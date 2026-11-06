import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  aTitleCase,
  apiPost,
  apiPut,
  clonarComercioTest,
  fijarPasswordAdminYLoguear,
  login,
  obtenerCodigoTest,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { loginUi, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sumarAlEquipo } from './helpers/empleado';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-inactividad');
const TEXTO_PANTALLA = 'Pasaron más de 3 meses sin que ingresaras, así que la dejamos en pausa. Tus datos y tus pedidos están a salvo.';
const TOAST = 'Cuenta reactivada. ¡Qué bueno verte de nuevo!';

async function captura(page: Page, nombre: string) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

async function inactivar(request: APIRequestContext, ...usuarioIds: number[]) {
  for (const id of usuarioIds) {
    const { status } = await apiPut(request, `/test/usuarios/${id}/ultimo-acceso?meses=4`, {});
    expect(status).toBe(200);
  }
  const corrida = await apiPost(request, '/test/jobs/inactivacion-cuentas', {});
  expect(corrida.status, JSON.stringify(corrida.body)).toBe(200);
  for (const id of usuarioIds) {
    expect(estadoUsuario(id)).toBe('INACTIVO');
  }
}

const estadoUsuario = (id: number): string => sql(`SELECT estado FROM usuario WHERE id = ${id};`);
const estadoComercio = (id: number): string => sql(`SELECT estado FROM comercio WHERE id = ${id};`);

async function almacenamientoContiene(page: Page, texto: string): Promise<boolean> {
  return page.evaluate((valor) => {
    const volcados = [localStorage, sessionStorage].map((almacen) => JSON.stringify(Object.fromEntries(Object.entries(almacen))));
    return volcados.some((volcado) => volcado.includes(valor)) || window.location.href.includes(valor);
  }, texto);
}

