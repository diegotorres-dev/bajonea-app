import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  crearCategoria,
  crearProducto,
  login,
  marcarAptoVenta,
  confirmarPagoTest,
  sufijoUnico,
  diaDeHoy,
} from './helpers/backend';

function formatearPrecio(valor: number): string {
  const entero = Math.round(valor);
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

const CARGO_SERVICIO_CLIENTE_FIJO = 200;

async function loginClienteUi(page: Page, nombreUsuario: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(nombreUsuario);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/index.html');
}

async function loginComercioUi(page: Page, nombreUsuario: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(nombreUsuario);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/comercio-dashboard.html');
}

test.describe('Flujo completo de pedido: Cliente pide, Comercio resuelve, ambos lados se enteran', () => {
  let categoriaId: number;
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Pedidos E2E ${sufijoUnico()}`);
  });

  async function crearComercioConProducto(
    request: import('@playwright/test').APIRequestContext,
    adminToken: string,
    opciones: { aceptaDelivery: boolean; aceptaRetiro: boolean; nombre: string; precio: number },
  ) {
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: opciones.nombre,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
      aceptaDelivery: opciones.aceptaDelivery,
      aceptaRetiro: opciones.aceptaRetiro,
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminToken, comercio.email);
    await resolverComercio(request, adminToken, pendiente.id, true);
    await marcarAptoVenta(request, pendiente.id);
    const comercioSesion = await login(request, comercio.nombreUsuario, comercio.password);
    const productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Pedido E2E ${sufijoUnico()}`,
      precio: opciones.precio,
      categoriaId,
    });
    return { comercioId: pendiente.id, comercioUsuario: comercio.nombreUsuario, comercioPassword: comercio.password, productoId };
  }

  test('envío a domicilio: pedido nuevo -> el comercio lo acepta -> el cliente ve el estado actualizado y recibe la notificación real por polling', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60000);

    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const precio = 4500;
    const { comercioId, comercioUsuario, comercioPassword, productoId } = await crearComercioConProducto(request, adminSesion.token, {
      aceptaDelivery: true,
      aceptaRetiro: false,
      nombre: `Comercio Pedido Domicilio E2E ${sufijoUnico()}`,
      precio,
    });
    const cliente = await registrarYVerificarCliente(request, localidadId);

    const clienteContext = await browser.newContext();
    const comercioContext = await browser.newContext();
    try {
      const clientePage = await clienteContext.newPage();
      const comercioPage = await comercioContext.newPage();

      await loginClienteUi(clientePage, cliente.nombreUsuario, cliente.password);
      await clientePage.goto(`/comercio-detalle.html?id=${comercioId}`);
      await clientePage.getByTestId(`producto-item-${productoId}`).click();
      await expect(clientePage.getByTestId('modal-detalle-producto')).toBeVisible();

      const agregarResponse = clientePage.waitForResponse(
        (res) => res.url().endsWith('/carrito/items') && res.request().method() === 'POST',
      );
      await clientePage.getByTestId('btn-agregar-carrito').click();
      await agregarResponse;

      await clientePage.goto('/carrito.html');
      await clientePage.getByTestId('btn-confirmar-pedido').click();
      await clientePage.waitForURL('**/checkout.html');

      await clientePage.getByTestId('btn-modalidad-domicilio').click();
      await clientePage.getByTestId('btn-continuar-modalidad').click();
      await clientePage.getByTestId('btn-confirmar-direccion').click();
      await expect(clientePage.getByTestId('total-carrito')).toHaveText(formatearPrecio(precio + CARGO_SERVICIO_CLIENTE_FIJO));

      const confirmarPedidoResponse = clientePage.waitForResponse(
        (res) => res.url().endsWith('/pedidos/cliente') && res.request().method() === 'POST',
      );
      await clientePage.getByTestId('btn-confirmar-pedido').click();
      const respuestaPedido = await confirmarPedidoResponse;
      expect(respuestaPedido.status()).toBe(201);
      const pedidoId = (await respuestaPedido.json()).data.id as number;

      await expect(clientePage.getByTestId('btn-ir-a-pagar')).toBeVisible();
      await confirmarPagoTest(request, pedidoId);

      await loginComercioUi(comercioPage, comercioUsuario, comercioPassword);
      await comercioPage.goto('/comercio-pedidos.html');
      const filaComercio = comercioPage.getByTestId(`pedido-item-${pedidoId}`);
      await expect(filaComercio).toBeVisible();
      await expect(filaComercio).toContainText(`${cliente.nombre} ${cliente.apellido}`);

      await comercioPage.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(comercioPage.getByTestId('numero-pedido')).toContainText(`#${pedidoId}`);
      await expect(comercioPage.getByTestId('nombre-cliente-pedido')).toContainText(cliente.nombre);
      await expect(comercioPage.getByTestId('estado-pedido')).toContainText('esperando tu confirmación');

      await clientePage.goto('/notificaciones.html');
      await expect(clientePage.getByTestId('estado-vacio')).toBeVisible();

      const aceptarResponse = comercioPage.waitForResponse(
        (res) => res.url().endsWith(`/pedidos/comercio/${pedidoId}/aceptar`) && res.request().method() === 'PUT',
      );
      await comercioPage.getByTestId('btn-aceptar-pedido').click();
      const respuestaAceptar = await aceptarResponse;
      expect(respuestaAceptar.status()).toBe(200);
      expect((await respuestaAceptar.json()).data.estado).toBe('EN_PREPARACION');
      await expect(comercioPage.getByTestId('estado-pedido')).toContainText('en preparación');

      const notificacionNueva = clientePage.locator('[data-testid^="notificacion-item-"]');
      await expect(notificacionNueva).toBeVisible({ timeout: 25000 });
      await expect(notificacionNueva).toContainText('fue aceptado');

      await clientePage.goto(`/pedido-detalle.html?id=${pedidoId}`);
      await expect(clientePage.getByTestId('estado-pedido')).toContainText('aceptó tu pedido y lo está preparando');
    } finally {
      await clienteContext.close();
      await comercioContext.close();
    }
  });

  test('retiro en el local: el comercio rechaza el pedido con un motivo y el cliente ve el estado y el motivo real', async ({
    browser,
    request,
  }) => {
    test.setTimeout(45000);

    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const precio = 2200;
    const { comercioId, comercioUsuario, comercioPassword, productoId } = await crearComercioConProducto(request, adminSesion.token, {
      aceptaDelivery: false,
      aceptaRetiro: true,
      nombre: `Comercio Pedido Retiro E2E ${sufijoUnico()}`,
      precio,
    });
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const motivo = 'SIN_STOCK';
    const comentario = 'Se agotó justo antes de que llegara tu pedido, disculpá las molestias.';

    const clienteContext = await browser.newContext();
    const comercioContext = await browser.newContext();
    try {
      const clientePage = await clienteContext.newPage();
      const comercioPage = await comercioContext.newPage();

      await loginClienteUi(clientePage, cliente.nombreUsuario, cliente.password);
      await clientePage.goto(`/comercio-detalle.html?id=${comercioId}`);
      await clientePage.getByTestId(`producto-item-${productoId}`).click();
      await expect(clientePage.getByTestId('modal-detalle-producto')).toBeVisible();

      const agregarResponse = clientePage.waitForResponse(
        (res) => res.url().endsWith('/carrito/items') && res.request().method() === 'POST',
      );
      await clientePage.getByTestId('btn-agregar-carrito').click();
      await agregarResponse;

      await clientePage.goto('/carrito.html');
      await clientePage.getByTestId('btn-confirmar-pedido').click();
      await clientePage.waitForURL('**/checkout.html');

      await clientePage.getByTestId('btn-modalidad-retiro').click();
      await clientePage.getByTestId('btn-continuar-modalidad').click();
      await clientePage.getByTestId('btn-confirmar-retiro').click();
      await expect(clientePage.getByTestId('total-carrito')).toHaveText(formatearPrecio(precio + CARGO_SERVICIO_CLIENTE_FIJO));

      const confirmarPedidoResponse = clientePage.waitForResponse(
        (res) => res.url().endsWith('/pedidos/cliente') && res.request().method() === 'POST',
      );
      await clientePage.getByTestId('btn-confirmar-pedido').click();
      const respuestaPedido = await confirmarPedidoResponse;
      expect(respuestaPedido.status()).toBe(201);
      const pedidoId = (await respuestaPedido.json()).data.id as number;
      expect((await respuestaPedido.json()).data.tipoEntrega).toBe('RETIRO');
      await expect(clientePage.getByTestId('btn-ir-a-pagar')).toBeVisible();
      await confirmarPagoTest(request, pedidoId);

      await loginComercioUi(comercioPage, comercioUsuario, comercioPassword);
      await comercioPage.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
      await expect(comercioPage.getByTestId('btn-rechazar-pedido')).toBeVisible();

      await comercioPage.getByTestId('btn-rechazar-pedido').click();
      await expect(comercioPage.getByTestId('modal-rechazar-pedido')).toBeVisible();
      await comercioPage.getByTestId('select-motivo-rechazo').selectOption(motivo);
      await comercioPage.getByTestId('input-comentario-rechazo').fill(comentario);

      const rechazarResponse = comercioPage.waitForResponse(
        (res) => res.url().endsWith(`/pedidos/comercio/${pedidoId}/rechazar`) && res.request().method() === 'PUT',
      );
      await comercioPage.getByTestId('btn-confirmar-rechazo').click();
      const respuestaRechazar = await rechazarResponse;
      expect(respuestaRechazar.status()).toBe(200);
      const bodyEnviado = respuestaRechazar.request().postDataJSON();
      expect(bodyEnviado.motivo).toBe(motivo);
      expect(bodyEnviado.comentario).toBe(comentario);
      expect((await respuestaRechazar.json()).data.estado).toBe('RECHAZADO');
      await expect(comercioPage.getByTestId('estado-pedido')).toContainText('Rechazaste este pedido');

      await clientePage.goto(`/pedido-detalle.html?id=${pedidoId}`);
      await expect(clientePage.getByTestId('estado-pedido')).toContainText('rechazó tu pedido');
      await expect(clientePage.getByTestId('motivo-rechazo-pedido')).toContainText('Sin stock');
      await expect(clientePage.getByTestId('motivo-rechazo-pedido')).toContainText(comentario);

      await clientePage.goto('/notificaciones.html');
      const notificacion = clientePage.locator('[data-testid^="notificacion-item-"]').first();
      await expect(notificacion).toContainText('fue rechazado');
      await expect(notificacion).toContainText('Sin stock');
    } finally {
      await clienteContext.close();
      await comercioContext.close();
    }
  });
});
