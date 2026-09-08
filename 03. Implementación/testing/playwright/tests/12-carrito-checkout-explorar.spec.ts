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
  apiPost,
  apiGet,
  sufijoUnico,
  diaDeHoy,
  aTitleCase,
} from './helpers/backend';

async function loginUi(page: Page, email: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-email').fill(email);
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
    const comercioSesion = await login(request, comercio.email, comercio.password);
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
    await loginUi(page, cliente.email, cliente.password);
    await page.goto(`/comercio-detalle.html?id=${comercioId}`);
    await page.getByTestId(`producto-item-${productoId}`).click();
    await expect(page.getByTestId('modal-detalle-producto')).toBeVisible();

    const menos = page.getByTestId('btn-restar-cantidad-producto');
    const mas = page.getByTestId('btn-sumar-cantidad-producto');
    const valor = page.getByTestId('cantidad-producto-modal');

    // Piso: arranca en 1. Hallazgo real (no corregido en este tramo, ver mapeo de Playwright):
    // catalogo.js solo llama actualizarStepper() desde los listeners de click, nunca al crear
    // el stepper -- así que minusBtn.disabled arranca en `false` (su default) aunque cantidad
    // ya sea 1, y recién queda deshabilitado de verdad después del primer click sobre "−"
    // (que no cambia el valor, pero sí corre actualizarStepper()). No hay forma de bajar de 1
    // en ningún momento (Math.max(1, ...) lo impide funcionalmente), pero el botón no refleja
    // ese piso visualmente hasta ese primer click -- inconsistente con el resto de los
    // steppers del proyecto (carrito.html sí lo deja bien puesto desde el primer render).
    await expect(valor).toHaveText('1');
    await expect(menos).toBeEnabled();
    await menos.click();
    await expect(valor).toHaveText('1');
    await expect(menos).toBeDisabled();

    // Techo: sumar 19 veces más llega a 20 y el botón "+" se deshabilita en el límite exacto,
    // no uno antes ni uno después.
    for (let i = 0; i < 18; i += 1) {
      await mas.click();
    }
    await expect(valor).toHaveText('19');
    await expect(mas).toBeEnabled();
    await mas.click();
    await expect(valor).toHaveText('20');
    await expect(mas).toBeDisabled();

    // El input de nota no deja escribir más de 255 caracteres (maxlength real del HTML).
    const notaInput = page.getByTestId('input-nota-producto');
    await notaInput.pressSequentially('x'.repeat(260));
    await expect(notaInput).toHaveValue('x'.repeat(255));
  });

  test('en carrito.html, el stepper de un ítem ya en 20 muestra "+" deshabilitado apenas se carga la pantalla', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.email, cliente.password);
    const { body } = await apiPost(request, '/carrito/items', { productoId, cantidad: 20 }, sesion.token);
    const itemId = body.data.items[0].id as number;

    await loginUi(page, cliente.email, cliente.password);
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
    const comercioSesion = await login(request, comercio.email, comercio.password);
    productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Checkout E2E ${suf}`,
      precio: 1000,
      categoriaId,
    });
  });

  test('"Continuar" del paso 1 arranca deshabilitado y solo se habilita al elegir una modalidad', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.email, cliente.password);
    await apiPost(request, '/carrito/items', { productoId, cantidad: 1 }, sesion.token);

    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/carrito.html');
    await page.getByTestId('btn-confirmar-pedido').click();
    await page.waitForURL('**/checkout.html');

    const continuarBtn = page.getByTestId('btn-continuar-modalidad');
    await expect(continuarBtn).toBeDisabled();
    await page.getByTestId('btn-modalidad-domicilio').click();
    await expect(continuarBtn).toBeEnabled();
  });

  /**
   * No hay ninguna vía real de API para dejar a un Cliente sin dirección: la dirección es
   * obligatoria en el registro (RegistroClienteRequestDTO.direccion, @NotNull) y no existe
   * ningún endpoint de baja de dirección propia -- mismo gap ya confirmado en la matriz de
   * Postman de Cliente (docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md, punto 7:
   * "Omitido, no simulable"). El bloqueo SÍ existe como código real en js/checkout.js
   * (renderStep2, rama `if (!cliente.direccion)`) -- así que, a diferencia del resto de los
   * specs de este proyecto (que nunca mockean respuestas), acá se intercepta puntualmente
   * GET /clientes/perfil para ejercitar esa rama de UI que el backend real no puede producir
   * hoy. No reemplaza cobertura de backend (eso ya está fuera de alcance, documentado arriba
   * como gap conocido) -- solo confirma que la rama de UI muestra un mensaje real, no una
   * pantalla en blanco ni un error de consola sin manejar.
   */
  test('checkout DOMICILIO sin dirección cargada muestra un mensaje real, no una pantalla rota (rama de UI sin vía real de API para ejercitarla)', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cliente.email, cliente.password);
    await apiPost(request, '/carrito/items', { productoId, cantidad: 1 }, sesion.token);

    await page.route('**/api/v1/clientes/perfil', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.data.direccion = null;
      await route.fulfill({ response, json });
    });

    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/carrito.html');
    await page.getByTestId('btn-confirmar-pedido').click();
    await page.waitForURL('**/checkout.html');

    await page.getByTestId('btn-modalidad-domicilio').click();
    await page.getByTestId('btn-continuar-modalidad').click();

    await expect(page.getByText('No tenés una dirección registrada')).toBeVisible();
    await expect(page.getByTestId('btn-confirmar-direccion')).toHaveCount(0);
    await expect(page.locator('.js-error, .console-error')).toHaveCount(0);
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
    const comercioSesion = await login(request, comercio.email, comercio.password);

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
    await loginUi(page, cliente.email, cliente.password);

    const requestsAProductos: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/catalogo/productos?')) {
        requestsAProductos.push(req.url());
      }
    });

    // Reloj virtual de Playwright en vez de esperas reales: un wait de milisegundos contra un
    // debounce de 300ms es una carrera (falló de forma intermitente con timers reales, ver
    // mapeo de este tramo). `install()` solo no alcanza -- el tiempo sigue corriendo normal
    // hasta pausarlo con pauseAt(); recién ahí ningún setTimeout de explorar.js puede
    // dispararse por más caracteres que se tipeen, y runFor(...) lo avanza de forma
    // determinística una sola vez, disparando exactamente el último timer vivo.
    await page.clock.install();
    await page.goto('/explorar.html');
    await expect(page.getByTestId('lista-productos-explorar')).toBeVisible();
    await page.clock.pauseAt(Date.now());
    // Margen real mínimo para que la pausa (viaje de ida y vuelta vía CDP) quede aplicada del
    // todo antes de tipear -- sin esto, bajo carga (suite completa corriendo), algún keystroke
    // temprano podía alcanzar a correr todavía con el reloj "flotando" y disparar su propio
    // debounce antes de que quedara realmente congelado.
    await page.waitForTimeout(50);
    const antesDeEscribir = requestsAProductos.length;

    // 19 caracteres tipeados uno por uno -- sin debounce, esto dispararía hasta 19 requests
    // (uno por evento 'input', cada uno cancelando el setTimeout anterior con clearTimeout).
    await page.getByTestId('input-buscar-producto-explorar').pressSequentially('Explorar Etiquetado');
    expect(requestsAProductos.length).toBe(antesDeEscribir);

    await page.clock.runFor(350);
    expect(requestsAProductos.length).toBe(antesDeEscribir + 1);
    await expect(page.getByTestId(`producto-item-${productoConTagId}`)).toBeVisible();
  });

  test('categoría + tag combinados filtran junto con el texto, y "sin resultados" muestra un mensaje real', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
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
