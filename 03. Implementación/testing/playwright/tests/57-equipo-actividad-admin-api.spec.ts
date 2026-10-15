import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  apiConHeaders,
  cancelarInvitacion,
  equipoComercio,
  fijarPasswordAdminYLoguear,
  invitarEmpleado,
  login,
  obtenerCodigoInvitacionTest,
  aceptarInvitacion,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado } from './helpers/backend';
import { ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });

interface Miembro {
  cuenta: ClienteRegistrado;
  id: number;
  token: string;
  nombre: string;
}

interface Fila {
  id: string;
  fuente: string;
  fechaHora: string;
  actorUsuarioId: number | null;
  actorNombre: string | null;
  actorRol: string;
  actorRolTexto: string;
  accion: string;
  accionTexto: string;
  entidadTipo: string;
  entidadId: number | null;
  entidadNombre: string | null;
}

test.describe('Rol Empleado, E4 bloque A3 (API): fuente EQUIPO de la Actividad y lectura del Administrador', () => {
  test.describe.configure({ timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;

  const baja = (request: APIRequestContext, miembroId: number, d = dueno) =>
    apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembroId}/desactivar`, d.token, conComercio(d.comercioId));
  const alta = (request: APIRequestContext, miembroId: number, d = dueno) =>
    apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembroId}/reactivar`, d.token, conComercio(d.comercioId));
  const renunciar = (request: APIRequestContext, comercioId: number, token: string) =>
    apiConHeaders(request, 'PUT', `/empleados/comercios/${comercioId}/renunciar`, token, {});
  const actividadDueno = (request: APIRequestContext, d: Dueno, consulta = '') =>
    apiConHeaders(request, 'GET', `/comercios/equipo/actividad${consulta ? `?${consulta}` : ''}`, d.token, conComercio(d.comercioId));
  const actividadAdmin = (request: APIRequestContext, comercioId: number | string, consulta = '', token: string | undefined = adminToken, headers: Record<string, string> = {}) =>
    apiConHeaders(request, 'GET', `/administrador/comercios/${comercioId}/actividad${consulta ? `?${consulta}` : ''}`, token, headers);
  const equipoAdmin = (request: APIRequestContext, comercioId: number | string, token: string | undefined = adminToken, headers: Record<string, string> = {}) =>
    apiConHeaders(request, 'GET', `/administrador/comercios/${comercioId}/equipo`, token, headers);

  const nombreDe = (usuarioId: number): string => sql(`SELECT CONCAT(nombre, ' ', apellido) FROM persona_fisica WHERE id = ${usuarioId};`);
  const envejecerInvitaciones = (d: Dueno): void =>
    sql(`UPDATE invitacion_empleado SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL 2 HOUR) WHERE comercio_id = ${d.comercioId} AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR);`);
  const relacion = (miembroId: number, d = dueno): number =>
    Number(sql(`SELECT id FROM empleado_comercio WHERE empleado_id = ${miembroId} AND comercio_id = ${d.comercioId};`));
  const motivos = (relacionId: number): string[] =>
    sql(`SELECT motivo FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacionId} ORDER BY id;`)
      .split(/\r?\n/)
      .filter(Boolean);

  async function nuevoMiembro(request: APIRequestContext, d = dueno): Promise<Miembro> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    envejecerInvitaciones(d);
    await sumarAlEquipo(request, d.comercioId, cuenta, d.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return { cuenta, id: sesion.usuario.id, token: sesion.token, nombre: nombreDe(sesion.usuario.id) };
  }

  async function todasLasFilas(request: APIRequestContext, d: Dueno, consulta = ''): Promise<Fila[]> {
    const respuesta = await actividadDueno(request, d, `limite=100${consulta ? `&${consulta}` : ''}`);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data.items as Fila[];
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId);
  });

  test('la fuente EQUIPO cuenta el ciclo completo con actor, rol, entidad y texto de cada paso', async ({ request }) => {
    const d = await prepararAprobado(request, adminToken, localidadId);
    const ana = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, d.comercioId, ana, d.token);
    const sesionAna = await login(request, ana.nombreUsuario, ana.password);
    const nombreAna = nombreDe(sesionAna.usuario.id);
    const nombreDueno = nombreDe(d.duenoId);
    expect((await baja(request, sesionAna.usuario.id, d)).status).toBe(200);
    expect((await alta(request, sesionAna.usuario.id, d)).status).toBe(200);
    expect((await renunciar(request, d.comercioId, sesionAna.token)).status).toBe(200);
    const invitacionAjena = await invitarEmpleado(request, d.token, d.comercioId, `cancelada.${sufijoUnico()}@bajonea.test`);
    expect(invitacionAjena.status).toBe(201);
    expect((await cancelarInvitacion(request, d.token, d.comercioId, invitacionAjena.body.data.id)).status).toBe(200);

    const filas = await todasLasFilas(request, d, 'fuente=EQUIPO');
    expect(filas.map((f) => f.accion)).toEqual(['INVITACION_CANCELADA', 'INVITACION', 'RENUNCIA', 'REACTIVACION', 'BAJA_DUENO', 'ACEPTACION', 'INVITACION']);
    expect(filas.every((f) => f.fuente === 'EQUIPO' && f.id.startsWith('EQUIPO-'))).toBe(true);
    const emailAjena = invitacionAjena.body.data.email as string;

    const [cancelo, invitoAjena, renuncia, reactivo, bajaDueno, acepto, invito] = filas;
    expect(cancelo).toMatchObject({ accionTexto: `Canceló la invitación a ${emailAjena}`, actorRol: 'DUENO', actorRolTexto: 'Dueño', actorNombre: nombreDueno, actorUsuarioId: d.duenoId, entidadTipo: 'INVITACION', entidadNombre: emailAjena });
    expect(invitoAjena).toMatchObject({ accionTexto: `Invitó a ${emailAjena}`, actorRol: 'DUENO', entidadTipo: 'INVITACION', entidadNombre: emailAjena });
    expect(renuncia).toMatchObject({ accionTexto: 'Dejó de trabajar en el comercio', actorRol: 'EMPLEADO', actorRolTexto: 'Empleado', actorNombre: nombreAna, actorUsuarioId: sesionAna.usuario.id, entidadTipo: 'EMPLEADO', entidadId: sesionAna.usuario.id, entidadNombre: nombreAna });
    expect(reactivo).toMatchObject({ accionTexto: `Reactivó a ${nombreAna}`, actorRol: 'DUENO', entidadTipo: 'EMPLEADO', entidadId: sesionAna.usuario.id, entidadNombre: nombreAna });
    expect(bajaDueno).toMatchObject({ accionTexto: `Dio de baja a ${nombreAna}`, actorRol: 'DUENO', entidadTipo: 'EMPLEADO', entidadNombre: nombreAna });
    expect(acepto).toMatchObject({ accionTexto: 'Aceptó la invitación', actorRol: 'EMPLEADO', actorNombre: nombreAna, actorUsuarioId: sesionAna.usuario.id, entidadTipo: 'EMPLEADO', entidadNombre: nombreAna });
    expect(invito).toMatchObject({ accionTexto: `Invitó a ${ana.email}`, actorRol: 'DUENO', entidadTipo: 'INVITACION', entidadNombre: ana.email });
    for (let i = 1; i < filas.length; i += 1) {
      expect(filas[i - 1].fechaHora >= filas[i].fechaHora, `orden de ${filas[i - 1].id} y ${filas[i].id}`).toBe(true);
    }
  });

  test('aceptar una invitacion estando inactivo escribe dos filas en la base pero es una sola linea en la Actividad', async ({ request }) => {
    const d = await prepararAprobado(request, adminToken, localidadId);
    const m = await nuevoMiembro(request, d);
    expect((await renunciar(request, d.comercioId, m.token)).status).toBe(200);
    envejecerInvitaciones(d);
    const nueva = await invitarEmpleado(request, d.token, d.comercioId, m.cuenta.email);
    expect(nueva.status).toBe(201);
    const codigo = await obtenerCodigoInvitacionTest(request, m.cuenta.email, d.comercioId);
    expect((await aceptarInvitacion(request, { email: m.cuenta.email, codigo })).status).toBe(200);

    const rel = relacion(m.id, d);
    expect(motivos(rel)).toEqual(['ACEPTACION', 'RENUNCIA', 'ACEPTACION', 'REACTIVACION']);
    const reactivacionDeLaAceptacion = sql(`SELECT CONCAT_WS('|', IFNULL(invitacion_id, 'null'), actor_usuario_id) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${rel} AND motivo = 'REACTIVACION';`);
    expect(reactivacionDeLaAceptacion).toBe(`${nueva.body.data.id}|${m.id}`);

    const filas = await todasLasFilas(request, d, 'fuente=EQUIPO');
    expect(filas.map((f) => f.accion)).toEqual(['ACEPTACION', 'INVITACION', 'RENUNCIA', 'ACEPTACION', 'INVITACION']);
    expect(filas.some((f) => f.accion === 'REACTIVACION')).toBe(false);
    expect(filas[0]).toMatchObject({ accionTexto: 'Aceptó la invitación', actorRol: 'EMPLEADO', entidadNombre: m.nombre });

    const sinFiltro = await todasLasFilas(request, d);
    expect(sinFiltro.filter((f) => f.fuente === 'EQUIPO').map((f) => f.id)).toEqual(filas.map((f) => f.id));
  });

  test('la reactivacion directa del Dueño si figura aunque exista una aceptacion anterior de la misma persona', async ({ request }) => {
    const d = await prepararAprobado(request, adminToken, localidadId);
    const m = await nuevoMiembro(request, d);
    await baja(request, m.id, d);
    await alta(request, m.id, d);
    const filas = await todasLasFilas(request, d, 'fuente=EQUIPO');
    expect(filas.filter((f) => f.accion === 'REACTIVACION').length).toBe(1);
    expect(filas.find((f) => f.accion === 'REACTIVACION')).toMatchObject({ accionTexto: `Reactivó a ${m.nombre}`, actorRol: 'DUENO' });
  });

  test('el filtro y el cursor entregan cada fila una sola vez, con y sin filtro, y sin filtro conviven las cuatro fuentes', async ({ request }) => {
    const d = await prepararAprobado(request, adminToken, localidadId);
    const a = await nuevoMiembro(request, d);
    const b = await nuevoMiembro(request, d);
    await baja(request, a.id, d);
    await alta(request, a.id, d);
    await renunciar(request, d.comercioId, b.token);

    const completas = await todasLasFilas(request, d, 'fuente=EQUIPO');
    expect(completas.length).toBe(7);
    const ids = completas.map((f) => f.id);
    for (const fuente of ['PEDIDO', 'EDICION', 'CIERRE']) {
      const otras = await todasLasFilas(request, d, `fuente=${fuente}`);
      expect(otras.some((f) => f.id.startsWith('EQUIPO-')), fuente).toBe(false);
    }

    for (const limite of [1, 2, 3]) {
      const recorridas: string[] = [];
      let cursor: string | null = null;
      for (let vueltas = 0; vueltas < 20; vueltas += 1) {
        const consulta: string = `fuente=EQUIPO&limite=${limite}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const respuesta: { status: number; body: any } = await actividadDueno(request, d, consulta);
        expect(respuesta.status).toBe(200);
        recorridas.push(...respuesta.body.data.items.map((f: Fila) => f.id));
        cursor = respuesta.body.data.siguienteCursor;
        expect(respuesta.body.data.hayMas).toBe(cursor !== null);
        if (!cursor) {
          break;
        }
      }
      expect(recorridas, `limite ${limite}`).toEqual(ids);
    }

    const sinFiltro = await todasLasFilas(request, d);
    expect(sinFiltro.filter((f) => f.fuente === 'EQUIPO').map((f) => f.id)).toEqual(ids);
  });

  test('el Empleado no ve la actividad, sin sesion es 401 y una fuente invalida es 400 con las cuatro validas', async ({ request }) => {
    const m = await nuevoMiembro(request);
    expect((await apiConHeaders(request, 'GET', '/comercios/equipo/actividad?fuente=EQUIPO', m.token, conComercio(dueno.comercioId))).status).toBe(403);
    expect((await apiConHeaders(request, 'GET', '/comercios/equipo/actividad?fuente=EQUIPO', undefined, conComercio(dueno.comercioId))).status).toBe(401);
    const invalida = await actividadDueno(request, dueno, 'fuente=basura');
    expect(invalida.status).toBe(400);
    expect(invalida.body.mensaje).toBe('La fuente tiene que ser PEDIDO, EDICION, CIERRE o EQUIPO');
  });

  test('el Administrador ve el equipo con la misma forma que el Dueño, con motivo de baja y reactivable, y sin X-Comercio-Id', async ({ request }) => {
    const d = await prepararAprobado(request, adminToken, localidadId);
    const activo = await nuevoMiembro(request, d);
    const dadoDeBaja = await nuevoMiembro(request, d);
    const renuncio = await nuevoMiembro(request, d);
    await baja(request, dadoDeBaja.id, d);
    await renunciar(request, d.comercioId, renuncio.token);
    envejecerInvitaciones(d);
    const pendiente = await invitarEmpleado(request, d.token, d.comercioId, `pendiente.${sufijoUnico()}@bajonea.test`);
    expect(pendiente.status).toBe(201);

    const propio = await equipoComercio(request, d.token, d.comercioId);
    const admin = await equipoAdmin(request, d.comercioId);
    expect(admin.status, JSON.stringify(admin.body)).toBe(200);
    expect(admin.body.mensaje).toBe('Equipo obtenido correctamente');
    expect(admin.body.data).toEqual(propio.body.data);

    const porId = new Map<number, Record<string, unknown>>(admin.body.data.miembros.map((x: { empleadoId: number }) => [x.empleadoId, x]));
    expect(porId.get(activo.id)).toMatchObject({ estado: 'ACTIVO', motivoBaja: null, puedeReactivar: false });
    expect(porId.get(dadoDeBaja.id)).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'BAJA_DUENO', puedeReactivar: true });
    expect(porId.get(renuncio.id)).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'RENUNCIA', puedeReactivar: false });
    expect(admin.body.data.invitaciones).toHaveLength(1);
    expect(admin.body.data.invitaciones[0]).toMatchObject({ id: pendiente.body.data.id, estado: 'PENDIENTE', diasRestantes: 7 });

    const conHeaderAjeno = await equipoAdmin(request, d.comercioId, adminToken, conComercio(dueno.comercioId));
    expect(conHeaderAjeno.body.data).toEqual(admin.body.data);
    const conHeaderBasura = await equipoAdmin(request, d.comercioId, adminToken, { [HEADER]: 'no-es-un-numero' });
    expect(conHeaderBasura.status).toBe(200);
  });

  test('el Administrador ve el equipo y la actividad de un comercio en cualquier estado', async ({ request }) => {
    const d = await prepararAprobado(request, adminToken, localidadId);
    const m = await nuevoMiembro(request, d);
    for (const estado of ['APROBADO', 'APTO_VENTA', 'PENDIENTE', 'RECHAZADO', 'RECHAZO_DEFINITIVO', 'SUSPENDIDO', 'CERRADO_TEMPORALMENTE', 'INACTIVO']) {
      ponerEstadoComercio(d.comercioId, estado);
      const equipo = await equipoAdmin(request, d.comercioId);
      expect(equipo.status, estado).toBe(200);
      expect(equipo.body.data.miembros.map((x: { empleadoId: number }) => x.empleadoId), estado).toEqual([m.id]);
      const actividad = await actividadAdmin(request, d.comercioId, 'fuente=EQUIPO&limite=100');
      expect(actividad.status, estado).toBe(200);
      expect(actividad.body.data.items.map((f: Fila) => f.accion), estado).toEqual(['ACEPTACION', 'INVITACION']);
    }
  });

  test('la actividad del Administrador es la misma que ve el Dueño: orden, filtro, cursor y rechazos', async ({ request }) => {
    const d = await prepararAprobado(request, adminToken, localidadId);
    const m = await nuevoMiembro(request, d);
    await baja(request, m.id, d);
    await alta(request, m.id, d);

    const propias = await todasLasFilas(request, d);
    const deAdmin = await actividadAdmin(request, d.comercioId, 'limite=100');
    expect(deAdmin.status).toBe(200);
    expect(deAdmin.body.data.items).toEqual(propias);
    const soloEquipo = await actividadAdmin(request, d.comercioId, 'fuente=EQUIPO&limite=100');
    expect(soloEquipo.body.data.items).toEqual(propias.filter((f) => f.fuente === 'EQUIPO'));

    const primera = await actividadAdmin(request, d.comercioId, 'fuente=EQUIPO&limite=2');
    expect(primera.body.data.hayMas).toBe(true);
    const segunda = await actividadAdmin(request, d.comercioId, `fuente=EQUIPO&limite=2&cursor=${encodeURIComponent(primera.body.data.siguienteCursor)}`);
    expect([...primera.body.data.items, ...segunda.body.data.items].map((f: Fila) => f.id)).toEqual(soloEquipo.body.data.items.slice(0, 4).map((f: Fila) => f.id));

    const sinHeader = await actividadAdmin(request, d.comercioId, 'limite=100', adminToken, conComercio(dueno.comercioId));
    expect(sinHeader.body.data.items).toEqual(propias);

    const invalida = await actividadAdmin(request, d.comercioId, 'fuente=basura');
    expect(invalida.status).toBe(400);
    expect(invalida.body.mensaje).toBe('La fuente tiene que ser PEDIDO, EDICION, CIERRE o EQUIPO');
    expect((await actividadAdmin(request, d.comercioId, 'limite=0')).status).toBe(400);
    expect((await actividadAdmin(request, d.comercioId, 'cursor=basura')).status).toBe(400);
  });

  test('un comercio inexistente es 404 "Comercio no encontrado" en las dos rutas del Administrador', async ({ request }) => {
    for (const respuesta of [await equipoAdmin(request, 987654321), await actividadAdmin(request, 987654321)]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body.mensaje).toBe('Comercio no encontrado');
    }
  });

  test('seguridad: solo el Administrador; el anonimo es 401 y el Dueño, el Cliente y el Empleado son 403', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
    const otroDueno = await prepararAprobado(request, adminToken, localidadId);
    const rutas = [
      (token: string | undefined, headers: Record<string, string> = {}) => equipoAdmin(request, dueno.comercioId, token, headers),
      (token: string | undefined, headers: Record<string, string> = {}) => actividadAdmin(request, dueno.comercioId, '', token, headers),
    ];
    for (const ruta of rutas) {
      expect((await ruta('')).status).toBe(401);
      expect((await ruta(dueno.token, conComercio(dueno.comercioId))).status).toBe(403);
      expect((await ruta(otroDueno.token)).status).toBe(403);
      expect((await ruta(sesionCliente.token)).status).toBe(403);
      expect((await ruta(m.token, conComercio(dueno.comercioId))).status).toBe(403);
      expect((await ruta(adminToken)).status).toBe(200);
    }
  });

  test('diasRestantes lo calcula el servidor: techo de los dias con minimo uno, solo en una pendiente vigente', async ({ request }) => {
    const d = await prepararAprobado(request, adminToken, localidadId);
    const casos: Array<{ horas: number; esperado: number | null; estado: string }> = [
      { horas: 168, esperado: 7, estado: 'PENDIENTE' },
      { horas: 156, esperado: 7, estado: 'PENDIENTE' },
      { horas: 49, esperado: 3, estado: 'PENDIENTE' },
      { horas: 25, esperado: 2, estado: 'PENDIENTE' },
      { horas: 23, esperado: 1, estado: 'PENDIENTE' },
      { horas: 0, esperado: null, estado: 'VENCIDA' },
    ];
    const ids: number[] = [];
    for (const caso of casos) {
      envejecerInvitaciones(d);
      const email = `dias${caso.horas}.${sufijoUnico()}@bajonea.test`;
      const invitacion = await invitarEmpleado(request, d.token, d.comercioId, email);
      expect(invitacion.status).toBe(201);
      expect(invitacion.body.data.diasRestantes).toBe(7);
      sql(`UPDATE invitacion_empleado SET fecha_vencimiento = DATE_ADD(fecha_creacion, INTERVAL ${caso.horas} HOUR) WHERE id = ${invitacion.body.data.id};`);
      ids.push(invitacion.body.data.id);
    }

    const equipo = await equipoComercio(request, d.token, d.comercioId);
    expect(equipo.status).toBe(200);
    const porId = new Map<number, { estado: string; diasRestantes?: number | null }>(equipo.body.data.invitaciones.map((x: { id: number }) => [x.id, x]));
    casos.forEach((caso, i) => {
      const invitacion = porId.get(ids[i])!;
      expect(invitacion.estado, `${caso.horas} horas`).toBe(caso.estado);
      expect(invitacion.diasRestantes ?? null, `${caso.horas} horas`).toBe(caso.esperado);
    });

    const cancelada = await cancelarInvitacion(request, d.token, d.comercioId, ids[0]);
    expect(cancelada.status).toBe(200);
    expect(cancelada.body.data.diasRestantes ?? null).toBeNull();
  });
});
