import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuario, loginUi, prepararAprobado } from './helpers/multicomercio';

const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

test.describe('Pedido no retirado en las pantallas (UI mínima), bloque A4b de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let dueno: Dueno;
  let clienteSesion: SesionApi;
  let pedidoNoRetirado: number;
  const erroresDePagina: string[] = [];

  const seguirErrores = (page: Page) => {
    page.on('pageerror', (error) => erroresDePagina.push(error.message));
  };

  test.beforeAll(async ({ request }) => {
    const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    const categoriaId = await crearCategoria(request, adminToken, `Cat No Retirado UI ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    const productoId = await crearProducto(request, dueno.token, { nombre: `Producto No Retirado UI ${sufijoUnico()}`, precio: 10000, categoriaId });
    const cliente = await registrarYVerificarCliente(request, localidadId);
    clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);
    dueno.token = (await login(request, dueno.nombreUsuario, dueno.password)).token;

    await agregarItemCarrito(request, clienteSesion.token, productoId, 1);
    pedidoNoRetirado = await crearPedido(request, clienteSesion.token, 'RETIRO', null);
    await confirmarPagoTest(request, pedidoNoRetirado, true);
    const conComercio = { 'X-Comercio-Id': String(dueno.comercioId) };
    expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoNoRetirado}/aceptar`, dueno.token, conComercio, {})).status).toBe(200);
    expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoNoRetirado}/despachar`, dueno.token, conComercio, {})).status).toBe(200);
    expect((await apiConHeaders(request, 'PUT', `/test/pedidos/${pedidoNoRetirado}/envejecer-listo?minutos=90`, undefined, {}, {})).status).toBe(200);
    expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoNoRetirado}/no-retirado`, dueno.token, conComercio, {})).status).toBe(200);
  });

  test('el Cliente ve el pedido como "No retirado" en la lista y en el detalle, sin devolución', async ({ page }) => {
    seguirErrores(page);
    await abrirComoUsuario(page, clienteSesion);
    await page.goto('/pedidos.html');

    const tarjeta = page.getByTestId(`pedido-item-${pedidoNoRetirado}`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('No retirado');

    await page.goto(`/pedido-detalle.html?id=${pedidoNoRetirado}`);
    await expect(page.getByText('No retirado').first()).toBeVisible();
    await expect(page.getByText('Como ya estaba preparado, no hay devolución del pago.', { exact: false })).toBeVisible();
    await expect(page.getByTestId('btn-cancelar-pedido')).toHaveCount(0);
    await expect(page.getByText('Te devolvimos', { exact: false })).toHaveCount(0);
    expect(erroresDePagina).toEqual([]);
  });

  test('el comercio ve el pedido como "No retirado" en la lista y en el detalle', async ({ page }) => {
    seguirErrores(page);
    await loginUi(page, dueno.nombreUsuario, dueno.password);
    await page.waitForURL('**/comercio-dashboard.html');
    await page.goto('/comercio-pedidos.html');

    const tarjeta = page.getByTestId(`pedido-item-${pedidoNoRetirado}`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('No retirado');

    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoNoRetirado}`);
    await expect(page.getByText('No retirado').first()).toBeVisible();
    await expect(page.getByText('el cliente no pasó a buscarlo', { exact: false })).toBeVisible();
    expect(erroresDePagina).toEqual([]);
  });

  test('un estado de pedido desconocido no rompe la lista ni el detalle del Cliente', async ({ page }) => {
    seguirErrores(page);
    await page.route('**/api/v1/pedidos/cliente', async (route) => {
      const respuesta = await route.fetch();
      const cuerpo = await respuesta.json();
      cuerpo.data = cuerpo.data.map((pedido: any) => ({ ...pedido, estado: 'ESTADO_FUTURO' }));
      await route.fulfill({ response: respuesta, json: cuerpo });
    });
    await abrirComoUsuario(page, clienteSesion);
    await page.goto('/pedidos.html');

    const tarjeta = page.getByTestId(`pedido-item-${pedidoNoRetirado}`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('Estado no disponible');

    await page.goto(`/pedido-detalle.html?id=${pedidoNoRetirado}`);
    await expect(page.getByText('Estado no disponible').first()).toBeVisible();
    expect(erroresDePagina).toEqual([]);
  });

  test('un estado de pedido desconocido no rompe la lista ni el detalle del comercio', async ({ page }) => {
    seguirErrores(page);
    await page.route('**/api/v1/pedidos/comercio', async (route) => {
      const respuesta = await route.fetch();
      const cuerpo = await respuesta.json();
      cuerpo.data = cuerpo.data.map((pedido: any) => ({ ...pedido, estado: 'ESTADO_FUTURO' }));
      await route.fulfill({ response: respuesta, json: cuerpo });
    });
    await loginUi(page, dueno.nombreUsuario, dueno.password);
    await page.waitForURL('**/comercio-dashboard.html');
    await page.goto('/comercio-pedidos.html');

    const tarjeta = page.getByTestId(`pedido-item-${pedidoNoRetirado}`);
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByTestId('estado-pedido')).toHaveText('Estado no disponible');

    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoNoRetirado}`);
    await expect(page.getByText('Estado no disponible').first()).toBeVisible();
    expect(erroresDePagina).toEqual([]);
  });
});
