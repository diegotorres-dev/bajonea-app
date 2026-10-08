import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  marcarAptoVenta,
  crearCategoria,
  crearProducto,
  login,
  apiPost,
  apiGet,
  sufijoUnico,
  diaDeHoy,
  aTitleCase,
} from './helpers/backend';

async function loginUi(page: Page, usuario: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(usuario);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/index.html');
}

test.describe('Carrito: stepper y nota (boundary visual)', () => {
  let localidadId: string;
  let comercioId: number;
  let productoId: number;
  let precio: number;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Stepper E2E ${suf}`);
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Stepper E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    comercioId = pendiente.id;
    await resolverComercio(request, adminSesion.token, comercioId, true);
    await marcarAptoVenta(request, comercioId);
    const comercioSesion = await login(request, comercio.nombreUsuario, comercio.password);
    precio = 800;
    productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Stepper E2E ${suf}`,
      precio,
      categoriaId,
    });
  });

  test('en el modal del producto, el stepper clampea visualmente en 1 y en 20 (botones deshabilitados, no solo un límite de backend)', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.goto(`/comercio-detalle.html?id=${comercioId}`);
    await page.getByTestId(`producto-item-${productoId}`).click();
    await expect(page.getByTestId('modal-detalle-producto')).toBeVisible();

    const menos = page.getByTestId('btn-restar-cantidad-producto');
    const mas = page.getByTestId('btn-sumar-cantidad-producto');
    const valor = page.getByTestId('cantidad-producto-modal');

    await expect(valor).toHaveText('1');
    await expect(menos).toBeDisabled();

    for (let i = 0; i < 18; i += 1) {
      await mas.click();
    }
    await expect(valor).toHaveText('19');
    await expect(mas).toBeEnabled();
    await mas.click();
    await expect(valor).toHaveText('20');
    await expect(mas).toBeDisabled();

    const notaInput = page.getByTestId('input-nota-producto');
    await notaInput.pressSequentially('x'.repeat(260));
    await expect(notaInput).toHaveValue('x'.repeat(255));
  });

  test('en carrito.html, el stepper de un ítem ya en 20 muestra "+" deshabilitado apenas se carga la pantalla', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.nombreUsuario, cliente.password);
    const { body } = await apiPost(request, '/carrito/items', { productoId, cantidad: 20 }, sesion.token);
    const itemId = body.data.items[0].id as number;

    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.goto('/carrito.html');

    await expect(page.getByTestId(`cantidad-item-carrito-${itemId}`)).toHaveText('20');
    await expect(page.getByTestId(`btn-sumar-cantidad-${itemId}`)).toBeDisabled();
    await expect(page.getByTestId(`btn-restar-cantidad-${itemId}`)).toBeEnabled();
  });
});

test.describe('Checkout: habilitación de botón y bloqueo sin dirección', () => {
  let localidadId: string;
  let comercioId: number;
  let productoId: number;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Checkout E2E ${suf}`);
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Checkout E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
      aceptaDelivery: true,
      aceptaRetiro: true,
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    comercioId = pendiente.id;
    await resolverComercio(request, adminSesion.token, comercioId, true);
    await marcarAptoVenta(request, comercioId);
    const comercioSesion = await login(request, comercio.nombreUsuario, comercio.password);
    productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Checkout E2E ${suf}`,
      precio: 1000,
      categoriaId,
    });
  });

  test('"Continuar" del paso 1 arranca deshabilitado y solo se habilita al elegir una modalidad', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.nombreUsuario, cliente.password);
    await apiPost(request, '/carrito/items', { productoId, cantidad: 1 }, sesion.token);

    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.goto('/carrito.html');
    await page.getByTestId('btn-confirmar-pedido').click();
    await page.waitForURL('**/checkout.html');

    const continuarBtn = page.getByTestId('btn-continuar-modalidad');
    await expect(continuarBtn).toBeDisabled();
    await page.getByTestId('btn-modalidad-domicilio').click();
    await expect(continuarBtn).toBeEnabled();
  });

  test('checkout DOMICILIO sin dirección cargada muestra un mensaje real, no una pantalla rota (rama de UI sin vía real de API para ejercitarla)', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.nombreUsuario, cliente.password);
    await apiPost(request, '/carrito/items', { productoId, cantidad: 1 }, sesion.token);

    await page.route('**/api/v1/clientes/perfil', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.data.direccion = null;
      await route.fulfill({ response, json });
    });

    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.goto('/carrito.html');
    await page.getByTestId('btn-confirmar-pedido').click();
    await page.waitForURL('**/checkout.html');

    await page.getByTestId('btn-modalidad-domicilio').click();
    await page.getByTestId('btn-continuar-modalidad').click();

    await expect(page.getByText('No tenés una dirección registrada')).toBeVisible();
    await expect(page.getByTestId('btn-confirmar-direccion')).toHaveCount(0);
    await expect(page.locator('.js-error, .console-error')).toHaveCount(0);
  });

  test('paso 4 (pago): texto simplificado, sin "Cargo por servicio" ni número de pedido; el paso 3 sí muestra el cargo', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.nombreUsuario, cliente.password);
    await apiPost(request, '/carrito/items', { productoId, cantidad: 1 }, sesion.token);

    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.goto('/carrito.html');
    await page.getByTestId('btn-confirmar-pedido').click();
    await page.waitForURL('**/checkout.html');
    await page.getByTestId('btn-modalidad-retiro').click();
    await page.getByTestId('btn-continuar-modalidad').click();
    await page.getByTestId('btn-confirmar-retiro').click();

    const paso3 = await page.getByTestId('btn-confirmar-pedido').locator('..').innerText();
    expect(paso3).toContain('Cargo por servicio');

    await page.getByTestId('btn-confirmar-pedido').click();
    await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();

    const paso4 = await page.getByTestId('btn-ir-a-pagar').locator('..').innerText();
    expect(paso4).toContain('Te vamos a redirigir a Mercado Pago para completar el pago.');
    expect(paso4).toContain('Total');
    expect(paso4).not.toContain('Cargo por servicio');
    expect(paso4).not.toContain('#');
    expect(paso4).not.toContain('Comercio Checkout E2E');
  });
});

