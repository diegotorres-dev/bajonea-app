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
  sufijoUnico,
  diaDeHoy,
  nombreArchivoFixture,
  aTitleCase,
} from './helpers/backend';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

async function loginUi(page: Page, email: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/comercio-dashboard.html');
}

/**
 * Tramo dedicado al perfil de Comercio (edición de datos, cambio de contraseña, foto de
 * perfil): lo que necesita navegador real -- mensajes visibles en el DOM cerca del campo
 * correcto, habilitación/deshabilitación de switches, y la confirmación visual del fix real
 * de `FotoPerfilComercioRequestDTO.url` (@Size(max=500) agregado -- ver CLAUDE.md, Fase 2 de
 * esta sesión). Los casos de puro formato de backend (nombre/telefono/email vacíos o
 * inválidos, límites de longitud, password débil) ya están cubiertos exhaustivamente en
 * Postman (folders 36-38) -- acá solo 1 caso de humo por variante más lo que es exclusivo de UI.
 */
test.describe('Perfil de Comercio: edición de datos, cambio de contraseña, foto de perfil', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  async function registrarComercioAprobadoYLoguear(page: Page, request: import('@playwright/test').APIRequestContext, nombre: string) {
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '09:00', horaCierre: '20:00' }],
      aceptaDelivery: true,
      aceptaRetiro: false,
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    await resolverComercio(request, adminSesion.token, pendiente.id, true);
    await loginUi(page, comercio.email, comercio.password);
    return comercio;
  }

  test('editar datos del comercio: nombre y teléfono vacíos bloquean el guardado con el error visible cerca de cada campo', async ({ page, request }) => {
    const suf = sufijoUnico();
    await registrarComercioAprobadoYLoguear(page, request, `Comercio Perfil Vacio E2E ${suf}`);

    await page.goto('/comercio-perfil.html');
    await page.getByTestId('btn-editar-perfil-comercio').click();
    await expect(page.getByTestId('input-nombre')).toBeVisible();

    await page.getByTestId('input-nombre').fill('');
    await page.getByTestId('input-telefono').fill('');
    await page.getByTestId('btn-guardar-perfil-comercio').click();

    await expect(page.getByTestId('mensaje-error-nombre')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-nombre')).toContainText('Ingresá el nombre de tu comercio');
    await expect(page.getByTestId('mensaje-error-telefono')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-telefono')).toContainText('Ingresá tu teléfono');
  });

  test('editar datos del comercio: sacar las 2 modalidades de entrega bloquea el guardado, y guardar con datos válidos actualiza el perfil visible', async ({ page, request }) => {
    const suf = sufijoUnico();
    await registrarComercioAprobadoYLoguear(page, request, `Comercio Perfil Modalidad E2E ${suf}`);

    await page.goto('/comercio-perfil.html');
    await page.getByTestId('btn-editar-perfil-comercio').click();
    await expect(page.getByTestId('btn-switch-delivery')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('btn-switch-retiro')).toHaveAttribute('aria-pressed', 'false');

    // El comercio se registró solo con delivery -- apagarlo sin prender retiro deja las 2
    // modalidades en false.
    await page.getByTestId('btn-switch-delivery').click();
    await page.getByTestId('btn-guardar-perfil-comercio').click();
    await expect(page.getByTestId('mensaje-error-modalidad')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-modalidad')).toContainText('Debés ofrecer al menos una modalidad de entrega');

    const nombreNuevo = `Comercio Perfil Editado E2E ${suf}`;
    await page.getByTestId('input-nombre').fill(nombreNuevo);
    await page.getByTestId('btn-switch-retiro').click();

    const guardarResponse = page.waitForResponse(
      (res) => res.url().endsWith('/comercios/perfil') && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-guardar-perfil-comercio').click();
    const respuesta = await guardarResponse;
    expect(respuesta.status()).toBe(200);
    const bodyRequest = respuesta.request().postDataJSON();
    expect(bodyRequest.aceptaDelivery).toBe(false);
    expect(bodyRequest.aceptaRetiro).toBe(true);

    // ComercioService normaliza el nombre a Title Case al persistir -- "E2E" vuelve "E2e",
    // mismo criterio que ProductoService (spec 06/15) y RegistroService (helpers/backend.ts).
    await expect(page.getByTestId('nombre-comercio-perfil')).toHaveText(aTitleCase(nombreNuevo));
  });

  test('cambiar contraseña: campos vacíos, contraseña débil y confirmación que no coincide muestran su error visible', async ({ page, request }) => {
    const suf = sufijoUnico();
    await registrarComercioAprobadoYLoguear(page, request, `Comercio Password Vacio E2E ${suf}`);

    await page.goto('/comercio-perfil.html');
    await page.getByTestId('btn-cambiar-password').click();
    await expect(page.getByTestId('input-password-actual')).toBeVisible();

    await page.getByTestId('btn-guardar-password').click();
    await expect(page.getByTestId('mensaje-error-password-actual')).toContainText('Ingresá tu contraseña actual');
    await expect(page.getByTestId('mensaje-error-password-nueva')).toContainText('Ingresá una nueva contraseña');

    // "password" (8 caracteres, todo minúsculas) para llegar de verdad a la validación de
    // fortaleza (esPasswordSegura): con menos de 8 caracteres, el input.checkValidity() nativo
    // (minlength="8" del HTML) falla ANTES, y valida­rCamposSilencioso muestra el mensaje
    // genérico de "campo vacío" en vez del de fortaleza -- comportamiento real de la app,
    // documentado como hallazgo en MAPEO-ARCHIVOS-TRAMO4.md, no corregido en esta sesión.
    await page.getByTestId('input-password-actual').fill('Testing123');
    await page.getByTestId('input-password-nueva').fill('password');
    await page.getByTestId('input-password-confirmar').fill('password');
    await page.getByTestId('btn-guardar-password').click();
    await expect(page.getByTestId('mensaje-error-password-nueva')).toContainText('mínimo 8 caracteres');

    await page.getByTestId('input-password-nueva').fill('NuevaPass123');
    await page.getByTestId('input-password-confirmar').fill('OtraCosa123');
    await page.getByTestId('btn-guardar-password').click();
    await expect(page.getByTestId('mensaje-error-password-confirmar')).toContainText('no coinciden');
  });

  test('cambiar contraseña: la contraseña actual incorrecta 2 veces seguidas avisa "1 intento más" antes del bloqueo real (MAX_INTENTOS_FALLIDOS=3)', async ({ page, request }) => {
    const suf = sufijoUnico();
    await registrarComercioAprobadoYLoguear(page, request, `Comercio Password Intentos E2E ${suf}`);

    await page.goto('/comercio-perfil.html');
    await page.getByTestId('btn-cambiar-password').click();

    for (let intento = 1; intento <= 2; intento += 1) {
      await page.getByTestId('input-password-actual').fill('PasswordIncorrecta1');
      await page.getByTestId('input-password-nueva').fill('NuevaPass123');
      await page.getByTestId('input-password-confirmar').fill('NuevaPass123');
      const cambioResponse = page.waitForResponse(
        (res) => res.url().endsWith('/auth/cambiar-password') && res.request().method() === 'POST',
      );
      await page.getByTestId('btn-guardar-password').click();
      const respuesta = await cambioResponse;
      expect(respuesta.status()).toBe(401);
      await expect(page.getByTestId('mensaje-error-password-actual')).toContainText('La contraseña actual no es correcta');
    }
    // Segundo intento fallido: intentosRestantes=1 (MAX_INTENTOS_FALLIDOS=3, AuthService) --
    // acá es donde el banner de advertencia real tiene que aparecer, no antes.
    await expect(page.getByTestId('mensaje-banner-password')).toContainText('si fallás 1 vez más');
  });

  test('cambiar contraseña: guardado exitoso cierra la sesión y redirige a login -- la contraseña vieja deja de servir y la nueva funciona', async ({ page, request }) => {
    const suf = sufijoUnico();
    const comercio = await registrarComercioAprobadoYLoguear(page, request, `Comercio Password Valido E2E ${suf}`);
    const passwordNueva = 'NuevaPassword123';

    await page.goto('/comercio-perfil.html');
    await page.getByTestId('btn-cambiar-password').click();
    await page.getByTestId('input-password-actual').fill(comercio.password);
    await page.getByTestId('input-password-nueva').fill(passwordNueva);
    await page.getByTestId('input-password-confirmar').fill(passwordNueva);
    await page.getByTestId('btn-guardar-password').click();

    await page.waitForURL('**/login.html?passwordActualizada=1', { timeout: 10000 });

    await page.getByTestId('input-email').fill(comercio.email);
    await page.getByTestId('input-password').fill(comercio.password);
    await page.getByTestId('btn-ingresar').click();
    await expect(page.getByTestId('mensaje-error-login')).toContainText('Email o contraseña incorrectos');

    await page.getByTestId('input-password').fill(passwordNueva);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/comercio-dashboard.html');
  });

  test('foto de perfil: subir una foto real vía el editor de recorte actualiza el avatar en pantalla', async ({ page, request }) => {
    const suf = sufijoUnico();
    await registrarComercioAprobadoYLoguear(page, request, `Comercio Foto E2E ${suf}`);

    await page.goto('/comercio-perfil.html');
    await page.getByTestId('btn-editar-perfil-comercio').click();
    await expect(page.getByTestId('btn-cambiar-foto-comercio')).toBeVisible();

    await page.getByTestId('input-foto-comercio').setInputFiles({
      name: nombreArchivoFixture(),
      mimeType: 'image/png',
      buffer: FIXTURE_BUFFER,
    });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    await expect(page.getByTestId('canvas-recorte')).toBeVisible();

    const putFotoResponse = page.waitForResponse(
      (res) => res.url().endsWith('/comercios/perfil/foto') && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-confirmar-recorte').click();
    const respuesta = await putFotoResponse;
    expect(respuesta.status()).toBe(200);

    await expect(page.locator('#editar-avatar img')).toHaveCount(1);
    await page.getByTestId('btn-volver-perfil').click();
    await expect(page.locator('#perfil-avatar img')).toHaveCount(1);
  });

  test('foto de perfil: una URL de Cloudinary de más de 500 caracteres la rechaza el backend real (400) y el mensaje se ve en el banner, sin romper la pantalla', async ({ page, request }) => {
    const suf = sufijoUnico();
    await registrarComercioAprobadoYLoguear(page, request, `Comercio Foto Url Larga E2E ${suf}`);

    // Solo se mockea la respuesta de Cloudinary (para controlar el largo exacto de la URL,
    // algo que una subida real nunca produciría) -- la firma y el PUT /comercios/perfil/foto
    // que valida @Size(max=500) siguen siendo el backend real (fix aplicado en esta sesión,
    // ver CLAUDE.md §1bis).
    const urlDe552Caracteres = `https://res.cloudinary.com/${'a'.repeat(520)}/imagen.jpg`;
    expect(urlDe552Caracteres.length).toBeGreaterThan(500);
    await page.route('https://api.cloudinary.com/v1_1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ secure_url: urlDe552Caracteres }),
      });
    });

    await page.goto('/comercio-perfil.html');
    await page.getByTestId('btn-editar-perfil-comercio').click();
    await page.getByTestId('input-foto-comercio').setInputFiles({
      name: nombreArchivoFixture(),
      mimeType: 'image/png',
      buffer: FIXTURE_BUFFER,
    });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();

    const putFotoResponse = page.waitForResponse(
      (res) => res.url().endsWith('/comercios/perfil/foto') && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-confirmar-recorte').click();
    const respuesta = await putFotoResponse;
    expect(respuesta.status()).toBe(400);

    await expect(page.getByTestId('mensaje-banner')).toBeVisible();
    await expect(page.getByTestId('mensaje-banner')).toContainText('no puede superar los 500 caracteres');
    // La pantalla sigue funcional -- no quedó ningún avatar roto ni la vista trabada.
    await expect(page.getByTestId('btn-guardar-perfil-comercio')).toBeVisible();
  });
});
