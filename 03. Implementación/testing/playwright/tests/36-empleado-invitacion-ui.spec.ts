import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  MENSAJE_CODIGO_INVALIDO,
  aceptarInvitacion,
  apiPost,
  clonarComercioTest,
  cuentaNuevaInvitacion,
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
  validarInvitacion,
  vencerInvitacionTest,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';
import { abrirComoUsuarioConComercio, abrirPanel, seleccionarComercioEnPanel } from './helpers/selector';

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

async function capturarEquipo(page: Page, nombre: string, paginaCompleta = false) {
  if (process.env.CAPTURAS) {
    await page.screenshot({ path: `tmp-capturas/e1b3-${process.env.CAPTURAS}-${nombre}.png`, fullPage: paginaCompleta });
  }
}

test.describe('Ver equipo del Dueño (UI), tramo E1 B3', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 375, height: 812 } });

  const MSG_YA_MIEMBRO = 'Esa persona ya es parte de tu equipo';
  const MSG_NO_SE_PUEDE = 'No se puede invitar a este email';
  const MSG_PENDIENTE = 'Ya hay una invitación pendiente para ese email. Podés reenviarla.';
  const IDS_ACCIONES_PERFIL = [
    'btn-foto-perfil-comercio',
    'btn-editar-perfil-comercio',
    'btn-ver-legales',
    'btn-ver-equipo',
    'btn-ir-mercadopago',
    'btn-cambiar-password',
  ];

  let dueno: Dueno;
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, false, horarios);
  });

  async function comercioNuevo(request: APIRequestContext) {
    const nombre = `Equipo UI ${sufijoUnico()}`;
    const id = await clonarComercioTest(request, dueno.comercioId, nombre, 'APROBADO');
    return { id, nombre };
  }

  async function invitar(request: APIRequestContext, comercioId: number, email = emailNuevo()) {
    const respuesta = await invitarEmpleado(request, dueno.token, comercioId, email);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return { email, id: respuesta.body.data.id as number };
  }

  async function aceptarPorApi(request: APIRequestContext, comercioId: number, email = emailNuevo()) {
    await invitar(request, comercioId, email);
    const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
    const respuesta = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: true, cuentaNueva: cuentaNuevaInvitacion(localidadId) });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return email;
  }

  async function abrirPerfil(page: Page, comercioId: number) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: comercioId, ultimoComercioId: comercioId });
    await page.goto('/comercio-perfil.html');
  }

  async function irAEquipo(page: Page) {
    const entrada = page.getByTestId('btn-ver-equipo');
    await expect(entrada).toBeEnabled();
    await entrada.click();
    await expect(page.getByTestId('titulo-equipo')).toBeVisible();
  }

  async function abrirEquipo(page: Page, comercioId: number) {
    await abrirPerfil(page, comercioId);
    await irAEquipo(page);
  }

  const filaInvitacion = (page: Page, email: string) => page.locator('[data-testid^="equipo-invitacion-"]', { hasText: email });
  const filaMiembro = (page: Page, email: string) => page.locator('[data-testid^="equipo-miembro-"]', { hasText: email });

  async function invitarDesdeLaHoja(page: Page, email: string) {
    await page.getByTestId('btn-invitar-equipo').click();
    await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
    await page.getByTestId('input-email-invitar').fill(email);
    await page.getByTestId('btn-enviar-invitacion').click();
  }

  async function abrirMenu(page: Page, email: string) {
    await filaInvitacion(page, email).locator('[data-testid^="btn-menu-invitacion-"]').click();
    await expect(page.getByTestId('menu-invitacion-equipo')).toBeVisible();
  }

  test('la fila "Ver equipo" abre la vista con el título y el comercio activo, y volver regresa al perfil', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    await abrirPerfil(page, comercio.id);

    const entrada = page.getByTestId('btn-ver-equipo');
    await expect(entrada).toBeVisible();
    await expect(entrada).toContainText('Ver equipo');
    await expect(entrada).toBeEnabled();
    await capturarEquipo(page, 'perfil-con-fila', true);
    await entrada.click();

    await expect(page.getByTestId('titulo-equipo')).toHaveText('Equipo');
    await expect(page.getByTestId('equipo-comercio-nombre')).toHaveText(comercio.nombre);
    await expect(page.getByTestId('btn-invitar-equipo')).toHaveText('Invitar');
    await expect(page.getByTestId('btn-volver-perfil-equipo')).toBeVisible();
    await expect(page.getByTestId('nombre-comercio-perfil')).toBeHidden();

    await page.getByTestId('btn-volver-perfil-equipo').click();
    await expect(page.getByTestId('nombre-comercio-perfil')).toBeVisible();
    await expect(page.getByTestId('titulo-equipo')).toBeHidden();
  });

  test('sin equipo se ve "Todavía no tenés equipo" y el botón Invitar sigue disponible', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    await abrirEquipo(page, comercio.id);

    const vacio = page.getByTestId('estado-vacio');
    await expect(vacio).toBeVisible();
    await expect(vacio).toContainText('Todavía no tenés equipo');
    await expect(page.getByTestId('btn-invitar-equipo')).toBeEnabled();
    await expect(page.getByTestId('equipo-cargando')).toHaveCount(0);
    await capturarEquipo(page, 'vacia');
  });

  test('invitar desde la hoja: se cierra, avisa con el mensaje del servidor y la fila queda Pendiente "vence en 7 días"', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    await abrirEquipo(page, comercio.id);
    await expect(page.getByTestId('estado-vacio')).toBeVisible();
    const email = emailNuevo();

    await page.getByTestId('btn-invitar-equipo').click();
    await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
    await expect(page.getByTestId('titulo-invitar-equipo')).toHaveText('Invitar al equipo');
    await expect(page.getByText('Email', { exact: true })).toBeVisible();
    await expect(page.getByTestId('ayuda-invitar-equipo')).toHaveText('Le llega un código que vale 7 días.');
    await page.getByTestId('input-email-invitar').fill(email);
    await page.getByTestId('btn-enviar-invitacion').click();

    await expect(page.getByTestId('hoja-invitar-equipo')).toBeHidden();
    await expect(page.locator('.toast')).toHaveText(`Invitación enviada a ${email}`);
    const fila = filaInvitacion(page, email);
    await expect(fila).toBeVisible();
    await expect(fila.getByTestId('equipo-estado')).toHaveText('Pendiente');
    await expect(fila.getByTestId('equipo-detalle')).toHaveText('vence en 7 días');
    await expect(page.getByTestId('estado-vacio')).toHaveCount(0);
  });

  test('un email con formato inválido muestra el error del servidor bajo el campo y deja la hoja abierta', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const api = await invitarEmpleado(request, dueno.token, comercio.id, 'no-es-un-email');
    expect(api.status).toBe(400);
    const esperado = (api.body.data && api.body.data.email) || api.body.mensaje;
    await abrirEquipo(page, comercio.id);

    await invitarDesdeLaHoja(page, 'no-es-un-email');

    await expect(page.getByTestId('error-email-invitar')).toHaveText(esperado);
    await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
    await expect(page.locator('.toast')).toHaveCount(0);
    await capturarEquipo(page, 'hoja-invitar-error');
    await page.getByTestId('input-email-invitar').fill('otro@bajonea.test');
    await expect(page.getByTestId('error-email-invitar')).toBeHidden();
  });

  test('invitar a un email que no se puede invitar muestra "No se puede invitar a este email" sin cerrar la hoja', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    await abrirEquipo(page, comercio.id);

    await invitarDesdeLaHoja(page, dueno.email);

    await expect(page.getByTestId('error-email-invitar')).toHaveText(MSG_NO_SE_PUEDE);
    await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
    await expect(page.getByTestId('btn-enviar-invitacion')).toBeEnabled();
  });

  test('invitar a quien ya es del equipo muestra el error bajo el campo', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const miembro = await aceptarPorApi(request, comercio.id);
    await abrirEquipo(page, comercio.id);
    await expect(filaMiembro(page, miembro)).toBeVisible();

    await invitarDesdeLaHoja(page, miembro);

    await expect(page.getByTestId('error-email-invitar')).toHaveText(MSG_YA_MIEMBRO);
    await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
  });

  test('invitar a un email con invitación pendiente muestra el error bajo el campo', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const { email } = await invitar(request, comercio.id);
    await abrirEquipo(page, comercio.id);
    await expect(filaInvitacion(page, email)).toBeVisible();

    await invitarDesdeLaHoja(page, email);

    await expect(page.getByTestId('error-email-invitar')).toHaveText(MSG_PENDIENTE);
    await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
  });

  test('con 5 invitaciones en la hora, la sexta muestra el tope con la hora de reintento', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    for (let n = 0; n < 5; n += 1) {
      await invitar(request, comercio.id);
    }
    await abrirEquipo(page, comercio.id);
    await expect(page.locator('[data-testid^="equipo-invitacion-"]')).toHaveCount(5);

    await invitarDesdeLaHoja(page, emailNuevo());

    await expect(page.getByTestId('error-email-invitar')).toHaveText(/^Alcanzaste el máximo de 5 invitaciones por hora\. Probá de nuevo a las \d{2}:\d{2}$/);
    await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
    await expect(page.locator('[data-testid^="equipo-invitacion-"]')).toHaveCount(5);
  });

  test('una invitación vencida se ve "Vencida" y su menú solo permite reenviar', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const { email, id } = await invitar(request, comercio.id);
    await vencerInvitacionTest(request, id);
    await abrirEquipo(page, comercio.id);

    const fila = filaInvitacion(page, email);
    await expect(fila).toBeVisible();
    await expect(fila).toHaveAttribute('data-estado', 'VENCIDA');
    await expect(fila.getByTestId('equipo-estado')).toHaveText('Vencida');
    await expect(fila.getByTestId('equipo-detalle')).toHaveCount(0);
    await abrirMenu(page, email);
    await expect(page.getByTestId('btn-reenviar-invitacion')).toHaveText('Reenviar código');
    await expect(page.getByTestId('btn-cancelar-invitacion')).toHaveCount(0);
  });

  test('una invitación con el código bloqueado se ve "Código bloqueado" y reenviarla la deja Pendiente', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const { email, id } = await invitar(request, comercio.id);
    const codigo = await obtenerCodigoInvitacionTest(request, email, comercio.id);
    for (let n = 0; n < 5; n += 1) {
      expect((await validarInvitacion(request, email, codigoErroneo(codigo))).status).toBe(401);
    }
    expect(estadoInvitacion(id)).toBe('INVALIDADA');
    await abrirEquipo(page, comercio.id);

    const fila = filaInvitacion(page, email);
    await expect(fila.getByTestId('equipo-estado')).toHaveText('Código bloqueado');
    await abrirMenu(page, email);
    await expect(page.getByTestId('btn-cancelar-invitacion')).toHaveCount(0);
    await page.getByTestId('btn-reenviar-invitacion').click();

    await expect(page.locator('.toast')).toHaveText(`Invitación reenviada a ${email}`);
    await expect(filaInvitacion(page, email)).toHaveCount(1);
    await expect(filaInvitacion(page, email).getByTestId('equipo-estado')).toHaveText('Pendiente');
    expect(estadoInvitacion(id)).toBe('REEMPLAZADA');
  });

  test('reenviar actúa directo: toast del servidor, la anterior queda reemplazada y hay un código nuevo', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const { email, id } = await invitar(request, comercio.id);
    await abrirEquipo(page, comercio.id);

    await abrirMenu(page, email);
    await expect(page.getByTestId('btn-reenviar-invitacion')).toHaveText('Reenviar código');
    await expect(page.getByTestId('btn-cancelar-invitacion')).toHaveText('Cancelar invitación');
    await capturarEquipo(page, 'menu-invitacion');
    await page.getByTestId('btn-reenviar-invitacion').click();

    await expect(page.getByTestId('menu-invitacion-equipo')).toBeHidden();
    await expect(page.locator('.toast')).toHaveText(`Invitación reenviada a ${email}`);
    await expect(filaInvitacion(page, email)).toHaveCount(1);
    await expect(filaInvitacion(page, email).getByTestId('equipo-estado')).toHaveText('Pendiente');
    expect(estadoInvitacion(id)).toBe('REEMPLAZADA');
    expect(sql(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercio.id} AND email = '${email}' AND estado = 'PENDIENTE';`)).toBe('1');
    expect(await obtenerCodigoInvitacionTest(request, email, comercio.id)).toMatch(/^\d{6}$/);
  });

  test('cancelar pide confirmación: "Volver" no cancela y confirmar quita la invitación de la lista', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const { email, id } = await invitar(request, comercio.id);
    await abrirEquipo(page, comercio.id);

    await abrirMenu(page, email);
    await page.getByTestId('btn-cancelar-invitacion').click();
    await expect(page.getByTestId('hoja-cancelar-invitacion')).toBeVisible();
    await expect(page.getByTestId('titulo-cancelar-invitacion')).toHaveText(`¿Cancelar la invitación a ${email}?`);
    await expect(page.getByTestId('btn-confirmar-cancelar-invitacion')).toHaveText('Cancelar invitación');
    await capturarEquipo(page, 'hoja-cancelar');
    await page.getByTestId('btn-volver-cancelar-invitacion').click();
    await expect(page.getByTestId('hoja-cancelar-invitacion')).toBeHidden();
    await expect(filaInvitacion(page, email)).toBeVisible();
    expect(estadoInvitacion(id)).toBe('PENDIENTE');

    await abrirMenu(page, email);
    await page.getByTestId('btn-cancelar-invitacion').click();
    await page.getByTestId('btn-confirmar-cancelar-invitacion').click();

    await expect(page.getByTestId('hoja-cancelar-invitacion')).toBeHidden();
    await expect(page.locator('.toast')).toHaveText('Invitación cancelada');
    await expect(filaInvitacion(page, email)).toHaveCount(0);
    await expect(page.getByTestId('estado-vacio')).toBeVisible();
    expect(estadoInvitacion(id)).toBe('CANCELADA');
  });

  test('cuando la persona acepta, la lista pasa a Activo sin recargar a mano y los miembros no tienen menú', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const { email } = await invitar(request, comercio.id);
    await abrirEquipo(page, comercio.id);
    await expect(filaInvitacion(page, email).getByTestId('equipo-estado')).toHaveText('Pendiente');

    const codigo = await obtenerCodigoInvitacionTest(request, email, comercio.id);
    const aceptada = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: true, cuentaNueva: cuentaNuevaInvitacion(localidadId) });
    expect(aceptada.status, JSON.stringify(aceptada.body)).toBe(200);

    const miembro = filaMiembro(page, email);
    await expect(miembro).toBeVisible({ timeout: 40_000 });
    await expect(miembro.getByTestId('equipo-estado')).toHaveText('Activo');
    await expect(miembro.getByTestId('equipo-nombre')).toHaveText('Empleada Invitada');
    await expect(miembro.getByRole('button')).toHaveCount(0);
    await expect(filaInvitacion(page, email)).toHaveCount(0);
  });

  test('la lista muestra cada estado con su puntito y su texto, y solo las invitaciones tienen menú', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const activo = await aceptarPorApi(request, comercio.id);
    const inactivo = await aceptarPorApi(request, comercio.id);
    sql(
      `UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() ` +
        `WHERE comercio_id = ${comercio.id} AND empleado_id = ${usuarioIdPorEmail(inactivo)};`,
    );
    const pendiente = (await invitar(request, comercio.id)).email;
    const vencida = await invitar(request, comercio.id);
    await vencerInvitacionTest(request, vencida.id);
    const bloqueada = await invitar(request, comercio.id);
    const codigo = await obtenerCodigoInvitacionTest(request, bloqueada.email, comercio.id);
    for (let n = 0; n < 5; n += 1) {
      await validarInvitacion(request, bloqueada.email, codigoErroneo(codigo));
    }
    await abrirEquipo(page, comercio.id);

    const punto = (fila: ReturnType<typeof filaMiembro>) => fila.locator('.pedido-estado__dot');
    await expect(filaMiembro(page, activo).getByTestId('equipo-estado')).toHaveText('Activo');
    await expect(punto(filaMiembro(page, activo))).toHaveClass(/pedido-estado__dot--positivo/);
    await expect(filaMiembro(page, inactivo).getByTestId('equipo-estado')).toHaveText('Inactivo');
    await expect(punto(filaMiembro(page, inactivo))).toHaveClass(/pedido-estado__dot--inactivo/);
    await expect(filaInvitacion(page, pendiente).getByTestId('equipo-estado')).toHaveText('Pendiente');
    await expect(punto(filaInvitacion(page, pendiente))).toHaveClass(/pedido-estado__dot--pendiente/);
    await expect(filaInvitacion(page, vencida.email).getByTestId('equipo-estado')).toHaveText('Vencida');
    await expect(punto(filaInvitacion(page, vencida.email))).toHaveClass(/pedido-estado__dot--vencido/);
    await expect(filaInvitacion(page, bloqueada.email).getByTestId('equipo-estado')).toHaveText('Código bloqueado');
    await expect(punto(filaInvitacion(page, bloqueada.email))).toHaveClass(/pedido-estado__dot--rechazado/);

    await expect(page.locator('[data-testid^="equipo-miembro-"]')).toHaveCount(2);
    await expect(page.locator('[data-testid^="equipo-invitacion-"]')).toHaveCount(3);
    await expect(page.locator('[data-testid^="btn-menu-invitacion-"]')).toHaveCount(3);
    await expect(page.locator('[data-testid^="equipo-miembro-"] button')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await capturarEquipo(page, 'con-equipo');
  });

  test('con dos comercios del mismo Dueño, cada uno muestra su propio equipo', async ({ page, request }) => {
    const a = await comercioNuevo(request);
    const b = await comercioNuevo(request);
    const emailA = (await invitar(request, a.id)).email;
    const emailB = (await invitar(request, b.id)).email;
    await abrirEquipo(page, a.id);

    await expect(page.getByTestId('equipo-comercio-nombre')).toHaveText(a.nombre);
    await expect(filaInvitacion(page, emailA)).toBeVisible();
    await expect(filaInvitacion(page, emailB)).toHaveCount(0);

    await abrirPanel(page);
    await seleccionarComercioEnPanel(page, b.id);
    await page.waitForURL('**/comercio-dashboard.html');
    await page.goto('/comercio-perfil.html');
    await irAEquipo(page);

    await expect(page.getByTestId('equipo-comercio-nombre')).toHaveText(b.nombre);
    await expect(filaInvitacion(page, emailB)).toBeVisible();
    await expect(filaInvitacion(page, emailA)).toHaveCount(0);
  });

  test('mientras carga el equipo se ven los skeletons y después la lista', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const { email } = await invitar(request, comercio.id);
    let liberar!: () => void;
    const compuerta = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    await page.route('**/api/v1/comercios/equipo', async (route) => {
      await compuerta;
      await route.continue();
    });
    await abrirEquipo(page, comercio.id);

    await expect(page.getByTestId('equipo-cargando')).toBeVisible();
    await expect(page.locator('.equipo-esqueleto__fila')).toHaveCount(3);
    await expect(page.getByTestId('equipo-lista')).toHaveAttribute('aria-busy', 'true');
    liberar();

    await expect(filaInvitacion(page, email)).toBeVisible();
    await expect(page.getByTestId('equipo-cargando')).toHaveCount(0);
  });

  test('si la carga del equipo falla se ve el aviso de error y "Reintentar" vuelve a pedirlo', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const { email } = await invitar(request, comercio.id);
    let fallos = 0;
    await page.route('**/api/v1/comercios/equipo', async (route) => {
      if (fallos === 0) {
        fallos += 1;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Error interno', data: null }) });
        return;
      }
      await route.continue();
    });
    await abrirEquipo(page, comercio.id);

    await expect(page.getByTestId('equipo-error')).toContainText('No pudimos cargar el equipo.');
    await expect(page).toHaveURL(/comercio-perfil\.html$/);
    await page.getByTestId('btn-reintentar-equipo').click();

    await expect(filaInvitacion(page, email)).toBeVisible();
    await expect(page.getByTestId('equipo-error')).toHaveCount(0);
  });

  test('carrera del perfil: con el perfil demorado los botones nacen deshabilitados y recién después responden', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    let liberar!: () => void;
    const compuerta = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    await page.route('**/api/v1/comercios/perfil', async (route) => {
      await compuerta;
      await route.continue();
    });
    await abrirPerfil(page, comercio.id);

    for (const id of IDS_ACCIONES_PERFIL) {
      await expect(page.getByTestId(id)).toBeDisabled();
    }
    await page.getByTestId('btn-cerrar-sesion').click();
    await expect(page.getByTestId('modal-confirmar-logout')).toBeVisible();
    await page.getByTestId('btn-cancelar-logout').click();
    liberar();

    for (const id of IDS_ACCIONES_PERFIL) {
      await expect(page.getByTestId(id)).toBeEnabled();
    }
    await page.getByTestId('btn-editar-perfil-comercio').click();
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await page.getByTestId('btn-volver-perfil').click();
    await page.getByTestId('btn-ver-equipo').click();
    await expect(page.getByTestId('titulo-equipo')).toBeVisible();
  });

  test('si el perfil no carga, los botones del perfil quedan deshabilitados', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    await page.route('**/api/v1/comercios/perfil', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ mensaje: 'No encontrado', data: null }) });
    });
    await abrirPerfil(page, comercio.id);

    await expect(page.getByTestId('btn-ver-equipo')).toBeVisible();
    await page.waitForLoadState('networkidle');
    for (const id of IDS_ACCIONES_PERFIL) {
      await expect(page.getByTestId(id)).toBeDisabled();
    }
  });

  test('en 375 px la vista del equipo no tiene scroll horizontal, ni con emails largos', async ({ page, request }) => {
    const comercio = await comercioNuevo(request);
    const largo = `inv.ui.${sufijoUnico()}.${'x'.repeat(40)}@bajonea.test`;
    await invitar(request, comercio.id, largo);
    const miembro = await aceptarPorApi(request, comercio.id, `inv.ui.${sufijoUnico()}.${'y'.repeat(40)}@bajonea.test`);
    await abrirEquipo(page, comercio.id);
    await expect(filaInvitacion(page, largo)).toBeVisible();
    await expect(filaMiembro(page, miembro)).toBeVisible();
    await sinScrollHorizontal(page);

    const dentroDeLaPantalla = async (testid: string) => {
      const caja = await page.getByTestId(testid).boundingBox();
      expect(caja).not.toBeNull();
      expect(caja!.x).toBeGreaterThanOrEqual(0);
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(375);
    };
    await abrirMenu(page, largo);
    await dentroDeLaPantalla('menu-invitacion-equipo');
    await page.getByTestId('btn-cancelar-invitacion').click();
    await expect(page.getByTestId('hoja-cancelar-invitacion')).toBeVisible();
    await dentroDeLaPantalla('titulo-cancelar-invitacion');
    await sinScrollHorizontal(page);
    await page.getByTestId('btn-volver-cancelar-invitacion').click();

    await page.getByTestId('btn-invitar-equipo').click();
    await expect(page.getByTestId('hoja-invitar-equipo')).toBeVisible();
    await sinScrollHorizontal(page);
  });
});
