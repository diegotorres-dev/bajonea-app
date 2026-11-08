import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { sqlTest as sql } from './helpers/backend';
import { loginAdminUi } from './helpers/multicomercio';
import { nuevoCliente, pedidoEnEstado, prepararEscenario } from './helpers/reclamos';
import type { Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

interface Valores {
  comerciosPendientes: number;
  resolicitudesPendientes: number;
  documentosPendientes: number;
  consultasSoporteEsperando: number;
  reclamosPendientes: number;
  reembolsos: number;
}

function sembrarNota(pedidoId: number, estado: string): void {
  sql(
    `INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos, mp_payment_id, ultimo_error, fecha_emision) ` +
      `SELECT p.id, p.monto, 'RECHAZO_COMERCIO', '${estado}', 1, p.id_transaccion_mp, 'dato sintetico del spec 111', NOW() FROM pago p WHERE p.pedido_id = ${pedidoId};`,
  );
}

function limpiarNotas(pedidoIds: number[]): void {
  sql(`DELETE FROM nota_credito WHERE pago_id IN (SELECT id FROM pago WHERE pedido_id IN (${pedidoIds.join(',')}));`);
}

const ORDEN_ORIGINAL_TILES = ['comercios', 'clientes', 'duenos', 'categorias', 'tags', 'tarifas', 'reembolsos', 'soporte', 'reclamos'];
const ORDEN_ORIGINAL_TARJETAS = ['btn-comercios-pendientes', 'btn-resolicitudes', 'btn-documentos-por-revisar'];

async function simularPanel(page: Page, valores: () => Valores) {
  await page.route('**/api/v1/administrador/metricas', async (ruta) => {
    const respuesta = await ruta.fetch();
    const cuerpo = await respuesta.json();
    const v = valores();
    Object.assign(cuerpo.data, {
      comerciosPendientes: v.comerciosPendientes,
      resolicitudesPendientes: v.resolicitudesPendientes,
      documentosPendientes: v.documentosPendientes,
      consultasSoporteEsperando: v.consultasSoporteEsperando,
      reclamosPendientes: v.reclamosPendientes,
    });
    await ruta.fulfill({ response: respuesta, json: cuerpo });
  });
  await page.route('**/api/v1/administrador/reembolsos', async (ruta) => {
    const notas = Array.from({ length: valores().reembolsos }, (_, indice) => ({ id: indice + 1 }));
    await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: notas }) });
  });
  await page.route('**/api/v1/administrador/documentos/pendientes', async (ruta) => {
    await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: [] }) });
  });
}

async function ordenDeTiles(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="tile-gestion-"]').evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute('data-testid')!.replace('tile-gestion-', '')));
}

async function ordenDeTarjetas(page: Page): Promise<string[]> {
  return page.locator('.alert-card').evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute('data-testid')!));
}

async function abrirPanelConSimulacion(page: Page, valores: () => Valores) {
  await simularPanel(page, valores);
  await loginAdminUi(page);
  await expect(page.getByTestId('nombre-admin').locator('.skeleton')).toHaveCount(0);
  await expect(page.getByTestId('nombre-admin')).not.toHaveText('');
  await page.waitForLoadState('networkidle');
}

