import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarComercio,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  crearCategoria,
  crearTag,
  sufijoUnico,
  diaDeHoy,
  nombreArchivoFixture,
  esperarImagenCargadaEnRecorte,
} from './helpers/backend';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

async function loginUi(page: Page, usuario: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(usuario);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/comercio-dashboard.html');
}

async function subirFotoCreacionViaCropUi(page: Page) {
  await page.getByTestId('input-foto-producto').setInputFiles({
    name: nombreArchivoFixture(),
    mimeType: 'image/png',
    buffer: FIXTURE_BUFFER,
  });
  await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
  await esperarImagenCargadaEnRecorte(page);
  await page.getByTestId('btn-confirmar-recorte').click();
  await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
  await expect(page.getByTestId('galeria-fotos-producto').locator('img')).toHaveCount(1);
}

test.describe('CRUD de producto del Comercio: validaciones exclusivas de UI', () => {
  let comercioUsuario: string;
  let comercioPassword: string;
  let categoriaId: number;
  let localidadId: string;
  let tagIds: number[];

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    const suf = sufijoUnico();
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    categoriaId = await crearCategoria(request, adminSesion.token, `Categoría Validaciones E2E ${suf}`);

    tagIds = [];
    for (let i = 0; i < 6; i += 1) {
      tagIds.push(await crearTag(request, adminSesion.token, `Tag Validaciones E2E ${suf} ${i}`));
    }

    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre: `Comercio Validaciones Producto E2E ${suf}`,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    await resolverComercio(request, adminSesion.token, pendiente.id, true);
    comercioUsuario = comercio.nombreUsuario;
    comercioPassword = comercio.password;
  });

  test('precio: el input formatea miles en vivo mientras se tipea y trunca a 8 dígitos (el error de "más de 8 dígitos" del backend no es alcanzable desde el teclado)', async ({ page }) => {
    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto('/comercio-producto-form.html');

    const inputPrecio = page.getByTestId('input-precio-producto');
    await inputPrecio.pressSequentially('1234567');
    await expect(inputPrecio).toHaveValue('1.234.567');

    await inputPrecio.fill('');
    await inputPrecio.pressSequentially('123456789');
    await expect(inputPrecio).toHaveValue('12.345.678');
  });

  test('nombre: no permite escribir más de 150 caracteres (maxlength nativo)', async ({ page }) => {
    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto('/comercio-producto-form.html');

    const inputNombre = page.getByTestId('input-nombre-producto');
    await inputNombre.pressSequentially('P'.repeat(160));
    await expect(inputNombre).toHaveValue('P'.repeat(150));
  });

  test('categoría: dejarla sin seleccionar bloquea el guardado con el error visible, sin llegar a enviar la petición', async ({ page }) => {
    const suf = sufijoUnico();
    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto('/comercio-producto-form.html');
    await expect(page.getByTestId(`chip-tag-producto-${tagIds[0]}`)).toBeVisible();

    await page.getByTestId('input-nombre-producto').fill(`Producto Sin Categoria E2E ${suf}`);
    await page.getByTestId('input-precio-producto').fill('1500');
    await subirFotoCreacionViaCropUi(page);

    let seEnvioAlgo = false;
    const detectarEnvio = (req: import('@playwright/test').Request) => {
      if (req.url().endsWith('/productos') && req.method() === 'POST') {
        seEnvioAlgo = true;
      }
    };
    page.on('request', detectarEnvio);
    await page.getByTestId('btn-guardar-producto').click();
    await expect(page.getByTestId('mensaje-error-categoria-producto')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-categoria-producto')).toContainText('Seleccioná una categoría');
    expect(seEnvioAlgo).toBe(false);
    page.off('request', detectarEnvio);
  });

  test('tags: seleccionar un 6º tag lo bloquea con el mensaje visible, y el chip nunca queda marcado', async ({ page }) => {
    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto('/comercio-producto-form.html');

    for (const tagId of tagIds.slice(0, 5)) {
      await page.getByTestId(`chip-tag-producto-${tagId}`).click();
      await expect(page.getByTestId(`chip-tag-producto-${tagId}`)).toHaveAttribute('aria-pressed', 'true');
    }

    const sextoTagId = tagIds[5];
    await page.getByTestId(`chip-tag-producto-${sextoTagId}`).click();
    await expect(page.getByTestId('mensaje-error-tags-producto')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-tags-producto')).toContainText('hasta 5 tags');
    await expect(page.getByTestId(`chip-tag-producto-${sextoTagId}`)).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId(`chip-tag-producto-${tagIds[0]}`).click();
    await expect(page.getByTestId(`chip-tag-producto-${tagIds[0]}`)).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId(`chip-tag-producto-${sextoTagId}`).click();
    await expect(page.getByTestId(`chip-tag-producto-${sextoTagId}`)).toHaveAttribute('aria-pressed', 'true');
  });

  test('nombre: se normaliza a Title Case al perder el foco, visible antes de guardar', async ({ page }) => {
    await loginUi(page, comercioUsuario, comercioPassword);
    await page.goto('/comercio-producto-form.html');

    const inputNombre = page.getByTestId('input-nombre-producto');
    await inputNombre.fill('HAMBURGUESA doble CHEDDAR');
    await page.getByTestId('input-precio-producto').click();
    await expect(inputNombre).toHaveValue('Hamburguesa Doble Cheddar');
  });
});
