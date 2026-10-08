import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  MENSAJE_CODIGO_INVALIDO,
  apiPost,
  clonarComercioTest,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  generarDni,
  generarTelefono,
  invitarEmpleado,
  login,
  nombreUsuarioUnico,
  obtenerCodigoInvitacionTest,
  obtenerLocalidadRioGrande,
  registrarCliente,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
  vencerInvitacionTest,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const MSG_LIMITE = 'Demasiados intentos. Probá de nuevo en un minuto.';
const MSG_SIN_CONEXION = 'No pudimos conectar. Probá de nuevo.';
const MSG_BLOQUEADA = 'Cuenta bloqueada. Recuperá tu contraseña para desbloquearla';
const MSG_DNI = 'Ya existe una cuenta registrada con ese DNI';
const MSG_USUARIO = 'Ese nombre de usuario ya está en uso';
const MSG_REVISAR = 'Revisá los campos marcados.';
const MSG_TERMINOS = 'Tenés que aceptar los Términos y Condiciones para continuar.';
const AVISO_LOGIN = 'Listo, ya podés ingresar';

const emailNuevo = (): string => `inv.ui.${sufijoUnico()}@bajonea.test`;
const estadoInvitacion = (id: number): string => sql(`SELECT estado FROM invitacion_empleado WHERE id = ${id};`);
const usuarioIdPorEmail = (email: string): number => Number(sql(`SELECT id FROM usuario WHERE email = '${email}';`));
const passwordNueva = (): string => `Pw${sufijoUnico()}Aa1`;

function codigoErroneo(codigo: string): string {
  const ultimo = (Number(codigo[5]) + 1) % 10;
  return `${codigo.slice(0, 5)}${ultimo}`;
}

async function escribirCodigo(page: Page, codigo: string) {
  for (let i = 0; i < codigo.length; i += 1) {
    await page.getByTestId(`input-codigo-digito-${i + 1}`).fill(codigo[i]);
  }
}

async function completarPaso1(page: Page, email: string, codigo: string) {
  await page.getByTestId('input-email-invitacion').fill(email);
  await escribirCodigo(page, codigo);
}

async function continuarConCodigo(page: Page, email: string, codigo: string) {
  await completarPaso1(page, email, codigo);
  await page.getByTestId('btn-continuar-invitacion').click();
}

async function sinScrollHorizontal(page: Page) {
  const medidas = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
  expect(medidas.ancho).toBeLessThanOrEqual(medidas.ventana);
}

