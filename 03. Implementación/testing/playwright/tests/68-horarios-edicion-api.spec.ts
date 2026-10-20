import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  aceptarInvitacion,
  apiConHeaders,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  invitarEmpleado,
  login,
  obtenerCodigoInvitacionTest,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { agregarComercioApto, prepararAprobado, reemplazarHorarios } from './helpers/multicomercio';
import { diaDeLaSemanaEnZona, fechaRelativaEnZona, hoyEnZona } from './helpers/zona';

const HEADER = 'X-Comercio-Id';
const RUTA = '/comercios/perfil/horarios';
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const diaEnOffset = (dias: number): string => DIAS[(diaDeLaSemanaEnZona() + dias + 700) % 7];
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const conComercio = (comercioId: number | string): Record<string, string> => ({ [HEADER]: String(comercioId) });
const franja = (diaSemana: string, horaApertura: string, horaCierre: string) => ({ diaSemana, horaApertura, horaCierre });
const manana = (): string => fechaRelativaEnZona(0, 1);

test.describe('Fase 2, T1 (API): edición versionada de los horarios', () => {
  test.describe.configure({ timeout: 300_000 });

  let adminToken: string;
  let dueno: Dueno;
  let empleado: ClienteRegistrado;
  let empleadoToken: string;
  let sinRelacionToken: string;

  async function comercioDelEquipo(request: APIRequestContext, horarios = todoElDia()): Promise<number> {
    const comercioId = await agregarComercioApto(request, dueno, `Horarios T1 ${sufijoUnico()}`, horarios);
    const invitacion = await invitarEmpleado(request, dueno.token, comercioId, empleado.email);
    expect(invitacion.status, JSON.stringify(invitacion.body)).toBe(201);
    const codigo = await obtenerCodigoInvitacionTest(request, empleado.email, comercioId);
    const aceptada = await aceptarInvitacion(request, { email: empleado.email, codigo });
    expect(aceptada.status, JSON.stringify(aceptada.body)).toBe(200);
    return comercioId;
  }

  const editar = (request: APIRequestContext, token: string | undefined, comercioId: number | string, horarios: unknown) =>
    apiConHeaders(request, 'PUT', RUTA, token, conComercio(comercioId), { horarios });
  const perfil = (request: APIRequestContext, token: string, comercioId: number) =>
    apiConHeaders(request, 'GET', '/comercios/perfil', token, conComercio(comercioId));
  const filas = (comercioId: number): number => Number(sql(`SELECT COUNT(*) FROM horario WHERE comercio_id = ${comercioId};`));
  const estadoDe = (comercioId: number, estado: string): string => sql(`UPDATE comercio SET estado = '${estado}' WHERE id = ${comercioId};`);

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    empleado = await registrarYVerificarCliente(request, localidadId);
    empleadoToken = (await login(request, empleado.nombreUsuario, empleado.password)).token;
    const sinRelacion = await registrarYVerificarCliente(request, localidadId);
    sinRelacionToken = (await login(request, sinRelacion.nombreUsuario, sinRelacion.password)).token;
  });

  test('el Dueño edita: lo vigente de hoy no cambia, el cambio queda programado desde mañana y el perfil lo informa aparte', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);

    const respuesta = await editar(request, dueno.token, comercioId, [franja('MARTES', '10:00', '20:00'), franja('MIERCOLES', '10:00', '20:00')]);

    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body.data.rigeDesde).toBe(manana());
    expect(respuesta.body.data.vigentes).toHaveLength(1);
    expect(respuesta.body.data.vigentes[0].diaSemana).toBe(diaDeHoy());
    expect(respuesta.body.data.pendientes).toHaveLength(2);

    const vista = await perfil(request, dueno.token, comercioId);
    expect(vista.body.data.horarios).toHaveLength(1);
    expect(vista.body.data.horariosPendientes).toHaveLength(2);
    expect(vista.body.data.horariosRigenDesde).toBe(manana());
  });

  test('las lecturas vigentes no muestran las filas pendientes: catálogo público, mis comercios y perfil del Empleado', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);
    await editar(request, dueno.token, comercioId, [franja('JUEVES', '08:00', '12:00')]);

    const catalogo = await apiConHeaders(request, 'GET', '/catalogo/comercios', undefined);
    const delCatalogo = catalogo.body.data.find((c: any) => c.id === comercioId);
    expect(delCatalogo.horarios).toHaveLength(1);
    expect(delCatalogo.horarios[0].diaSemana).toBe(diaDeHoy());

    const delEmpleado = await perfil(request, empleadoToken, comercioId);
    expect(delEmpleado.status).toBe(200);
    expect(delEmpleado.body.data.horarios).toHaveLength(1);
    expect(delEmpleado.body.data.horariosPendientes).toHaveLength(1);
    expect(delEmpleado.body.data.horariosRigenDesde).toBe(manana());
  });

  test('una segunda edición el mismo día reemplaza al cambio programado y solo queda una generación pendiente', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);
    await editar(request, dueno.token, comercioId, [franja('MARTES', '10:00', '20:00'), franja('MIERCOLES', '10:00', '20:00')]);

    const segunda = await editar(request, dueno.token, comercioId, [franja('JUEVES', '08:00', '12:00')]);

    expect(segunda.status).toBe(200);
    expect(segunda.body.data.pendientes).toHaveLength(1);
    expect(segunda.body.data.pendientes[0].diaSemana).toBe('JUEVES');
    expect(filas(comercioId)).toBe(2);
  });

  test('una edición igual a lo vigente cancela el cambio programado', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);
    await editar(request, dueno.token, comercioId, [franja('MARTES', '10:00', '20:00')]);

    const cancelada = await editar(request, dueno.token, comercioId, todoElDia());

    expect(cancelada.status).toBe(200);
    expect(cancelada.body.data.pendientes).toHaveLength(0);
    expect(cancelada.body.data.rigeDesde).toBeNull();
    expect(filas(comercioId)).toBe(1);
    expect(sql(`SELECT COUNT(*) FROM horario WHERE comercio_id = ${comercioId} AND vigente_hasta IS NULL;`)).toBe('1');
  });

  test('el Empleado edita y la Actividad del Dueño muestra "Editó los horarios"', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);

    const respuesta = await editar(request, empleadoToken, comercioId, [franja('VIERNES', '09:00', '13:00')]);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);

    const actividad = await apiConHeaders(request, 'GET', '/comercios/equipo/actividad?fuente=EDICION', dueno.token, conComercio(comercioId));
    expect(actividad.status).toBe(200);
    const items = actividad.body.data.items as any[];
    const hecho = items.find((i) => i.accionTexto === 'Editó los horarios');
    expect(hecho, JSON.stringify(items)).toBeTruthy();
    expect(hecho.actorRol).toBe('EMPLEADO');
  });

  test('con el comercio SUSPENDIDO el Empleado recibe 409 COMERCIO_SUSPENDIDO y no se cambia nada; con CERRADO_TEMPORALMENTE puede', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);

    estadoDe(comercioId, 'SUSPENDIDO');
    const bloqueado = await editar(request, empleadoToken, comercioId, [franja('VIERNES', '09:00', '13:00')]);
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.data.codigo).toBe('COMERCIO_SUSPENDIDO');
    expect(filas(comercioId)).toBe(1);

    estadoDe(comercioId, 'CERRADO_TEMPORALMENTE');
    const permitido = await editar(request, empleadoToken, comercioId, [franja('VIERNES', '09:00', '13:00')]);
    expect(permitido.status, JSON.stringify(permitido.body)).toBe(200);

    estadoDe(comercioId, 'SUSPENDIDO');
    const delDueno = await editar(request, dueno.token, comercioId, [franja('SABADO', '09:00', '13:00')]);
    expect(delDueno.status).toBe(200);
  });

  test('sin token 401, Administrador 403, Cliente sin relación 404 con header y 400 sin header', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);
    const cuerpo = [franja('VIERNES', '09:00', '13:00')];

    expect((await editar(request, undefined, comercioId, cuerpo)).status).toBe(401);
    expect((await editar(request, adminToken, comercioId, cuerpo)).status).toBe(403);
    const ajeno = await editar(request, sinRelacionToken, comercioId, cuerpo);
    expect(ajeno.status).toBe(404);
    expect(ajeno.body.data.codigo).toBe('COMERCIO_NO_DISPONIBLE');
    const sinHeader = await apiConHeaders(request, 'PUT', RUTA, sinRelacionToken, {}, { horarios: cuerpo });
    expect(sinHeader.status).toBe(400);
    expect(filas(comercioId)).toBe(1);
  });

  test('un Empleado dado de baja recibe 404 aunque el cuerpo sea inválido', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);
    sql(`UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE comercio_id = ${comercioId};`);

    const respuesta = await editar(request, empleadoToken, comercioId, []);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.data.codigo).toBe('COMERCIO_NO_DISPONIBLE');
  });

  test('lista vacía y cierre igual a la apertura dan 400 con el mensaje de las 24 horas', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);

    const vacia = await editar(request, dueno.token, comercioId, []);
    expect(vacia.status).toBe(400);

    const igual = await editar(request, dueno.token, comercioId, [franja('LUNES', '09:00', '09:00')]);
    expect(igual.status).toBe(400);
    expect(igual.body.mensaje).toContain('no puede ser igual');
    expect(igual.body.mensaje).toContain('00:00 a 23:59');
    expect(filas(comercioId)).toBe(1);
  });

  test('un turno que cruza la medianoche se acepta y se informa con cruzaMedianoche', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);

    const respuesta = await editar(request, dueno.token, comercioId, [franja('VIERNES', '20:00', '02:00'), franja('SABADO', '20:00', '23:59')]);

    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    const pendientes = respuesta.body.data.pendientes as any[];
    expect(pendientes.find((h) => h.diaSemana === 'VIERNES').cruzaMedianoche).toBe(true);
    expect(pendientes.find((h) => h.diaSemana === 'SABADO').cruzaMedianoche).toBe(false);
  });

  test('superposición del mismo día, entre días y con la vuelta de domingo a lunes', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);

    const mismoDia = await editar(request, dueno.token, comercioId, [franja('LUNES', '09:00', '13:00'), franja('LUNES', '12:00', '15:00')]);
    expect(mismoDia.status).toBe(400);
    expect(mismoDia.body.mensaje).toContain('se superpone con este');

    const entreDias = await editar(request, dueno.token, comercioId, [franja('VIERNES', '20:00', '02:00'), franja('SABADO', '01:00', '05:00')]);
    expect(entreDias.status).toBe(400);
    expect(entreDias.body.mensaje).toBe('El turno del viernes de 20:00 a 02:00 se superpone con el del sábado de 01:00 a 05:00');

    const vuelta = await editar(request, dueno.token, comercioId, [franja('DOMINGO', '22:00', '03:00'), franja('LUNES', '02:00', '10:00')]);
    expect(vuelta.status).toBe(400);
    expect(vuelta.body.mensaje).toContain('del domingo');

    const adyacentes = await editar(request, dueno.token, comercioId, [franja('VIERNES', '20:00', '23:59'), franja('SABADO', '00:00', '02:00')]);
    expect(adyacentes.status, JSON.stringify(adyacentes.body)).toBe(200);
  });

  test('la cola de un turno de hoy que cruza rechaza una franja de mañana que se superpone, con el mensaje que nombra el turno', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);
    reemplazarHorarios(comercioId, [franja(diaEnOffset(0), '20:00', '02:00')]);

    const rechazada = await editar(request, dueno.token, comercioId, [franja(diaEnOffset(1), '01:00', '05:00')]);

    expect(rechazada.status).toBe(400);
    expect(rechazada.body.mensaje).toContain('Tu turno de hoy (');
    expect(rechazada.body.mensaje).toContain('a las 02:00');
    expect(rechazada.body.mensaje).toContain('Movela para que empiece después de las 02:00');
    expect(filas(comercioId)).toBe(1);

    const aceptada = await editar(request, dueno.token, comercioId, [franja(diaEnOffset(1), '02:00', '05:00')]);
    expect(aceptada.status, JSON.stringify(aceptada.body)).toBe(200);
  });

  test('el historial de ediciones deja una sola fila por cambio efectivo y ninguna cuando no cambia nada', async ({ request }) => {
    const comercioId = await comercioDelEquipo(request);
    const cuenta = (): number => Number(sql(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ${comercioId} AND entidad_tipo = 'HORARIO';`));

    await editar(request, dueno.token, comercioId, todoElDia());
    expect(cuenta()).toBe(0);
    await editar(request, dueno.token, comercioId, [franja('MARTES', '10:00', '20:00')]);
    expect(cuenta()).toBe(1);
    await editar(request, dueno.token, comercioId, [franja('MARTES', '10:00', '20:00')]);
    expect(cuenta()).toBe(2);
    expect(hoyEnZona()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
