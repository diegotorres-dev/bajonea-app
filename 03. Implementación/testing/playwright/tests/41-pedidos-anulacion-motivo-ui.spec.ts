import { test, expect } from '@playwright/test';
import type { APIRequestContext, Request } from '@playwright/test';
import {
  agregarItemCarrito,
  apiPut,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuario, loginUi, prepararAprobado } from './helpers/multicomercio';

test.describe('Anular con motivo de la lista y cancelación del Cliente con devolución en gestión (UI), bloque A0b de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let dueno: Dueno;
  let productoId: number;
  let clienteSesion: SesionApi;

  test.beforeAll(async ({ request }) => {
    const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    const categoriaId = await crearCategoria(request, adminToken, `Cat Anulacion UI ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto Anulacion UI ${sufijoUnico()}`, precio: 10000, categoriaId });
    const cliente = await registrarYVerificarCliente(request, localidadId);
    clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);
  });

  async function pedidoPagado(request: APIRequestContext): Promise<number> {
    await agregarItemCarrito(request, clienteSesion.token, productoId, 1);
    const pedidoId = await crearPedido(request, clienteSesion.token, 'RETIRO');
    await confirmarPagoTest(request, pedidoId, true);
    return pedidoId;
  }

  async function pedidoEnPreparacion(request: APIRequestContext): Promise<number> {
    const pedidoId = await pedidoPagado(request);
    dueno.token = (await login(request, dueno.nombreUsuario, dueno.password)).token;
    expect((await apiPut(request, `/pedidos/comercio/${pedidoId}/aceptar`, {}, dueno.token)).status).toBe(200);
    return pedidoId;
  }

  async function abrirDetalleComoDueno(page: import('@playwright/test').Page, pedidoId: number) {
    await loginUi(page, dueno.nombreUsuario, dueno.password);
    await page.waitForURL('**/comercio-dashboard.html');
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await page.getByTestId('btn-anular-pedido').click();
    await expect(page.getByTestId('modal-anular-pedido')).toBeVisible();
  }

  test('el modal de anulación ofrece los siete motivos de la lista y ya no pide texto libre obligatorio', async ({ page, request }) => {
    const pedidoId = await pedidoEnPreparacion(request);
    await abrirDetalleComoDueno(page, pedidoId);

    const opciones = await page.getByTestId('select-motivo-anulacion').locator('option:not([disabled])').evaluateAll((nodos) => nodos.map((nodo) => (nodo as HTMLOptionElement).value));
    expect(opciones).toEqual(['SIN_STOCK', 'CERRADO', 'ALTO_VOLUMEN_PEDIDOS', 'PRODUCTO_NO_DISPONIBLE_TEMPORAL', 'SIN_DELIVERY_DISPONIBLE', 'PROBLEMA_TECNICO', 'OTRO']);
    await expect(page.locator('#anulacion-comentario-label')).toHaveText('Comentario (opcional)');
  });

  test('sin elegir motivo, y con OTRO sin comentario, el modal bloquea sin llamar al backend', async ({ page, request }) => {
    const pedidoId = await pedidoEnPreparacion(request);
    await abrirDetalleComoDueno(page, pedidoId);

    let seEnvio = false;
    const detectar = (req: Request) => {
      if (req.url().endsWith(`/pedidos/comercio/${pedidoId}/anular`)) seEnvio = true;
    };
    page.on('request', detectar);

    await page.getByTestId('btn-confirmar-anulacion').click();
    await expect(page.getByTestId('mensaje-error-motivo-anulacion')).toBeVisible();

    await page.getByTestId('select-motivo-anulacion').selectOption('OTRO');
    await expect(page.locator('#anulacion-comentario-label')).toHaveText('Comentario');
    await expect(page.getByTestId('mensaje-error-motivo-anulacion')).toBeHidden();
    await page.getByTestId('input-comentario-anulacion').fill('    ');
    await page.getByTestId('btn-confirmar-anulacion').click();
    await expect(page.getByTestId('mensaje-error-comentario-anulacion')).toContainText('Ingresá un comentario para especificar el motivo de la anulación');

    await page.getByTestId('select-motivo-anulacion').selectOption('SIN_STOCK');
    await expect(page.locator('#anulacion-comentario-label')).toHaveText('Comentario (opcional)');
    await expect(page.getByTestId('mensaje-error-comentario-anulacion')).toBeHidden();

    expect(seEnvio).toBe(false);
    page.off('request', detectar);
    await expect(page.getByTestId('modal-anular-pedido')).toBeVisible();
  });

  test('anular con un motivo de la lista envía motivo y comentario, anula el pedido y el Cliente ve el motivo y la devolución en gestión', async ({ page, request }) => {
    const pedidoId = await pedidoEnPreparacion(request);
    await abrirDetalleComoDueno(page, pedidoId);

    await page.getByTestId('select-motivo-anulacion').selectOption('PROBLEMA_TECNICO');
    await page.getByTestId('input-comentario-anulacion').fill('Se cortó la luz');
    const respuesta = page.waitForResponse((res) => res.url().endsWith(`/pedidos/comercio/${pedidoId}/anular`) && res.request().method() === 'PUT');
    await page.getByTestId('btn-confirmar-anulacion').click();
    const anulacion = await respuesta;
    expect(anulacion.status()).toBe(200);
    expect(anulacion.request().postDataJSON()).toEqual({ motivo: 'PROBLEMA_TECNICO', comentario: 'Se cortó la luz' });

    const clientePage = await page.context().newPage();
    await abrirComoUsuario(clientePage, clienteSesion);
    await clientePage.goto(`/pedido-detalle.html?id=${pedidoId}`);
    await expect(clientePage.getByText('Problema técnico')).toBeVisible();
    await expect(clientePage.getByText('Se cortó la luz')).toBeVisible();
    await expect(clientePage.getByText('La estamos revisando manualmente', { exact: false })).toBeVisible();
  });

  test('el Cliente que cancela un pedido pagado ve que la devolución de su pago está en gestión', async ({ page, request }) => {
    const pedidoId = await pedidoPagado(request);
    await abrirComoUsuario(page, clienteSesion);
    await page.goto(`/pedido-detalle.html?id=${pedidoId}`);

    const respuesta = page.waitForResponse((res) => res.url().endsWith(`/pedidos/cliente/${pedidoId}/cancelar`) && res.request().method() === 'PUT');
    await page.getByTestId('btn-cancelar-pedido').click();
    expect((await respuesta).status()).toBe(200);

    await expect(page.locator('.toast')).toContainText('Estamos gestionando la devolución de tu pago');
    await expect(page.getByText('Cancelaste este pedido. Estamos gestionando la devolución de tu pago.')).toBeVisible();
  });
});
