import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import { apiGet, sqlTest as sql } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';
import {
  DESCRIPCION_VALIDA,
  CARGO_CLIENTE,
  PRECIO_PRODUCTO,
  TOTAL_PEDIDO,
  autoconfirmarEnCamino,
  capturarReclamos,
  conReembolsosFallidos,
  nuevoCliente,
  pedidoEnCamino,
  pedidoEnEstado,
  pedidoEntregado,
  pedidoNoRetirado,
  prepararEscenario,
  reclamarPorApi,
  reclamoIdDe,
  resolverPorApi,
} from './helpers/reclamos';
import type { Cliente, Escenario } from './helpers/reclamos';

test.use({ viewport: { width: 375, height: 812 } });

const TEXTO_PLAZO_VENCIDO = 'Pasaron los 7 días para reclamar este pedido.';
const HTML_EN_TEXTO = '<b>Llegó</b> <img src=x onerror=alert(1)> frío';

test.describe('Fase 5, S5 (entrega B): reclamos del Cliente', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;
  let cliente: Cliente;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    cliente = await nuevoCliente(request, esc.localidadId);
  });

  async function abrirPedido(page: Page, pedidoId: number, quien: Cliente = cliente) {
    await abrirComoUsuario(page, quien.sesion);
    await page.goto(`/pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('estado-pedido').first()).toBeVisible();
  }

  async function abrirFormulario(page: Page, pedidoId: number, quien: Cliente = cliente) {
    await abrirComoUsuario(page, quien.sesion);
    await page.goto(`/reclamo-nuevo.html?pedido=${pedidoId}`);
    await expect(page.getByTestId('formulario-reclamo')).toBeVisible();
  }

  async function estadoDelReclamo(request: APIRequestContext, pedidoId: number) {
    const { body } = await apiGet(request, '/pedidos/cliente', cliente.sesion.token);
    return body.data.find((p: { id: number }) => p.id === pedidoId).reclamo;
  }

  test('el botón aparece en un pedido entregado y dentro de plazo, con la fecha límite que informa el servidor', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    const reclamo = await estadoDelReclamo(request, pedidoId);
    expect(reclamo.puedeReclamar).toBe(true);
    await abrirPedido(page, pedidoId);

    const boton = page.getByTestId('btn-reclamar-pedido');
    await expect(boton).toBeVisible();
    await expect(boton).toBeEnabled();
    await expect(boton).toHaveText('Tuve un problema con este pedido');
    const limite = new Date(reclamo.fechaLimiteReclamo);
    const fecha = `${String(limite.getDate()).padStart(2, '0')}/${String(limite.getMonth() + 1).padStart(2, '0')}/${limite.getFullYear()}`;
    await expect(page.getByTestId('texto-plazo-reclamo')).toHaveText(`¿Tuviste un problema con este pedido? Tenés hasta el ${fecha} para reclamar.`);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '01-cliente-boton-de-reclamo');
  });

  test('el botón no aparece en un pedido rechazado, cancelado, en preparación ni no retirado', async ({ page, request }) => {
    const rechazado = await pedidoEnEstado(request, esc, cliente, 'RECHAZADO');
    const cancelado = await pedidoEnEstado(request, esc, cliente, 'CANCELADO');
    const enPreparacion = await pedidoEnEstado(request, esc, cliente, 'EN_PREPARACION');
    const noRetirado = await pedidoNoRetirado(request, esc, cliente);

    for (const pedidoId of [rechazado, cancelado, enPreparacion, noRetirado]) {
      await abrirPedido(page, pedidoId);
      await expect(page.getByTestId('seccion-reclamar')).toHaveCount(0);
      await expect(page.getByTestId('btn-reclamar-pedido')).toHaveCount(0);
      await expect(page.getByTestId('bloque-reclamo')).toHaveCount(0);
    }
  });

  test('con el plazo vencido el botón está deshabilitado y el texto lo explica', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente, { diasAtras: 8 });
    await abrirPedido(page, pedidoId);

    await expect(page.getByTestId('btn-reclamar-pedido')).toBeDisabled();
    await expect(page.getByTestId('texto-plazo-vencido')).toHaveText(TEXTO_PLAZO_VENCIDO);
    await expect(page.getByTestId('texto-plazo-reclamo')).toHaveCount(0);
    await capturarReclamos(page, '02-cliente-plazo-vencido');

    await page.goto(`/reclamo-nuevo.html?pedido=${pedidoId}`);
    await expect(page.getByTestId('texto-reclamo-no-disponible')).toHaveText(TEXTO_PLAZO_VENCIDO);
  });

  test('un pedido a domicilio ofrece "No recibí el pedido" y uno de retiro no', async ({ page, request }) => {
    const domicilio = await pedidoEntregado(request, esc, cliente, { domicilio: true });
    const retiro = await pedidoEntregado(request, esc, cliente);

    await abrirFormulario(page, domicilio);
    await expect(page.getByTestId('select-reclamo-motivo').locator('option')).toHaveText([
      'Elegí una opción', 'No recibí el pedido', 'Faltan productos', 'Productos equivocados', 'Producto en mal estado', 'Cobro incorrecto', 'Otro problema',
    ]);
    await page.getByTestId('select-reclamo-motivo').selectOption('NO_RECIBI_PEDIDO');
    await page.getByTestId('input-reclamo-descripcion').fill('El repartidor marcó el pedido como entregado pero nunca llegó.');
    await expect(page.getByTestId('contador-reclamo-descripcion')).toHaveText('62 / 1000 · mínimo 10');
    await capturarReclamos(page, '03b-cliente-formulario-con-motivo');
    await abrirFormulario(page, retiro);
    await expect(page.getByTestId('select-reclamo-motivo').locator('option')).toHaveText([
      'Elegí una opción', 'Faltan productos', 'Productos equivocados', 'Producto en mal estado', 'Cobro incorrecto', 'Otro problema',
    ]);
    await capturarReclamos(page, '03-cliente-formulario-vacio');
  });

  test('el formulario muestra los errores del servidor por campo, con foco y el contador del mensaje', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, pedidoId);

    await expect(page.getByTestId('titulo-reclamo')).toHaveText('Tuve un problema');
    await expect(page.getByTestId('texto-un-solo-reclamo')).toHaveText('Podés enviar un solo reclamo por pedido y después no se puede cambiar.');
    await expect(page.getByTestId('contador-reclamo-descripcion')).toHaveText('0 / 1000 · mínimo 10');
    await page.getByTestId('input-reclamo-descripcion').fill('Faltó');
    await expect(page.getByTestId('contador-reclamo-descripcion')).toHaveText('5 / 1000 · mínimo 10');
    await page.getByTestId('input-reclamo-descripcion').fill('');

    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('error-reclamo-motivo')).toHaveText('Elegí el motivo del reclamo');
    await expect(page.getByTestId('error-reclamo-descripcion')).toContainText('Contanos qué pasó');
    await expect(page.getByTestId('select-reclamo-motivo')).toBeFocused();
    await expect(page.getByTestId('btn-enviar-reclamo')).toBeEnabled();
    await capturarReclamos(page, '04-cliente-formulario-con-errores');

    await page.getByTestId('select-reclamo-motivo').selectOption('FALTAN_PRODUCTOS');
    await page.getByTestId('input-reclamo-descripcion').fill('Faltó');
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('error-reclamo-descripcion')).toHaveText('Contanos qué pasó en entre 10 y 1000 caracteres');
    await expect(page.getByTestId('input-reclamo-descripcion')).toBeFocused();
    await expect(page.getByTestId('error-reclamo-motivo')).toBeHidden();
    expect(await estadoDelReclamo(request, pedidoId)).toMatchObject({ puedeReclamar: true });

    await page.getByTestId('btn-cancelar-reclamo').click();
    await expect(page).toHaveURL(new RegExp(`pedido-detalle\\.html\\?id=${pedidoId}$`));
    await sinScrollHorizontal(page);
  });

  test('al enviar muestra "Enviando…", evita el doble envío y termina con la confirmación y el aviso', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, pedidoId);
    let envios = 0;
    await page.route(`**/api/v1/pedidos/cliente/${pedidoId}/reclamo`, async (ruta) => {
      envios += 1;
      await new Promise((resolver) => setTimeout(resolver, 700));
      await ruta.continue();
    });

    await page.getByTestId('select-reclamo-motivo').selectOption('PRODUCTO_EN_MAL_ESTADO');
    await page.getByTestId('input-reclamo-descripcion').fill(DESCRIPCION_VALIDA);
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('btn-enviar-reclamo')).toHaveText('Enviando…');
    await expect(page.getByTestId('btn-enviar-reclamo')).toBeDisabled();
    await capturarReclamos(page, '05-cliente-enviando');

    await expect(page.getByTestId('reclamo-recibido')).toBeVisible();
    await expect(page.getByTestId('titulo-reclamo-recibido')).toHaveText('Recibimos tu reclamo');
    await expect(page.getByTestId('titulo-reclamo-recibido')).toBeFocused();
    await expect(page.getByTestId('texto-reclamo-recibido')).toHaveText('Lo vamos a revisar y te avisamos con el resultado, acá y por email.');
    await expect(page.locator('.toast')).toContainText('Reclamo enviado');
    expect(envios).toBe(1);
    await sinScrollHorizontal(page);
    await expect(page.locator('.toast')).toHaveCount(0);
    await capturarReclamos(page, '06-cliente-reclamo-recibido');

    await page.getByTestId('btn-volver-pedido').click();
    await expect(page.getByTestId('bloque-reclamo')).toBeVisible();
    await expect(page.getByTestId('estado-reclamo')).toContainText('En revisión');
    await expect(page.getByTestId('linea-reclamo')).toContainText('Producto en mal estado · Enviado el');
    await expect(page.getByTestId('texto-reclamo-pendiente')).toHaveText('Lo estamos revisando. Te avisamos cuando tengamos novedades.');
    await expect(page.getByTestId('btn-reclamar-pedido')).toHaveCount(0);
    await expect(page.getByTestId('seccion-reclamar')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '07-cliente-resultado-en-revision');
  });

  test('un error del servidor aparece en un aviso visible con foco y el segundo reclamo es imposible', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, pedidoId);
    await reclamarPorApi(request, cliente, pedidoId);

    await page.getByTestId('select-reclamo-motivo').selectOption('COBRO_INCORRECTO');
    await page.getByTestId('input-reclamo-descripcion').fill(DESCRIPCION_VALIDA);
    await page.getByTestId('btn-enviar-reclamo').click();

    const aviso = page.getByTestId('aviso-reclamo-mensaje');
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveText('Ya hiciste un reclamo por este pedido.');
    await expect(aviso).toBeFocused();
    await expect(page.getByTestId('btn-enviar-reclamo')).toBeEnabled();
    await capturarReclamos(page, '08-cliente-error-de-la-api');

    await page.goto(`/reclamo-nuevo.html?pedido=${pedidoId}`);
    await expect(page.getByTestId('texto-reclamo-no-disponible')).toHaveText('Ya hiciste un reclamo por este pedido.');
    await page.getByTestId('btn-volver-pedido').click();
    await expect(page.getByTestId('btn-reclamar-pedido')).toHaveCount(0);
    expect(Number(sql(`SELECT COUNT(*) FROM reclamo WHERE pedido_id = ${pedidoId};`))).toBe(1);
  });

  test('un pedido ajeno o inexistente no abre el formulario', async ({ page, request }) => {
    const otro = await nuevoCliente(request, esc.localidadId);
    const ajeno = await pedidoEntregado(request, esc, otro);
    await abrirComoUsuario(page, cliente.sesion);
    for (const destino of [`/reclamo-nuevo.html?pedido=${ajeno}`, '/reclamo-nuevo.html?pedido=99999999', '/reclamo-nuevo.html', '/reclamo-nuevo.html?pedido=abc']) {
      await page.goto(destino);
      await expect(page.getByTestId('titulo-reclamo-no-disponible')).toBeVisible();
      await expect(page.getByTestId('formulario-reclamo')).toHaveCount(0);
    }
  });

  test('un reclamo aprobado con reembolso total muestra el monto y que ya se envió a Mercado Pago', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    const reclamoId = await reclamarPorApi(request, cliente, pedidoId);
    expect((await resolverPorApi(request, esc.adminToken, reclamoId, { tipo: 'REEMBOLSO_TOTAL' })).status).toBe(200);
    await abrirPedido(page, pedidoId);

    await expect(page.getByTestId('estado-reclamo')).toContainText('Aprobado');
    const monto = `$${String(TOTAL_PEDIDO).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    await expect(page.getByTestId('texto-reclamo-aprobado')).toHaveText(`Aprobamos tu reclamo. Te devolvemos ${monto}.`);
    await expect(page.getByTestId('texto-reembolso-reclamo')).toContainText('El reembolso ya fue enviado a Mercado Pago. Puede tardar unos días en verse en tu medio de pago.');
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '09-cliente-resultado-aprobado-total');
  });

  test('un reclamo aprobado en parte con el reembolso en proceso lo aclara y muestra cuánto se pagó', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente, { cantidad: 2 });
    const reclamoId = await reclamarPorApi(request, cliente, pedidoId, 'PRODUCTOS_EQUIVOCADOS');
    await conReembolsosFallidos(request, 'Sin saldo suficiente en la cuenta', async () => {
      const resuelto = await resolverPorApi(request, esc.adminToken, reclamoId, { tipo: 'REEMBOLSO_PARCIAL', monto: 1250.5 });
      expect(resuelto.status).toBe(200);
    });
    await expect.poll(async () => (await estadoDelReclamo(request, pedidoId)).reembolsoEnProceso).toBe(true);
    await abrirPedido(page, pedidoId);

    const total = (await apiGet(request, '/pedidos/cliente', cliente.sesion.token)).body.data.find((p: { id: number }) => p.id === pedidoId).total;
    expect(total).toBe(PRECIO_PRODUCTO * 2 + CARGO_CLIENTE);
    await expect(page.getByTestId('texto-reclamo-aprobado')).toHaveText('Aprobamos tu reclamo. Te devolvemos $1.250,50 de los $9.800 que pagaste.');
    await expect(page.getByTestId('texto-reembolso-reclamo')).toHaveText('El reembolso está en proceso y puede tardar unos días en verse en tu medio de pago.');
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '10-cliente-resultado-aprobado-parcial-en-proceso');
  });

  test('un reclamo rechazado muestra el motivo tal cual, no deja reclamar de nuevo y lleva a Soporte', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    const reclamoId = await reclamarPorApi(request, cliente, pedidoId, 'OTRO', HTML_EN_TEXTO);
    const motivo = '<i>Revisamos</i> el pedido y salió completo';
    expect((await resolverPorApi(request, esc.adminToken, reclamoId, { tipo: 'RECHAZO', motivo })).status).toBe(200);
    await abrirPedido(page, pedidoId);

    await expect(page.getByTestId('estado-reclamo')).toContainText('Rechazado');
    await expect(page.getByTestId('texto-reclamo-rechazado')).toHaveText('No pudimos aprobar tu reclamo.');
    await expect(page.getByTestId('motivo-reclamo-rechazado')).toHaveText(`Motivo: ${motivo}`);
    await expect(page.getByTestId('bloque-reclamo').locator('i')).toHaveCount(0);
    await expect(page.getByTestId('btn-reclamar-pedido')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '11-cliente-resultado-rechazado');

    const soporte = page.getByTestId('btn-contactar-soporte-reclamo');
    await expect(soporte).toHaveAttribute('href', 'soporte.html?tipo=OTRA');
    await soporte.click();
    await expect(page).toHaveURL(/soporte\.html\?tipo=OTRA$/);
    await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('OTRA');
  });

  test('el texto del Cliente con HTML se guarda y se muestra literal', async ({ page, request }) => {
    const pedidoId = await pedidoEntregado(request, esc, cliente);
    await abrirFormulario(page, pedidoId);
    await page.getByTestId('select-reclamo-motivo').selectOption('OTRO');
    await page.getByTestId('input-reclamo-descripcion').fill(HTML_EN_TEXTO);
    await page.getByTestId('btn-enviar-reclamo').click();
    await expect(page.getByTestId('reclamo-recibido')).toBeVisible();

    const guardado = sql(`SELECT descripcion FROM reclamo WHERE pedido_id = ${pedidoId};`);
    expect(guardado).toBe(HTML_EN_TEXTO);
    expect(reclamoIdDe(pedidoId)).toBeGreaterThan(0);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });

  test('el listado de pedidos marca cada reclamo con su estado', async ({ page, request }) => {
    const otro = await nuevoCliente(request, esc.localidadId);
    const enRevision = await pedidoEntregado(request, esc, otro);
    const aprobado = await pedidoEntregado(request, esc, otro);
    const rechazado = await pedidoEntregado(request, esc, otro);
    const sinReclamo = await pedidoEntregado(request, esc, otro);
    await reclamarPorApi(request, otro, enRevision);
    const idAprobado = await reclamarPorApi(request, otro, aprobado);
    const idRechazado = await reclamarPorApi(request, otro, rechazado);
    expect((await resolverPorApi(request, esc.adminToken, idAprobado, { tipo: 'REEMBOLSO_TOTAL' })).status).toBe(200);
    expect((await resolverPorApi(request, esc.adminToken, idRechazado, { tipo: 'RECHAZO', motivo: 'El pedido salió completo' })).status).toBe(200);

    await abrirComoUsuario(page, otro.sesion);
    await page.goto('/pedidos.html');
    await expect(page.getByTestId(`pedido-item-${enRevision}`).getByTestId('chip-reclamo')).toHaveText('Reclamo en revisión');
    await expect(page.getByTestId(`pedido-item-${aprobado}`).getByTestId('chip-reclamo')).toHaveText('Reclamo aprobado');
    await expect(page.getByTestId(`pedido-item-${rechazado}`).getByTestId('chip-reclamo')).toHaveText('Reclamo rechazado');
    await expect(page.getByTestId(`pedido-item-${sinReclamo}`).getByTestId('chip-reclamo')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '12-cliente-listado-con-chips');
  });

  test('el aviso de entrega automática explica el plazo para reclamar con el texto nuevo', async ({ page, request }) => {
    const otro = await nuevoCliente(request, esc.localidadId);
    const pedidoId = await pedidoEnCamino(request, esc, otro);
    expect((await autoconfirmarEnCamino(request)).status).toBe(200);
    expect(sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`)).toBe('ENTREGADO');

    await abrirComoUsuario(page, otro.sesion);
    await page.goto('/notificaciones.html');
    const texto = `Marcamos tu pedido #${pedidoId} como entregado. Si tuviste algún problema, podés reclamar dentro de los 7 días desde esta fecha.`;
    await expect(page.getByText(texto)).toBeVisible();
    await expect(page.getByText('autoconfirmado')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await capturarReclamos(page, '13-cliente-aviso-de-entrega-automatica');
  });
});
