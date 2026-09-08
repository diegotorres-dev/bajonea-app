import { test, expect } from '@playwright/test';
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
  apiPost,
  sufijoUnico,
  diaDeHoy,
  diaDistintoDeHoy,
  aTitleCase,
} from './helpers/backend';

function formatearPrecio(valor: number): string {
  const entero = Math.round(valor);
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

async function loginUi(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/index.html');
}

test.describe('Carrito simplificado', () => {
  let comercioAbiertoId: number;
  let productoAId: number;
  let productoBId: number;
  let precioA: number;
  let precioB: number;
  let comercioCerradoId: number;

  test.beforeAll(async ({ request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Carrito E2E ${suf}`);

    const comercioAbierto = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Carrito E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    });
    const pendienteAbierto = await buscarComercioPendientePorEmail(request, adminSesion.token, comercioAbierto.email);
    comercioAbiertoId = pendienteAbierto.id;
    await resolverComercio(request, adminSesion.token, comercioAbiertoId, true);
    const comercioAbiertoSesion = await login(request, comercioAbierto.email, comercioAbierto.password);

    precioA = 1200;
    precioB = 2500;
    productoAId = await crearProducto(request, comercioAbiertoSesion.token, {
      nombre: `Producto A Carrito E2E ${suf}`,
      precio: precioA,
      categoriaId,
    });
    productoBId = await crearProducto(request, comercioAbiertoSesion.token, {
      nombre: `Producto B Carrito E2E ${suf}`,
      precio: precioB,
      categoriaId,
    });

    const comercioCerrado = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Cerrado Carrito E2E ${suf}`,
      horarios: [{ diaSemana: diaDistintoDeHoy(), horaApertura: '10:00', horaCierre: '18:00' }],
    });
    const pendienteCerrado = await buscarComercioPendientePorEmail(request, adminSesion.token, comercioCerrado.email);
    comercioCerradoId = pendienteCerrado.id;
    await resolverComercio(request, adminSesion.token, comercioCerradoId, true);
    const comercioCerradoSesion = await login(request, comercioCerrado.email, comercioCerrado.password);
    await crearProducto(request, comercioCerradoSesion.token, {
      nombre: `Producto Cerrado Carrito E2E ${suf}`,
      precio: 900,
      categoriaId,
    });
  });

  test('el cliente agrega un producto al carrito desde el detalle del comercio', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const cliente = await registrarYVerificarCliente(request, localidadId);

    await loginUi(page, cliente.email, cliente.password);
    await page.goto(`/comercio-detalle.html?id=${comercioAbiertoId}`);

    await page.getByTestId(`producto-item-${productoAId}`).click();
    await expect(page.getByTestId('modal-detalle-producto')).toBeVisible();
    await page.getByTestId('btn-sumar-cantidad-producto').click();
    await expect(page.getByTestId('cantidad-producto-modal')).toHaveText('2');
    await page.getByTestId('input-nota-producto').fill('Sin sal');

    const agregarResponse = page.waitForResponse(
      (res) => res.url().endsWith('/carrito/items') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-agregar-carrito').click();
    const respuesta = await agregarResponse;
    expect(respuesta.status()).toBe(201);
    const body = await respuesta.json();
    const itemId = body.data.items[0].id as number;

    await page.goto('/carrito.html');
    await expect(page.getByTestId(`item-carrito-${itemId}`)).toBeVisible();
    // ProductoService normaliza el nombre a Title Case al persistir -- "E2E" vuelve "E2e".
    await expect(page.getByTestId(`item-carrito-${itemId}`)).toContainText(aTitleCase('Producto A Carrito E2E'));
    await expect(page.getByTestId(`cantidad-item-carrito-${itemId}`)).toHaveText('2');
    await expect(page.getByTestId(`subtotal-item-carrito-${itemId}`)).toHaveText(formatearPrecio(precioA * 2));
    await expect(page.getByTestId('total-carrito')).toHaveText(formatearPrecio(precioA * 2));
  });

  test('modificar la cantidad de un ítem actualiza el total del carrito', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.email, cliente.password);

    const { body } = await apiPost(request, '/carrito/items', { productoId: productoAId, cantidad: 1 }, sesion.token);
    const itemId = body.data.items[0].id as number;

    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/carrito.html');

    await expect(page.getByTestId(`cantidad-item-carrito-${itemId}`)).toHaveText('1');
    await expect(page.getByTestId('total-carrito')).toHaveText(formatearPrecio(precioA));

    const actualizarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/carrito/items/${itemId}`) && res.request().method() === 'PUT',
    );
    await page.getByTestId(`btn-sumar-cantidad-${itemId}`).click();
    await actualizarResponse;

    await expect(page.getByTestId(`cantidad-item-carrito-${itemId}`)).toHaveText('2');
    await expect(page.getByTestId(`subtotal-item-carrito-${itemId}`)).toHaveText(formatearPrecio(precioA * 2));
    await expect(page.getByTestId('total-carrito')).toHaveText(formatearPrecio(precioA * 2));
  });

  test('quitar un ítem del carrito deja el resto de los productos intactos', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.email, cliente.password);

    await apiPost(request, '/carrito/items', { productoId: productoAId, cantidad: 1 }, sesion.token);
    const { body } = await apiPost(request, '/carrito/items', { productoId: productoBId, cantidad: 1 }, sesion.token);
    const itemA = body.data.items.find((i: any) => i.productoId === productoAId).id as number;
    const itemB = body.data.items.find((i: any) => i.productoId === productoBId).id as number;

    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/carrito.html');

    await expect(page.getByTestId(`item-carrito-${itemA}`)).toBeVisible();
    await expect(page.getByTestId(`item-carrito-${itemB}`)).toBeVisible();

    const eliminarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/carrito/items/${itemA}`) && res.request().method() === 'DELETE',
    );
    await page.getByTestId(`btn-eliminar-item-carrito-${itemA}`).click();
    await eliminarResponse;

    await expect(page.getByTestId(`item-carrito-${itemA}`)).toHaveCount(0);
    await expect(page.getByTestId(`item-carrito-${itemB}`)).toBeVisible();
    await expect(page.getByTestId('total-carrito')).toHaveText(formatearPrecio(precioB));
  });

  test('vaciar el carrito completo deja la pantalla en su estado vacío', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.email, cliente.password);
    await apiPost(request, '/carrito/items', { productoId: productoAId, cantidad: 1 }, sesion.token);

    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/carrito.html');

    await expect(page.getByTestId('tarjeta-comercio-carrito')).toBeVisible();
    await page.getByTestId('btn-vaciar-carrito').click();
    await expect(page.getByTestId('modal-vaciar-carrito')).toBeVisible();

    const vaciarResponse = page.waitForResponse(
      (res) => res.url().endsWith('/carrito') && res.request().method() === 'DELETE',
    );
    await page.getByTestId('btn-confirmar-vaciar-carrito').click();
    await vaciarResponse;

    await expect(page.getByTestId('modal-vaciar-carrito')).toHaveCount(0);
    await expect(page.getByTestId('tarjeta-comercio-carrito')).toHaveCount(0);
    await expect(page.getByTestId('btn-explorar-comercios')).toBeVisible();
  });

  // "Comercio bloqueado" (EstadoComercio.SUSPENDIDO/INACTIVO) no tiene ninguna vía real para
  // llegar a ese estado en el MVP -- no hay endpoint de suspensión de Administrador (fuera de
  // alcance, CLAUDE.md §1) y ya quedó documentado como limitación conocida en el cierre de
  // Fase 14 (docs/AUDITORIA-POSTMAN-FASE10-14.md). El único caso de rechazo real y alcanzable
  // por UI es "fuera de horario", que es lo que se prueba acá: el backend (CarritoService.
  // agregarItem -> ComercioService.validarAceptaPedidos) devolvería 409 si se pudiera forzar
  // el click, pero la UI ya oculta el botón "Agregar al carrito" para un comercio cerrado y
  // muestra el aviso correspondiente en su lugar -- eso es lo que se verifica.
  test('un producto de un comercio cerrado fuera de horario no se puede agregar al carrito', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const cliente = await registrarYVerificarCliente(request, localidadId);

    await loginUi(page, cliente.email, cliente.password);
    await page.goto(`/comercio-detalle.html?id=${comercioCerradoId}`);

    await expect(page.getByTestId('estado-comercio')).toContainText('Cerrado');

    const productoItem = page.locator('[data-testid^="producto-item-"]').first();
    await productoItem.click();
    await expect(page.getByTestId('modal-detalle-producto')).toBeVisible();

    await expect(page.getByText('Este comercio está cerrado en este momento.')).toBeVisible();
    await expect(page.getByTestId('btn-agregar-carrito')).toHaveCount(0);
  });
});