test.describe('Tramo 2B, bloque 4: el panel del Administrador', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;
  const pedidos: number[] = [];

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    const cliente = await nuevoCliente(request, esc.localidadId);
    pedidos.push(await pedidoEnEstado(request, esc, cliente, 'PENDIENTE'));
    pedidos.push(await pedidoEnEstado(request, esc, cliente, 'PENDIENTE'));
  });

  test.afterAll(() => {
    limpiarNotas(pedidos);
  });

  test('la tarjeta de Reembolsos cuenta de verdad los reembolsos para revisar (revisión manual y fallidos)', async ({ page }) => {
    limpiarNotas(pedidos);
    sembrarNota(pedidos[0], 'PENDIENTE_REVISION_MANUAL');
    sembrarNota(pedidos[1], 'FALLIDO');
    const esperados = Number(sql(`SELECT COUNT(*) FROM nota_credito WHERE estado IN ('PENDIENTE_REVISION_MANUAL', 'FALLIDO');`));
    expect(esperados).toBeGreaterThanOrEqual(2);

    await loginAdminUi(page);
    await expect(page.getByTestId('contador-tile-reembolsos')).toHaveText(String(esperados));
    await expect(page.getByTestId('tile-gestion-reembolsos')).toContainText(`${esperados} para revisar`);
    await sinScrollHorizontal(page);
  });

  test('sin reembolsos para revisar la tarjeta lo dice y no muestra contador', async ({ page }) => {
    limpiarNotas(pedidos);
    sql(`DELETE FROM nota_credito WHERE estado IN ('PENDIENTE_REVISION_MANUAL', 'FALLIDO');`);
    await loginAdminUi(page);
    await expect(page.getByTestId('tile-gestion-reembolsos')).toContainText('Sin reembolsos para revisar');
    await expect(page.getByTestId('contador-tile-reembolsos')).toBeHidden();
  });

  test('todas las tarjetas con acción usan el mismo contador redondo', async ({ page }) => {
    await abrirPanelConSimulacion(page, () => ({
      comerciosPendientes: 3, resolicitudesPendientes: 2, documentosPendientes: 4, consultasSoporteEsperando: 5, reclamosPendientes: 6, reembolsos: 7,
    }));
    const contadores = [
      ['contador-comercios-pendientes', '3'],
      ['contador-resolicitudes-pendientes', '2'],
      ['contador-documentos-por-revisar', '4'],
      ['contador-tile-soporte', '5'],
      ['contador-tile-reclamos', '6'],
      ['contador-tile-reembolsos', '7'],
    ];
    const medidas = new Set<string>();
    for (const [testid, valor] of contadores) {
      const nodo = page.getByTestId(testid);
      await expect(nodo).toHaveText(valor);
      const medida = await nodo.evaluate((el) => {
        const estilo = getComputedStyle(el);
        return `${estilo.height}|${estilo.borderRadius}|${estilo.backgroundColor}|${estilo.fontSize}`;
      });
      medidas.add(medida);
    }
    expect(medidas.size).toBe(1);
    await expect(page.getByTestId('contador-soporte-esperando')).toContainText('5 esperan tu respuesta');
    await expect(page.getByTestId('contador-reclamos-pendientes')).toContainText('6 pendientes de revisar');
    await sinScrollHorizontal(page);
  });

  test('las tarjetas con algo pendiente van primero y el resto conserva su orden', async ({ page }) => {
    await abrirPanelConSimulacion(page, () => ({
      comerciosPendientes: 0, resolicitudesPendientes: 0, documentosPendientes: 4, consultasSoporteEsperando: 3, reclamosPendientes: 0, reembolsos: 2,
    }));
    expect(await ordenDeTarjetas(page)).toEqual(['btn-documentos-por-revisar', 'btn-comercios-pendientes', 'btn-resolicitudes']);
    expect(await ordenDeTiles(page)).toEqual(['reembolsos', 'soporte', 'comercios', 'clientes', 'duenos', 'categorias', 'tags', 'tarifas', 'reclamos']);
  });

  test('sin nada pendiente el orden es el de siempre', async ({ page }) => {
    await abrirPanelConSimulacion(page, () => ({
      comerciosPendientes: 0, resolicitudesPendientes: 0, documentosPendientes: 0, consultasSoporteEsperando: 0, reclamosPendientes: 0, reembolsos: 0,
    }));
    expect(await ordenDeTarjetas(page)).toEqual(ORDEN_ORIGINAL_TARJETAS);
    expect(await ordenDeTiles(page)).toEqual(ORDEN_ORIGINAL_TILES);
  });

  test('cada 30 s los números se actualizan solos pero las tarjetas no se mueven', async ({ page }) => {
    let valores: Valores = { comerciosPendientes: 0, resolicitudesPendientes: 0, documentosPendientes: 0, consultasSoporteEsperando: 0, reclamosPendientes: 0, reembolsos: 0 };
    await page.clock.install();
    await abrirPanelConSimulacion(page, () => valores);
    const tilesAntes = await ordenDeTiles(page);
    const tarjetasAntes = await ordenDeTarjetas(page);
    expect(tilesAntes).toEqual(ORDEN_ORIGINAL_TILES);

    valores = { comerciosPendientes: 2, resolicitudesPendientes: 1, documentosPendientes: 3, consultasSoporteEsperando: 4, reclamosPendientes: 1, reembolsos: 5 };
    await page.clock.fastForward(29_000);
    await page.waitForTimeout(300);
    await expect(page.getByTestId('contador-tile-soporte')).toBeHidden();
    await page.clock.fastForward(2000);

    await expect(page.getByTestId('contador-tile-soporte')).toHaveText('4');
    await expect(page.getByTestId('contador-tile-reembolsos')).toHaveText('5');
    await expect(page.getByTestId('contador-tile-reclamos')).toHaveText('1');
    await expect(page.getByTestId('contador-comercios-pendientes')).toHaveText('2');
    await expect(page.getByTestId('contador-resolicitudes-pendientes')).toHaveText('1');
    await expect(page.getByTestId('contador-documentos-por-revisar')).toHaveText('3');
    expect(await ordenDeTiles(page)).toEqual(tilesAntes);
    expect(await ordenDeTarjetas(page)).toEqual(tarjetasAntes);
  });

  test('si nada cambió no se toca la pantalla', async ({ page }) => {
    const valores: Valores = { comerciosPendientes: 1, resolicitudesPendientes: 0, documentosPendientes: 0, consultasSoporteEsperando: 2, reclamosPendientes: 0, reembolsos: 1 };
    await page.clock.install();
    await abrirPanelConSimulacion(page, () => valores);
    await page.evaluate(() => {
      (window as any).__mutaciones = 0;
      new MutationObserver((lista) => {
        (window as any).__mutaciones += lista.length;
      }).observe(document.querySelector('.screen-body')!, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    let consultas = 0;
    page.on('request', (peticion) => {
      if (/\/api\/v1\/administrador\/metricas$/.test(peticion.url())) {
        consultas += 1;
      }
    });
    await page.clock.fastForward(30_000);
    await expect.poll(() => consultas).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as any).__mutaciones)).toBe(0);
  });

  test('un fallo de red o del servidor en la actualización es silencioso: no redirige, no avisa y deja lo que ya se veía', async ({ page }) => {
    const valores: Valores = { comerciosPendientes: 1, resolicitudesPendientes: 0, documentosPendientes: 0, consultasSoporteEsperando: 2, reclamosPendientes: 0, reembolsos: 1 };
    await page.clock.install();
    await abrirPanelConSimulacion(page, () => valores);
    await expect(page.getByTestId('contador-tile-soporte')).toHaveText('2');

    await page.unroute('**/api/v1/administrador/metricas');
    await page.route('**/api/v1/administrador/metricas', (ruta) => ruta.abort('connectionfailed'));
    await page.clock.fastForward(30_000);
    await page.waitForTimeout(400);
    expect(page.url()).toContain('/admin-dashboard.html');
    await expect(page.locator('.toast')).toHaveCount(0);
    await expect(page.getByTestId('aviso-red')).toHaveCount(0);
    await expect(page.getByTestId('contador-tile-soporte')).toHaveText('2');

    await page.unroute('**/api/v1/administrador/metricas');
    await page.route('**/api/v1/administrador/metricas', (ruta) => ruta.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ mensaje: 'caído', data: null }) }));
    await page.clock.fastForward(30_000);
    await page.waitForTimeout(400);
    expect(page.url()).toContain('/admin-dashboard.html');
    await expect(page.locator('.toast')).toHaveCount(0);
    await expect(page.getByTestId('contador-tile-soporte')).toHaveText('2');
  });

  test('con la pestaña oculta no se actualiza y al volver a verse revisa enseguida', async ({ page }) => {
    let valores: Valores = { comerciosPendientes: 0, resolicitudesPendientes: 0, documentosPendientes: 0, consultasSoporteEsperando: 1, reclamosPendientes: 0, reembolsos: 0 };
    await page.clock.install();
    await abrirPanelConSimulacion(page, () => valores);
    let consultas = 0;
    page.on('request', (peticion) => {
      if (/\/api\/v1\/administrador\/metricas$/.test(peticion.url())) {
        consultas += 1;
      }
    });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    valores = { ...valores, consultasSoporteEsperando: 9 };
    await page.clock.fastForward(95_000);
    await page.waitForTimeout(300);
    expect(consultas).toBe(0);
    await expect(page.getByTestId('contador-tile-soporte')).toHaveText('1');

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('contador-tile-soporte')).toHaveText('9');
    expect(consultas).toBeGreaterThanOrEqual(1);
  });
});
