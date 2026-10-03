import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarComercio,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  crearCategoria,
  crearProducto,
  subirImagenProductoDirecto,
  nombreArchivoFixture,
  login,
  apiPost,
  sufijoUnico,
  diaDeHoy,
  aTitleCase,
  esperarImagenCargadaEnRecorte,
} from './helpers/backend';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

async function loginUi(page: import('@playwright/test').Page, usuario: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(usuario);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/comercio-dashboard.html');
}

async function subirFotoViaCropUi(
  page: import('@playwright/test').Page,
  { modo = 'editar', esperar409 = false }: { modo?: 'crear' | 'editar'; esperar409?: boolean } = {},
) {
  await page.getByTestId('input-foto-producto').setInputFiles({
    name: nombreArchivoFixture(),
    mimeType: 'image/png',
    buffer: FIXTURE_BUFFER,
  });
  await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
  await expect(page.getByTestId('canvas-recorte')).toBeVisible();
  await expect(page.getByTestId('input-zoom-recorte')).toBeVisible();

  if (modo === 'crear') {
    await esperarImagenCargadaEnRecorte(page);
    await page.getByTestId('btn-confirmar-recorte').click();
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
    return null;
  }

  const firmaResponse = page.waitForResponse(
    (res) => res.url().endsWith('/cloudinary/firma') && res.request().method() === 'POST',
  );
  await esperarImagenCargadaEnRecorte(page);
  await page.getByTestId('btn-confirmar-recorte').click();
  const respuesta = await firmaResponse;
  if (esperar409) {
    expect(respuesta.status()).toBe(409);
  } else {
    expect(respuesta.status()).toBe(200);
  }
  return respuesta;
}

