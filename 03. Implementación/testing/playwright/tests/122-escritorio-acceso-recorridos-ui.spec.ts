import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import {
  apiPut,
  buscarClienteAdminPorEmail,
  clonarComercioTest,
  diaDeHoy,
  esperarImagenCargadaEnRecorte,
  fijarPasswordAdminYLoguear,
  generarCuit,
  generarDni,
  generarTelefono,
  invitarEmpleado,
  nombreArchivoFixture,
  nombreUsuarioUnico,
  obtenerCodigoInvitacionTest,
  obtenerCodigoTest,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
  login,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';
import { sumarAlEquipo } from './helpers/empleado';
import { ANCHOS_ESCRITORIO, caja, esDialogoCentrado, sinScrollHorizontalEnAnchos } from './helpers/layout';
import { abrirDatosAdicionales } from './helpers/datos-adicionales';
import fs from 'node:fs';

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-escritorio-e0');

async function capturar(page: Page, nombre: string) {
  if (!process.env.CAPTURAS) return;
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`), fullPage: true });
}

test.use({ viewport: { width: 1440, height: 900 } });

const FIXTURE = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));

test.describe('Escritorio E0: recorridos de acceso completos a 1440 px @escritorio', () => {
  test.describe.configure({ timeout: 180_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, false, horarios);
  });

  async function escribirCodigo(page: Page, codigo: string) {
    for (let i = 0; i < codigo.length; i += 1) {
      await page.getByTestId(`input-codigo-digito-${i + 1}`).fill(codigo[i]);
    }
  }

  test('login: error de credenciales visible dentro de la tarjeta y login correcto hasta el catálogo @escritorio', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill('ContraseñaIncorrecta1');
    await page.getByTestId('btn-ingresar').click();
    const error = page.getByTestId('mensaje-error-login');
    await expect(error).toBeVisible();
    await capturar(page, '31-login-error-credenciales');
    const tarjeta = await caja(page.locator('.app-main'));
    const caja_error = await caja(error);
    expect(caja_error.x).toBeGreaterThanOrEqual(tarjeta.x);
    expect(caja_error.x + caja_error.width).toBeLessThanOrEqual(tarjeta.x + tarjeta.width);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');
    await expect(page.getByTestId('mensaje-saludo')).toBeVisible();
  });

  test('login: cuenta sin verificar muestra el banner dentro de la tarjeta @escritorio', async ({ page, request }) => {
    const { registrarCliente } = await import('./helpers/backend');
    const cliente = await registrarCliente(request, localidadId);
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await expect(page.getByTestId('mensaje-banner')).toContainText('Todavía no verificaste tu email');
    const tarjeta = await caja(page.locator('.app-main'));
    const banner = await caja(page.getByTestId('mensaje-banner'));
    expect(banner.x + banner.width).toBeLessThanOrEqual(tarjeta.x + tarjeta.width);
  });

  test('login: la cuenta suspendida muestra la hoja como diálogo centrado y Cerrar devuelve el foco @escritorio', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const fila = await buscarClienteAdminPorEmail(request, adminToken, cliente.email);
    const suspension = await apiPut(request, `/administrador/clientes/${fila.id}/suspender`, { motivo: 'Motivo de prueba de escritorio' }, adminToken);
    expect(suspension.status).toBe(200);
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    const hoja = page.locator('[data-testid="hoja-cuenta-suspendida"] .modal-sheet');
    await expect(hoja).toBeVisible();
    await esDialogoCentrado(page, hoja);
    expect((await caja(hoja)).width).toBe(560);
    await capturar(page, '30-login-hoja-cuenta-suspendida');
    await page.getByTestId('btn-cerrar-cuenta-suspendida').click();
    await expect(page.getByTestId('hoja-cuenta-suspendida')).toHaveCount(0);
  });

  test('registro de cliente: los dos pasos, la verificación por código y el primer ingreso @escritorio', async ({ page, request }) => {
    const suf = sufijoUnico();
    const email = `cliente.esc.${suf}@bajonea.test`;
    const nombreUsuario = nombreUsuarioUnico('cli');
    await page.goto('/registro-cliente.html');
    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    await page.getByTestId('input-dni').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuario);
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('input-acepta-terminos').check();
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-calle')).toBeVisible();
    await page.getByTestId('input-calle').fill('Belgrano');
    await page.getByTestId('input-numero').fill('450');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await expect(page.getByTestId('select-localidad')).toBeEnabled();
    await page.getByTestId('select-localidad').selectOption(localidadId);
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    await page.setViewportSize({ width: 1440, height: 900 });
    const respuesta = page.waitForResponse((res) => res.url().endsWith('/auth/registro/cliente') && res.request().method() === 'POST');
    await page.getByTestId('btn-crear-cuenta').click();
    expect((await respuesta).status()).toBe(201);
    await expect(page.getByText('Revisá tu email')).toBeVisible();
    await page.getByTestId('btn-ir-a-verificar').click();
    const codigo = await obtenerCodigoTest(request, email, 'VERIFICACION_EMAIL');
    await escribirCodigo(page, codigo);
    await expect(page.getByTestId('estado-verificacion-exito')).toBeVisible();
    await page.getByTestId('btn-ir-a-login').click();
    await page.waitForURL('**/login.html');
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuario);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');
  });

  test('registro de comercio: los cuatro pasos hasta la pantalla de código @escritorio', async ({ page }) => {
    const suf = sufijoUnico();
    const emailLogin = `comercio.esc.${suf}@bajonea.test`;
    await page.goto('/registro-comercio.html');
    await page.getByTestId('input-nombre').fill(`Comercio Escritorio ${suf}`);
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
    await page.getByTestId('input-calle').fill('Av. San Martín');
    await page.getByTestId('input-numero').fill('100');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await expect(page.getByTestId('select-localidad')).toBeEnabled();
    await page.getByTestId('select-localidad').selectOption(localidadId);
    await page.getByTestId('input-foto-comercio').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    await esperarImagenCargadaEnRecorte(page);
    const recorte = page.locator('.modal-backdrop .crop-modal');
    await esDialogoCentrado(page, recorte, { anchoMinimo: 400, anchoMaximo: 640 });
    await page.getByTestId('btn-confirmar-recorte').click();
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
    await page.getByTestId('btn-continuar').click();

    await abrirDatosAdicionales(page);
    await page.getByTestId('input-cuit').fill(generarCuit());
    await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
    await page.getByTestId('input-nombre-representante').fill('Rodrigo');
    await page.getByTestId('input-apellido-representante').fill('Fernández');
    await page.getByTestId('input-dni-representante').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
    await page.getByTestId('input-telefono-representante').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('com'));
    await page.getByTestId('input-email').fill(emailLogin);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('btn-continuar-2').click();

    await page.getByTestId('tab-horario-personalizado').click();
    await page.getByTestId('btn-agregar-horario').click();
    const fila = page.getByTestId('fila-horario').nth(0);
    await fila.getByTestId('select-dia-horario').selectOption(diaDeHoy());
    await fila.getByTestId('input-apertura-horario').fill('09:00');
    await fila.getByTestId('input-cierre-horario').fill('18:00');
    await page.getByTestId('btn-continuar-3').click();

    await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
    await page.getByTestId('select-tipo-red-social').selectOption('INSTAGRAM');
    await page.getByTestId('input-url-red-social').fill(`instagram.com/comercio.esc.${suf}`);
    const respuesta = page.waitForResponse((res) => res.url().endsWith('/auth/registro/comercio') && res.request().method() === 'POST');
    await page.getByTestId('input-acepta-terminos').check();
    await page.getByTestId('btn-registrar-comercio').click();
    expect((await respuesta).status()).toBe(201);
    await expect(page.getByTestId('btn-ir-a-verificar')).toBeVisible();
    await expect(page.getByText('Registro enviado')).toBeVisible();
  });

  test('recuperar contraseña: tres pasos y login con la nueva @escritorio', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const nueva = 'NuevaClave456';
    await page.goto('/recuperar-password.html');
    await page.getByTestId('input-email').fill(cliente.email);
    await page.getByTestId('btn-enviar-codigo-recuperacion').click();
    await expect(page.getByTestId('input-codigo-verificacion')).toBeVisible();
    const codigo = await obtenerCodigoTest(request, cliente.email, 'RECUPERACION_PASSWORD');
    await escribirCodigo(page, codigo);
    await expect(page.getByTestId('input-nueva-password')).toBeVisible();
    await page.getByTestId('input-nueva-password').fill(nueva);
    await page.getByTestId('input-confirmar-password').fill(nueva);
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId('btn-restablecer-password').click();
    await expect(page.getByText('Contraseña actualizada')).toBeVisible();
    await page.getByTestId('btn-ir-a-login-exito').click();
    await page.waitForURL('**/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(nueva);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');
  });

  test('invitación de Empleado con cuenta existente: código, aceptación y primer ingreso @escritorio', async ({ page, request }) => {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    const comercioId = await clonarComercioTest(request, dueno.comercioId, `Invitación Escritorio ${sufijoUnico()}`, 'APROBADO');
    const invitacion = await invitarEmpleado(request, dueno.token, comercioId, cuenta.email);
    expect(invitacion.status).toBe(201);
    const codigo = await obtenerCodigoInvitacionTest(request, cuenta.email, comercioId);
    await page.goto('/invitacion-empleado.html');
    const columna = await caja(page.locator('.app-main'));
    expect(columna.width).toBe(640);
    await page.getByTestId('input-email-invitacion').fill(cuenta.email);
    await escribirCodigo(page, codigo);
    await page.getByTestId('btn-continuar-invitacion').click();
    await expect(page.getByTestId('btn-aceptar-invitacion')).toBeVisible();
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId('btn-aceptar-invitacion').click();
    await expect(page.getByTestId('estado-invitacion-exito')).toBeVisible();
  });

  test('selector de contexto: tarjeta centrada y sin scroll horizontal a todos los anchos @escritorio', async ({ page, request }) => {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    const comercioId = await clonarComercioTest(request, dueno.comercioId, `Contexto Escritorio ${sufijoUnico()}`, 'APROBADO');
    await sumarAlEquipo(request, comercioId, cuenta, dueno.token);
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cuenta.nombreUsuario);
    await page.getByTestId('input-password').fill(cuenta.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/seleccionar-contexto.html');
    await expect(page.getByTestId('selector-contexto')).toBeVisible();
    await capturar(page, '32-seleccionar-contexto');
    const contenido = await caja(page.locator('#selector-contenido'));
    expect(contenido.width).toBeLessThanOrEqual(960);
    expect(Math.abs(contenido.x + contenido.width / 2 - 720)).toBeLessThanOrEqual(1);
    await sinScrollHorizontalEnAnchos(page, ANCHOS_ESCRITORIO);
    void login;
  });
});