test.describe('Invitación de empleado (UI), tramo E1 B2', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 375, height: 812 } });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, false, horarios);
  });

  async function invitarConCodigo(request: APIRequestContext, email = emailNuevo()) {
    const comercioNombre = `Invitación UI ${sufijoUnico()}`;
    const comercioId = await clonarComercioTest(request, dueno.comercioId, comercioNombre, 'APROBADO');
    const respuesta = await invitarEmpleado(request, dueno.token, comercioId, email);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
    return { email, id: respuesta.body.data.id as number, codigo, comercioId, comercioNombre };
  }

  async function loginUi(page: Page, usuario: string, password: string) {
    await page.getByTestId('input-nombre-usuario').fill(usuario);
    await page.getByTestId('input-password').fill(password);
    await page.getByTestId('btn-ingresar').click();
  }

  async function completarPaso1Asistente(page: Page, datos: { dni: string; nombreUsuario: string; password: string; fecha?: string; terminos?: boolean }) {
    await page.getByTestId('input-nombre').fill('Empleada');
    await page.getByTestId('input-apellido').fill('Invitada');
    await page.getByTestId('input-dni').fill(datos.dni);
    await page.getByTestId('input-fecha-nacimiento').fill(datos.fecha ?? '1996-08-14');
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(datos.nombreUsuario);
    await page.getByTestId('input-password').fill(datos.password);
    await page.getByTestId('input-confirmar-password').fill(datos.password);
    if (datos.terminos !== false) {
      await page.getByTestId('input-acepta-terminos').check();
    }
  }

  async function completarPaso2Asistente(page: Page) {
    await expect(page.getByTestId('input-calle')).toBeVisible();
    await page.getByTestId('input-calle').fill('Belgrano');
    await page.getByTestId('input-numero').fill('450');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await expect(page.getByTestId('select-localidad')).toBeEnabled();
    await page.getByTestId('select-localidad').selectOption(localidadId);
  }

  test('el login tiene el enlace "Tengo una invitación" y lleva a la pantalla de invitación', async ({ page }) => {
    await page.goto('/login.html');
    const enlace = page.getByTestId('btn-ir-a-invitacion');
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveText('Tengo una invitación');
    await enlace.click();
    await expect(page).toHaveURL(/invitacion-empleado\.html$/);
    await expect(page.getByTestId('titulo-invitacion')).toHaveText('Tengo una invitación');
    await expect(page.getByTestId('btn-continuar-invitacion')).toBeVisible();
  });

  test('el tipo de cuenta tiene la línea "Tengo una invitación", sin ser una tercera tarjeta', async ({ page }) => {
    await page.goto('/registro-tipo-cuenta.html');
    await expect(page.locator('.delivery-option')).toHaveCount(2);
    const enlace = page.getByTestId('btn-ir-a-invitacion');
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveText('Tengo una invitación');
    await expect(page.getByText('¿Te invitaron a trabajar en un comercio?')).toBeVisible();
    await enlace.click();
    await expect(page).toHaveURL(/invitacion-empleado\.html$/);
  });

  test('paso 1: un código incorrecto da el mensaje único bajo el código, marca el OTP y no redirige ni cierra sesión', async ({ page, request }) => {
    const { email, codigo } = await invitarConCodigo(request);
    const llamadas: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/invitaciones-empleado/')) llamadas.push(r.url());
    });

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, email, codigoErroneo(codigo));

    await expect(page.getByTestId('mensaje-error-codigo-invitacion')).toHaveText(MENSAJE_CODIGO_INVALIDO);
    await expect(page.locator('.otp-box--error')).toHaveCount(6);
    await expect(page).toHaveURL(/invitacion-empleado\.html$/);
    expect(page.url()).not.toContain(email);
    expect(page.url()).not.toContain(codigo);
    await expect(page.locator('#sesion-cerrada-modal')).toHaveCount(0);
    await expect(page.getByTestId('titulo-invitacion')).toHaveText('Tengo una invitación');
    expect(llamadas.length).toBe(1);
    await expect(page.getByTestId('input-email-invitacion')).toHaveValue(email);
    const almacenado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(almacenado).not.toContain(email);
  });

  test('paso 1: email o código vacíos o incompletos se frenan en pantalla sin llamar al servidor', async ({ page }) => {
    let llamadas = 0;
    page.on('request', (r) => {
      if (r.url().includes('/invitaciones-empleado/')) llamadas += 1;
    });

    await page.goto('/invitacion-empleado.html');
    await page.getByTestId('btn-continuar-invitacion').click();
    await expect(page.getByTestId('mensaje-error-email-invitacion')).toHaveText('El email es obligatorio');
    await expect(page.getByTestId('mensaje-error-codigo-invitacion')).toHaveText('Ingresá el código de 6 dígitos.');

    await page.getByTestId('input-email-invitacion').fill('esto-no-es-un-email');
    await escribirCodigo(page, '123');
    await page.getByTestId('btn-continuar-invitacion').click();
    await expect(page.getByTestId('mensaje-error-email-invitacion')).toHaveText('Ingresá un email válido');
    await expect(page.getByTestId('mensaje-error-codigo-invitacion')).toHaveText('Ingresá el código de 6 dígitos.');
    expect(llamadas).toBe(0);
  });

  test('paso 1: el código de otra persona da el mismo mensaje único', async ({ page, request }) => {
    const propia = await invitarConCodigo(request);
    const ajena = await invitarConCodigo(request);

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, propia.email, ajena.codigo === propia.codigo ? codigoErroneo(ajena.codigo) : ajena.codigo);

    await expect(page.getByTestId('mensaje-error-codigo-invitacion')).toHaveText(MENSAJE_CODIGO_INVALIDO);
    await expect(page).toHaveURL(/invitacion-empleado\.html$/);
    expect(estadoInvitacion(propia.id)).toBe('PENDIENTE');
  });

  test('paso 1: una invitación vencida da el mismo mensaje único', async ({ page, request }) => {
    const { email, id, codigo } = await invitarConCodigo(request);
    await vencerInvitacionTest(request, id);

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, email, codigo);

    await expect(page.getByTestId('mensaje-error-codigo-invitacion')).toHaveText(MENSAJE_CODIGO_INVALIDO);
    await expect(page.locator('.otp-box--error')).toHaveCount(6);
    await expect(page.getByTestId('vista-invitacion-existente')).toBeHidden();
  });

  test('paso 1: una cuenta bloqueada después de invitar da un 409 con el mensaje del servidor en un banner', async ({ page, request }) => {
    const existente = await registrarYVerificarCliente(request, localidadId);
    const { codigo } = await invitarConCodigo(request, existente.email);
    for (let intento = 1; intento <= 3; intento += 1) {
      const fallido = await apiPost(request, '/auth/login', { nombreUsuario: existente.nombreUsuario, password: `Mala${sufijoUnico()}` });
      expect(fallido.status, `intento ${intento}`).toBe(401);
    }

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, existente.email, codigo);

    await expect(page.getByTestId('mensaje-banner-invitacion')).toContainText(MSG_BLOQUEADA);
    await expect(page.getByTestId('mensaje-error-codigo-invitacion')).toBeHidden();
    await expect(page).toHaveURL(/invitacion-empleado\.html$/);
    await expect(page.getByTestId('vista-invitacion-existente')).toBeHidden();
  });

  test('paso 1: un 429 simulado muestra el aviso de demasiados intentos sin redirigir', async ({ page }) => {
    await page.route('**/auth/invitaciones-empleado/validar', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ mensaje: 'Límite', data: null }) }),
    );

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, 'persona@bajonea.test', '123456');

    await expect(page.getByTestId('mensaje-banner-invitacion')).toContainText(MSG_LIMITE);
    await expect(page).toHaveURL(/invitacion-empleado\.html$/);
    await expect(page.getByTestId('input-email-invitacion')).toHaveValue('persona@bajonea.test');
  });

  test('paso 1: un corte de red o un error 500 no redirige ni pierde lo cargado, y reintentar funciona', async ({ page, request }) => {
    const existente = await registrarYVerificarCliente(request, localidadId);
    const { codigo } = await invitarConCodigo(request, existente.email);

    await page.route('**/auth/invitaciones-empleado/validar', (route) => route.abort('failed'));
    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, existente.email, codigo);

    await expect(page.getByTestId('mensaje-banner-invitacion')).toContainText(MSG_SIN_CONEXION);
    await expect(page).toHaveURL(/invitacion-empleado\.html$/);
    await expect(page.getByTestId('input-email-invitacion')).toHaveValue(existente.email);
    await expect(page.getByTestId('input-codigo-digito-1')).toHaveValue(codigo[0]);
    await expect(page.getByTestId('input-codigo-digito-6')).toHaveValue(codigo[5]);

    await page.unroute('**/auth/invitaciones-empleado/validar');
    await page.route('**/auth/invitaciones-empleado/validar', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ mensaje: 'Falla interna', data: null }) }),
    );
    await page.getByTestId('btn-continuar-invitacion').click();
    await expect(page.getByTestId('mensaje-banner-invitacion')).toContainText(MSG_SIN_CONEXION);
    await expect(page).toHaveURL(/invitacion-empleado\.html$/);
    await expect(page.getByTestId('input-email-invitacion')).toHaveValue(existente.email);

    await page.unroute('**/auth/invitaciones-empleado/validar');
    await page.getByTestId('btn-continuar-invitacion').click();
    await expect(page.getByTestId('vista-invitacion-existente')).toBeVisible();
  });

  test('cuenta existente: confirma la invitación, ve el éxito, vuelve al login con el aviso y puede iniciar sesión', async ({ page, request }) => {
    const existente = await registrarYVerificarCliente(request, localidadId);
    const { id, codigo, comercioId, comercioNombre } = await invitarConCodigo(request, existente.email);

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, existente.email, codigo);

    await expect(page.getByTestId('titulo-invitacion')).toHaveText('Invitación');
    await expect(page.getByTestId('nombre-comercio-invitacion')).toHaveText(comercioNombre);
    await expect(page.getByTestId('vista-invitacion-existente')).toContainText('Te invitaron a sumarte a su equipo.');
    await expect(page.getByTestId('cuenta-invitacion')).toHaveText(`Cuenta: ${existente.email}`);
    await expect(page.getByTestId('avatar-comercio-invitacion').locator('img, .avatar-inicial')).toHaveCount(1);
    expect(page.url()).not.toContain(existente.email);

    const aceptar = page.waitForResponse((r) => r.url().endsWith('/auth/invitaciones-empleado/aceptar') && r.request().method() === 'POST');
    await page.getByTestId('btn-aceptar-invitacion').click();
    expect((await aceptar).status()).toBe(200);
    const cuerpo = (await aceptar).request().postDataJSON();
    expect(Object.keys(cuerpo).sort()).toEqual(['codigo', 'email']);

    await expect(page.getByTestId('mensaje-invitacion-exito')).toHaveText(`Ya sos parte del equipo de ${comercioNombre}`);
    await expect(page.getByTestId('btn-volver')).toBeHidden();
    expect(estadoInvitacion(id)).toBe('ACEPTADA');
    expect(sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${usuarioIdPorEmail(existente.email)} AND comercio_id = ${comercioId};`)).toBe('ACTIVO');
    expect(await page.evaluate(() => localStorage.getItem('bajonea_token'))).toBeNull();

    await page.getByTestId('btn-iniciar-sesion-invitacion').click();
    await expect(page).toHaveURL(/login\.html$/);
    await expect(page.getByText(AVISO_LOGIN)).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('bajonea_aviso_invitacion'))).toBeNull();

    await loginUi(page, existente.nombreUsuario, existente.password);
    await page.waitForURL('**/index.html');
  });

  test('cuenta existente: "Ahora no" vuelve al login sin consumir la invitación ni mostrar el aviso', async ({ page, request }) => {
    const existente = await registrarYVerificarCliente(request, localidadId);
    const { id, codigo, comercioId } = await invitarConCodigo(request, existente.email);

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, existente.email, codigo);
    await expect(page.getByTestId('btn-ahora-no')).toBeVisible();
    await page.getByTestId('btn-ahora-no').click();

    await expect(page).toHaveURL(/login\.html$/);
    await expect(page.getByText(AVISO_LOGIN)).toHaveCount(0);
    expect(estadoInvitacion(id)).toBe('PENDIENTE');
    expect(await obtenerCodigoInvitacionTest(request, existente.email, comercioId)).toBe(codigo);
    expect(Number(sql(`SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ${comercioId} AND empleado_id = ${usuarioIdPorEmail(existente.email)};`))).toBe(0);
  });

  test('cuenta nueva: los dos pasos del asistente, Términos obligatorio, foto omitida, éxito e inicio de sesión con el usuario creado', async ({ page, request }) => {
    const { email, id, codigo, comercioId, comercioNombre } = await invitarConCodigo(request);
    const nombreUsuario = nombreUsuarioUnico('emp');
    const password = passwordNueva();

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, email, codigo);

    await expect(page.getByTestId('titulo-invitacion')).toHaveText('Crear tu cuenta');
    await expect(page.getByTestId('subtitulo-cuenta-nueva')).toHaveText(`Para sumarte a ${comercioNombre}`);
    await expect(page.getByTestId('input-email')).toHaveCount(0);
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await expect(page.locator('.form-footer-link')).toHaveCount(0);

    await completarPaso1Asistente(page, { dni: generarDni(), nombreUsuario, password, terminos: false });
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('mensaje-error-terminos')).toHaveText(MSG_TERMINOS);
    await expect(page.getByTestId('input-calle')).toBeHidden();

    await page.getByTestId('input-acepta-terminos').check();
    await page.getByTestId('btn-continuar').click();
    await completarPaso2Asistente(page);
    await expect(page.getByTestId('btn-crear-cuenta')).toHaveText('Crear cuenta y aceptar');

    const aceptar = page.waitForResponse((r) => r.url().endsWith('/auth/invitaciones-empleado/aceptar') && r.request().method() === 'POST');
    await page.getByTestId('btn-crear-cuenta').click();
    const respuesta = await aceptar;
    expect(respuesta.status()).toBe(200);
    const cuerpo = respuesta.request().postDataJSON();
    expect(Object.keys(cuerpo).sort()).toEqual(['aceptaTerminos', 'codigo', 'cuentaNueva', 'email']);
    expect(cuerpo.aceptaTerminos).toBe(true);
    expect(cuerpo.cuentaNueva.email).toBeUndefined();
    expect(cuerpo.cuentaNueva.aceptaTerminos).toBeUndefined();
    expect(cuerpo.cuentaNueva.nombreUsuario).toBe(nombreUsuario);

    await expect(page.getByTestId('mensaje-invitacion-exito')).toHaveText(`Ya sos parte del equipo de ${comercioNombre}`);
    expect(estadoInvitacion(id)).toBe('ACEPTADA');
    expect(sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${usuarioIdPorEmail(email)} AND comercio_id = ${comercioId};`)).toBe('ACTIVO');

    await page.getByTestId('btn-iniciar-sesion-invitacion').click();
    await expect(page).toHaveURL(/login\.html$/);
    await expect(page.getByText(AVISO_LOGIN)).toBeVisible();
    const verificar = await apiPost(request, '/auth/login', { nombreUsuario, password });
    expect(verificar.status).toBe(200);
    expect(verificar.body.data.usuario.rol).toBe('CLIENTE');
    await loginUi(page, nombreUsuario, password);
    await page.waitForURL('**/index.html');
  });

  test('cuenta nueva: un DNI ya registrado vuelve al paso 1 con el error en el campo y la invitación sigue pendiente', async ({ page, request }) => {
    const otra = await registrarYVerificarCliente(request, localidadId);
    const dniExistente = sql(`SELECT pf.dni FROM persona_fisica pf JOIN usuario u ON u.id = pf.id WHERE u.email = '${otra.email}';`);
    const { email, id, codigo } = await invitarConCodigo(request);

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, email, codigo);
    await completarPaso1Asistente(page, { dni: dniExistente, nombreUsuario: nombreUsuarioUnico('emp'), password: passwordNueva() });
    await page.getByTestId('btn-continuar').click();
    await completarPaso2Asistente(page);
    await page.getByTestId('btn-crear-cuenta').click();

    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-dni')).toHaveText(MSG_DNI);
    await expect(page.getByTestId('mensaje-banner')).toContainText(MSG_REVISAR);
    await expect(page.getByTestId('mensaje-invitacion-exito')).toBeHidden();
    expect(estadoInvitacion(id)).toBe('PENDIENTE');
    expect(Number(sql(`SELECT COUNT(*) FROM usuario WHERE email = '${email}';`))).toBe(0);
  });

  test('cuenta nueva: un nombre de usuario que otra persona toma antes de enviar vuelve al paso 1 con el error en el campo', async ({ page, request }) => {
    const { email, id, codigo } = await invitarConCodigo(request);
    const nombreUsuario = nombreUsuarioUnico('emp');

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, email, codigo);
    await completarPaso1Asistente(page, { dni: generarDni(), nombreUsuario, password: passwordNueva() });
    await expect(page.getByTestId('estado-nombre-usuario')).toHaveText('Nombre de usuario disponible');
    await registrarCliente(request, localidadId, { nombreUsuario });
    await page.getByTestId('btn-continuar').click();
    await completarPaso2Asistente(page);
    await page.getByTestId('btn-crear-cuenta').click();

    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText(MSG_USUARIO);
    await expect(page.getByTestId('mensaje-banner')).toContainText(MSG_REVISAR);
    expect(estadoInvitacion(id)).toBe('PENDIENTE');
  });

  test('cuenta nueva: un 400 del servidor con campos con prefijo cuentaNueva. se marca en los campos del asistente', async ({ page, request }) => {
    const { email, id, codigo } = await invitarConCodigo(request);
    await page.route('**/auth/invitaciones-empleado/aceptar', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          mensaje: 'Datos inválidos',
          data: { 'cuentaNueva.fechaNacimiento': 'La fecha ingresada no es válida', 'cuentaNueva.direccion.calle': 'La calle es obligatoria' },
        }),
      }),
    );

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, email, codigo);
    await completarPaso1Asistente(page, { dni: generarDni(), nombreUsuario: nombreUsuarioUnico('emp'), password: passwordNueva() });
    await page.getByTestId('btn-continuar').click();
    await completarPaso2Asistente(page);
    await page.getByTestId('btn-crear-cuenta').click();

    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-fecha-nacimiento')).toHaveText('La fecha ingresada no es válida');
    await expect(page.getByTestId('mensaje-error-calle')).toHaveText('La calle es obligatoria');
    await expect(page.getByTestId('mensaje-banner')).toContainText(MSG_REVISAR);
    await expect(page.getByTestId('mensaje-invitacion-exito')).toBeHidden();
    expect(estadoInvitacion(id)).toBe('PENDIENTE');
  });

  test('con una sesión previa abierta, el botón final la cierra antes de ir al login', async ({ page, request }) => {
    const previo = await registrarYVerificarCliente(request, localidadId);
    const sesionPrevia: SesionApi = await login(request, previo.nombreUsuario, previo.password);
    const existente = await registrarYVerificarCliente(request, localidadId);
    const { codigo } = await invitarConCodigo(request, existente.email);

    await page.goto('/invitacion-empleado.html');
    await page.evaluate(
      ([token, usuario]) => {
        localStorage.setItem('bajonea_token', token);
        localStorage.setItem('bajonea_usuario', usuario);
      },
      [sesionPrevia.token, JSON.stringify(sesionPrevia.usuario)],
    );
    await continuarConCodigo(page, existente.email, codigo);
    await page.getByTestId('btn-aceptar-invitacion').click();
    await expect(page.getByTestId('mensaje-invitacion-exito')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('bajonea_token'))).not.toBeNull();

    await page.getByTestId('btn-iniciar-sesion-invitacion').click();
    await expect(page).toHaveURL(/login\.html$/);
    expect(await page.evaluate(() => localStorage.getItem('bajonea_token'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('bajonea_usuario'))).toBeNull();
    await expect(page.getByText(AVISO_LOGIN)).toBeVisible();
  });

  test('volver: del paso 2 vuelve al código y del código al login; el asistente conserva el paso interno', async ({ page, request }) => {
    const { email, codigo } = await invitarConCodigo(request);

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, email, codigo);
    await completarPaso1Asistente(page, { dni: generarDni(), nombreUsuario: nombreUsuarioUnico('emp'), password: passwordNueva() });
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-calle')).toBeVisible();

    await page.getByTestId('btn-volver').click();
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await expect(page.getByTestId('input-calle')).toBeHidden();

    await page.getByTestId('btn-volver').click();
    await expect(page.getByTestId('vista-codigo')).toBeVisible();
    await expect(page.getByTestId('titulo-invitacion')).toHaveText('Tengo una invitación');
    await expect(page.getByTestId('input-email-invitacion')).toHaveValue(email);

    await page.getByTestId('btn-volver').click();
    await expect(page).toHaveURL(/login\.html$/);
  });

  test('en 375 px ninguna vista tiene scroll horizontal', async ({ page, request }) => {
    const existente = await registrarYVerificarCliente(request, localidadId);
    const conCuenta = await invitarConCodigo(request, existente.email);
    const sinCuenta = await invitarConCodigo(request);

    await page.goto('/invitacion-empleado.html');
    await sinScrollHorizontal(page);
    await continuarConCodigo(page, existente.email, conCuenta.codigo);
    await expect(page.getByTestId('vista-invitacion-existente')).toBeVisible();
    await sinScrollHorizontal(page);
    await page.getByTestId('btn-aceptar-invitacion').click();
    await expect(page.getByTestId('mensaje-invitacion-exito')).toBeVisible();
    await sinScrollHorizontal(page);

    await page.goto('/invitacion-empleado.html');
    await continuarConCodigo(page, sinCuenta.email, sinCuenta.codigo);
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await sinScrollHorizontal(page);
    await completarPaso1Asistente(page, { dni: generarDni(), nombreUsuario: nombreUsuarioUnico('emp'), password: passwordNueva() });
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-calle')).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
