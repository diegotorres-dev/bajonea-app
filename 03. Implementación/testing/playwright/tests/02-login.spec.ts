import { test, expect } from '@playwright/test';
import {
  registrarCliente,
  registrarYVerificarCliente,
  obtenerLocalidadRioGrande,
  obtenerCodigoTest,
} from './helpers/backend';

test.describe('Login', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('login exitoso de un cliente verificado redirige al catálogo', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();

    await page.waitForURL('**/index.html');
    await expect(page.getByTestId('mensaje-saludo')).toContainText(cliente.nombre);
  });

  test('login con contraseña incorrecta muestra un error visible', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill('ContraseñaIncorrecta1');
    await page.getByTestId('btn-ingresar').click();

    await expect(page.getByTestId('mensaje-error-login')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-login')).toContainText('Usuario o contraseña incorrectos');
    await expect(page).toHaveURL(/login\.html/);
  });

  test('login con usuario no verificado muestra el aviso de verificación pendiente', async ({ page, request }) => {
    const cliente = await registrarCliente(request, localidadId);

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();

    await expect(page.getByTestId('mensaje-banner')).toContainText('Todavía no verificaste tu email');
  });

  test('recuperar contraseña permite loguearse con la nueva contraseña', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const nuevaPassword = 'NuevaClave456';

    await page.goto('/recuperar-password.html');
    await page.getByTestId('input-email').fill(cliente.email);

    const solicitudResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/recuperar-password') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-enviar-codigo-recuperacion').click();
    await solicitudResponse;

    await expect(page.getByTestId('input-codigo-verificacion')).toBeVisible();

    const codigo = await obtenerCodigoTest(request, cliente.email, 'RECUPERACION_PASSWORD');
    const validacionResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/recuperar-password/validar-codigo') && res.request().method() === 'POST',
    );
    for (let i = 0; i < 6; i += 1) {
      await page.getByTestId(`input-codigo-digito-${i + 1}`).fill(codigo[i]);
    }
    await validacionResponse;

    await expect(page.getByTestId('input-nueva-password')).toBeVisible();
    await page.getByTestId('input-nueva-password').fill(nuevaPassword);
    await page.getByTestId('input-confirmar-password').fill(nuevaPassword);

    const confirmarResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/recuperar-password/confirmar') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-restablecer-password').click();
    await confirmarResponse;

    await expect(page.getByText('Contraseña actualizada')).toBeVisible();
    await page.getByTestId('btn-ir-a-login-exito').click();
    await page.waitForURL('**/login.html');

    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(nuevaPassword);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');
  });

  test('reactivar cuenta: la solicitud llega a la pantalla de código y un código sin token pendiente es rechazado', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);

    await page.goto('/reactivar-cuenta.html');
    await page.getByTestId('input-email').fill(cliente.email);

    const solicitudResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/reactivar-cuenta') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-enviar-codigo-reactivacion').click();
    await solicitudResponse;

    await expect(page.getByTestId('input-codigo-verificacion')).toBeVisible();

    const confirmarResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/reactivar-cuenta/confirmar') && res.request().method() === 'POST',
    );
    for (let i = 0; i < 6; i += 1) {
      await page.getByTestId(`input-codigo-digito-${i + 1}`).fill('0');
    }
    await confirmarResponse;

    await expect(page.getByTestId('mensaje-error-codigo')).toBeVisible();
  });
});

test.describe('Banners: el mensaje del servidor se muestra como texto', () => {
  const MENSAJE_CON_HTML = 'Servicio no disponible <img src="x" onerror="window.__bannerInyectado=true"><b>importante</b>';

  test('login: un error 409 del servidor con etiquetas HTML se muestra tal cual, sin crear elementos ni ejecutar nada', async ({ page }) => {
    await page.route('**/auth/login', (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ mensaje: MENSAJE_CON_HTML, data: null }) }),
    );

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill('usuarioinexistente1');
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('btn-ingresar').click();

    const banner = page.getByTestId('mensaje-banner');
    await expect(banner).toContainText(MENSAJE_CON_HTML);
    await expect(banner.locator('img, b')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __bannerInyectado?: boolean }).__bannerInyectado)).toBeUndefined();
  });
});
