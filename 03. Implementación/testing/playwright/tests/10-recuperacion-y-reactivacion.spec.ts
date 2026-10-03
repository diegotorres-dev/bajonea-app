import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  obtenerCodigoTest,
  login,
  sufijoUnico,
} from './helpers/backend';

async function llenarOtp(page: Page, valor: string) {
  for (let i = 0; i < 6; i += 1) {
    await page.getByTestId(`input-codigo-digito-${i + 1}`).fill(valor[i] ?? '');
  }
}

async function vaciarOtp(page: Page) {
  for (let i = 0; i < 6; i += 1) {
    await page.getByTestId(`input-codigo-digito-${i + 1}`).fill('');
  }
}

test.describe('Recuperación de contraseña (3 pasos)', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('paso 1: email vacío y formato inválido muestran el error cerca del campo, sin avanzar de paso', async ({ page }) => {
    await page.goto('/recuperar-password.html');

    await page.getByTestId('btn-enviar-codigo-recuperacion').click();
    await expect(page.getByTestId('mensaje-error-email')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-email')).toContainText('Ingresá tu email');
    await expect(page.getByTestId('input-codigo-verificacion')).toBeHidden();

    await page.getByTestId('input-email').fill('sin-arroba-invalido');
    await page.getByTestId('btn-enviar-codigo-recuperacion').click();
    await expect(page.getByTestId('mensaje-error-email')).toContainText('formato válido');
    await expect(page.getByTestId('input-codigo-verificacion')).toBeHidden();
  });

  test('flujo completo: código incorrecto bloquea el paso intermedio con error visible, código real avanza y la contraseña nueva sirve para loguear', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const nuevaPassword = 'Recuperada123';

    await page.goto('/recuperar-password.html');
    await page.getByTestId('input-email').fill(cliente.email);

    const solicitudResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/recuperar-password') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-enviar-codigo-recuperacion').click();
    await solicitudResponse;
    await expect(page.getByTestId('input-codigo-verificacion')).toBeVisible();

    const intentoIncorrecto = page.waitForResponse(
      (res) => res.url().endsWith('/auth/recuperar-password/validar-codigo') && res.request().method() === 'POST',
    );
    await llenarOtp(page, '000000');
    const respuestaIncorrecta = await intentoIncorrecto;
    expect(respuestaIncorrecta.status()).toBe(401);
    await expect(page.getByTestId('mensaje-error-codigo')).toBeVisible();
    await expect(page.getByTestId('input-nueva-password')).toBeHidden();

    await vaciarOtp(page);
    const codigo = await obtenerCodigoTest(request, cliente.email, 'RECUPERACION_PASSWORD');
    const intentoCorrecto = page.waitForResponse(
      (res) => res.url().endsWith('/auth/recuperar-password/validar-codigo') && res.request().method() === 'POST',
    );
    await llenarOtp(page, codigo);
    await intentoCorrecto;
    await expect(page.getByTestId('input-nueva-password')).toBeVisible();

    const barrasLlenas = page.locator('[data-testid="indicador-fortaleza-password"] .strength-meter__bar--filled');
    await page.getByTestId('input-nueva-password').fill('debil');
    await expect(barrasLlenas).toHaveCount(0);
    await expect(page.locator('#strength-label')).toContainText('débil');
    await page.getByTestId('input-nueva-password').fill(nuevaPassword);
    await expect(barrasLlenas).toHaveCount(4);

    await page.getByTestId('input-confirmar-password').fill('OtraCosa123');
    await page.getByTestId('btn-restablecer-password').click();
    await expect(page.getByTestId('mensaje-error-confirmar-password')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-confirmar-password')).toContainText('no coinciden');

    await page.getByTestId('input-confirmar-password').fill(nuevaPassword);
    const confirmarResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/recuperar-password/confirmar') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-restablecer-password').click();
    const respuestaConfirmar = await confirmarResponse;
    expect(respuestaConfirmar.status()).toBe(200);
    await expect(page.getByTestId('btn-ir-a-login-exito')).toBeVisible();

    const sesionNueva = await login(request, cliente.nombreUsuario, nuevaPassword);
    expect(sesionNueva.token).toBeTruthy();
    await expect(login(request, cliente.nombreUsuario, cliente.password)).rejects.toThrow();
  });

  test('reenviar código pide uno nuevo y limpia los boxes del OTP', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await page.goto('/recuperar-password.html');
    await page.getByTestId('input-email').fill(cliente.email);
    await page.getByTestId('btn-enviar-codigo-recuperacion').click();
    await expect(page.getByTestId('input-codigo-verificacion')).toBeVisible();

    await page.getByTestId('input-codigo-digito-1').fill('9');
    const reenvioResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/recuperar-password') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-reenviar-codigo').click();
    await reenvioResponse;
    await expect(page.getByTestId('input-codigo-digito-1')).toHaveValue('');
    await expect(page.getByTestId('mensaje-banner-codigo')).toContainText('nuevo código');
  });
});

test.describe('Reactivación de cuenta (2 pasos)', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('paso 1: email vacío y formato inválido muestran el error cerca del campo, sin avanzar de paso', async ({ page }) => {
    await page.goto('/reactivar-cuenta.html');

    await page.getByTestId('btn-enviar-codigo-reactivacion').click();
    await expect(page.getByTestId('mensaje-error-email')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-email')).toContainText('Ingresá tu email');
    await expect(page.getByTestId('input-codigo-verificacion')).toBeHidden();

    await page.getByTestId('input-email').fill('sin-arroba-invalido');
    await page.getByTestId('btn-enviar-codigo-reactivacion').click();
    await expect(page.getByTestId('mensaje-error-email')).toContainText('formato válido');
    await expect(page.getByTestId('input-codigo-verificacion')).toBeHidden();
  });

  test('cuenta ya activa: pedir reactivación no genera ningún código real, cualquier código se rechaza con error visible', async ({
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
    const respuestaSolicitud = await solicitudResponse;
    expect(respuestaSolicitud.status()).toBe(200);
    await expect(page.getByTestId('input-codigo-verificacion')).toBeVisible();

    const intentoResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/reactivar-cuenta/confirmar') && res.request().method() === 'POST',
    );
    await llenarOtp(page, '123456');
    const respuestaIntento = await intentoResponse;
    expect([401, 409]).toContain(respuestaIntento.status());
    await expect(page.getByTestId('mensaje-error-codigo')).toBeVisible();
    await expect(page.getByTestId('btn-ir-a-login')).toBeHidden();
  });

  test('OTP de reactivación bloquea letras y símbolos en tiempo real, solo acepta un dígito por casillero', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await page.goto('/reactivar-cuenta.html');
    await page.getByTestId('input-email').fill(cliente.email);
    await page.getByTestId('btn-enviar-codigo-reactivacion').click();
    await expect(page.getByTestId('input-codigo-verificacion')).toBeVisible();

    const primerBox = page.getByTestId('input-codigo-digito-1');
    await primerBox.pressSequentially('a7b');
    await expect(primerBox).toHaveValue('7');
  });
});