test.describe('Fase 5, S6 (UI B): pantalla de cuenta inactiva en el login', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;

  async function clienteInactivo(request: APIRequestContext): Promise<ClienteRegistrado & { id: number }> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    await inactivar(request, sesion.usuario.id);
    return { ...cuenta, id: sesion.usuario.id };
  }

  async function duenoConSuspendido(request: APIRequestContext): Promise<{ dueno: Dueno; suspendidoId: number; nombreSuspendido: string }> {
    const dueno = await prepararAprobado(request, adminSesion.token, localidadId, true);
    const nombreSuspendido = `Anexo ${sufijoUnico().replace(/[0-9]/g, (digito) => 'abcdefghij'[Number(digito)])} Norte`;
    const suspendidoId = await clonarComercioTest(request, dueno.comercioId, nombreSuspendido, 'SUSPENDIDO');
    await inactivar(request, dueno.duenoId);
    return { dueno, suspendidoId, nombreSuspendido };
  }

  async function intentarLogin(page: Page, usuario: string, password: string) {
    await loginUi(page, usuario, password);
  }

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('el login ya no ofrece el enlace de reactivación por código', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.getByTestId('btn-ir-a-reactivar-cuenta')).toHaveCount(0);
    await expect(page.locator('a[href="reactivar-cuenta.html"]')).toHaveCount(0);
  });

  test('un Cliente inactivo ve la pantalla, sin lista de comercios, con la contraseña fuera del formulario', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);

    await intentarLogin(page, cliente.nombreUsuario, cliente.password);

    const pantalla = page.getByTestId('pantalla-cuenta-inactiva');
    await expect(pantalla).toBeVisible();
    await expect(page.getByTestId('titulo-cuenta-inactiva')).toHaveText('Tu cuenta está inactiva');
    await expect(page.getByTestId('texto-cuenta-inactiva')).toHaveText(TEXTO_PANTALLA);
    await expect(page.getByTestId('comercios-cuenta-inactiva')).toHaveCount(0);
    await expect(page.getByTestId('btn-reactivar-cuenta-inactiva')).toBeFocused();
    await expect(page.getByTestId('btn-soporte-cuenta-inactiva')).toHaveAttribute('href', 'soporte.html?tipo=NO_PUEDO_ENTRAR');
    await expect(page.getByTestId('input-password')).toHaveValue('');
    expect(await almacenamientoContiene(page, cliente.password)).toBe(false);
    await expect(page.getByText('Solicitá la reactivación')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await captura(page, '01-pantalla-cuenta-inactiva-cliente');
  });

  test('"Reactivar mi cuenta" muestra "Reactivando…", entra al inicio con el toast y deja la cuenta activa', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);
    await intentarLogin(page, cliente.nombreUsuario, cliente.password);
    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toBeVisible();

    let liberar: () => void = () => {};
    const retenida = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    await page.route('**/auth/reactivar-cuenta/con-credenciales', async (ruta) => {
      await retenida;
      await ruta.continue();
    });

    await page.getByTestId('btn-reactivar-cuenta-inactiva').click();
    await expect(page.getByTestId('btn-reactivar-cuenta-inactiva')).toHaveText('Reactivando…');
    await expect(page.getByTestId('btn-reactivar-cuenta-inactiva')).toBeDisabled();
    await expect(page.getByTestId('btn-volver-a-ingresar')).toBeDisabled();
    await expect(page.getByTestId('btn-soporte-cuenta-inactiva')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('estado-reactivar-cuenta')).toHaveText('Reactivando tu cuenta…');
    await captura(page, '03-reactivando');
    liberar();

    await page.waitForURL('**/index.html');
    await expect(page.locator('.toast')).toContainText(TOAST);
    await captura(page, '04-toast-cuenta-reactivada');
    expect(estadoUsuario(cliente.id)).toBe('ACTIVO');
    expect(await almacenamientoContiene(page, cliente.password)).toBe(false);
  });

  test('un Empleado inactivo ve la misma pantalla sin lista y al reactivar pasa por el selector de contexto', async ({ page, request }) => {
    const dueno = await prepararAprobado(request, adminSesion.token, localidadId, true);
    const empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, empleado, dueno.token);
    const sesion = await login(request, empleado.nombreUsuario, empleado.password);
    await inactivar(request, sesion.usuario.id);

    await intentarLogin(page, empleado.nombreUsuario, empleado.password);
    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toBeVisible();
    await expect(page.getByTestId('comercios-cuenta-inactiva')).toHaveCount(0);

    await page.getByTestId('btn-reactivar-cuenta-inactiva').click();
    await page.waitForURL('**/seleccionar-contexto.html');
    await expect(page.locator('.toast')).toContainText(TOAST);
    expect(estadoUsuario(sesion.usuario.id)).toBe('ACTIVO');
  });

  test('un Dueño inactivo ve qué comercios vuelven y cuál sigue suspendido; al reactivar entra a su panel', async ({ page, request }) => {
    const { dueno, suspendidoId, nombreSuspendido } = await duenoConSuspendido(request);
    expect(estadoComercio(dueno.comercioId)).toBe('INACTIVO');
    expect(estadoComercio(suspendidoId)).toBe('SUSPENDIDO');

    await intentarLogin(page, dueno.nombreUsuario, dueno.password);

    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toBeVisible();
    const vuelve = page.getByTestId(`comercio-vuelve-${dueno.comercioId}`);
    await expect(vuelve).toContainText('vuelve a estar disponible.');
    await expect(vuelve).toContainText(aTitleCase(dueno.nombre));
    const sigue = page.getByTestId(`comercio-sigue-suspendido-${suspendidoId}`);
    await expect(sigue).toHaveText(`${aTitleCase(nombreSuspendido)} sigue suspendido. Si creés que es un error, escribinos.`);
    await sinScrollHorizontal(page);
    await captura(page, '02-pantalla-cuenta-inactiva-dueno-con-comercios');

    await page.getByTestId('btn-reactivar-cuenta-inactiva').click();
    await page.waitForURL('**/comercio-dashboard.html');
    await expect(page.locator('.toast')).toContainText(TOAST);
    expect(estadoUsuario(dueno.duenoId)).toBe('ACTIVO');
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    expect(estadoComercio(suspendidoId)).toBe('SUSPENDIDO');
  });

  test('con la contraseña incorrecta no aparece la pantalla: mensaje uniforme, aviso al segundo error y bloqueo a los 3', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);

    await intentarLogin(page, cliente.nombreUsuario, 'Incorrecta123');
    await expect(page.getByTestId('mensaje-error-login')).toContainText('Usuario o contraseña incorrectos');
    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toHaveCount(0);

    await page.getByTestId('btn-ingresar').click();
    await expect(page.getByTestId('mensaje-advertencia-bloqueo')).toBeVisible();

    await page.getByTestId('btn-ingresar').click();
    await expect(page.getByTestId('mensaje-error-login')).toContainText('Usuario o contraseña incorrectos');
    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toHaveCount(0);

    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await expect(page.getByTestId('mensaje-banner')).toContainText('Tu cuenta está bloqueada por intentos fallidos');
    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toHaveCount(0);
    expect(estadoUsuario(cliente.id)).toBe('INACTIVO');
  });

  test('si algo falla al reactivar, el bloque de error recibe el foco con el mensaje de la API y se puede reintentar', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);
    await intentarLogin(page, cliente.nombreUsuario, cliente.password);
    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toBeVisible();
    const reactivada = await apiPut(request, `/administrador/cuentas/${cliente.id}/reactivar`, {}, adminSesion.token);
    expect(reactivada.status).toBe(200);

    await page.getByTestId('btn-reactivar-cuenta-inactiva').click();

    const error = page.getByTestId('error-reactivar-cuenta');
    await expect(error).toBeVisible();
    await expect(error).toHaveText('Usuario o contraseña incorrectos');
    await expect(error).toBeFocused();
    await expect(page.getByTestId('btn-reactivar-cuenta-inactiva')).toBeEnabled();
    await expect(page.getByTestId('btn-reactivar-cuenta-inactiva')).toHaveText('Reactivar mi cuenta');
    await expect(page.getByTestId('btn-volver-a-ingresar')).toBeEnabled();
    await sinScrollHorizontal(page);
    await captura(page, '05-error-al-reactivar');
  });

  test('"Contactar a Soporte" lleva a Soporte con el tipo "No puedo entrar" ya elegido', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);
    await intentarLogin(page, cliente.nombreUsuario, cliente.password);

    await page.getByTestId('btn-soporte-cuenta-inactiva').click();

    await page.waitForURL('**/soporte.html?tipo=NO_PUEDO_ENTRAR');
    await expect(page.getByTestId('select-soporte-tipo')).toHaveValue('NO_PUEDO_ENTRAR');
  });

  test('"Volver a ingresar" descarta todo: sin credenciales en el almacenamiento ni en la URL y la cuenta sigue inactiva', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);
    await intentarLogin(page, cliente.nombreUsuario, cliente.password);
    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toBeVisible();

    await page.getByTestId('btn-volver-a-ingresar').click();

    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toHaveCount(0);
    await expect(page.getByTestId('input-password')).toHaveValue('');
    await expect(page.getByTestId('input-nombre-usuario')).toBeFocused();
    expect(await almacenamientoContiene(page, cliente.password)).toBe(false);
    expect(page.url()).not.toContain(cliente.nombreUsuario);
    await expect(page.evaluate(() => localStorage.getItem('bajonea_token'))).resolves.toBeNull();
    expect(estadoUsuario(cliente.id)).toBe('INACTIVO');
  });

  test('con Escape también se vuelve al login', async ({ page, request }) => {
    const cliente = await clienteInactivo(request);
    await intentarLogin(page, cliente.nombreUsuario, cliente.password);
    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('pantalla-cuenta-inactiva')).toHaveCount(0);
    await expect(page.getByTestId('input-nombre-usuario')).toBeFocused();
  });

  test('"Olvidé mi contraseña" reactiva la cuenta inactiva y devuelve los comercios, menos el suspendido aparte', async ({ page, request }) => {
    const { dueno, suspendidoId } = await duenoConSuspendido(request);
    const nuevaPassword = 'Recuperada123';

    await page.goto('/login.html');
    await page.getByTestId('btn-olvide-password').click();
    await page.waitForURL('**/recuperar-password.html');
    await page.getByTestId('input-email').fill(dueno.email);
    await page.getByTestId('btn-enviar-codigo-recuperacion').click();
    await expect(page.getByTestId('input-codigo-verificacion')).toBeVisible();
    const codigo = await obtenerCodigoTest(request, dueno.email, 'RECUPERACION_PASSWORD');
    for (let i = 0; i < 6; i += 1) {
      await page.getByTestId(`input-codigo-digito-${i + 1}`).fill(codigo[i]);
    }
    await expect(page.getByTestId('input-nueva-password')).toBeVisible();
    await page.getByTestId('input-nueva-password').fill(nuevaPassword);
    await page.getByTestId('input-confirmar-password').fill(nuevaPassword);
    const confirmar = page.waitForResponse((res) => res.url().endsWith('/auth/recuperar-password/confirmar') && res.request().method() === 'POST');
    await page.getByTestId('btn-restablecer-password').click();
    expect((await confirmar).status()).toBe(200);
    await expect(page.getByTestId('btn-ir-a-login-exito')).toBeVisible();

    expect(estadoUsuario(dueno.duenoId)).toBe('ACTIVO');
    expect(estadoComercio(dueno.comercioId)).toBe('APTO_VENTA');
    expect(estadoComercio(suspendidoId)).toBe('SUSPENDIDO');

    await page.getByTestId('btn-ir-a-login-exito').click();
    await loginUi(page, dueno.nombreUsuario, nuevaPassword);
    await page.waitForURL('**/comercio-dashboard.html');
  });

  test('una sesión abierta que la inactividad cerró lleva al aviso de sesión cerrada, sin errores feos', async ({ page, request }) => {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    await page.addInitScript(
      ([token, usuario]) => {
        localStorage.setItem('bajonea_token', token);
        localStorage.setItem('bajonea_usuario', usuario);
      },
      [sesion.token, JSON.stringify(sesion.usuario)],
    );
    await inactivar(request, sesion.usuario.id);

    await page.goto('/index.html');

    await expect(page.locator('#sesion-cerrada-modal')).toBeVisible();
  });
});
