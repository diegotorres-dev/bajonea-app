import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  ADMIN_EMAIL,
  MENSAJE_CODIGO_INVALIDO,
  aceptarInvitacion,
  apiConHeaders,
  apiPost,
  cancelarInvitacion,
  cantidadEmailsRegularizacionTest,
  clonarComercioTest,
  cuentaNuevaInvitacion,
  diaDeHoy,
  equipoComercio,
  fijarPasswordAdminYLoguear,
  generarCuit,
  generarDni,
  invitarEmpleado,
  login,
  nombreUsuarioUnico,
  obtenerCodigoInvitacionTest,
  obtenerLocalidadRioGrande,
  registrarCliente,
  registrarYVerificarCliente,
  reenviarInvitacion,
  sqlTest as sql,
  sufijoUnico,
  validarInvitacion,
  vencerInvitacionTest,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const MSG_GENERICO = 'No se puede invitar a este email';
const MSG_NO_OPERATIVO = 'Este comercio no puede invitar empleados en este momento';
const MSG_YA_MIEMBRO = 'Esa persona ya es parte de tu equipo';
const MSG_PENDIENTE = 'Ya hay una invitación pendiente para ese email. Podés reenviarla.';
const MSG_NO_REENVIABLE = 'Esta invitación ya no se puede reenviar';
const MSG_NO_CANCELABLE = 'Esta invitación ya no se puede cancelar';
const MSG_NO_DISPONIBLE = 'Esta invitación ya no está disponible';
const MSG_TERMINOS = 'Tenés que aceptar los Términos y Condiciones';
const MSG_DNI = 'Ya existe una cuenta registrada con ese DNI';
const MSG_USUARIO = 'Ese nombre de usuario ya está en uso';
const MSG_BLOQUEADA = 'Cuenta bloqueada. Recuperá tu contraseña para desbloquearla';
const MSG_INACTIVA = 'Cuenta inactiva. Solicitá la reactivación de tu cuenta';

const emailNuevo = (): string => `inv.${sufijoUnico()}@bajonea.test`;

const estadoInvitacion = (id: number): string => sql(`SELECT estado FROM invitacion_empleado WHERE id = ${id};`);
const intentosInvitacion = (id: number): number => Number(sql(`SELECT intentos_fallidos FROM invitacion_empleado WHERE id = ${id};`));
const cantidadFilas = (consulta: string): number => Number(sql(consulta));
const usuarioIdPorEmail = (email: string): number => Number(sql(`SELECT id FROM usuario WHERE email = '${email}';`));
const motivosHistorial = (comercioId: number): string[] => {
  const salida = sql(`SELECT motivo FROM historial_empleado_comercio WHERE comercio_id = ${comercioId} ORDER BY id;`);
  return salida === '' ? [] : salida.split(/\r?\n/);
};