test.describe('Explorar: búsqueda con debounce y filtros combinados', () => {
  let localidadId: string;
  let comercioId: number;
  let categoriaId: number;
  let tagId: number;
  let productoConTagId: number;
  let productoSinTagId: number;
  let sufijoProductos: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    sufijoProductos = suf;
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Explorar E2E ${suf}`);
    const { body: tagBody } = await apiPost(request, '/tags', { nombre: `Tag Explorar E2E ${suf}` }, adminSesion.token);
    tagId = tagBody.data.id as number;

    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Explorar E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    comercioId = pendiente.id;
    await resolverComercio(request, adminSesion.token, comercioId, true);
    await marcarAptoVenta(request, comercioId);
    const comercioSesion = await login(request, comercio.nombreUsuario, comercio.password);

    const { body: productoConTag } = await apiPost(
      request,
      '/productos',
      { nombre: `Producto Explorar Etiquetado ${suf}`, precio: 500, categoriaId, tagIds: [tagId] },
      comercioSesion.token,
    );
    productoConTagId = productoConTag.data.id as number;

    const { body: productoSinTag } = await apiPost(
      request,
      '/productos',
      { nombre: `Producto Explorar Simple ${suf}`, precio: 500, categoriaId },
      comercioSesion.token,
    );
    productoSinTagId = productoSinTag.data.id as number;
  });

  test('tipear rápido en el buscador dispara una sola request al backend, no una por tecla (debounce real de 300ms)', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.nombreUsuario, cliente.password);

    const requestsAProductos: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/catalogo/productos?')) {
        requestsAProductos.push(req.url());
      }
    });

    await page.clock.install();
    const cargaInicial = page.waitForResponse((res) => res.url().includes('/catalogo/productos?'));
    await page.goto('/explorar.html');
    await cargaInicial;
    await expect(page.getByTestId('lista-productos-explorar')).toBeVisible();
    const ahoraEnLaPagina = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(ahoraEnLaPagina + 1000);
    const antesDeEscribir = requestsAProductos.length;

    await page.getByTestId('input-buscar-producto-explorar').pressSequentially('Explorar Etiquetado');
    expect(requestsAProductos.length).toBe(antesDeEscribir);

    const peticionBusqueda = page.waitForRequest(
      (req) =>
        req.url().includes('/catalogo/productos?') &&
        new URL(req.url()).searchParams.get('q') === 'explorar etiquetado',
    );
    await page.clock.runFor(350);
    await peticionBusqueda;
    expect(requestsAProductos.length).toBe(antesDeEscribir + 1);
    await expect(page.getByTestId(`producto-item-${productoConTagId}`)).toBeVisible();
  });

  test('categoría + tag combinados filtran junto con el texto, y "sin resultados" muestra un mensaje real', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.nombreUsuario, cliente.password);
    await page.goto('/explorar.html');

    await page.getByTestId(`chip-categoria-${categoriaId}`).click();
    await expect(page.getByTestId(`chip-categoria-${categoriaId}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`producto-item-${productoConTagId}`)).toBeVisible();
    await expect(page.getByTestId(`producto-item-${productoSinTagId}`)).toBeVisible();

    await page.getByTestId(`chip-tag-${tagId}`).click();
    await expect(page.getByTestId(`chip-tag-${tagId}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`producto-item-${productoConTagId}`)).toBeVisible();
    await expect(page.getByTestId(`producto-item-${productoSinTagId}`)).toHaveCount(0);

    await page.getByTestId('input-buscar-producto-explorar').fill(`inexistente-${sufijoProductos}-zzz`);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('estado-vacio')).toBeVisible();
    await expect(page.getByText('Sin resultados')).toBeVisible();
    await expect(page.getByText('Probá con otro filtro')).toBeVisible();
  });
});
