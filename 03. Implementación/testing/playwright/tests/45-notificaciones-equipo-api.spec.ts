import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiPost,
  clonarComercioTest,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
  suspenderComercio,
} from './helpers/backend';
import { atajoEstadoRelacion, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const NOTIFICACIONES = '/notificaciones';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

interface Aviso {
  id: number;
  mensaje: string;
  leida: boolean;
  entidadTipo: string | null;
  entidadId: number | null;
}

interface Persona {
  id: number;
  token: string;
  email: string;
  nombre: string;
  nombreUsuario: string;
  password: string;
}

test.describe('Avisos del comercio con fan-out al equipo (API), bloque A4 de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;

  const conComercio = (comercioId?: number): Record<string, string> => (comercioId === undefined ? {} : { [HEADER]: String(comercioId) });
  const lista = async (request: APIRequestContext, token: string, comercioId?: number) =>
    apiConHeaders(request, 'GET', NOTIFICACIONES, token, conComercio(comercioId));
  const contador = async (request: APIRequestContext, token: string, comercioId?: number) =>
    apiConHeaders(request, 'GET', `${NOTIFICACIONES}/no-leidas/contador`, token, conComercio(comercioId));
  const marcarTodas = async (request: APIRequestContext, token: string, comercioId?: number) =>
    apiConHeaders(request, 'PUT', `${NOTIFICACIONES}/leidas`, token, conComercio(comercioId), {});
  const marcarUna = async (request: APIRequestContext, token: string, id: number) =>
    apiConHeaders(request, 'PUT', `${NOTIFICACIONES}/${id}/leida`, token, {}, {});

  async function avisos(request: APIRequestContext, token: string, comercioId?: number): Promise<Aviso[]> {
    const respuesta = await lista(request, token, comercioId);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data as Aviso[];
  }

  async function sinLeer(request: APIRequestContext, token: string, comercioId?: number): Promise<number> {
    const respuesta = await contador(request, token, comercioId);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data as number;
  }

  const delPedido = (items: Aviso[], pedidoId: number, patron: RegExp): Aviso | undefined =>
    items.find((aviso) => aviso.entidadTipo === 'PEDIDO' && aviso.entidadId === pedidoId && patron.test(aviso.mensaje));

  async function persona(request: APIRequestContext): Promise<Persona> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return { id: sesion.usuario.id, token: sesion.token, email: cuenta.email, nombre: cuenta.nombre, nombreUsuario: cuenta.nombreUsuario, password: cuenta.password };
  }

  interface Escenario {
    dueno: Dueno;
    productoId: number;
    a: Persona;
    b: Persona;
    comprador: Persona;
  }

  async function escenario(request: APIRequestContext): Promise<Escenario> {
    const dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    const productoId = await crearProducto(request, dueno.token, { nombre: `Producto A4 ${sufijoUnico()}`, precio: 10000, categoriaId });
    const cuentaA = await registrarYVerificarCliente(request, localidadId);
    const cuentaB = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, cuentaA, dueno.token);
    await sumarAlEquipo(request, dueno.comercioId, cuentaB, dueno.token);
    const sesionA = await login(request, cuentaA.nombreUsuario, cuentaA.password);
    const sesionB = await login(request, cuentaB.nombreUsuario, cuentaB.password);
    return {
      dueno,
      productoId,
      a: { id: sesionA.usuario.id, token: sesionA.token, email: cuentaA.email, nombre: cuentaA.nombre, nombreUsuario: cuentaA.nombreUsuario, password: cuentaA.password },
      b: { id: sesionB.usuario.id, token: sesionB.token, email: cuentaB.email, nombre: cuentaB.nombre, nombreUsuario: cuentaB.nombreUsuario, password: cuentaB.password },
      comprador: await persona(request),
    };
  }

  async function pedidoSinPagar(request: APIRequestContext, quien: Persona, productoId: number): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', quien.token);
    await agregarItemCarrito(request, quien.token, productoId, 1);
    return crearPedido(request, quien.token, 'RETIRO');
  }

  async function pedidoPagado(request: APIRequestContext, quien: Persona, productoId: number): Promise<number> {
    const pedidoId = await pedidoSinPagar(request, quien, productoId);
    await confirmarPagoTest(request, pedidoId, true);
    return pedidoId;
  }

  const copias = (usuarioId: number, pedidoId: number, tipo: string): number =>
    Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND tipo = '${tipo}' AND entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId};`));

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Avisos A4 ${sufijoUnico()}`);
  });

  test('un pedido pagado deja una copia por Dueño y Empleado con su comercio, y la lectura es individual', async ({ request }) => {
    const e = await escenario(request);
    const comercioId = e.dueno.comercioId;

    const pedidoId = await pedidoPagado(request, e.comprador, e.productoId);

    for (const usuarioId of [e.dueno.duenoId, e.a.id, e.b.id]) {
      expect(copias(usuarioId, pedidoId, 'NUEVO_PEDIDO')).toBe(1);
    }
    expect(copias(e.comprador.id, pedidoId, 'NUEVO_PEDIDO')).toBe(0);
    expect(sql(`SELECT COUNT(*) FROM notificacion WHERE tipo = 'NUEVO_PEDIDO' AND entidad_id = ${pedidoId} AND comercio_id = ${comercioId};`)).toBe('3');

    const deA = delPedido(await avisos(request, e.a.token, comercioId), pedidoId, /Nuevo pedido recibido/);
    const deB = delPedido(await avisos(request, e.b.token, comercioId), pedidoId, /Nuevo pedido recibido/);
    expect(deA).toBeDefined();
    expect(deB).toBeDefined();
    expect(deA!.id).not.toBe(deB!.id);
    expect(await sinLeer(request, e.a.token, comercioId)).toBe(1);
    expect(await sinLeer(request, e.b.token, comercioId)).toBe(1);

    expect((await marcarUna(request, e.a.token, deA!.id)).status).toBe(200);
    expect(await sinLeer(request, e.a.token, comercioId)).toBe(0);
    expect(await sinLeer(request, e.b.token, comercioId)).toBe(1);
    expect((await marcarUna(request, e.b.token, deA!.id)).status).toBe(404);

    const todas = await marcarTodas(request, e.b.token, comercioId);
    expect(todas.status).toBe(200);
    expect(todas.body.data).toBe(1);
    expect((await marcarTodas(request, e.b.token, comercioId)).body.data).toBe(0);
    expect(await sinLeer(request, e.b.token, comercioId)).toBe(0);
    expect(await avisos(request, e.b.token, comercioId)).toHaveLength(1);
    const delDueno = delPedido(await avisos(request, e.dueno.token, comercioId), pedidoId, /Nuevo pedido recibido/);
    expect(delDueno).toBeDefined();
    expect(delDueno!.leida).toBe(false);
  });

  test('el Empleado que compra en su comercio no recibe el aviso del equipo de su pedido y no mezcla las dos campanas', async ({ request }) => {
    const e = await escenario(request);
    const comercioId = e.dueno.comercioId;

    const propio = await pedidoPagado(request, e.a, e.productoId);
    expect(copias(e.a.id, propio, 'NUEVO_PEDIDO')).toBe(0);
    expect(copias(e.b.id, propio, 'NUEVO_PEDIDO')).toBe(1);
    expect(copias(e.dueno.duenoId, propio, 'NUEVO_PEDIDO')).toBe(1);

    const ajeno = await pedidoPagado(request, e.comprador, e.productoId);
    expect(copias(e.a.id, ajeno, 'NUEVO_PEDIDO')).toBe(1);

    const aceptar = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${propio}/aceptar`, e.dueno.token, conComercio(comercioId), {});
    expect(aceptar.status, JSON.stringify(aceptar.body)).toBe(200);

    const conElComercio = await avisos(request, e.a.token, comercioId);
    expect(conElComercio).toHaveLength(1);
    expect(conElComercio.some((aviso) => /fue aceptado/.test(aviso.mensaje))).toBe(false);
    const personales = await avisos(request, e.a.token);
    expect(personales).toHaveLength(1);
    expect(personales[0].mensaje).toMatch(/fue aceptado/);
    expect(await sinLeer(request, e.a.token)).toBe(1);
    expect(await sinLeer(request, e.a.token, comercioId)).toBe(1);
  });

  test('quien se suma al equipo ve solo los avisos posteriores a su alta', async ({ request }) => {
    const e = await escenario(request);
    const comercioId = e.dueno.comercioId;
    const anterior = await pedidoPagado(request, e.comprador, e.productoId);

    const cuentaC = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, comercioId, cuentaC, e.dueno.token);
    const c = await login(request, cuentaC.nombreUsuario, cuentaC.password);
    expect(await avisos(request, c.token, comercioId)).toEqual([]);
    expect(await sinLeer(request, c.token, comercioId)).toBe(0);

    const posterior = await pedidoPagado(request, e.comprador, e.productoId);

    const vistos = await avisos(request, c.token, comercioId);
    expect(vistos).toHaveLength(1);
    expect(delPedido(vistos, posterior, /Nuevo pedido recibido/)).toBeDefined();
    expect(delPedido(vistos, anterior, /Nuevo pedido recibido/)).toBeUndefined();
    expect(copias(c.usuario.id, anterior, 'NUEVO_PEDIDO')).toBe(0);
    expect(await avisos(request, e.a.token, comercioId)).toHaveLength(2);
  });

  test('un Empleado desactivado deja de recibir avisos y de ver los del comercio, y al reactivarlo no vuelve a ver los viejos', async ({ request }) => {
    const e = await escenario(request);
    const comercioId = e.dueno.comercioId;
    const primero = await pedidoPagado(request, e.comprador, e.productoId);
    const viejoDeA = delPedido(await avisos(request, e.a.token, comercioId), primero, /Nuevo pedido recibido/)!;

    expect((await atajoEstadoRelacion(request, comercioId, e.a.id, 'INACTIVO')).status).toBe(200);
    const segundo = await pedidoPagado(request, e.comprador, e.productoId);

    expect(copias(e.a.id, segundo, 'NUEVO_PEDIDO')).toBe(0);
    expect(copias(e.b.id, segundo, 'NUEVO_PEDIDO')).toBe(1);
    for (const respuesta of [
      await lista(request, e.a.token, comercioId),
      await contador(request, e.a.token, comercioId),
      await marcarTodas(request, e.a.token, comercioId),
      await marcarUna(request, e.a.token, viejoDeA.id),
    ]) {
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(404);
    }
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${viejoDeA.id};`)).toBe('0');

    await sumarAlEquipo(request, comercioId, { email: e.a.email, nombreUsuario: e.a.nombreUsuario, password: e.a.password } as never, e.dueno.token);
    const reactivada = await login(request, e.a.nombreUsuario, e.a.password);
    expect(await avisos(request, reactivada.token, comercioId)).toEqual([]);
    expect(await sinLeer(request, reactivada.token, comercioId)).toBe(0);
    expect(copias(e.a.id, primero, 'NUEVO_PEDIDO')).toBe(0);

    const tercero = await pedidoPagado(request, e.comprador, e.productoId);
    const vistos = await avisos(request, reactivada.token, comercioId);
    expect(vistos).toHaveLength(1);
    expect(delPedido(vistos, tercero, /Nuevo pedido recibido/)).toBeDefined();
    expect(delPedido(vistos, segundo, /Nuevo pedido recibido/)).toBeUndefined();
  });

  test('los avisos de administración llegan al Dueño y los Empleados reciben solo el aviso corto de la suspensión', async ({ request }) => {
    const e = await escenario(request);
    const segundoComercio = await clonarComercioTest(request, e.dueno.comercioId, `Segundo A4 ${sufijoUnico()}`, 'APTO_VENTA');
    const cuentaC = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, segundoComercio, cuentaC, e.dueno.token);
    const c = await login(request, cuentaC.nombreUsuario, cuentaC.password);

    await suspenderComercio(request, adminToken, segundoComercio, 'Prueba de suspensión de avisos A4');

    const delDueno = await avisos(request, e.dueno.token, segundoComercio);
    expect(delDueno.some((aviso) => aviso.entidadTipo === 'COMERCIO' && /fue suspendido/.test(aviso.mensaje))).toBe(true);
    const delEmpleado = await avisos(request, c.token, segundoComercio);
    const avisosDelComercio = delEmpleado.filter((aviso) => aviso.entidadTipo === 'COMERCIO');
    expect(avisosDelComercio).toHaveLength(1);
    expect(avisosDelComercio[0].mensaje).toContain('Mientras dure no se aceptan pedidos nuevos');
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${c.usuario.id} AND comercio_id IS NOT NULL;`))).toBe(1);
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${c.usuario.id} AND comercio_id = ${segundoComercio} AND tipo = 'COMERCIO_SUSPENDIDO_EQUIPO';`))).toBe(1);
    const primerComercio = await avisos(request, e.dueno.token, e.dueno.comercioId);
    expect(primerComercio.some((aviso) => /fue suspendido/.test(aviso.mensaje))).toBe(false);
  });

  test('un Dueño de varios comercios ve solo los avisos del comercio abierto y el Empleado solo los de los suyos', async ({ request }) => {
    const e = await escenario(request);
    const segundoComercio = await clonarComercioTest(request, e.dueno.comercioId, `Segundo A4 ${sufijoUnico()}`, 'APTO_VENTA');
    const productoSegundo = await apiConHeaders(request, 'POST', '/productos', e.dueno.token, conComercio(segundoComercio), {
      nombre: `Producto segundo A4 ${sufijoUnico()}`,
      precio: 9000,
      categoriaId,
    });
    expect(productoSegundo.status, JSON.stringify(productoSegundo.body)).toBe(201);

    const enPrimero = await pedidoPagado(request, e.comprador, e.productoId);
    const enSegundo = await pedidoPagado(request, e.comprador, productoSegundo.body.data.id as number);

    const primero = (await avisos(request, e.dueno.token, e.dueno.comercioId)).filter((aviso) => aviso.entidadTipo === 'PEDIDO');
    const segundo = (await avisos(request, e.dueno.token, segundoComercio)).filter((aviso) => aviso.entidadTipo === 'PEDIDO');
    expect(primero.map((aviso) => aviso.entidadId)).toEqual([enPrimero]);
    expect(segundo.map((aviso) => aviso.entidadId)).toEqual([enSegundo]);
    expect((await lista(request, e.a.token, segundoComercio)).status).toBe(404);

    const marcadas = await marcarTodas(request, e.dueno.token, segundoComercio);
    expect(marcadas.status).toBe(200);
    expect(await sinLeer(request, e.dueno.token, segundoComercio)).toBe(0);
    expect(await sinLeer(request, e.dueno.token, e.dueno.comercioId)).toBeGreaterThan(0);
  });

  test('un Cliente sin relación recibe 404 con el header de un comercio ajeno, y marcar todas sin header es 400', async ({ request }) => {
    const e = await escenario(request);
    const ajeno = await persona(request);
    await pedidoPagado(request, e.comprador, e.productoId);

    for (const respuesta of [
      await lista(request, ajeno.token, e.dueno.comercioId),
      await contador(request, ajeno.token, e.dueno.comercioId),
      await marcarTodas(request, ajeno.token, e.dueno.comercioId),
    ]) {
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(404);
      expect(respuesta.body.data.codigo).toBe('COMERCIO_NO_DISPONIBLE');
    }
    expect((await marcarTodas(request, ajeno.token)).status).toBe(400);
    expect((await marcarTodas(request, e.a.token)).status).toBe(400);
    expect((await apiConHeaders(request, 'PUT', `${NOTIFICACIONES}/leidas`, e.dueno.token, { [HEADER]: '' }, {})).status).toBe(400);
    expect((await apiConHeaders(request, 'PUT', `${NOTIFICACIONES}/leidas`, undefined, conComercio(e.dueno.comercioId), {})).status).toBe(401);
    expect((await marcarTodas(request, adminToken, e.dueno.comercioId)).status).toBe(404);
    expect(await avisos(request, ajeno.token)).toEqual([]);
    expect(await sinLeer(request, ajeno.token)).toBe(0);
  });

  test('la cancelación del Cliente y la expiración avisan a todo el equipo, y el Cliente recibe el suyo sin comercio', async ({ request }) => {
    const e = await escenario(request);
    const comercioId = e.dueno.comercioId;
    const aCancelar = await pedidoPagado(request, e.comprador, e.productoId);
    const cancelacion = await apiConHeaders(request, 'PUT', `/pedidos/cliente/${aCancelar}/cancelar`, e.comprador.token, {}, {});
    expect(cancelacion.status, JSON.stringify(cancelacion.body)).toBe(200);
    const aExpirar = await pedidoPagado(request, e.comprador, e.productoId);
    sql(
      `UPDATE historial_estado_pedido SET fecha_hora = DATE_SUB(fecha_hora, INTERVAL 40 MINUTE) ` +
        `WHERE pedido_id = ${aExpirar} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`,
    );
    expect((await apiPost(request, '/test/jobs/pedidos/expirar-sin-respuesta', {})).status).toBe(200);

    for (const token of [e.dueno.token, e.a.token, e.b.token]) {
      const vistos = await avisos(request, token, comercioId);
      expect(delPedido(vistos, aCancelar, /cancel/)).toBeDefined();
      expect(delPedido(vistos, aExpirar, /expir/)).toBeDefined();
    }
    const personales = await avisos(request, e.comprador.token);
    expect(delPedido(personales, aCancelar, /./)).toBeUndefined();
    expect(delPedido(personales, aExpirar, /no respondió/)).toBeDefined();
    expect(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${e.comprador.id} AND tipo = 'PEDIDO_EXPIRADO_CLIENTE' AND comercio_id IS NULL;`)).toBe('1');
  });

  test('el listado de comercios del Empleado trae su contador real de avisos sin leer', async ({ request }) => {
    const e = await escenario(request);
    await pedidoPagado(request, e.comprador, e.productoId);
    await pedidoPagado(request, e.comprador, e.productoId);

    const antes = await apiConHeaders(request, 'GET', '/empleados/mis-comercios', e.a.token);
    expect(antes.status).toBe(200);
    expect(antes.body.data).toHaveLength(1);
    expect(antes.body.data[0].cantidadNotificacionesNoLeidas).toBe(2);

    await marcarTodas(request, e.a.token, e.dueno.comercioId);
    const despues = await apiConHeaders(request, 'GET', '/empleados/mis-comercios', e.a.token);
    expect(despues.body.data[0].cantidadNotificacionesNoLeidas).toBe(0);
    const delDueno = await apiConHeaders(request, 'GET', '/comercios/mis-comercios', e.dueno.token);
    expect(delDueno.body.data[0].cantidadNotificacionesNoLeidas).toBeGreaterThanOrEqual(2);
  });

  test('un Empleado no puede marcar el aviso de otra persona', async ({ request }) => {
    const e = await escenario(request);
    const pedidoId = await pedidoPagado(request, e.comprador, e.productoId);
    const deDueno = delPedido(await avisos(request, e.dueno.token, e.dueno.comercioId), pedidoId, /Nuevo pedido recibido/)!;

    expect((await marcarUna(request, e.a.token, deDueno.id)).status).toBe(404);
    expect((await marcarUna(request, e.a.token, 99999999)).status).toBe(404);
    expect((await avisos(request, e.dueno.token, e.dueno.comercioId)).find((aviso) => aviso.id === deDueno.id)!.leida).toBe(false);
  });
});
