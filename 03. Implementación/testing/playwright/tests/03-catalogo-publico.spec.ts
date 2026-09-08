import { test, expect } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarComercio,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  crearCategoria,
  crearProducto,
  login,
  diaDeHoy,
  diaDistintoDeHoy,
  sufijoUnico,
  aTitleCase,
} from './helpers/backend';

test.describe('Catálogo público', () => {
  let comercioAbiertoId: number;
  let comercioAbiertoNombre: string;
  let comercioCerradoId: number;
  let comercioCerradoNombre: string;
  let productoId: number;
  let productoNombre: string;

  test.beforeAll(async ({ request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();

    const comercioAbierto = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Abierto E2E ${suf}`,
      tipoComercio: 'RESTAURANTE',
      aceptaDelivery: true,
      aceptaRetiro: false,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    });
    comercioAbiertoNombre = comercioAbierto.nombre;

    const comercioCerrado = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Cerrado E2E ${suf}`,
      tipoComercio: 'EMPRENDIMIENTO',
      aceptaDelivery: false,
      aceptaRetiro: true,
      horarios: [{ diaSemana: diaDistintoDeHoy(), horaApertura: '10:00', horaCierre: '18:00' }],
    });
    comercioCerradoNombre = comercioCerrado.nombre;

    const adminSesion = await fijarPasswordAdminYLoguear(request);

    const pendienteAbierto = await buscarComercioPendientePorEmail(request, adminSesion.token, comercioAbierto.email);
    comercioAbiertoId = pendienteAbierto.id;
    await resolverComercio(request, adminSesion.token, comercioAbiertoId, true);

    const pendienteCerrado = await buscarComercioPendientePorEmail(request, adminSesion.token, comercioCerrado.email);
    comercioCerradoId = pendienteCerrado.id;
    await resolverComercio(request, adminSesion.token, comercioCerradoId, true);

    const categoriaId = await crearCategoria(request, adminSesion.token, `Categoría E2E ${suf}`);
    const comercioSesion = await login(request, comercioAbierto.email, comercioAbierto.password);
    // ProductoService normaliza Producto.nombre a Title Case al persistir (igual que
    // Comercio.nombre, ver aTitleCase en helpers/backend) -- "Producto E2E" vuelve "Producto E2e".
    productoNombre = aTitleCase(`Producto E2E ${suf}`);
    productoId = await crearProducto(request, comercioSesion.token, {
      nombre: productoNombre,
      precio: 1500,
      categoriaId,
      descripcion: 'Producto de prueba generado por Playwright',
    });
  });

  test('sin login, se puede ver el catálogo público con los comercios listados', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.getByTestId('lista-comercios')).toBeVisible();
    await expect(page.getByTestId(`comercio-card-${comercioAbiertoId}`)).toBeVisible();
    await expect(page.getByTestId(`comercio-card-${comercioCerradoId}`)).toBeVisible();
    await expect(page.getByTestId('btn-ingresar')).toBeVisible();
  });

  test('los chips filtran comercios por modalidad de entrega y por si están abiertos ahora', async ({ page }) => {
    // El catálogo ya no filtra por tipo de comercio (restaurante/emprendimiento) -- los chips
    // reales hoy son todos/delivery/retiro/abierto (js/catalogo.js). comercioAbierto acepta
    // delivery (no retiro) y comercioCerrado acepta retiro (no delivery), mismo criterio que
    // ya usaba este test para separarlos, solo que ahora vía modalidad en vez de tipo.
    await page.goto('/index.html');

    await page.getByTestId('chip-filtro-delivery').click();
    await expect(page.getByTestId(`comercio-card-${comercioAbiertoId}`)).toBeVisible();
    await expect(page.getByTestId(`comercio-card-${comercioCerradoId}`)).toHaveCount(0);

    await page.getByTestId('chip-filtro-retiro').click();
    await expect(page.getByTestId(`comercio-card-${comercioCerradoId}`)).toBeVisible();
    await expect(page.getByTestId(`comercio-card-${comercioAbiertoId}`)).toHaveCount(0);

    await page.getByTestId('chip-filtro-abierto').click();
    await expect(page.getByTestId(`comercio-card-${comercioAbiertoId}`)).toBeVisible();
    await expect(page.getByTestId(`comercio-card-${comercioCerradoId}`)).toHaveCount(0);

    await page.getByTestId('chip-filtro-todos').click();
    await expect(page.getByTestId(`comercio-card-${comercioAbiertoId}`)).toBeVisible();
    await expect(page.getByTestId(`comercio-card-${comercioCerradoId}`)).toBeVisible();
  });

  test('entrar al detalle de un comercio muestra sus productos', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId(`comercio-card-${comercioAbiertoId}`).click();

    await page.waitForURL(new RegExp(`comercio-detalle\\.html\\?id=${comercioAbiertoId}$`));
    await expect(page.getByTestId('nombre-comercio')).toHaveText(comercioAbiertoNombre);
    await expect(page.getByTestId(`producto-item-${productoId}`)).toBeVisible();
    await expect(page.getByTestId(`producto-item-${productoId}`)).toContainText(productoNombre);
  });

  test('un comercio cerrado fuera de horario muestra el estado correspondiente', async ({ page }) => {
    await page.goto('/index.html');

    const tarjetaCerrada = page.getByTestId(`comercio-card-${comercioCerradoId}`);
    await expect(tarjetaCerrada.getByTestId('estado-comercio')).toContainText('Cerrado');

    await page.goto(`/comercio-detalle.html?id=${comercioCerradoId}`);
    await expect(page.getByTestId('estado-comercio')).toContainText('Cerrado');
  });
});