test.describe('Invitaciones de empleado (API), tramo E1', () => {
  test.describe.configure({ timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;
  let otroDueno: Dueno;
  let cliente: SesionApi;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, false, horarios);
    otroDueno = await prepararAprobado(request, adminToken, localidadId, false, horarios);
    const registrado = await registrarYVerificarCliente(request, localidadId);
    cliente = await login(request, registrado.nombreUsuario, registrado.password);
  });

  const comercioNuevo = (request: APIRequestContext, estado = 'APROBADO'): Promise<number> =>
    clonarComercioTest(request, dueno.comercioId, `Equipo E1 ${sufijoUnico()}`, estado);

  async function invitar(request: APIRequestContext, comercioId: number, email = emailNuevo()) {
    const respuesta = await invitarEmpleado(request, dueno.token, comercioId, email);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return { email, id: respuesta.body.data.id as number };
  }

  async function cuentaVerificada(request: APIRequestContext) {
    return registrarYVerificarCliente(request, localidadId);
  }

  async function aceptarConCuentaNueva(request: APIRequestContext, email: string, comercioId: number, cuenta = cuentaNuevaInvitacion(localidadId)) {
    const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
    const respuesta = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: true, cuentaNueva: cuenta });
    return { respuesta, codigo, cuenta };
  }

  async function bloquearCuenta(request: APIRequestContext, nombreUsuario: string) {
    for (let intento = 1; intento <= 3; intento += 1) {
      const fallido = await apiPost(request, '/auth/login', { nombreUsuario, password: `Mala${sufijoUnico()}` });
      expect(fallido.status, `intento ${intento}`).toBe(401);
    }
  }

  test.describe('Invitar', () => {
    test('invita a un email nuevo: 201, estado PENDIENTE, email normalizado, sin exponer el código y con el historial', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const email = emailNuevo();

      const respuesta = await invitarEmpleado(request, dueno.token, comercioId, `  ${email.toUpperCase()} `);

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.mensaje).toBe(`Invitación enviada a ${email}`);
      expect(respuesta.body.data.email).toBe(email);
      expect(respuesta.body.data.estado).toBe('PENDIENTE');
      expect(JSON.stringify(respuesta.body)).not.toContain('codigo');
      const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
      expect(codigo).toMatch(/^\d{6}$/);
      expect(estadoInvitacion(respuesta.body.data.id)).toBe('PENDIENTE');
      expect(motivosHistorial(comercioId)).toEqual(['INVITACION']);
    });

    test('un email mal formado o vacío da 400', async ({ request }) => {
      const comercioId = await comercioNuevo(request);

      const malFormado = await invitarEmpleado(request, dueno.token, comercioId, 'esto-no-es-un-email');
      const vacio = await invitarEmpleado(request, dueno.token, comercioId, '');

      expect(malFormado.status).toBe(400);
      expect(vacio.status).toBe(400);
      expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId};`)).toBe(0);
    });

    test('sin header 400 y no numérico 400; comercio ajeno o inexistente dan el mismo 404; sin token 401', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const cuerpo = { email: emailNuevo() };

      const sinHeader = await apiConHeaders(request, 'POST', '/comercios/equipo/invitaciones', dueno.token, {}, cuerpo);
      const noNumerico = await apiConHeaders(request, 'POST', '/comercios/equipo/invitaciones', dueno.token, { 'X-Comercio-Id': 'abc' }, cuerpo);
      const ajeno = await invitarEmpleado(request, otroDueno.token, comercioId, cuerpo.email);
      const inexistente = await invitarEmpleado(request, dueno.token, 99_999_999, cuerpo.email);
      const sinToken = await apiConHeaders(request, 'GET', '/comercios/equipo', undefined, { 'X-Comercio-Id': String(comercioId) });

      expect(sinHeader.status).toBe(400);
      expect(noNumerico.status).toBe(400);
      expect(ajeno.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(ajeno.body).toEqual(inexistente.body);
      expect(sinToken.status).toBe(401);
      expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId};`)).toBe(0);
    });

    test('un Cliente recibe 403 en las cuatro rutas del equipo', async ({ request }) => {
      const comercioId = await comercioNuevo(request);

      const ver = await equipoComercio(request, cliente.token, comercioId);
      const invitar = await invitarEmpleado(request, cliente.token, comercioId, emailNuevo());
      const reenviar = await reenviarInvitacion(request, cliente.token, comercioId, 1);
      const cancelar = await cancelarInvitacion(request, cliente.token, comercioId, 1);

      expect([ver.status, invitar.status, reenviar.status, cancelar.status]).toEqual([403, 403, 403, 403]);
    });

    test('el email de un Dueño y el de un Administrador dan el mismo 409 genérico y no mandan ningún email', async ({ request }) => {
      const comercioId = await comercioNuevo(request);

      const aDueno = await invitarEmpleado(request, dueno.token, comercioId, otroDueno.email);
      const aAdmin = await invitarEmpleado(request, dueno.token, comercioId, ADMIN_EMAIL);

      expect(aDueno.status).toBe(409);
      expect(aAdmin.status).toBe(409);
      expect(aDueno.body.mensaje).toBe(MSG_GENERICO);
      expect(aAdmin.body).toEqual(aDueno.body);
      expect(await cantidadEmailsRegularizacionTest(request, otroDueno.email)).toBe(0);
      expect(await cantidadEmailsRegularizacionTest(request, ADMIN_EMAIL)).toBe(0);
      expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId};`)).toBe(0);
    });

    test('una cuenta bloqueada da el 409 genérico con una fila de regularización y el tope de 3 por día', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const destinatario = await cuentaVerificada(request);
      await bloquearCuenta(request, destinatario.nombreUsuario);
      expect(sql(`SELECT estado FROM usuario WHERE email = '${destinatario.email}';`)).toBe('BLOQUEADO');

      const primera = await invitarEmpleado(request, dueno.token, comercioId, destinatario.email);

      expect(primera.status).toBe(409);
      expect(primera.body.mensaje).toBe(MSG_GENERICO);
      expect(await cantidadEmailsRegularizacionTest(request, destinatario.email)).toBe(1);
      for (let intento = 2; intento <= 5; intento += 1) {
        const repetida = await invitarEmpleado(request, dueno.token, comercioId, destinatario.email);
        expect(repetida.status).toBe(409);
        expect(repetida.body.mensaje).toBe(MSG_GENERICO);
      }
      expect(await cantidadEmailsRegularizacionTest(request, destinatario.email)).toBe(3);
      expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId};`)).toBe(0);
    });

    for (const estado of ['INACTIVO', 'SUSPENDIDO']) {
      test(`una cuenta ${estado} da el 409 genérico y suma una fila de regularización`, async ({ request }) => {
        const comercioId = await comercioNuevo(request);
        const destinatario = await cuentaVerificada(request);
        sql(`UPDATE usuario SET estado = '${estado}' WHERE email = '${destinatario.email}';`);

        const respuesta = await invitarEmpleado(request, dueno.token, comercioId, destinatario.email);

        expect(respuesta.status).toBe(409);
        expect(respuesta.body.mensaje).toBe(MSG_GENERICO);
        expect(await cantidadEmailsRegularizacionTest(request, destinatario.email)).toBe(1);
        expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId};`)).toBe(0);
      });
    }

    test('una cuenta sin verificar da el 409 genérico y suma una fila de regularización', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const destinatario = await registrarCliente(request, localidadId);

      const respuesta = await invitarEmpleado(request, dueno.token, comercioId, destinatario.email);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MSG_GENERICO);
      expect(await cantidadEmailsRegularizacionTest(request, destinatario.email)).toBe(1);
    });

    test('con una invitación vigente del mismo email: 409 "Ya hay una invitación pendiente"', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email } = await invitar(request, comercioId);

      const repetida = await invitarEmpleado(request, dueno.token, comercioId, email);

      expect(repetida.status).toBe(409);
      expect(repetida.body.mensaje).toBe(MSG_PENDIENTE);
      expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId} AND email = '${email}';`)).toBe(1);
    });

    test('quien ya es parte activa del equipo recibe 409 "Esa persona ya es parte de tu equipo"', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const existente = await cuentaVerificada(request);
      await invitar(request, comercioId, existente.email);
      const codigo = await obtenerCodigoInvitacionTest(request, existente.email, comercioId);
      expect((await aceptarInvitacion(request, { email: existente.email, codigo })).status).toBe(200);

      const otraVez = await invitarEmpleado(request, dueno.token, comercioId, existente.email);

      expect(otraVez.status).toBe(409);
      expect(otraVez.body.mensaje).toBe(MSG_YA_MIEMBRO);
    });

    test('un comercio que no está APROBADO ni APTO_VENTA no puede invitar', async ({ request }) => {
      for (const estado of ['PENDIENTE', 'SUSPENDIDO', 'CERRADO_TEMPORALMENTE']) {
        const comercioId = await comercioNuevo(request, estado);

        const respuesta = await invitarEmpleado(request, dueno.token, comercioId, emailNuevo());

        expect(respuesta.status, estado).toBe(409);
        expect(respuesta.body.mensaje, estado).toBe(MSG_NO_OPERATIVO);
        expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId};`), estado).toBe(0);
      }
    });

    test('tope de 5 invitaciones por hora por comercio: la sexta da 409 con la hora, y otro comercio del Dueño no lo comparte', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const otroComercioId = await comercioNuevo(request);
      for (let n = 1; n <= 5; n += 1) {
        await invitar(request, comercioId);
      }

      const sexta = await invitarEmpleado(request, dueno.token, comercioId, emailNuevo());

      expect(sexta.status).toBe(409);
      expect(sexta.body.mensaje).toMatch(/^Alcanzaste el máximo de 5 invitaciones por hora\. Probá de nuevo a las \d{2}:\d{2}$/);
      expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId};`)).toBe(5);
      const enOtroComercio = await invitarEmpleado(request, dueno.token, otroComercioId, emailNuevo());
      expect(enOtroComercio.status).toBe(201);
    });
  });

  test.describe('Reenviar y cancelar', () => {
    test('reenviar crea una fila nueva con otro código, deja la anterior REEMPLAZADA e invalida el código viejo', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email, id } = await invitar(request, comercioId);
      const codigoViejo = await obtenerCodigoInvitacionTest(request, email, comercioId);

      const reenvio = await reenviarInvitacion(request, dueno.token, comercioId, id);

      expect(reenvio.status).toBe(200);
      expect(reenvio.body.mensaje).toBe(`Invitación reenviada a ${email}`);
      expect(reenvio.body.data.id).not.toBe(id);
      expect(reenvio.body.data.estado).toBe('PENDIENTE');
      expect(estadoInvitacion(id)).toBe('REEMPLAZADA');
      expect(estadoInvitacion(reenvio.body.data.id)).toBe('PENDIENTE');
      expect(cantidadFilas(`SELECT COUNT(*) FROM invitacion_empleado WHERE comercio_id = ${comercioId} AND email = '${email}' AND estado = 'PENDIENTE';`)).toBe(1);
      const codigoNuevo = await obtenerCodigoInvitacionTest(request, email, comercioId);
      if (codigoNuevo !== codigoViejo) {
        const viejo = await validarInvitacion(request, email, codigoViejo);
        expect(viejo.status).toBe(401);
      }
      const nuevo = await validarInvitacion(request, email, codigoNuevo);
      expect(nuevo.status).toBe(200);
    });

    test('reenviar una aceptada, cancelada o reemplazada da 409; una invitación de otro comercio da 404', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const cancelada = await invitar(request, comercioId);
      expect((await cancelarInvitacion(request, dueno.token, comercioId, cancelada.id)).status).toBe(200);
      const aceptada = await invitar(request, comercioId);
      expect((await aceptarConCuentaNueva(request, aceptada.email, comercioId)).respuesta.status).toBe(200);
      const reemplazada = await invitar(request, comercioId);
      expect((await reenviarInvitacion(request, dueno.token, comercioId, reemplazada.id)).status).toBe(200);

      for (const id of [cancelada.id, aceptada.id, reemplazada.id]) {
        const respuesta = await reenviarInvitacion(request, dueno.token, comercioId, id);
        expect(respuesta.status, `invitación ${id}`).toBe(409);
        expect(respuesta.body.mensaje).toBe(MSG_NO_REENVIABLE);
      }
      const vigente = await invitar(request, comercioId);
      const ajena = await reenviarInvitacion(request, otroDueno.token, otroDueno.comercioId, vigente.id);
      expect(ajena.status).toBe(404);
    });

    test('cancelar deja la invitación CANCELADA con su historial, invalida el código y permite invitar de nuevo; repetirlo da 409', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email, id } = await invitar(request, comercioId);
      const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);

      const cancelada = await cancelarInvitacion(request, dueno.token, comercioId, id);

      expect(cancelada.status).toBe(200);
      expect(cancelada.body.mensaje).toBe('Invitación cancelada');
      expect(estadoInvitacion(id)).toBe('CANCELADA');
      expect(motivosHistorial(comercioId)).toEqual(['INVITACION', 'INVITACION_CANCELADA']);
      expect((await validarInvitacion(request, email, codigo)).status).toBe(401);
      const repetida = await cancelarInvitacion(request, dueno.token, comercioId, id);
      expect(repetida.status).toBe(409);
      expect(repetida.body.mensaje).toBe(MSG_NO_CANCELABLE);
      expect((await invitarEmpleado(request, dueno.token, comercioId, email)).status).toBe(201);
    });

    test('cancelar la invitación de otro comercio o inexistente da el mismo 404', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { id } = await invitar(request, comercioId);

      const ajena = await cancelarInvitacion(request, otroDueno.token, otroDueno.comercioId, id);
      const inexistente = await cancelarInvitacion(request, dueno.token, comercioId, 99_999_999);

      expect(ajena.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(ajena.body).toEqual(inexistente.body);
      expect(estadoInvitacion(id)).toBe('PENDIENTE');
    });
  });

  test.describe('Equipo del comercio', () => {
    test('el listado muestra Pendiente, Vencida (atajo de vencer) y Código bloqueado, sin el código ni las canceladas', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const pendiente = await invitar(request, comercioId);
      const vencida = await invitar(request, comercioId);
      const bloqueada = await invitar(request, comercioId);
      const cancelada = await invitar(request, comercioId);
      await cancelarInvitacion(request, dueno.token, comercioId, cancelada.id);
      await vencerInvitacionTest(request, vencida.id);
      for (let n = 1; n <= 5; n += 1) {
        expect((await validarInvitacion(request, bloqueada.email, '000000')).status).toBe(401);
      }

      const equipo = await equipoComercio(request, dueno.token, comercioId);

      expect(equipo.status).toBe(200);
      expect(equipo.body.data.miembros).toEqual([]);
      const porId = new Map<number, string>(equipo.body.data.invitaciones.map((i: any) => [i.id, i.estado]));
      expect(porId.get(pendiente.id)).toBe('PENDIENTE');
      expect(porId.get(vencida.id)).toBe('VENCIDA');
      expect(porId.get(bloqueada.id)).toBe('INVALIDADA');
      expect(porId.has(cancelada.id)).toBe(false);
      expect(estadoInvitacion(vencida.id)).toBe('PENDIENTE');
      expect(JSON.stringify(equipo.body)).not.toContain('codigo');
    });

    test('el miembro aceptado aparece ACTIVO con sus datos y deja de figurar entre las invitaciones', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email, id } = await invitar(request, comercioId);
      const { respuesta } = await aceptarConCuentaNueva(request, email, comercioId);
      expect(respuesta.status).toBe(200);

      const equipo = await equipoComercio(request, dueno.token, comercioId);

      expect(equipo.body.data.miembros).toHaveLength(1);
      const miembro = equipo.body.data.miembros[0];
      expect(miembro.estado).toBe('ACTIVO');
      expect(miembro.email).toBe(email);
      expect(miembro.nombre).toBe('Empleada');
      expect(miembro.apellido).toBe('Invitada');
      expect(miembro.fechaBaja).toBeNull();
      expect(equipo.body.data.invitaciones.map((i: any) => i.id)).not.toContain(id);
    });

    test('el equipo de un comercio no se mezcla con el de otro del mismo Dueño ni con el de otro Dueño', async ({ request }) => {
      const comercioA = await comercioNuevo(request);
      const comercioB = await comercioNuevo(request);
      const compartido = emailNuevo();
      const enA = await invitar(request, comercioA, compartido);
      const enB = await invitar(request, comercioB, compartido);

      const equipoA = await equipoComercio(request, dueno.token, comercioA);
      const equipoB = await equipoComercio(request, dueno.token, comercioB);
      const ajeno = await equipoComercio(request, otroDueno.token, comercioA);

      expect(equipoA.body.data.invitaciones.map((i: any) => i.id)).toEqual([enA.id]);
      expect(equipoB.body.data.invitaciones.map((i: any) => i.id)).toEqual([enB.id]);
      expect(ajeno.status).toBe(404);
      const { respuesta } = await aceptarConCuentaNueva(request, compartido, comercioA);
      expect(respuesta.status).toBe(200);
      expect(estadoInvitacion(enB.id)).toBe('PENDIENTE');
      expect((await equipoComercio(request, dueno.token, comercioB)).body.data.miembros).toEqual([]);
    });
  });

  test.describe('Validar', () => {
    test('con el código correcto informa comercio, foto, si la cuenta existe y el vencimiento', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const sinCuenta = await invitar(request, comercioId);
      const existente = await cuentaVerificada(request);
      await invitar(request, comercioId, existente.email);

      const nueva = await validarInvitacion(request, sinCuenta.email, await obtenerCodigoInvitacionTest(request, sinCuenta.email, comercioId));
      const conCuenta = await validarInvitacion(request, existente.email, await obtenerCodigoInvitacionTest(request, existente.email, comercioId));

      expect(nueva.status).toBe(200);
      expect(nueva.body.data.cuentaExistente).toBe(false);
      expect(nueva.body.data.comercioNombre).toMatch(/^Equipo E1 /);
      expect(nueva.body.data.comercioFotoPerfilUrl).toContain('res.cloudinary.com');
      expect(new Date(nueva.body.data.fechaVencimiento).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
      expect(conCuenta.status).toBe(200);
      expect(conCuenta.body.data.cuentaExistente).toBe(true);
    });

    test('todo fallo de resolución da el mismo 401, sin intentos restantes', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const vigente = await invitar(request, comercioId);
      const codigoVigente = await obtenerCodigoInvitacionTest(request, vigente.email, comercioId);
      const incorrecto = codigoVigente === '123456' ? '654321' : '123456';
      const vencida = await invitar(request, comercioId);
      const codigoVencida = await obtenerCodigoInvitacionTest(request, vencida.email, comercioId);
      await vencerInvitacionTest(request, vencida.id);
      const cancelada = await invitar(request, comercioId);
      const codigoCancelada = await obtenerCodigoInvitacionTest(request, cancelada.email, comercioId);
      await cancelarInvitacion(request, dueno.token, comercioId, cancelada.id);
      const aceptada = await invitar(request, comercioId);
      const { codigo: codigoAceptada } = await aceptarConCuentaNueva(request, aceptada.email, comercioId);

      const casos = [
        await validarInvitacion(request, emailNuevo(), '123456'),
        await validarInvitacion(request, vigente.email, incorrecto),
        await validarInvitacion(request, vencida.email, codigoVencida),
        await validarInvitacion(request, cancelada.email, codigoCancelada),
        await validarInvitacion(request, aceptada.email, codigoAceptada),
      ];

      for (const caso of casos) {
        expect(caso.status).toBe(401);
        expect(caso.body.mensaje).toBe(MENSAJE_CODIGO_INVALIDO);
        expect(caso.body).toEqual(casos[0].body);
      }
      expect(JSON.stringify(casos[0].body)).not.toMatch(/intentos/i);
    });

    test('un código con formato inválido da 400', async ({ request }) => {
      const corto = await validarInvitacion(request, emailNuevo(), '12345');
      const letras = await validarInvitacion(request, emailNuevo(), 'abcdef');
      const emailMalo = await validarInvitacion(request, 'sin-arroba', '123456');

      expect([corto.status, letras.status, emailMalo.status]).toEqual([400, 400, 400]);
    });

    test('cinco códigos incorrectos (validar y aceptar suman igual) invalidan la invitación, y el Dueño la rehabilita reenviando', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email, id } = await invitar(request, comercioId);
      const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
      const incorrecto = codigo === '000000' ? '111111' : '000000';

      for (let n = 1; n <= 2; n += 1) {
        expect((await validarInvitacion(request, email, incorrecto)).status).toBe(401);
      }
      for (let n = 1; n <= 3; n += 1) {
        expect((await aceptarInvitacion(request, { email, codigo: incorrecto })).status).toBe(401);
      }

      expect(intentosInvitacion(id)).toBe(5);
      expect(estadoInvitacion(id)).toBe('INVALIDADA');
      const conElCorrecto = await validarInvitacion(request, email, codigo);
      expect(conElCorrecto.status).toBe(401);
      expect(conElCorrecto.body.mensaje).toBe(MENSAJE_CODIGO_INVALIDO);
      const reenvio = await reenviarInvitacion(request, dueno.token, comercioId, id);
      expect(reenvio.status).toBe(200);
      const nuevo = await obtenerCodigoInvitacionTest(request, email, comercioId);
      expect((await validarInvitacion(request, email, nuevo)).status).toBe(200);
    });
  });

  test.describe('Aceptar con cuenta nueva', () => {
    test('crea usuario ACTIVO, cliente, empleado, relación ACTIVO y dirección en una sola transacción, y el login posterior funciona', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email, id } = await invitar(request, comercioId);
      const cuenta = cuentaNuevaInvitacion(localidadId);

      const { respuesta } = await aceptarConCuentaNueva(request, email, comercioId, cuenta);

      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
      expect(respuesta.body.mensaje).toMatch(/^Ya sos parte del equipo de Equipo E1 /);
      expect(respuesta.body.data.cuentaCreada).toBe(true);
      expect(respuesta.body.data.relacionReactivada).toBe(false);
      const usuarioId = usuarioIdPorEmail(email);
      expect(sql(`SELECT CONCAT(rol, '|', estado) FROM usuario WHERE id = ${usuarioId};`)).toBe('CLIENTE|ACTIVO');
      expect(cantidadFilas(`SELECT COUNT(*) FROM cliente WHERE id = ${usuarioId};`)).toBe(1);
      expect(cantidadFilas(`SELECT COUNT(*) FROM empleado WHERE id = ${usuarioId};`)).toBe(1);
      expect(cantidadFilas(`SELECT COUNT(*) FROM direccion WHERE cliente_id = ${usuarioId} AND principal = 1;`)).toBe(1);
      expect(sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${usuarioId} AND comercio_id = ${comercioId};`)).toBe('ACTIVO');
      expect(sql(`SELECT CONCAT(estado, '|', usuario_aceptante_id) FROM invitacion_empleado WHERE id = ${id};`)).toBe(`ACEPTADA|${usuarioId}`);
      expect(motivosHistorial(comercioId)).toEqual(['INVITACION', 'ACEPTACION']);
      const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
      expect(sesion.usuario.rol).toBe('CLIENTE');
    });

    test('la segunda aceptación del mismo código da 401 y no duplica nada', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email } = await invitar(request, comercioId);
      const { codigo } = await aceptarConCuentaNueva(request, email, comercioId);

      const segunda = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: true, cuentaNueva: cuentaNuevaInvitacion(localidadId) });

      expect(segunda.status).toBe(401);
      expect(segunda.body.mensaje).toBe(MENSAJE_CODIGO_INVALIDO);
      expect(cantidadFilas(`SELECT COUNT(*) FROM usuario WHERE email = '${email}';`)).toBe(1);
      expect(cantidadFilas(`SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ${comercioId};`)).toBe(1);
    });

    test('sin aceptaTerminos, con false o sin cuentaNueva da 400 con el error por campo y no gasta intentos ni crea nada', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email, id } = await invitar(request, comercioId);
      const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
      const cuenta = cuentaNuevaInvitacion(localidadId);

      const sinTerminos = await aceptarInvitacion(request, { email, codigo, cuentaNueva: cuenta });
      const conFalse = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: false, cuentaNueva: cuenta });
      const sinCuenta = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: true });

      expect(sinTerminos.status).toBe(400);
      expect(sinTerminos.body.data.aceptaTerminos).toBe(MSG_TERMINOS);
      expect(conFalse.status).toBe(400);
      expect(conFalse.body.data.aceptaTerminos).toBe(MSG_TERMINOS);
      expect(sinCuenta.status).toBe(400);
      expect(sinCuenta.body.data.cuentaNueva).toBeTruthy();
      expect(intentosInvitacion(id)).toBe(0);
      expect(estadoInvitacion(id)).toBe('PENDIENTE');
      expect(cantidadFilas(`SELECT COUNT(*) FROM usuario WHERE email = '${email}';`)).toBe(0);
      const bien = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: true, cuentaNueva: cuenta });
      expect(bien.status).toBe(200);
    });

    test('datos de cuenta con formato inválido dan 400 con el mapa por campo', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email } = await invitar(request, comercioId);
      const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
      const cuenta = { ...cuentaNuevaInvitacion(localidadId), dni: '12', password: 'corta' };

      const respuesta = await aceptarInvitacion(request, { email, codigo, aceptaTerminos: true, cuentaNueva: cuenta });

      expect(respuesta.status).toBe(400);
      expect(Object.keys(respuesta.body.data)).toEqual(expect.arrayContaining(['cuentaNueva.dni', 'cuentaNueva.password']));
      expect(cantidadFilas(`SELECT COUNT(*) FROM usuario WHERE email = '${email}';`)).toBe(0);
    });

    test('DNI y nombre de usuario ya registrados dan los mismos 409 del registro y la invitación sigue PENDIENTE', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email, id } = await invitar(request, comercioId);
      const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
      const otra = await cuentaVerificada(request);
      const dniExistente = sql(`SELECT pf.dni FROM persona_fisica pf JOIN usuario u ON u.id = pf.id WHERE u.email = '${otra.email}';`);

      const porDni = await aceptarInvitacion(request, {
        email,
        codigo,
        aceptaTerminos: true,
        cuentaNueva: cuentaNuevaInvitacion(localidadId, { dni: dniExistente }),
      });
      const porUsuario = await aceptarInvitacion(request, {
        email,
        codigo,
        aceptaTerminos: true,
        cuentaNueva: cuentaNuevaInvitacion(localidadId, { nombreUsuario: otra.nombreUsuario }),
      });

      expect(porDni.status).toBe(409);
      expect(porDni.body.mensaje).toBe(MSG_DNI);
      expect(porUsuario.status).toBe(409);
      expect(porUsuario.body.mensaje).toBe(MSG_USUARIO);
      expect(estadoInvitacion(id)).toBe('PENDIENTE');
      expect(cantidadFilas(`SELECT COUNT(*) FROM usuario WHERE email = '${email}';`)).toBe(0);
      expect(cantidadFilas(`SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ${comercioId};`)).toBe(0);
    });

    test('el Dueño recibe el aviso de la aceptación, visible solo bajo ese comercio', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const otroComercioId = await comercioNuevo(request);
      const { email } = await invitar(request, comercioId);
      await aceptarConCuentaNueva(request, email, comercioId);

      const bajoElComercio = await apiConHeaders(request, 'GET', '/notificaciones', dueno.token, { 'X-Comercio-Id': String(comercioId) });
      const bajoElOtro = await apiConHeaders(request, 'GET', '/notificaciones', dueno.token, { 'X-Comercio-Id': String(otroComercioId) });

      expect(bajoElComercio.status).toBe(200);
      const aviso = (bajoElComercio.body.data as any[]).find((n) => n.mensaje.includes('aceptó tu invitación'));
      expect(aviso).toBeTruthy();
      expect(aviso.mensaje).toMatch(/^Empleada Invitada aceptó tu invitación y ya es parte del equipo de Equipo E1 /);
      expect((bajoElOtro.body.data as any[]).some((n) => n.mensaje.includes('aceptó tu invitación'))).toBe(false);
    });
  });

  test.describe('Aceptar con cuenta existente', () => {
    test('alcanza email y código: no modifica la cuenta, ignora cualquier cuentaNueva y no pide términos', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const existente = await cuentaVerificada(request);
      await invitar(request, comercioId, existente.email);
      const codigo = await obtenerCodigoInvitacionTest(request, existente.email, comercioId);
      const usuarioId = usuarioIdPorEmail(existente.email);
      const antes = sql(`SELECT CONCAT(pf.nombre, '|', pf.apellido, '|', pf.dni, '|', u.nombre_usuario) FROM persona_fisica pf JOIN usuario u ON u.id = pf.id WHERE u.id = ${usuarioId};`);

      const respuesta = await aceptarInvitacion(request, {
        email: existente.email,
        codigo,
        cuentaNueva: cuentaNuevaInvitacion(localidadId, { dni: generarDni() }),
      });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.cuentaCreada).toBe(false);
      expect(respuesta.body.data.relacionReactivada).toBe(false);
      expect(sql(`SELECT CONCAT(pf.nombre, '|', pf.apellido, '|', pf.dni, '|', u.nombre_usuario) FROM persona_fisica pf JOIN usuario u ON u.id = pf.id WHERE u.id = ${usuarioId};`)).toBe(antes);
      expect(cantidadFilas(`SELECT COUNT(*) FROM empleado WHERE id = ${usuarioId};`)).toBe(1);
      expect(sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${usuarioId} AND comercio_id = ${comercioId};`)).toBe('ACTIVO');
      const sesion = await login(request, existente.nombreUsuario, existente.password);
      expect(sesion.usuario.rol).toBe('CLIENTE');
    });

    test('revalida la cuenta al aceptar: si el invitado quedó bloqueado, validar y aceptar dan 409 con el motivo', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const existente = await cuentaVerificada(request);
      const { id } = await invitar(request, comercioId, existente.email);
      const codigo = await obtenerCodigoInvitacionTest(request, existente.email, comercioId);
      await bloquearCuenta(request, existente.nombreUsuario);

      const validar = await validarInvitacion(request, existente.email, codigo);
      const aceptar = await aceptarInvitacion(request, { email: existente.email, codigo });

      expect(validar.status).toBe(409);
      expect(validar.body.mensaje).toBe(MSG_BLOQUEADA);
      expect(aceptar.status).toBe(409);
      expect(aceptar.body.mensaje).toBe(MSG_BLOQUEADA);
      expect(estadoInvitacion(id)).toBe('PENDIENTE');
      expect(cantidadFilas(`SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ${comercioId};`)).toBe(0);
      const incorrecto = await validarInvitacion(request, existente.email, codigo === '000000' ? '111111' : '000000');
      expect(incorrecto.status).toBe(401);
      expect(incorrecto.body.mensaje).toBe(MENSAJE_CODIGO_INVALIDO);
    });

    test('una cuenta que pasó a INACTIVA tampoco puede aceptar', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const existente = await cuentaVerificada(request);
      await invitar(request, comercioId, existente.email);
      const codigo = await obtenerCodigoInvitacionTest(request, existente.email, comercioId);
      sql(`UPDATE usuario SET estado = 'INACTIVO' WHERE email = '${existente.email}';`);

      const aceptar = await aceptarInvitacion(request, { email: existente.email, codigo });

      expect(aceptar.status).toBe(409);
      expect(aceptar.body.mensaje).toBe(MSG_INACTIVA);
    });

    test('reactiva la relación INACTIVA conservando fecha_alta, con las filas ACEPTACION y REACTIVACION', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const existente = await cuentaVerificada(request);
      await invitar(request, comercioId, existente.email);
      const primera = await aceptarInvitacion(request, {
        email: existente.email,
        codigo: await obtenerCodigoInvitacionTest(request, existente.email, comercioId),
      });
      expect(primera.status).toBe(200);
      const usuarioId = usuarioIdPorEmail(existente.email);
      sql(`UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ${usuarioId} AND comercio_id = ${comercioId};`);
      const fechaAlta = sql(`SELECT fecha_alta FROM empleado_comercio WHERE empleado_id = ${usuarioId} AND comercio_id = ${comercioId};`);
      await invitar(request, comercioId, existente.email);

      const segunda = await aceptarInvitacion(request, {
        email: existente.email,
        codigo: await obtenerCodigoInvitacionTest(request, existente.email, comercioId),
      });

      expect(segunda.status).toBe(200);
      expect(segunda.body.data.relacionReactivada).toBe(true);
      expect(sql(`SELECT CONCAT(estado, '|', IF(fecha_baja IS NULL, 'sin-baja', 'con-baja')) FROM empleado_comercio WHERE empleado_id = ${usuarioId} AND comercio_id = ${comercioId};`)).toBe('ACTIVO|sin-baja');
      expect(sql(`SELECT fecha_alta FROM empleado_comercio WHERE empleado_id = ${usuarioId} AND comercio_id = ${comercioId};`)).toBe(fechaAlta);
      expect(cantidadFilas(`SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ${usuarioId} AND comercio_id = ${comercioId};`)).toBe(1);
      expect(motivosHistorial(comercioId)).toEqual(['INVITACION', 'ACEPTACION', 'INVITACION', 'ACEPTACION', 'REACTIVACION']);
    });
  });

  test.describe('Estado del comercio al validar y aceptar', () => {
    test('un comercio SUSPENDIDO o CERRADO_TEMPORALMENTE permite validar y aceptar', async ({ request }) => {
      for (const estado of ['SUSPENDIDO', 'CERRADO_TEMPORALMENTE']) {
        const comercioId = await comercioNuevo(request);
        const { email } = await invitar(request, comercioId);
        sql(`UPDATE comercio SET estado = '${estado}' WHERE id = ${comercioId};`);
        const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);

        const validar = await validarInvitacion(request, email, codigo);
        const { respuesta } = await aceptarConCuentaNueva(request, email, comercioId);

        expect(validar.status, estado).toBe(200);
        expect(respuesta.status, estado).toBe(200);
        expect(sql(`SELECT estado FROM empleado_comercio WHERE comercio_id = ${comercioId};`), estado).toBe('ACTIVO');
      }
    });

    test('un comercio INACTIVO da 409 al validar y al aceptar, y la cuenta nueva no se crea', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email, id } = await invitar(request, comercioId);
      const codigo = await obtenerCodigoInvitacionTest(request, email, comercioId);
      sql(`UPDATE comercio SET estado = 'INACTIVO' WHERE id = ${comercioId};`);

      const validar = await validarInvitacion(request, email, codigo);
      const { respuesta } = await aceptarConCuentaNueva(request, email, comercioId);

      expect(validar.status).toBe(409);
      expect(validar.body.mensaje).toBe(MSG_NO_DISPONIBLE);
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MSG_NO_DISPONIBLE);
      expect(estadoInvitacion(id)).toBe('PENDIENTE');
      expect(cantidadFilas(`SELECT COUNT(*) FROM usuario WHERE email = '${email}';`)).toBe(0);
      expect(cantidadFilas(`SELECT COUNT(*) FROM empleado_comercio WHERE comercio_id = ${comercioId};`)).toBe(0);
    });
  });

  test.describe('Matriz de roles', () => {
    test('quien fue Empleado no puede registrar un comercio con su email ni con su DNI', async ({ request }) => {
      const comercioId = await comercioNuevo(request);
      const { email } = await invitar(request, comercioId);
      const cuenta = cuentaNuevaInvitacion(localidadId);
      const { respuesta } = await aceptarConCuentaNueva(request, email, comercioId, cuenta);
      expect(respuesta.status).toBe(200);
      const usuarioId = usuarioIdPorEmail(email);
      sql(`UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ${usuarioId};`);
      const suf = sufijoUnico();
      const payload = (emailDeRegistro: string, dniRepresentante: string) => ({
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/ex-empleado.jpg',
        razonSocial: `Ex Empleado SRL ${suf}`,
        cuit: generarCuit(),
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Av. San Martín 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `Ex Empleado ${suf}`,
        descripcion: 'Intento de registro de un ex Empleado',
        telefono: '+5492964555444',
        emailContacto: emailDeRegistro,
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: true,
        aceptaRetiro: false,
        nombreUsuario: nombreUsuarioUnico('exe'),
        email: emailDeRegistro,
        password: `Pw${suf}Aa1`,
        direccion: { calle: 'Av. San Martín', numero: '100', pisoDepto: null, codigoPostal: '9420', localidadId, principal: true },
        horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
        redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/ex.empleado.${suf}` }],
        nombreRepresentante: 'Ex',
        apellidoRepresentante: 'Empleado',
        dniRepresentante,
        telefonoRepresentante: '+5492964701103',
        fechaNacimientoRepresentante: '1985-03-15',
      });

      const porEmail = await apiPost(request, '/auth/registro/comercio', payload(email, generarDni()));
      const porDni = await apiPost(request, '/auth/registro/comercio', payload(`otro.${suf}@bajonea.test`, cuenta.dni));

      expect(porEmail.status).toBe(409);
      expect(porEmail.body.mensaje).toBe('Ya existe una cuenta registrada con ese email');
      expect(porDni.status).toBe(409);
      expect(porDni.body.mensaje).toBe(MSG_DNI);
    });
  });
});
