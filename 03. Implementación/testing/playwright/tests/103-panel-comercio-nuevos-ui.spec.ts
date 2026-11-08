import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoUsuario } from './helpers/multicomercio';
import { nuevoCliente, pedidoEnEstado, prepararEscenario } from './helpers/reclamos';
import type { Cliente, Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const PLAZO_MINUTOS = 30;

async function modificarPedidosDelComercio(page: Page, cambiar: (pedido: any) => void) {
  await page.route('**/api/v1/pedidos/comercio', async (ruta) => {
    if (ruta.request().method() !== 'GET') {
      await ruta.continue();
      return;
    }
    const respuesta = await ruta.fetch();
    const cuerpo = await respuesta.json();
    cuerpo.data.forEach(cambiar);
    await ruta.fulfill({ response: respuesta, json: cuerpo });
  });
}

test.describe('Pulido 1, K01: el panel y la lista de pedidos se actualizan solos', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;
  let cliente: Cliente;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    cliente = await nuevoCliente(request, esc.localidadId);
  });

  test('un pedido que entra se marca "Nuevo" en el panel sin recargar, y deja de serlo al abrir su detalle', async ({ page, request }) => {
    await page.clock.install();
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('lista-pedidos-activos')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('etiqueta-pedido-nuevo')).toHaveCount(0);

    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    await page.clock.fastForward(15_000);

    const tarjeta = page.getByTestId(`pedido-item-${pedidoId}`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByTestId('etiqueta-pedido-nuevo')).toHaveText('Nuevo');
    await expect(tarjeta).toHaveClass(/pedido-card--nuevo/);
    await sinScrollHorizontal(page);

    await page.evaluate((id) => {
      (document.querySelector(`[data-testid="pedido-item-${id}"]`) as any).__marca = 'sin-repintar';
    }, pedidoId);
    await page.clock.fastForward(15_000);
    await page.waitForTimeout(400);
    const marca = await page.evaluate((id) => (document.querySelector(`[data-testid="pedido-item-${id}"]`) as any).__marca, pedidoId);
    expect(marca).toBe('sin-repintar');

    await page.reload();
    await expect(page.getByTestId(`pedido-item-${pedidoId}`).getByTestId('etiqueta-pedido-nuevo')).toBeVisible();

    await page.getByTestId(`pedido-item-${pedidoId}`).click();
    await page.waitForURL('**/comercio-pedido-detalle.html?id=*');
    await expect(page.getByTestId('estado-pedido-detalle')).toBeVisible().catch(() => undefined);
    await page.waitForLoadState('networkidle');
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId(`pedido-item-${pedidoId}`)).toBeVisible();
    await expect(page.getByTestId('etiqueta-pedido-nuevo')).toHaveCount(0);
  });

  test('la lista de pedidos también recibe el pedido nuevo sola y conserva el filtro elegido', async ({ page, request }) => {
    await page.clock.install();
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-pedidos.html');
    await expect(page.getByTestId('chip-filtro-todos')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('chip-filtro-pendiente_confirmacion_comercio').click();

    const pedidoId = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    await page.clock.fastForward(15_000);

    const tarjeta = page.getByTestId(`pedido-item-${pedidoId}`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByTestId('etiqueta-pedido-nuevo')).toBeVisible();
    await expect(page.getByTestId('chip-filtro-pendiente_confirmacion_comercio')).toHaveAttribute('aria-pressed', 'true');

    await tarjeta.click();
    await page.waitForURL('**/comercio-pedido-detalle.html?id=*');
    await page.waitForLoadState('networkidle');
    await page.goBack();
    await expect(page.getByTestId(`pedido-item-${pedidoId}`)).toBeVisible();
    await expect(page.getByTestId(`pedido-item-${pedidoId}`).getByTestId('etiqueta-pedido-nuevo')).toHaveCount(0);
  });

  test('un pedido que ya estaba al abrir la pantalla no se marca como nuevo', async ({ page, request }) => {
    const previo = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-pedidos.html');
    await expect(page.getByTestId(`pedido-item-${previo}`)).toBeVisible();
    await expect(page.getByTestId('etiqueta-pedido-nuevo')).toHaveCount(0);
  });

  test('el servidor informa el límite de respuesta y el pedido muestra cuánto falta, sin simular nada', async ({ page, request }) => {
    const previo = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    await page.clock.install();
    await abrirComoUsuario(page, esc.dueno.sesion);
    const respuestaLista = page.waitForResponse((r) => r.url().endsWith('/api/v1/pedidos/comercio') && r.request().method() === 'GET');
    await page.goto('/comercio-dashboard.html');
    const cuerpo = await (await respuestaLista).json();
    const delPrevio = cuerpo.data.find((pedido: any) => pedido.id === previo);
    expect(delPrevio.limiteRespuestaComercio).toBeTruthy();
    expect(Date.parse(`${delPrevio.limiteRespuestaComercio}Z`) - Date.parse(`${delPrevio.fechaPagoAprobado}Z`)).toBe(PLAZO_MINUTOS * 60000);
    await expect(page.getByTestId(`pedido-item-${previo}`)).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(`pedido-item-${previo}`).getByTestId('vencimiento-pedido')).toHaveText(/^Vence en \d+ minutos?$/);

    const nuevo = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    await page.clock.fastForward(15_000);
    const tarjetaNueva = page.getByTestId(`pedido-item-${nuevo}`);
    await expect(tarjetaNueva).toBeVisible();
    await expect(tarjetaNueva.getByTestId('vencimiento-pedido')).toHaveText(`Respondé antes de ${PLAZO_MINUTOS} minutos`);
  });

  test('un pedido ya aceptado no muestra ningún vencimiento', async ({ page, request }) => {
    const aceptado = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-pedidos.html');
    const tarjeta = page.getByTestId(`pedido-item-${aceptado}`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByTestId('vencimiento-pedido')).toHaveCount(0);
  });

  test('si el límite ya pasó no se muestran minutos negativos ni "Vence en 0"', async ({ page, request }) => {
    const previo = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    await modificarPedidosDelComercio(page, (pedido) => {
      pedido.limiteRespuestaComercio = new Date(Date.now() - 3 * 3600000 - 5 * 60000).toISOString().slice(0, 19);
    });
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-pedidos.html');
    const texto = page.getByTestId(`pedido-item-${previo}`).getByTestId('vencimiento-pedido');
    await expect(texto).toHaveText('Está por vencer');
    await expect(texto).not.toHaveText(/Vence en|minutos/);
  });

  test('sin el límite de respuesta en la respuesta no se muestra ninguna cuenta regresiva inventada ni la palabra null', async ({ page, request }) => {
    const previo = await pedidoEnEstado(request, esc, cliente, 'PENDIENTE');
    await modificarPedidosDelComercio(page, (pedido) => {
      pedido.limiteRespuestaComercio = null;
    });
    await abrirComoUsuario(page, esc.dueno.sesion);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId(`pedido-item-${previo}`)).toBeVisible();
    await expect(page.getByTestId('vencimiento-pedido')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('null');

    await modificarPedidosDelComercio(page, (pedido) => {
      delete pedido.limiteRespuestaComercio;
    });
    await page.goto('/comercio-pedidos.html');
    await expect(page.getByTestId(`pedido-item-${previo}`)).toBeVisible();
    await expect(page.getByTestId('vencimiento-pedido')).toHaveCount(0);
  });
});
