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

    // Paso intermedio con error real: código incorrecto no deja avanzar al paso de nueva
    // contraseña -- se queda en el paso de código con el error visible.
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

    // Fortaleza visual: password débil no marca ninguna barra, password fuerte marca las 4.
    // (Selector plano, no encadenado: las clases --filled se agregan a los mismos divs .bar,
    // no a hijos nuevos -- barras.locator(...) buscaría descendientes y nunca los encontraría.)
    const barrasLlenas = page.locator('[data-testid="indicador-fortaleza-password"] .strength-meter__bar--filled');
    await page.getByTestId('input-nueva-password').fill('debil');
    await expect(barrasLlenas).toHaveCount(0);
    await expect(page.locator('#strength-label')).toContainText('débil');
    await page.getByTestId('input-nueva-password').fill(nuevaPassword);
    await expect(barrasLlenas).toHaveCount(4);

    // Confirmación no coincide: error visible cerca del campo, no envía el form.
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

    // La contraseña vieja ya no sirve; la nueva sí -- confirma persistencia real, no solo la UI.
    const sesionNueva = await login(request, cliente.email, nuevaPassword);
    expect(sesionNueva.token).toBeTruthy();
    await expect(login(request, cliente.email, cliente.password)).rejects.toThrow();
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

  /**
   * No hay ninguna vía real de API en el MVP para dejar una cuenta en EstadoUsuario.INACTIVO
   * (sin job de inactivación automática, sin endpoint de baja de cuenta propia ni de
   * suspensión de Administrador -- mismo gap ya confirmado en el cierre de Fase 14,
   * docs/AUDITORIA-POSTMAN-FASE10-14.md, y en el tramo de matriz de Postman de Cliente,
   * docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md punto 7). El flujo feliz completo
   * (cuenta inactiva -> reactivar -> loguear) queda sin cobertura E2E por el mismo motivo que
   * en Postman -- no es simulable sin tocar la base a mano, que va contra la metodología del
   * proyecto. Lo que SÍ es real y alcanzable: AuthService.solicitarReactivacionCuenta no
   * genera ningún token para una cuenta ya ACTIVO (anti user-enumeration, sin revelarlo en la
   * respuesta HTTP) -- así que un código cualquiera después de pedirlo para una cuenta activa
   * siempre es "código inexistente" real, no simulado. Cubre el mismo caso que la carpeta de
   * Postman ya documentaba como el único negocio real alcanzable para este formulario.
   */
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
    // Misma respuesta genérica exista o no la cuenta -- anti user-enumeration.
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
    // El listener de otp.js filtra no-dígitos y corta a 1 caracter -- "a7b" tipeado letra por
    // letra deja únicamente el "7", nunca deja pasar la letra ni acumula más de un caracter.
    await expect(primerBox).toHaveValue('7');
  });
});
