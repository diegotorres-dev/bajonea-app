import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarComercio,
  registrarYVerificarCliente,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  crearCategoria,
  crearProducto,
  agregarItemCarrito,
  crearPedido,
  login,
  marcarAptoVenta,
  confirmarPagoTest,
  sufijoUnico,
  diaDeHoy,
} from './helpers/backend';

async function loginUi(page: Page, nombreUsuario: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(nombreUsuario);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/comercio-dashboard.html');
}

test.describe('Rechazo de pedido: obligatoriedad condicional del comentario cuando motivo=OTRO', () => {
  let localidadId: string;
  let categoriaId: number;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Rechazo E2E ${sufijoUnico()}`);
  });

  async function crearPedidoPendiente(request: import('@playwright/test').APIRequestContext) {
    const suf = sufijoUnico();
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Rechazo E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
      aceptaDelivery: false,
      aceptaRetiro: true,
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    await resolverComercio(request, adminSesion.token, pendiente.id, true);
    await marcarAptoVenta(request, pendiente.id);
    const comercioSesion = await login(request, comercio.nombreUsuario, comercio.password);
    const productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Rechazo E2E ${suf}`,
      precio: 2000,
      categoriaId,
    });

    const cliente = await registrarYVerificarCliente(request, localidadId);
    const clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);
    await agregarItemCarrito(request, clienteSesion.token, productoId, 1);
    const pedidoId = await crearPedido(request, clienteSesion.token, 'RETIRO');
    await confirmarPagoTest(request, pedidoId);

    return { comercioUsuario: comercio.nombreUsuario, comercioPassword: comercio.password, pedidoId };
  }

  test('motivo=OTRO sin comentario: el botón "Rechazar pedido" del modal lo bloquea con el error visible junto al textarea, sin llegar a llamar al backend', async ({ page, request }) => {
    const { comercioUsuario, comercioPassword, pedidoId } = await crearPedidoPendiente(request);

    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await page.getByTestId('btn-rechazar-pedido').click();
    await expect(page.getByTestId('modal-rechazar-pedido')).toBeVisible();

    await page.getByTestId('select-motivo-rechazo').selectOption('OTRO');
    await expect(page.locator('#rechazo-comentario-label')).toHaveText('Comentario');

    let seEnvioAlgo = false;
    const detectarEnvio = (req: import('@playwright/test').Request) => {
      if (req.url().endsWith(`/pedidos/comercio/${pedidoId}/rechazar`)) {
        seEnvioAlgo = true;
      }
    };
    page.on('request', detectarEnvio);
    await page.getByTestId('btn-confirmar-rechazo').click();
    await expect(page.getByTestId('mensaje-error-comentario-rechazo')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-comentario-rechazo')).toContainText('Ingresá un comentario para especificar el motivo del rechazo');
    expect(seEnvioAlgo).toBe(false);
    page.off('request', detectarEnvio);

    await expect(page.getByTestId('modal-rechazar-pedido')).toBeVisible();
  });

  test('motivo=OTRO con comentario de solo espacios también bloquea (el frontend hace trim, igual que el backend)', async ({ page, request }) => {
    const { comercioUsuario, comercioPassword, pedidoId } = await crearPedidoPendiente(request);

    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await page.getByTestId('btn-rechazar-pedido').click();
    await page.getByTestId('select-motivo-rechazo').selectOption('OTRO');
    await page.getByTestId('input-comentario-rechazo').fill('    ');

    await page.getByTestId('btn-confirmar-rechazo').click();
    await expect(page.getByTestId('mensaje-error-comentario-rechazo')).toBeVisible();
  });

  test('motivo=OTRO con comentario válido rechaza el pedido; motivo distinto de OTRO no exige comentario', async ({ page, request }) => {
    const { comercioUsuario, comercioPassword, pedidoId } = await crearPedidoPendiente(request);
    const comentario = `No podemos preparar este pedido en este momento (E2E ${sufijoUnico()})`;

    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await page.getByTestId('btn-rechazar-pedido').click();
    await page.getByTestId('select-motivo-rechazo').selectOption('OTRO');
    await page.getByTestId('input-comentario-rechazo').fill(comentario);

    const rechazarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/pedidos/comercio/${pedidoId}/rechazar`) && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-confirmar-rechazo').click();
    const respuesta = await rechazarResponse;
    expect(respuesta.status()).toBe(200);
    const bodyRequest = respuesta.request().postDataJSON();
    expect(bodyRequest.motivo).toBe('OTRO');
    expect(bodyRequest.comentario).toBe(comentario);
  });

  test('cambiar de motivo OTRO a uno distinto limpia el error de comentario ya mostrado', async ({ page, request }) => {
    const { comercioUsuario, comercioPassword, pedidoId } = await crearPedidoPendiente(request);

    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await page.getByTestId('btn-rechazar-pedido').click();
    await page.getByTestId('select-motivo-rechazo').selectOption('OTRO');
    await page.getByTestId('btn-confirmar-rechazo').click();
    await expect(page.getByTestId('mensaje-error-comentario-rechazo')).toBeVisible();

    await page.getByTestId('select-motivo-rechazo').selectOption('SIN_STOCK');
    await expect(page.locator('#rechazo-comentario-label')).toHaveText('Comentario (opcional)');
    await expect(page.getByTestId('mensaje-error-comentario-rechazo')).toBeHidden();

    const rechazarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/pedidos/comercio/${pedidoId}/rechazar`) && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-confirmar-rechazo').click();
    const respuesta = await rechazarResponse;
    expect(respuesta.status()).toBe(200);
    const bodyRequest = respuesta.request().postDataJSON();
    expect(bodyRequest.motivo).toBe('SIN_STOCK');
    expect(bodyRequest.comentario).toBe(null);
  });
});
