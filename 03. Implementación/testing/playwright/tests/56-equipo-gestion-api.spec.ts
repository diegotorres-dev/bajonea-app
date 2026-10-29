import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  apiConHeaders,
  apiGet,
  cantidadEmailsRegularizacionTest,
  cancelarInvitacion,
  equipoComercio,
  fijarPasswordAdminYLoguear,
  invitarEmpleado,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  suspenderComercio,
} from './helpers/backend';
import type { ClienteRegistrado } from './helpers/backend';
import { atajoEstadoRelacion, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
const NO_DISPONIBLE = { mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } };

interface Miembro {
  cuenta: ClienteRegistrado;
  id: number;
  token: string;
}

test.describe('Rol Empleado, E4 bloque A1 (API): desactivar y reactivar al miembro', () => {
  test.describe.configure({ timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;

  const baja = (request: APIRequestContext, miembroId: number, token = dueno.token, comercioId = dueno.comercioId) =>
    apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembroId}/desactivar`, token, conComercio(comercioId));
  const alta = (request: APIRequestContext, miembroId: number, token = dueno.token, comercioId = dueno.comercioId) =>
    apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembroId}/reactivar`, token, conComercio(comercioId));

  async function nuevoMiembro(request: APIRequestContext, duenoDe = dueno): Promise<Miembro> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    sql(`UPDATE invitacion_empleado SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL 2 HOUR) WHERE comercio_id = ${duenoDe.comercioId} AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR);`);
    await sumarAlEquipo(request, duenoDe.comercioId, cuenta, duenoDe.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return { cuenta, id: sesion.usuario.id, token: sesion.token };
  }

  const relacion = (miembroId: number, comercioId = dueno.comercioId): number =>
    Number(sql(`SELECT id FROM empleado_comercio WHERE empleado_id = ${miembroId} AND comercio_id = ${comercioId};`));
  const estadoRelacion = (miembroId: number): string => sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${miembroId} AND comercio_id = ${dueno.comercioId};`);
  const motivos = (relacionId: number): string[] =>
    sql(`SELECT motivo FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacionId} ORDER BY id;`)
      .split(/\r?\n/)
      .filter(Boolean);
  const avisos = (usuarioId: number, tipo: string): number => Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND tipo = '${tipo}';`));

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId);
  });

  test('el ENUM de notificacion.tipo trae EMPLEADO_REACTIVADO (V35)', async () => {
    const tipo = sql("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificacion' AND COLUMN_NAME = 'tipo';");
    expect(tipo).toContain("'EMPLEADO_DESACTIVADO'");
    expect(tipo).toContain("'EMPLEADO_REACTIVADO'");
    expect(sql("SELECT success FROM flyway_schema_history WHERE version = '35';")).toBe('1');
  });

  test('desactivar da de baja: relacion INACTIVO, fila BAJA_DUENO, aviso T32 personal y avisos del comercio purgados', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const rel = relacion(m.id);
    sql(`INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) ` +
      `VALUES (${m.id}, 'NUEVO_PEDIDO', 'Aviso viejo', 0, NOW(), 'PUSH', 'PENDIENTE', 'COMERCIO', ${dueno.comercioId}, ${dueno.comercioId});`);

    const respuesta = await baja(request, m.id);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body.mensaje).toBe('Miembro dado de baja');
    expect(respuesta.body.data).toMatchObject({ empleadoId: m.id, estado: 'INACTIVO', motivoBaja: 'BAJA_DUENO', puedeReactivar: true });
    expect(respuesta.body.data.fechaBaja).toBeTruthy();

    expect(estadoRelacion(m.id)).toBe('INACTIVO');
    expect(motivos(rel)).toEqual(['ACEPTACION', 'BAJA_DUENO']);
    const fila = sql(`SELECT CONCAT_WS('|', estado_origen, estado_destino, actor_usuario_id, IFNULL(invitacion_id, 'null')) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${rel} AND motivo = 'BAJA_DUENO';`);
    expect(fila).toBe(`ACTIVO|INACTIVO|${dueno.duenoId}|null`);
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${m.id} AND comercio_id = ${dueno.comercioId};`))).toBe(0);
    const t32 = sql(`SELECT CONCAT_WS('|', IFNULL(comercio_id, 'null'), entidad_tipo, entidad_id, canal, mensaje) FROM notificacion WHERE usuario_id = ${m.id} AND tipo = 'EMPLEADO_DESACTIVADO';`);
    expect(t32).toBe(`null|COMERCIO|${dueno.comercioId}|PUSH|${dueno.nombre} te dio de baja del equipo. Ya no tenés acceso a ese comercio.`);

    const personales = await apiGet(request, '/notificaciones', m.token);
    expect(personales.status).toBe(200);
    expect(personales.body.data.some((n: { mensaje: string }) => n.mensaje.includes('te dio de baja del equipo'))).toBe(true);
  });

  test('desactivar dos veces es idempotente: 200 sin otra fila ni otro aviso, y conserva la fecha de baja', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const primera = await baja(request, m.id);
    expect(primera.status).toBe(200);
    const fechaBaja = sql(`SELECT fecha_baja FROM empleado_comercio WHERE id = ${relacion(m.id)};`);

    const segunda = await baja(request, m.id);
    expect(segunda.status).toBe(200);
    expect(segunda.body.mensaje).toBe('El miembro ya estaba inactivo');
    expect(segunda.body.data).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'BAJA_DUENO', puedeReactivar: true });
    expect(motivos(relacion(m.id))).toEqual(['ACEPTACION', 'BAJA_DUENO']);
    expect(avisos(m.id, 'EMPLEADO_DESACTIVADO')).toBe(1);
    expect(sql(`SELECT fecha_baja FROM empleado_comercio WHERE id = ${relacion(m.id)};`)).toBe(fechaBaja);
  });

  test('el Empleado dado de baja pierde el acceso en la siguiente request, con el 404 de siempre, y lo recupera al reactivarlo', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const antes = await apiConHeaders(request, 'GET', '/pedidos/comercio', m.token, conComercio(dueno.comercioId));
    expect(antes.status).toBe(200);

    await baja(request, m.id);
    const sin = await apiConHeaders(request, 'GET', '/pedidos/comercio', m.token, conComercio(dueno.comercioId));
    expect(sin.status).toBe(404);
    expect(sin.body).toMatchObject(NO_DISPONIBLE);
    const comercios = await apiGet(request, '/empleados/mis-comercios', m.token);
    expect(comercios.body.data).toEqual([]);

    const reactivado = await alta(request, m.id);
    expect(reactivado.status).toBe(200);
    const con = await apiConHeaders(request, 'GET', '/pedidos/comercio', m.token, conComercio(dueno.comercioId));
    expect(con.status).toBe(200);
  });

  test('reactivar vuelve a ACTIVO, escribe REACTIVACION del Dueño sin invitacion, avisa con T37 y purga los avisos del comercio', async ({ request }) => {
    const m = await nuevoMiembro(request);
    await baja(request, m.id);
    sql(`INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) ` +
      `VALUES (${m.id}, 'NUEVO_PEDIDO', 'Aviso viejo', 0, NOW(), 'PUSH', 'PENDIENTE', 'COMERCIO', ${dueno.comercioId}, ${dueno.comercioId});`);

    const respuesta = await alta(request, m.id);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body.mensaje).toBe('Miembro reactivado');
    expect(respuesta.body.data).toMatchObject({ estado: 'ACTIVO', motivoBaja: null, puedeReactivar: false, fechaBaja: null });

    const rel = relacion(m.id);
    expect(estadoRelacion(m.id)).toBe('ACTIVO');
    expect(sql(`SELECT fecha_baja IS NULL FROM empleado_comercio WHERE id = ${rel};`)).toBe('1');
    expect(motivos(rel)).toEqual(['ACEPTACION', 'BAJA_DUENO', 'REACTIVACION']);
    const fila = sql(`SELECT CONCAT_WS('|', estado_origen, estado_destino, actor_usuario_id, IFNULL(invitacion_id, 'null')) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${rel} AND motivo = 'REACTIVACION';`);
    expect(fila).toBe(`INACTIVO|ACTIVO|${dueno.duenoId}|null`);
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${m.id} AND comercio_id = ${dueno.comercioId};`))).toBe(0);
    const t37 = sql(`SELECT CONCAT_WS('|', IFNULL(comercio_id, 'null'), entidad_tipo, entidad_id, canal, mensaje) FROM notificacion WHERE usuario_id = ${m.id} AND tipo = 'EMPLEADO_REACTIVADO';`);
    expect(t37).toBe(`null|COMERCIO|${dueno.comercioId}|PUSH|${dueno.nombre} te reactivó en el equipo. Ya podés volver a trabajar ahí.`);
    expect(avisos(m.id, 'EMPLEADO_DESACTIVADO'), 'T32 queda en la campana personal').toBe(1);
  });

  test('reactivar a un miembro ya activo es idempotente y no escribe nada', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const respuesta = await alta(request, m.id);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.mensaje).toBe('El miembro ya estaba activo');
    expect(motivos(relacion(m.id))).toEqual(['ACEPTACION']);
    expect(avisos(m.id, 'EMPLEADO_REACTIVADO')).toBe(0);
  });

  test('no se reactiva directamente a quien renuncio ni a quien quedo sin registro de la baja: 409 EMPLEADO_NO_REACTIVABLE', async ({ request }) => {
    const renuncio = await nuevoMiembro(request);
    expect((await atajoEstadoRelacion(request, dueno.comercioId, renuncio.id, 'INACTIVO', 'RENUNCIA')).status).toBe(200);
    const r1 = await alta(request, renuncio.id);
    expect(r1.status).toBe(409);
    expect(r1.body.data.codigo).toBe('EMPLEADO_NO_REACTIVABLE');
    expect(r1.body.mensaje).toBe('Esta persona dejó el equipo por su cuenta. Para que vuelva, invitala de nuevo.');
    expect(estadoRelacion(renuncio.id)).toBe('INACTIVO');

    const sinRegistro = await nuevoMiembro(request);
    expect((await atajoEstadoRelacion(request, dueno.comercioId, sinRegistro.id, 'INACTIVO')).status).toBe(200);
    expect(motivos(relacion(sinRegistro.id))).toEqual(['ACEPTACION']);
    const r2 = await alta(request, sinRegistro.id);
    expect(r2.status).toBe(409);
    expect(r2.body.data.codigo).toBe('EMPLEADO_NO_REACTIVABLE');
    expect(estadoRelacion(sinRegistro.id)).toBe('INACTIVO');
    expect(motivos(relacion(sinRegistro.id)).includes('REACTIVACION')).toBe(false);
  });

  test('con una invitacion pendiente vigente de la misma persona no se reactiva: 409 INVITACION_PENDIENTE; cancelada, si', async ({ request }) => {
    const m = await nuevoMiembro(request);
    await baja(request, m.id);
    const invitacion = await invitarEmpleado(request, dueno.token, dueno.comercioId, m.cuenta.email);
    expect(invitacion.status).toBe(201);

    const bloqueada = await alta(request, m.id);
    expect(bloqueada.status).toBe(409);
    expect(bloqueada.body.data.codigo).toBe('INVITACION_PENDIENTE');
    expect(bloqueada.body.mensaje).toBe('Hay una invitación pendiente para esta persona. Cancelala primero.');
    expect(estadoRelacion(m.id)).toBe('INACTIVO');

    expect((await cancelarInvitacion(request, dueno.token, dueno.comercioId, invitacion.body.data.id)).status).toBe(200);
    expect((await alta(request, m.id)).status).toBe(200);
    expect(estadoRelacion(m.id)).toBe('ACTIVO');
  });

  test('una cuenta no apta da el 409 generico, no revela el estado y no manda email de regularizacion', async ({ request }) => {
    const m = await nuevoMiembro(request);
    await baja(request, m.id);
    sql(`UPDATE usuario SET estado = 'BLOQUEADO' WHERE id = ${m.id};`);

    const respuesta = await alta(request, m.id);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe('No se puede reactivar a esta persona');
    expect(JSON.stringify(respuesta.body).toLowerCase()).not.toContain('bloquead');
    expect(respuesta.body.data?.codigo).toBeUndefined();
    expect(estadoRelacion(m.id)).toBe('INACTIVO');
    expect(avisos(m.id, 'EMPLEADO_REACTIVADO')).toBe(0);
    expect(await cantidadEmailsRegularizacionTest(request, m.cuenta.email)).toBe(0);

    sql(`UPDATE usuario SET estado = 'ACTIVO' WHERE id = ${m.id};`);
    sql(`UPDATE persona_fisica SET fecha_nacimiento = DATE_SUB(CURDATE(), INTERVAL 17 YEAR) WHERE id = ${m.id};`);
    const menor = await alta(request, m.id);
    expect(menor.status).toBe(409);
    expect(menor.body.mensaje).toBe('No se puede reactivar a esta persona');
  });

  test('con el comercio suspendido no se puede dar de baja (409 COMERCIO_SUSPENDIDO) ni reactivar (409 COMERCIO_NO_OPERATIVO)', async ({ request }) => {
    const propio = await prepararAprobado(request, adminToken, localidadId);
    const m = await nuevoMiembro(request, propio);
    const otro = await nuevoMiembro(request, propio);
    await baja(request, otro.id, propio.token, propio.comercioId);
    await suspenderComercio(request, adminToken, propio.comercioId, 'Suspension de la prueba E4');

    const bajaSuspendido = await baja(request, m.id, propio.token, propio.comercioId);
    expect(bajaSuspendido.status).toBe(409);
    expect(bajaSuspendido.body.data.codigo).toBe('COMERCIO_SUSPENDIDO');
    expect(bajaSuspendido.body.mensaje).toBe('El comercio está suspendido: el equipo se puede ver, pero no modificar');
    expect(sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${m.id} AND comercio_id = ${propio.comercioId};`)).toBe('ACTIVO');
    const altaSuspendido = await alta(request, otro.id, propio.token, propio.comercioId);
    expect(altaSuspendido.status).toBe(409);
    expect(altaSuspendido.body.data.codigo).toBe('COMERCIO_NO_OPERATIVO');
  });

  test('el listado del equipo informa motivoBaja y puedeReactivar de cada miembro', async ({ request }) => {
    const propio = await prepararAprobado(request, adminToken, localidadId);
    const activo = await nuevoMiembro(request, propio);
    const dadoDeBaja = await nuevoMiembro(request, propio);
    const renuncio = await nuevoMiembro(request, propio);
    const sinRegistro = await nuevoMiembro(request, propio);
    await baja(request, dadoDeBaja.id, propio.token, propio.comercioId);
    await atajoEstadoRelacion(request, propio.comercioId, renuncio.id, 'INACTIVO', 'RENUNCIA');
    await atajoEstadoRelacion(request, propio.comercioId, sinRegistro.id, 'INACTIVO');

    const equipo = await equipoComercio(request, propio.token, propio.comercioId);
    expect(equipo.status).toBe(200);
    const porId = new Map<number, Record<string, unknown>>(equipo.body.data.miembros.map((x: { empleadoId: number }) => [x.empleadoId, x]));
    expect(porId.get(activo.id)).toMatchObject({ estado: 'ACTIVO', motivoBaja: null, puedeReactivar: false });
    expect(porId.get(dadoDeBaja.id)).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'BAJA_DUENO', puedeReactivar: true });
    expect(porId.get(renuncio.id)).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'RENUNCIA', puedeReactivar: false });
    expect(porId.get(sinRegistro.id)).toMatchObject({ estado: 'INACTIVO', motivoBaja: null, puedeReactivar: false });
  });

  test('seguridad: el Empleado recibe 403, sin sesion 401, sin comercio 400, y un miembro ajeno o inexistente 404', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const otroDueno = await prepararAprobado(request, adminToken, localidadId);
    const ajeno = await nuevoMiembro(request, otroDueno);

    expect((await baja(request, m.id, m.token)).status).toBe(403);
    expect((await alta(request, m.id, m.token)).status).toBe(403);
    expect((await apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${m.id}/desactivar`, undefined, conComercio(dueno.comercioId))).status).toBe(401);
    expect((await apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${m.id}/desactivar`, dueno.token, {})).status).toBe(400);
    expect((await apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${m.id}/reactivar`, dueno.token, {})).status).toBe(400);

    const inexistente = await baja(request, 987654321);
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.mensaje).toBe('Miembro no encontrado');
    expect((await baja(request, ajeno.id)).status, 'un miembro de otro comercio no existe para este Dueño').toBe(404);
    expect((await alta(request, ajeno.id)).status).toBe(404);
    expect((await baja(request, ajeno.id, otroDueno.token, dueno.comercioId)).status, 'el comercio de otro Dueño tampoco se puede gestionar').toBe(404);
    expect((await baja(request, dueno.duenoId)).status, 'el propio Dueño no es un miembro').toBe(404);
    expect(estadoRelacion(m.id)).toBe('ACTIVO');
    expect(sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${ajeno.id} AND comercio_id = ${otroDueno.comercioId};`)).toBe('ACTIVO');
  });

  test('el atajo de test con motivo escribe la fila de la baja; sin motivo no escribe nada; un motivo invalido se rechaza', async ({ request }) => {
    const conMotivo = await nuevoMiembro(request);
    expect((await atajoEstadoRelacion(request, dueno.comercioId, conMotivo.id, 'INACTIVO', 'BAJA_DUENO')).status).toBe(200);
    expect(sql(`SELECT CONCAT_WS('|', estado_origen, estado_destino, actor_usuario_id) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacion(conMotivo.id)} AND motivo = 'BAJA_DUENO';`))
      .toBe(`ACTIVO|INACTIVO|${dueno.duenoId}`);
    expect((await alta(request, conMotivo.id)).status, 'una baja sembrada por el Dueño es reactivable').toBe(200);

    const renuncia = await nuevoMiembro(request);
    expect((await atajoEstadoRelacion(request, dueno.comercioId, renuncia.id, 'INACTIVO', 'RENUNCIA')).status).toBe(200);
    expect(sql(`SELECT actor_usuario_id FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacion(renuncia.id)} AND motivo = 'RENUNCIA';`)).toBe(String(renuncia.id));

    const sinMotivo = await nuevoMiembro(request);
    expect((await atajoEstadoRelacion(request, dueno.comercioId, sinMotivo.id, 'INACTIVO')).status).toBe(200);
    expect(motivos(relacion(sinMotivo.id))).toEqual(['ACEPTACION']);

    const invalido = await atajoEstadoRelacion(request, dueno.comercioId, sinMotivo.id, 'ACTIVO', 'RENUNCIA');
    expect(invalido.status).toBe(409);
  });
});

test.describe('Rol Empleado, E4 bloque A2 (API): renuncia y acceso propio', () => {
  test.describe.configure({ timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;

  const renunciar = (request: APIRequestContext, comercioId: number, token: string | undefined) =>
    apiConHeaders(request, 'PUT', `/empleados/comercios/${comercioId}/renunciar`, token, {});
  const acceso = (request: APIRequestContext, comercioId: number, token: string | undefined, headers: Record<string, string> = {}) =>
    apiConHeaders(request, 'GET', `/empleados/comercios/${comercioId}/acceso`, token, headers);
  const baja = (request: APIRequestContext, miembroId: number, token = dueno.token, comercioId = dueno.comercioId) =>
    apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembroId}/desactivar`, token, conComercio(comercioId));
  const alta = (request: APIRequestContext, miembroId: number, token = dueno.token, comercioId = dueno.comercioId) =>
    apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembroId}/reactivar`, token, conComercio(comercioId));

  async function nuevoMiembro(request: APIRequestContext, duenoDe = dueno): Promise<Miembro> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    sql(`UPDATE invitacion_empleado SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL 2 HOUR) WHERE comercio_id = ${duenoDe.comercioId} AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR);`);
    await sumarAlEquipo(request, duenoDe.comercioId, cuenta, duenoDe.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return { cuenta, id: sesion.usuario.id, token: sesion.token };
  }

  const relacion = (miembroId: number, comercioId = dueno.comercioId): number =>
    Number(sql(`SELECT id FROM empleado_comercio WHERE empleado_id = ${miembroId} AND comercio_id = ${comercioId};`));
  const estadoRelacion = (miembroId: number, comercioId = dueno.comercioId): string =>
    sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${miembroId} AND comercio_id = ${comercioId};`);
  const motivos = (relacionId: number): string[] =>
    sql(`SELECT motivo FROM historial_empleado_comercio WHERE empleado_comercio_id = ${relacionId} ORDER BY id;`)
      .split(/\r?\n/)
      .filter(Boolean);
  const avisos = (usuarioId: number, tipo: string): number => Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND tipo = '${tipo}';`));

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId);
  });

  test('renunciar: relacion INACTIVO, fila RENUNCIA del propio Empleado, avisos del comercio purgados y T34 al Dueño con el comercio abierto', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const rel = relacion(m.id);
    sql(`INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) ` +
      `VALUES (${m.id}, 'NUEVO_PEDIDO', 'Aviso viejo', 0, NOW(), 'PUSH', 'PENDIENTE', 'COMERCIO', ${dueno.comercioId}, ${dueno.comercioId});`);

    const respuesta = await renunciar(request, dueno.comercioId, m.token);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body.mensaje).toBe('Dejaste de trabajar en el comercio');
    expect(respuesta.body.data ?? null).toBeNull();

    expect(estadoRelacion(m.id)).toBe('INACTIVO');
    expect(sql(`SELECT fecha_baja IS NOT NULL FROM empleado_comercio WHERE id = ${rel};`)).toBe('1');
    expect(motivos(rel)).toEqual(['ACEPTACION', 'RENUNCIA']);
    expect(sql(`SELECT CONCAT_WS('|', estado_origen, estado_destino, actor_usuario_id, IFNULL(invitacion_id, 'null')) FROM historial_empleado_comercio WHERE empleado_comercio_id = ${rel} AND motivo = 'RENUNCIA';`))
      .toBe(`ACTIVO|INACTIVO|${m.id}|null`);
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${m.id} AND comercio_id = ${dueno.comercioId};`))).toBe(0);
    expect(avisos(m.id, 'EMPLEADO_DESACTIVADO'), 'el Empleado no recibe aviso de su propia renuncia').toBe(0);

    expect(sql(`SELECT CONCAT_WS('|', comercio_id, entidad_tipo, entidad_id, canal) FROM notificacion WHERE usuario_id = ${dueno.duenoId} AND tipo = 'EMPLEADO_DESACTIVADO' AND mensaje LIKE '${m.cuenta.nombre} ${m.cuenta.apellido}%';`))
      .toBe(`${dueno.comercioId}|COMERCIO|${dueno.comercioId}|PUSH`);
    const campana = await apiConHeaders(request, 'GET', '/notificaciones', dueno.token, conComercio(dueno.comercioId));
    expect(campana.status).toBe(200);
    const textos: string[] = campana.body.data.map((n: { mensaje: string }) => n.mensaje);
    expect(textos).toContain(`${m.cuenta.nombre} ${m.cuenta.apellido} dejó de trabajar en ${dueno.nombre}.`);
  });

  test('renunciar dos veces es idempotente: 200 sin otra fila, sin otro aviso y con la misma fecha de baja', async ({ request }) => {
    const m = await nuevoMiembro(request);
    expect((await renunciar(request, dueno.comercioId, m.token)).status).toBe(200);
    const fechaBaja = sql(`SELECT fecha_baja FROM empleado_comercio WHERE id = ${relacion(m.id)};`);
    const avisosDelDueno = avisos(dueno.duenoId, 'EMPLEADO_DESACTIVADO');

    const segunda = await renunciar(request, dueno.comercioId, m.token);
    expect(segunda.status).toBe(200);
    expect(segunda.body.mensaje).toBe('Ya habías dejado de trabajar en este comercio');
    expect(motivos(relacion(m.id))).toEqual(['ACEPTACION', 'RENUNCIA']);
    expect(avisos(dueno.duenoId, 'EMPLEADO_DESACTIVADO')).toBe(avisosDelDueno);
    expect(sql(`SELECT fecha_baja FROM empleado_comercio WHERE id = ${relacion(m.id)};`)).toBe(fechaBaja);
  });

  test('renunciar sobre una relacion que el Dueño ya dio de baja es idempotente y no cambia el motivo', async ({ request }) => {
    const m = await nuevoMiembro(request);
    expect((await baja(request, m.id)).status).toBe(200);
    const avisosDelDueno = avisos(dueno.duenoId, 'EMPLEADO_DESACTIVADO');

    const respuesta = await renunciar(request, dueno.comercioId, m.token);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.mensaje).toBe('Ya habías dejado de trabajar en este comercio');
    expect(motivos(relacion(m.id))).toEqual(['ACEPTACION', 'BAJA_DUENO']);
    expect(avisos(dueno.duenoId, 'EMPLEADO_DESACTIVADO')).toBe(avisosDelDueno);
    const estado = await acceso(request, dueno.comercioId, m.token);
    expect(estado.body.data).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'BAJA_DUENO' });
  });

  test('sin relacion, con un comercio ajeno o con uno inexistente es el mismo 404 COMERCIO_NO_DISPONIBLE con el mismo cuerpo', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const otroDueno = await prepararAprobado(request, adminToken, localidadId);
    const sinNada = await registrarYVerificarCliente(request, localidadId);
    const sesionSinNada = await login(request, sinNada.nombreUsuario, sinNada.password);

    const ajeno = await renunciar(request, otroDueno.comercioId, m.token);
    const inexistente = await renunciar(request, 987654321, m.token);
    const sinRelacion = await renunciar(request, dueno.comercioId, sesionSinNada.token);
    for (const respuesta of [ajeno, inexistente, sinRelacion]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toMatchObject(NO_DISPONIBLE);
    }
    expect(inexistente.body).toEqual(ajeno.body);
    expect(sinRelacion.body).toEqual(ajeno.body);

    const accesoAjeno = await acceso(request, otroDueno.comercioId, m.token);
    const accesoInexistente = await acceso(request, 987654321, m.token);
    const accesoSinRelacion = await acceso(request, dueno.comercioId, sesionSinNada.token);
    for (const respuesta of [accesoAjeno, accesoInexistente, accesoSinRelacion]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual(ajeno.body);
    }
    expect(estadoRelacion(m.id)).toBe('ACTIVO');
    expect(motivos(relacion(m.id))).toEqual(['ACEPTACION']);
  });

  test('seguridad: sin sesion 401, el Dueño y el Administrador 403 en la renuncia y en el acceso', async ({ request }) => {
    const m = await nuevoMiembro(request);

    expect((await renunciar(request, dueno.comercioId, undefined)).status).toBe(401);
    expect((await renunciar(request, dueno.comercioId, dueno.token)).status).toBe(403);
    expect((await renunciar(request, dueno.comercioId, adminToken)).status).toBe(403);
    expect((await acceso(request, dueno.comercioId, undefined)).status).toBe(401);
    expect((await acceso(request, dueno.comercioId, dueno.token)).status).toBe(403);
    expect((await acceso(request, dueno.comercioId, adminToken)).status).toBe(403);
    expect(estadoRelacion(m.id)).toBe('ACTIVO');
    expect(motivos(relacion(m.id))).toEqual(['ACEPTACION']);
  });

  test('el header X-Comercio-Id se ignora en la renuncia y en el acceso', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const consulta = await acceso(request, dueno.comercioId, m.token, { [HEADER]: 'no-es-un-numero' });
    expect(consulta.status).toBe(200);
    const respuesta = await apiConHeaders(request, 'PUT', `/empleados/comercios/${dueno.comercioId}/renunciar`, m.token, { [HEADER]: 'no-es-un-numero' });
    expect(respuesta.status).toBe(200);
    expect(estadoRelacion(m.id)).toBe('INACTIVO');
  });

  test('se puede renunciar con el comercio en cualquier estado', async ({ request }) => {
    for (const estado of ['SUSPENDIDO', 'CERRADO_TEMPORALMENTE', 'INACTIVO', 'RECHAZADO']) {
      const propio = await prepararAprobado(request, adminToken, localidadId);
      const m = await nuevoMiembro(request, propio);
      ponerEstadoComercio(propio.comercioId, estado);

      const respuesta = await renunciar(request, propio.comercioId, m.token);
      expect(respuesta.status, `con el comercio ${estado}: ${JSON.stringify(respuesta.body)}`).toBe(200);
      expect(estadoRelacion(m.id, propio.comercioId)).toBe('INACTIVO');
    }
  });

  test('despues de renunciar se pierde el acceso, el Dueño ve la renuncia y no puede reactivar directamente', async ({ request }) => {
    const m = await nuevoMiembro(request);
    expect((await apiConHeaders(request, 'GET', '/pedidos/comercio', m.token, conComercio(dueno.comercioId))).status).toBe(200);

    expect((await renunciar(request, dueno.comercioId, m.token)).status).toBe(200);

    const sin = await apiConHeaders(request, 'GET', '/pedidos/comercio', m.token, conComercio(dueno.comercioId));
    expect(sin.status).toBe(404);
    expect(sin.body).toMatchObject(NO_DISPONIBLE);
    expect((await apiGet(request, '/empleados/mis-comercios', m.token)).body.data).toEqual([]);

    const equipo = await equipoComercio(request, dueno.token, dueno.comercioId);
    const miembro = equipo.body.data.miembros.find((x: { empleadoId: number }) => x.empleadoId === m.id);
    expect(miembro).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'RENUNCIA', puedeReactivar: false });
    const reactivar = await alta(request, m.id);
    expect(reactivar.status).toBe(409);
    expect(reactivar.body.data.codigo).toBe('EMPLEADO_NO_REACTIVABLE');
  });

  test('quien renuncio puede volver con una invitacion nueva y el historial queda completo', async ({ request }) => {
    const m = await nuevoMiembro(request);
    expect((await renunciar(request, dueno.comercioId, m.token)).status).toBe(200);
    sql(`UPDATE invitacion_empleado SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL 2 HOUR) WHERE comercio_id = ${dueno.comercioId} AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR);`);
    await sumarAlEquipo(request, dueno.comercioId, m.cuenta, dueno.token);

    expect(estadoRelacion(m.id)).toBe('ACTIVO');
    expect(motivos(relacion(m.id))).toEqual(['ACEPTACION', 'RENUNCIA', 'ACEPTACION', 'REACTIVACION']);
    const estado = await acceso(request, dueno.comercioId, m.token);
    expect(estado.body.data).toMatchObject({ estado: 'ACTIVO', comercioAccesible: true });
    expect(estado.body.data.motivoBaja ?? null).toBeNull();
  });

  test('acceso: relacion activa, baja del Dueño, renuncia y baja sin registro', async ({ request }) => {
    const activo = await nuevoMiembro(request);
    const conBaja = await nuevoMiembro(request);
    const conRenuncia = await nuevoMiembro(request);
    const sinRegistro = await nuevoMiembro(request);
    await baja(request, conBaja.id);
    await renunciar(request, dueno.comercioId, conRenuncia.token);
    await atajoEstadoRelacion(request, dueno.comercioId, sinRegistro.id, 'INACTIVO');

    const a = await acceso(request, dueno.comercioId, activo.token);
    expect(a.status).toBe(200);
    expect(a.body.mensaje).toBe('Acceso obtenido correctamente');
    expect(a.body.data).toMatchObject({ estado: 'ACTIVO', comercioAccesible: true });
    expect(a.body.data.motivoBaja ?? null).toBeNull();
    expect((await acceso(request, dueno.comercioId, conBaja.token)).body.data).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'BAJA_DUENO', comercioAccesible: true });
    expect((await acceso(request, dueno.comercioId, conRenuncia.token)).body.data).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'RENUNCIA', comercioAccesible: true });
    const s = await acceso(request, dueno.comercioId, sinRegistro.token);
    expect(s.body.data).toMatchObject({ estado: 'INACTIVO', comercioAccesible: true });
    expect(s.body.data.motivoBaja ?? null).toBeNull();
  });

  test('acceso: con varias bajas gana la mas reciente y el comercio no accesible no revela su motivo', async ({ request }) => {
    const propio = await prepararAprobado(request, adminToken, localidadId);
    const m = await nuevoMiembro(request, propio);
    expect((await baja(request, m.id, propio.token, propio.comercioId)).status).toBe(200);
    expect((await alta(request, m.id, propio.token, propio.comercioId)).status).toBe(200);
    expect((await renunciar(request, propio.comercioId, m.token)).status).toBe(200);
    expect((await acceso(request, propio.comercioId, m.token)).body.data).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'RENUNCIA' });

    ponerEstadoComercio(propio.comercioId, 'SUSPENDIDO');
    expect((await acceso(request, propio.comercioId, m.token)).body.data.comercioAccesible).toBe(true);
    for (const estado of ['INACTIVO', 'RECHAZADO', 'PENDIENTE', 'RECHAZO_DEFINITIVO']) {
      ponerEstadoComercio(propio.comercioId, estado);
      const consulta = await acceso(request, propio.comercioId, m.token);
      expect(consulta.status).toBe(200);
      expect(consulta.body.data).toMatchObject({ estado: 'INACTIVO', motivoBaja: 'RENUNCIA', comercioAccesible: false });
      expect(Object.keys(consulta.body.data).sort()).toEqual(['comercioAccesible', 'estado', 'motivoBaja']);
      if (estado !== 'INACTIVO') {
        expect(JSON.stringify(consulta.body)).not.toContain(estado);
      }
    }
  });

  test('varias renuncias simultaneas escriben una sola fila y un solo aviso', async ({ request }) => {
    const m = await nuevoMiembro(request);
    const avisosAntes = avisos(dueno.duenoId, 'EMPLEADO_DESACTIVADO');

    const respuestas = await Promise.all([1, 2, 3, 4, 5].map(() => renunciar(request, dueno.comercioId, m.token)));

    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(respuestas.filter((r) => r.body.mensaje === 'Dejaste de trabajar en el comercio')).toHaveLength(1);
    expect(motivos(relacion(m.id))).toEqual(['ACEPTACION', 'RENUNCIA']);
    expect(avisos(dueno.duenoId, 'EMPLEADO_DESACTIVADO')).toBe(avisosAntes + 1);
  });
});