test.describe('CRUD de producto del Comercio', () => {
  let comercioUsuario: string;
  let comercioPassword: string;
  let categoriaId: number;
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Productos E2E ${suf}`);

    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Productos E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    await resolverComercio(request, adminSesion.token, pendiente.id, true);
    comercioUsuario = comercio.nombreUsuario;
    comercioPassword = comercio.password;
  });

  test('crear un producto con nombre, precio, categoría e imagen real (recorte + Cloudinary): aparece en el listado con su foto', async ({ page }) => {
    const suf = sufijoUnico();
    const nombre = aTitleCase(`Producto Nuevo E2E ${suf}`);

    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto('/comercio-productos.html');
    await page.getByTestId('btn-crear-producto').click();
    await page.waitForURL('**/comercio-producto-form.html');

    await page.getByTestId('input-nombre-producto').fill(nombre);
    await page.getByTestId('input-descripcion-producto').fill('Descripción generada por el spec 06 de Playwright.');
    await page.getByTestId('input-precio-producto').fill('5990');
    await page.getByTestId('select-categoria-producto').selectOption(String(categoriaId));

    await subirFotoViaCropUi(page, { modo: 'crear' });
    await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);

    const crearResponse = page.waitForResponse(
      (res) => res.url().endsWith('/productos') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-guardar-producto').click();
    const respuesta = await crearResponse;
    expect(respuesta.status()).toBe(201);
    const productoId = (await respuesta.json()).data.id as number;

    await page.waitForURL('**/comercio-productos.html*', { timeout: 20000 });

    const fila = page.getByTestId(`producto-item-${productoId}`);
    await expect(fila).toBeVisible();
    await expect(fila).toContainText(nombre);
    await expect(fila).toContainText('$5.990');
    await expect(fila.locator('img')).toHaveCount(1);
  });

  test('editar un producto: cambia nombre y precio, saca la foto original y agrega una nueva', async ({ page, request }) => {
    const suf = sufijoUnico();
    const comercioSesion = await login(request, comercioUsuario, comercioPassword);
    const productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Editar E2E ${suf}`,
      precio: 1000,
      categoriaId,
    });
    const imagenOriginalId = await subirImagenProductoDirecto(request, comercioSesion.token, productoId, FIXTURE_BUFFER, {
      orden: 0,
      esPrincipal: true,
    });

    const nombreNuevo = aTitleCase(`Producto Editado E2E ${suf}`);

    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto(`/comercio-producto-form.html?id=${productoId}`);

    await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);
    await expect(page.getByTestId('input-nombre-producto')).toHaveValue(aTitleCase(`Producto Editar E2E ${suf}`));

    const eliminarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/productos/${productoId}/imagenes/${imagenOriginalId}`) && res.request().method() === 'DELETE',
    );
    await page.getByTestId('btn-eliminar-foto-producto-0').click();
    await eliminarResponse;
    await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(0);

    await subirFotoViaCropUi(page);
    await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);

    await page.getByTestId('input-nombre-producto').fill(nombreNuevo);
    await page.getByTestId('input-precio-producto').fill('2500');

    const editarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/productos/${productoId}`) && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-guardar-producto').click();
    const respuesta = await editarResponse;
    expect(respuesta.status()).toBe(200);

    await page.waitForURL('**/comercio-productos.html*', { timeout: 20000 });
    const fila = page.getByTestId(`producto-item-${productoId}`);
    await expect(fila).toContainText(nombreNuevo);
    await expect(fila).toContainText('$2.500');
  });

  test('ciclo de estados: agotado, disponible de nuevo, y descontinuar (irreversible)', async ({ page, request }) => {
    const suf = sufijoUnico();
    const comercioSesion = await login(request, comercioUsuario, comercioPassword);
    const productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Estados E2E ${suf}`,
      precio: 3000,
      categoriaId,
    });

    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto('/comercio-productos.html');

    const fila = page.getByTestId(`producto-item-${productoId}`);
    await expect(fila).toBeVisible();

    const estadoUrl = (res: import('@playwright/test').Response) =>
      res.url().endsWith(`/productos/${productoId}/estado`) && res.request().method() === 'PATCH';

    await page.getByTestId(`btn-acciones-producto-${productoId}`).click();
    await expect(page.getByTestId('modal-acciones-producto')).toBeVisible();
    const agotarResponse = page.waitForResponse(estadoUrl);
    await page.getByTestId('btn-cambiar-estado-producto').click();
    const respAgotado = await agotarResponse;
    expect(respAgotado.status()).toBe(200);
    expect((await respAgotado.json()).data.estado).toBe('AGOTADO');
    await expect(fila).toContainText('Agotado');

    await page.getByTestId(`btn-acciones-producto-${productoId}`).click();
    await expect(page.getByTestId('modal-acciones-producto')).toBeVisible();
    const disponibleResponse = page.waitForResponse(estadoUrl);
    await page.getByTestId('btn-cambiar-estado-producto').click();
    const respDisponible = await disponibleResponse;
    expect(respDisponible.status()).toBe(200);
    expect((await respDisponible.json()).data.estado).toBe('DISPONIBLE');
    await expect(fila).not.toContainText('Agotado');
    await expect(fila).not.toContainText('Descontinuado');

    await page.getByTestId(`btn-acciones-producto-${productoId}`).click();
    await expect(page.getByTestId('modal-acciones-producto')).toBeVisible();
    await page.getByTestId('btn-descontinuar-producto').click();
    await expect(page.getByTestId('modal-confirmar-descontinuar')).toBeVisible();
    await expect(page.getByTestId('btn-confirmar-descontinuar')).toBeDisabled();
    await page.getByTestId('input-confirmar-irreversible').check();
    await expect(page.getByTestId('btn-confirmar-descontinuar')).toBeEnabled();

    const descontinuarResponse = page.waitForResponse(estadoUrl);
    await page.getByTestId('btn-confirmar-descontinuar').click();
    const respuestaDescontinuado = await descontinuarResponse;
    expect(respuestaDescontinuado.status()).toBe(200);
    expect((await respuestaDescontinuado.json()).data.estado).toBe('DESCONTINUADO');
    await expect(fila).toContainText('Descontinuado');

    await page.goto(`/comercio-producto-form.html?id=${productoId}`);
    await expect(page.getByTestId('mensaje-banner')).toContainText('descontinuado');
    await expect(page.locator('#form-producto')).toBeHidden();
  });

  test('casos negativos: nombre vacío no se envía, precio negativo lo rechaza el backend, y el límite de 5 fotos por producto se respeta', async ({ page, request }) => {
    const suf = sufijoUnico();

    const comercioSesion = await login(request, comercioUsuario, comercioPassword);
    const { status: statusNegativo } = await apiPost(request, '/productos', {
      nombre: `Producto Precio Invalido E2E ${suf}`,
      precio: -500,
      categoriaId,
    }, comercioSesion.token);
    expect(statusNegativo).toBe(400);
    const { status: statusCero } = await apiPost(request, '/productos', {
      nombre: `Producto Precio Cero E2E ${suf}`,
      precio: 0,
      categoriaId,
    }, comercioSesion.token);
    expect(statusCero).toBe(400);

    const productoId = await crearProducto(request, comercioSesion.token, {
      nombre: `Producto Limite Fotos E2E ${suf}`,
      precio: 4200,
      categoriaId,
    });
    for (let orden = 0; orden < 4; orden += 1) {
      await subirImagenProductoDirecto(request, comercioSesion.token, productoId, FIXTURE_BUFFER, {
        orden,
        esPrincipal: orden === 0,
      });
    }

    await loginUi(page, comercioUsuario, comercioPassword);

    await page.goto('/comercio-producto-form.html');
    await page.getByTestId('input-precio-producto').fill('1500');
    await page.getByTestId('select-categoria-producto').selectOption(String(categoriaId));
    await subirFotoViaCropUi(page, { modo: 'crear' });
    await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);

    let seEnvioAlgo = false;
    const detectarEnvio = (req: import('@playwright/test').Request) => {
      if (req.url().endsWith('/productos') && req.method() === 'POST') {
        seEnvioAlgo = true;
      }
    };
    page.on('request', detectarEnvio);
    await page.getByTestId('btn-guardar-producto').click();
    await expect(page.getByTestId('mensaje-error-nombre-producto')).toBeVisible();
    expect(seEnvioAlgo).toBe(false);
    page.off('request', detectarEnvio);
    await expect(page).toHaveURL(/comercio-producto-form\.html$/);

    await page.goto(`/comercio-producto-form.html?id=${productoId}`);
    await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(4);
    await expect(page.getByTestId('btn-agregar-foto-producto')).toHaveCount(1);

    await subirFotoViaCropUi(page);
    await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(5);
    await expect(page.getByTestId('btn-agregar-foto-producto')).toHaveCount(0);

    await subirFotoViaCropUi(page, { esperar409: true });
    await expect(page.getByTestId('mensaje-banner')).toContainText('máximo de 5 imágenes');
    await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(5);
  });
});
