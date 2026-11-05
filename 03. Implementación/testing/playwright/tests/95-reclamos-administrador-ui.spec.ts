import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import { apiGet, sqlTest as sql } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';
import {
  DESCRIPCION_VALIDA,
  PRECIO_PRODUCTO,
  TOTAL_PEDIDO,
  capturarReclamos,
  conReembolsosFallidos,
  nuevoCliente,
  pedidoEntregado,
  prepararEscenario,
  reclamarPorApi,
  resolverPorApi,
} from './helpers/reclamos';
import type { Cliente, Escenario } from './helpers/reclamos';

test.use({ viewport: { width: 375, height: 812 } });

const HTML_EN_MENSAJE = '<b>Faltó</b> <img src=x onerror=alert(1)> la bebida';
const TEXTO_CONFIRMAR_REEMBOLSO = (monto: string) =>
  `¿Reembolsar ${monto} al Cliente? El reembolso lo hace la cuenta de Mercado Pago del comercio. No se puede deshacer.`;
const TEXTO_CONFIRMAR_RECHAZO = '¿Rechazar este reclamo? El Cliente va a ver el motivo que escribiste. No se puede deshacer.';
const SALDO = '$5.000';

test.describe('Fase 5, S5 (entrega B): reclamos del Administrador', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;
  let cliente: Cliente;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    cliente = await nuevoCliente(request, esc.localidadId);
  });

  async function nuevoReclamo(request: APIRequestContext, descripcion = DESCRIPCION_VALIDA, motivo = 'FALTAN_PRODUCTOS') {
    const pedidoId = await pedidoEntregado(request, esc, cliente, { domicilio: true });
    const reclamoId = await reclamarPorApi(request, cliente, pedidoId, motivo, descripcion);
    return { pedidoId, reclamoId };
  }

  async function abrirBandeja(page: Page) {
    await abrirComoUsuario(page, esc.adminSesion);
    await page.goto('/admin-reclamos.html');
    await expect(page.getByTestId('titulo-admin-reclamos')).toBeVisible();
  }

  async function abrirDetalle(page: Page, reclamoId: number) {
    await abrirComoUsuario(page, esc.adminSesion);
    await page.goto(`/admin-reclamos.html?id=${reclamoId}`);
    await expect(page.getByTestId('cabecera-reclamo')).toBeVisible();
  }

  async function elegir(page: Page, opcion: 'total' | 'parcial' | 'rechazo') {
    const testid = { total: 'opcion-reembolso-total', parcial: 'opcion-reembolso-parcial', rechazo: 'opcion-rechazo' }[opcion];
    await page.getByTestId(testid).check();
  }

  async function metricas(request: APIRequestContext) {
    const { status, body } = await apiGet(request, '/administrador/metricas', esc.adminToken);
    expect(status).toBe(200);
    return body.data as { reclamosPendientes: number; consultasSoporteEsperando: number };
  }

  const estadoDe = (reclamoId: number): string => sql(`SELECT estado FROM reclamo WHERE id = ${reclamoId};`);

  test('el panel tiene su propia tarjeta de Reclamos, separada de Soporte, con el contador de pendientes', async ({ page, request }) => {
    await nuevoReclamo(request);
    const { reclamosPendientes } = await metricas(request);
    expect(reclamosPendientes).toBeGreaterThan(0);
    await abrirComoUsuario(page, esc.adminSesion);
    await page.goto('/admin-dashboard.html');

    const tarjeta = page.getByTestId('tile-gestion-reclamos');
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta).toContainText('Reclamos');
    await expect(page.getByTestId('contador-reclamos-pendientes')).toHaveText(
      reclamosPendientes === 1 ? '1 pendiente de revisar' : `${reclamosPendientes} pendientes de revisar`,
    );
    await expect(page.getByTestId('tile-gestion-soporte')).toBeVisible();
    await expect(page.getByTestId('contador-soporte-esperando')).not.toContainText('pendiente de revisar');
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '14-admin-panel-con-tarjeta-de-reclamos');

    await tarjeta.click();
    await expect(page).toHaveURL(/admin-reclamos\.html$/);
  });

  test('la bandeja muestra los filtros con sus contadores y los pendientes más viejos arriba', async ({ page, request }) => {
    const viejo = await nuevoReclamo(request);
    const nuevo = await nuevoReclamo(request);
    sql(`UPDATE reclamo SET fecha_creacion = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE id = ${viejo.reclamoId};`);
    const aprobado = await nuevoReclamo(request);
    expect((await resolverPorApi(request, esc.adminToken, aprobado.reclamoId, { tipo: 'REEMBOLSO_TOTAL' })).status).toBe(200);
    await abrirBandeja(page);

    const { reclamosPendientes } = await metricas(request);
    await expect(page.getByTestId('filtro-reclamos-pendientes')).toHaveText(`Pendientes ${reclamosPendientes}`);
    await expect(page.getByTestId('filtro-reclamos-pendientes')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('filtro-reclamos-reembolso')).toContainText('Reembolso en proceso');
    await expect(page.getByTestId('filtro-reclamos-resueltos')).toContainText('Resueltos');

    const items = page.getByTestId('bandeja-reclamos').locator('a');
    await expect(items.first()).toBeVisible();
    const hrefs = await items.evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute('href')));
    expect(hrefs.indexOf(`admin-reclamos.html?id=${viejo.reclamoId}`)).toBeGreaterThanOrEqual(0);
    expect(hrefs.indexOf(`admin-reclamos.html?id=${viejo.reclamoId}`)).toBeLessThan(hrefs.indexOf(`admin-reclamos.html?id=${nuevo.reclamoId}`));
    expect(hrefs).not.toContain(`admin-reclamos.html?id=${aprobado.reclamoId}`);

    const fila = page.getByTestId(`reclamo-item-${viejo.reclamoId}`);
    await expect(fila.getByTestId('reclamo-item-titulo')).toHaveText(`Pedido #${viejo.pedidoId} · Faltan productos`);
    await expect(fila.getByTestId('reclamo-item-estado')).toContainText('Pendiente');
    await expect(fila.getByTestId('reclamo-item-comercio')).toHaveText(esc.dueno.nombre);
    await expect(fila.getByTestId('reclamo-item-hace')).toContainText(`${SALDO} · Hace 3 días`);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '15-admin-bandeja-pendientes');

    await page.getByTestId('filtro-reclamos-resueltos').click();
    await expect(page.getByTestId(`reclamo-item-${aprobado.reclamoId}`)).toBeVisible();
    await expect(page.getByTestId(`reclamo-item-${aprobado.reclamoId}`).getByTestId('reclamo-item-estado')).toContainText('Aprobado');
    await expect(page.getByTestId(`reclamo-item-${viejo.reclamoId}`)).toHaveCount(0);
    await capturarReclamos(page, '16-admin-bandeja-resueltos');
  });

  test('cada filtro vacío tiene su texto y un error de carga se puede reintentar', async ({ page }) => {
    await page.route('**/api/v1/administrador/reclamos?**', async (ruta) => {
      await ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mensaje: 'ok', data: { contadores: { pendientes: 0, reembolsoEnProceso: 0, resueltos: 0 }, reclamos: [] } }),
      });
    });
    await abrirBandeja(page);
    await expect(page.getByTestId('bandeja-reclamos-vacia')).toHaveText('No hay reclamos pendientes de revisar.');
    await expect(page.getByTestId('filtro-reclamos-pendientes')).toHaveText('Pendientes 0');
    await capturarReclamos(page, '17-admin-bandeja-vacia');
    await page.getByTestId('filtro-reclamos-reembolso').click();
    await expect(page.getByTestId('bandeja-reclamos-vacia')).toHaveText('No hay reembolsos de reclamos en proceso.');
    await page.getByTestId('filtro-reclamos-resueltos').click();
    await expect(page.getByTestId('bandeja-reclamos-vacia')).toHaveText('Todavía no resolviste ningún reclamo.');

    await page.unroute('**/api/v1/administrador/reclamos?**');
    await page.route('**/api/v1/administrador/reclamos?**', (ruta) => ruta.fulfill({ status: 500, contentType: 'application/json', body: '{"mensaje":"Error del servidor"}' }));
    await page.getByTestId('filtro-reclamos-pendientes').click();
    await expect(page.getByTestId('btn-reintentar-bandeja-reclamos')).toBeVisible();
    await expect(page.getByTestId('aviso-bandeja-reclamos-mensaje')).toBeVisible();
  });

  test('el detalle de un pendiente muestra el pedido, el mensaje tal cual y el saldo reembolsable', async ({ page, request }) => {
    const { pedidoId, reclamoId } = await nuevoReclamo(request, HTML_EN_MENSAJE, 'COBRO_INCORRECTO');
    await abrirDetalle(page, reclamoId);

    await expect(page.getByTestId('reclamo-titulo')).toHaveText(`Pedido #${pedidoId} · Cobro incorrecto`);
    await expect(page.getByTestId('reclamo-comercio')).toHaveText(`Comercio: ${esc.dueno.nombre}`);
    await expect(page.getByTestId('reclamo-cliente')).toContainText(`${cliente.email}`);
    await expect(page.getByTestId('reclamo-modalidad')).toContainText('A domicilio · Entregado el');
    await expect(page.getByTestId('reclamo-total')).toHaveText(`Total pagado: ${SALDO}`);
    await expect(page.getByTestId('reclamo-estado')).toContainText('Pendiente');
    await expect(page.getByTestId('reclamo-mensaje')).toHaveText(HTML_EN_MENSAJE);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.getByTestId('producto-reclamo')).toHaveCount(1);
    await expect(page.getByTestId('producto-reclamo').first()).toContainText('1x Empanadas');
    await expect(page.getByTestId('saldo-reembolsable')).toHaveText(`Saldo reembolsable: ${SALDO}`);
    await expect(page.getByTestId('btn-resolver-reclamo')).toBeEnabled();
    await expect(page.getByTestId('campo-monto')).toBeHidden();
    await expect(page.getByTestId('campo-motivo-rechazo')).toBeHidden();
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '18-admin-detalle-pendiente');
  });

  test('sin elegir una opción no se puede resolver y el aviso lo dice', async ({ page, request }) => {
    const { reclamoId } = await nuevoReclamo(request);
    await abrirDetalle(page, reclamoId);
    await page.getByTestId('btn-resolver-reclamo').click();
    await expect(page.getByTestId('aviso-resolucion-mensaje')).toHaveText('Elegí cómo se resuelve el reclamo');
    await expect(page.getByTestId('modal-confirmar-resolucion')).toHaveCount(0);
    expect(estadoDe(reclamoId)).toBe('PENDIENTE');
  });

  test('un reembolso total pide confirmación, se puede cancelar y al confirmar resuelve con el reembolso enviado', async ({ page, request }) => {
    const { reclamoId } = await nuevoReclamo(request);
    await abrirDetalle(page, reclamoId);
    await elegir(page, 'total');
    await expect(page.getByTestId('opciones-resolucion')).toContainText(`Reembolso total · ${SALDO}`);
    await capturarReclamos(page, '19-admin-resolucion-reembolso-total');

    await page.getByTestId('btn-resolver-reclamo').click();
    await expect(page.getByTestId('texto-confirmar-resolucion')).toHaveText(TEXTO_CONFIRMAR_REEMBOLSO(SALDO));
    await expect(page.getByTestId('btn-cancelar-resolucion')).toBeFocused();
    await capturarReclamos(page, '22-admin-modal-confirmar-reembolso');
    await page.getByTestId('btn-cancelar-resolucion').click();
    await expect(page.getByTestId('modal-confirmar-resolucion')).toHaveCount(0);
    expect(estadoDe(reclamoId)).toBe('PENDIENTE');

    await page.getByTestId('btn-resolver-reclamo').click();
    await page.getByTestId('btn-confirmar-resolucion').click();
    await expect(page.locator('.toast')).toContainText('Reclamo resuelto');
    await expect(page.getByTestId('resolucion-reclamo')).toBeVisible();
    await expect(page.getByTestId('tipo-resolucion')).toHaveText('Resolución: Reembolso total');
    await expect(page.getByTestId('monto-resolucion')).toHaveText(`Monto reembolsado: ${SALDO}`);
    await expect(page.getByTestId('reclamo-estado')).toContainText('Aprobado');
    await expect(page.getByTestId('formulario-resolucion')).toHaveCount(0);
    await expect(page.getByTestId('bloque-reembolso-reclamo')).toHaveCount(0);
    expect(estadoDe(reclamoId)).toBe('APROBADO');
    await expect(page.locator('.toast')).toHaveCount(0);
    await capturarReclamos(page, '26-admin-detalle-resuelto-aprobado');
  });

  test('un reembolso parcial acepta solo números con dos decimales, muestra el máximo y el error del tope', async ({ page, request }) => {
    const { reclamoId } = await nuevoReclamo(request);
    await abrirDetalle(page, reclamoId);
    await elegir(page, 'parcial');

    await expect(page.getByTestId('ayuda-monto-maximo')).toHaveText(`Máximo ${SALDO}`);
    const monto = page.getByTestId('input-reclamo-monto');
    await monto.fill('12ab3,4567');
    await expect(monto).toHaveValue('123,45');
    await monto.fill('9999');
    await capturarReclamos(page, '20-admin-resolucion-reembolso-parcial');

    await page.getByTestId('btn-resolver-reclamo').click();
    await expect(page.getByTestId('texto-confirmar-resolucion')).toHaveText(TEXTO_CONFIRMAR_REEMBOLSO('$9.999'));
    await page.getByTestId('btn-confirmar-resolucion').click();
    await expect(page.getByTestId('modal-confirmar-resolucion')).toHaveCount(0);
    await expect(page.getByTestId('error-reclamo-monto')).toBeVisible();
    await expect(page.getByTestId('error-reclamo-monto')).not.toBeEmpty();
    await expect(monto).toBeFocused();
    expect(estadoDe(reclamoId)).toBe('PENDIENTE');

    await monto.fill('1250,50');
    await page.getByTestId('btn-resolver-reclamo').click();
    await expect(page.getByTestId('texto-confirmar-resolucion')).toHaveText(TEXTO_CONFIRMAR_REEMBOLSO('$1.250,50'));
    await page.getByTestId('btn-confirmar-resolucion').click();
    await expect(page.getByTestId('tipo-resolucion')).toHaveText('Resolución: Reembolso parcial');
    await expect(page.getByTestId('monto-resolucion')).toHaveText('Monto reembolsado: $1.250,50');
    expect(sql(`SELECT monto_aprobado FROM reclamo WHERE id = ${reclamoId};`)).toBe('1250.50');
  });

  test('el rechazo pide un motivo con contador, avisa al Cliente y lo muestra tal cual', async ({ page, request }) => {
    const { pedidoId, reclamoId } = await nuevoReclamo(request);
    await abrirDetalle(page, reclamoId);
    await elegir(page, 'rechazo');

    await expect(page.getByTestId('contador-reclamo-motivo-rechazo')).toHaveText('0 / 500 · mínimo 10');
    await page.getByTestId('input-reclamo-motivo-rechazo').fill('corto');
    await expect(page.getByTestId('contador-reclamo-motivo-rechazo')).toHaveText('5 / 500 · mínimo 10');
    await page.getByTestId('btn-resolver-reclamo').click();
    await expect(page.getByTestId('texto-confirmar-resolucion')).toHaveText(TEXTO_CONFIRMAR_RECHAZO);
    await capturarReclamos(page, '23-admin-modal-confirmar-rechazo');
    await page.getByTestId('btn-confirmar-resolucion').click();
    await expect(page.getByTestId('error-reclamo-motivo-rechazo')).toHaveText('Escribí el motivo del rechazo en entre 10 y 500 caracteres');
    await expect(page.getByTestId('input-reclamo-motivo-rechazo')).toBeFocused();
    expect(estadoDe(reclamoId)).toBe('PENDIENTE');

    const motivo = '<i>Revisamos</i> el pedido y salió completo';
    await page.getByTestId('input-reclamo-motivo-rechazo').fill('x'.repeat(600));
    await expect(page.getByTestId('contador-reclamo-motivo-rechazo')).toHaveText('500 / 500 · mínimo 10');
    await page.getByTestId('input-reclamo-motivo-rechazo').fill(motivo);
    await capturarReclamos(page, '21-admin-resolucion-rechazo');
    await page.getByTestId('btn-resolver-reclamo').click();
    await page.getByTestId('btn-confirmar-resolucion').click();
    await expect(page.locator('.toast')).toContainText('Reclamo resuelto');
    await expect(page.getByTestId('tipo-resolucion')).toHaveText('Resolución: Reclamo rechazado');
    await expect(page.getByTestId('motivo-rechazo-resolucion')).toHaveText(`Motivo: ${motivo}`);
    await expect(page.getByTestId('monto-resolucion')).toHaveCount(0);
    await expect(page.getByTestId('resolucion-reclamo').locator('i')).toHaveCount(0);
    expect(estadoDe(reclamoId)).toBe('RECHAZADO');
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} AND tipo = 'RECLAMO_RECHAZADO';`))).toBe(1);
    await expect(page.locator('.toast')).toHaveCount(0);
    await capturarReclamos(page, '27-admin-detalle-resuelto-rechazado');
  });

  test('si otra persona resolvió el reclamo antes, el segundo intento muestra el aviso y recarga el detalle', async ({ page, request }) => {
    const { reclamoId } = await nuevoReclamo(request);
    await abrirDetalle(page, reclamoId);
    await elegir(page, 'rechazo');
    await page.getByTestId('input-reclamo-motivo-rechazo').fill('Segundo intento sobre un reclamo ya resuelto');
    expect((await resolverPorApi(request, esc.adminToken, reclamoId, { tipo: 'REEMBOLSO_TOTAL' })).status).toBe(200);

    await page.getByTestId('btn-resolver-reclamo').click();
    await page.getByTestId('btn-confirmar-resolucion').click();
    await expect(page.getByTestId('modal-confirmar-resolucion')).toHaveCount(0);
    await expect(page.getByTestId('aviso-detalle-reclamo-mensaje')).toHaveText('Este reclamo ya fue resuelto.');
    await expect(page.getByTestId('resolucion-reclamo')).toBeVisible();
    await expect(page.getByTestId('tipo-resolucion')).toHaveText('Resolución: Reembolso total');
    await expect(page.getByTestId('formulario-resolucion')).toHaveCount(0);
    expect(estadoDe(reclamoId)).toBe('APROBADO');
    await capturarReclamos(page, '24-admin-segundo-intento');
  });

  test('un reembolso que Mercado Pago no pudo hacer queda a la vista, con su motivo y el camino a Reembolsos', async ({ page, request }) => {
    const { reclamoId } = await nuevoReclamo(request);
    await abrirDetalle(page, reclamoId);
    await elegir(page, 'total');
    await conReembolsosFallidos(request, 'Saldo insuficiente en la cuenta del comercio', async () => {
      await page.getByTestId('btn-resolver-reclamo').click();
      await page.getByTestId('btn-confirmar-resolucion').click();
      await expect(page.getByTestId('resolucion-reclamo')).toBeVisible();
    });

    await expect(page.getByTestId('reclamo-estado')).toContainText('Reembolso en proceso');
    await expect(page.getByTestId('bloque-reembolso-reclamo')).toBeVisible();
    await expect(page.getByTestId('estado-reembolso-reclamo')).toContainText('Reembolso en proceso');
    await expect(page.getByTestId('error-reembolso-reclamo')).toContainText('Saldo insuficiente en la cuenta del comercio');
    await sinScrollHorizontal(page);
    await expect(page.locator('.toast')).toHaveCount(0);
    await capturarReclamos(page, '25-admin-reembolso-fallido');

    await abrirBandeja(page);
    await page.getByTestId('filtro-reclamos-reembolso').click();
    await expect(page.getByTestId(`reclamo-item-${reclamoId}`)).toBeVisible();
    await expect(page.getByTestId(`reclamo-item-${reclamoId}`).getByTestId('reclamo-item-estado')).toContainText('Reembolso en proceso');
    await capturarReclamos(page, '16b-admin-bandeja-reembolso-en-proceso');

    await page.getByTestId(`reclamo-item-${reclamoId}`).click();
    await page.getByTestId('enlace-ir-a-reembolsos').click();
    await expect(page).toHaveURL(/admin-reembolsos\.html$/);
  });

  test('un reclamo ya resuelto se ve solo para leer, sin formulario', async ({ page, request }) => {
    const { reclamoId } = await nuevoReclamo(request);
    expect((await resolverPorApi(request, esc.adminToken, reclamoId, { tipo: 'REEMBOLSO_PARCIAL', monto: PRECIO_PRODUCTO / 2 })).status).toBe(200);
    await abrirDetalle(page, reclamoId);

    await expect(page.getByTestId('formulario-resolucion')).toHaveCount(0);
    await expect(page.getByTestId('btn-resolver-reclamo')).toHaveCount(0);
    await expect(page.getByTestId('saldo-reembolsable')).toHaveCount(0);
    await expect(page.getByTestId('tipo-resolucion')).toHaveText('Resolución: Reembolso parcial');
    await expect(page.getByTestId('monto-resolucion')).toHaveText('Monto reembolsado: $2.400');
    await expect(page.getByTestId('fecha-resolucion')).toContainText('Resuelto el');
    await expect(page.getByTestId('reclamo-total')).toHaveText(`Total pagado: ${SALDO}`);
    expect(TOTAL_PEDIDO).toBe(5000);
  });

  test('un reclamo inexistente avisa y vuelve a la bandeja', async ({ page }) => {
    await abrirComoUsuario(page, esc.adminSesion);
    await page.goto('/admin-reclamos.html?id=99999999');
    await expect(page.getByTestId('aviso-detalle-reclamo-mensaje')).toHaveText('No encontramos ese reclamo.');
    await page.getByTestId('btn-volver-bandeja-reclamos').click();
    await expect(page.getByTestId('titulo-admin-reclamos')).toBeVisible();
  });

  test('solo el Administrador accede: el Cliente y el Dueño van al login y el servidor responde 403', async ({ browser, request }) => {
    for (const sesion of [cliente.sesion, esc.dueno.sesion]) {
      const contexto = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const pagina = await contexto.newPage();
      await abrirComoUsuario(pagina, sesion);
      await pagina.goto('/admin-reclamos.html');
      await expect(pagina).toHaveURL(/login\.html/);
      await contexto.close();
    }
    for (const token of [cliente.sesion.token, esc.dueno.token]) {
      expect((await apiGet(request, '/administrador/reclamos', token)).status).toBe(403);
    }
    expect((await apiGet(request, '/administrador/reclamos')).status).toBe(401);
  });
});
