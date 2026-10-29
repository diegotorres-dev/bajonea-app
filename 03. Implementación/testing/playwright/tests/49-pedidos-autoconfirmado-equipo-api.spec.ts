import { test, expect } from './helpers/prueba';
import { haceMinutosEnZona } from './helpers/zona';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiPost,
  apiPut,
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
} from './helpers/backend';
import { atajoEstadoRelacion, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const NOTIFICACIONES = '/notificaciones';
const T30 = 'PEDIDO_AUTOCONFIRMADO_COMERCIO';
const T8 = 'PEDIDO_AUTOCONFIRMADO';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

const haceMinutos = haceMinutosEnZona;

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

test.describe('Aviso T30 de pedido autoconfirmado al equipo (API), bloque A6 de E3', () => {
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
  const correrProceso = (request: APIRequestContext, nombre: string) => apiPost(request, `/test/jobs/pedidos/${nombre}`, {});

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

  const delPedido = (items: Aviso[], pedidoId: number): Aviso[] => items.filter((aviso) => aviso.entidadTipo === 'PEDIDO' && aviso.entidadId === pedidoId);
  const delEquipo = (items: Aviso[], pedidoId: number): Aviso[] =>
    delPedido(items, pedidoId).filter((aviso) => /^El pedido #\d+ se confirmó automáticamente como entregado porque el cliente no respondió en \d+ minutos\.$/.test(aviso.mensaje));

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
    const productoId = await crearProducto(request, dueno.token, { nombre: `Producto A6 ${sufijoUnico()}`, precio: 10000, categoriaId });
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

  async function pedidoEnCamino(request: APIRequestContext, quien: Persona, e: Escenario, minutosEnCamino = 100): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', quien.token);
    await agregarItemCarrito(request, quien.token, e.productoId, 1);
    const pedidoId = await crearPedido(request, quien.token, 'RETIRO');
    await confirmarPagoTest(request, pedidoId, true);
    sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${pedidoId};`);
    sql(
      `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES ` +
        `(${pedidoId}, 'EN_PREPARACION', 'DUENO', ${e.dueno.duenoId}, '${haceMinutos(minutosEnCamino + 20)}'), ` +
        `(${pedidoId}, 'EN_CAMINO', 'DUENO', ${e.dueno.duenoId}, '${haceMinutos(minutosEnCamino)}');`,
    );
    return pedidoId;
  }

  const copias = (usuarioId: number, pedidoId: number, tipo: string): number =>
    Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND tipo = '${tipo}' AND entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId};`));
  const copiasDelTipo = (pedidoId: number, tipo: string): number =>
    Number(sql(`SELECT COUNT(*) FROM notificacion WHERE tipo = '${tipo}' AND entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId};`));
  const estado = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Autoconfirmado A6 ${sufijoUnico()}`);
  });

  test('la autoconfirmación deja una copia por Dueño y Empleado activo con su comercio y el texto con los minutos, y la lectura es individual', async ({ request }) => {
    const e = await escenario(request);
    const comercioId = e.dueno.comercioId;
    const pedidoId = await pedidoEnCamino(request, e.comprador, e);
    const antes: Record<string, number> = {};
    for (const [nombre, token] of [['dueno', e.dueno.token], ['a', e.a.token], ['b', e.b.token]]) {
      antes[nombre] = await sinLeer(request, token, comercioId);
    }

    expect((await correrProceso(request, 'avisar-y-autoconfirmar')).status).toBe(200);

    expect(estado(pedidoId)).toBe('ENTREGADO');
    for (const usuarioId of [e.dueno.duenoId, e.a.id, e.b.id]) {
      expect(copias(usuarioId, pedidoId, T30)).toBe(1);
    }
    expect(copiasDelTipo(pedidoId, T30)).toBe(3);
    expect(copias(e.comprador.id, pedidoId, T30)).toBe(0);
    expect(copias(e.comprador.id, pedidoId, T8)).toBe(1);
    expect(
      Number(sql(`SELECT COUNT(*) FROM notificacion WHERE tipo = '${T30}' AND entidad_id = ${pedidoId} AND comercio_id = ${comercioId} AND canal = 'PUSH' AND leida = 0;`)),
    ).toBe(3);

    for (const [nombre, token] of [['dueno', e.dueno.token], ['a', e.a.token], ['b', e.b.token]]) {
      const items = delEquipo(await avisos(request, token, comercioId), pedidoId);
      expect(items).toHaveLength(1);
      expect(items[0].mensaje).toBe(`El pedido #${pedidoId} se confirmó automáticamente como entregado porque el cliente no respondió en 90 minutos.`);
      expect(await sinLeer(request, token, comercioId)).toBe(antes[nombre] + 1);
    }

    const deA = delEquipo(await avisos(request, e.a.token, comercioId), pedidoId)[0].id;
    expect((await marcarUna(request, e.a.token, deA)).status).toBe(200);
    expect(await sinLeer(request, e.a.token, comercioId)).toBe(antes.a);
    expect(await sinLeer(request, e.b.token, comercioId)).toBe(antes.b + 1);
    expect(await sinLeer(request, e.dueno.token, comercioId)).toBe(antes.dueno + 1);
    expect((await marcarUna(request, e.b.token, deA)).status).toBe(404);
    const todas = await marcarTodas(request, e.b.token, comercioId);
    expect(todas.status).toBe(200);
    expect(todas.body.data).toBe(antes.b + 1);
    expect(await sinLeer(request, e.b.token, comercioId)).toBe(0);
    expect(await sinLeer(request, e.dueno.token, comercioId)).toBe(antes.dueno + 1);
  });

  test('el aviso del Cliente (T8) no cambia: personal, sin comercio, y el comprador no ve el del equipo', async ({ request }) => {
    const e = await escenario(request);
    const pedidoId = await pedidoEnCamino(request, e.comprador, e);

    expect((await correrProceso(request, 'avisar-y-autoconfirmar')).status).toBe(200);

    const delComprador = delPedido(await avisos(request, e.comprador.token), pedidoId);
    expect(delComprador).toHaveLength(1);
    expect(delComprador[0].mensaje).toContain('fue autoconfirmado como entregado');
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE tipo = '${T8}' AND entidad_id = ${pedidoId} AND comercio_id IS NULL;`))).toBe(1);
    const sinHeaderDelDueno = await lista(request, e.dueno.token);
    expect(sinHeaderDelDueno.status).toBe(400);
  });

  test('el Cliente del pedido que es Empleado no recibe el aviso del equipo de su propio pedido pero sí el de comprador', async ({ request }) => {
    const e = await escenario(request);
    const propio = await pedidoEnCamino(request, e.a, e);
    const ajeno = await pedidoEnCamino(request, e.comprador, e);

    expect((await correrProceso(request, 'avisar-y-autoconfirmar')).status).toBe(200);

    expect(copias(e.a.id, propio, T30)).toBe(0);
    expect(copias(e.a.id, propio, T8)).toBe(1);
    expect(copias(e.b.id, propio, T30)).toBe(1);
    expect(copias(e.dueno.duenoId, propio, T30)).toBe(1);
    expect(copias(e.a.id, ajeno, T30)).toBe(1);

    const conComercio = await avisos(request, e.a.token, e.dueno.comercioId);
    expect(delEquipo(conComercio, ajeno)).toHaveLength(1);
    expect(delEquipo(conComercio, propio)).toHaveLength(0);
    expect(delPedido(conComercio, propio)).toHaveLength(0);
    const personales = await avisos(request, e.a.token);
    expect(delPedido(personales, propio)).toHaveLength(1);
    expect(delEquipo(personales, propio)).toHaveLength(0);
    expect(delPedido(personales, ajeno)).toHaveLength(0);
  });

  test('un Empleado desactivado no recibe el aviso y recibe el mismo 404; uno que se suma después no ve el anterior', async ({ request }) => {
    const e = await escenario(request);
    expect((await atajoEstadoRelacion(request, e.dueno.comercioId, e.b.id, 'INACTIVO')).status).toBe(200);
    const pedidoId = await pedidoEnCamino(request, e.comprador, e);

    expect((await correrProceso(request, 'avisar-y-autoconfirmar')).status).toBe(200);

    expect(copias(e.b.id, pedidoId, T30)).toBe(0);
    expect(copias(e.a.id, pedidoId, T30)).toBe(1);
    expect((await lista(request, e.b.token, e.dueno.comercioId)).status).toBe(404);

    const nuevo = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, e.dueno.comercioId, nuevo, e.dueno.token);
    const sesionNuevo = await login(request, nuevo.nombreUsuario, nuevo.password);
    expect(copias(sesionNuevo.usuario.id, pedidoId, T30)).toBe(0);
    expect(await avisos(request, sesionNuevo.token, e.dueno.comercioId)).toHaveLength(0);
    expect(await sinLeer(request, sesionNuevo.token, e.dueno.comercioId)).toBe(0);
  });

  test('cada contexto ve solo los avisos de su comercio', async ({ request }) => {
    const uno = await escenario(request);
    const otro = await escenario(request);
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, uno.dueno.comercioId, cuenta, uno.dueno.token);
    await sumarAlEquipo(request, otro.dueno.comercioId, cuenta, otro.dueno.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    const enUno = await pedidoEnCamino(request, uno.comprador, uno);
    const enOtro = await pedidoEnCamino(request, otro.comprador, otro);

    expect((await correrProceso(request, 'avisar-y-autoconfirmar')).status).toBe(200);

    const deUno = delEquipo(await avisos(request, sesion.token, uno.dueno.comercioId), enUno);
    const deOtro = delEquipo(await avisos(request, sesion.token, otro.dueno.comercioId), enOtro);
    expect(deUno).toHaveLength(1);
    expect(deOtro).toHaveLength(1);
    expect(delPedido(await avisos(request, sesion.token, uno.dueno.comercioId), enOtro)).toHaveLength(0);
    expect(await avisos(request, sesion.token)).toHaveLength(0);
    expect((await lista(request, uno.a.token, otro.dueno.comercioId)).status).toBe(404);
    expect(delPedido(await avisos(request, otro.dueno.token, otro.dueno.comercioId), enUno)).toHaveLength(0);
  });

  test('no se emite antes de los minutos configurados, ni con la confirmación manual del Cliente, ni en el retiro cerrado por la suspensión', async ({ request }) => {
    const e = await escenario(request);
    const temprano = await pedidoEnCamino(request, e.comprador, e, 80);
    const manual = await pedidoEnCamino(request, e.comprador, e);
    expect((await apiPut(request, `/pedidos/cliente/${manual}/entregar`, {}, e.comprador.token)).status).toBe(200);

    await apiConHeaders(request, 'DELETE', '/carrito', e.comprador.token);
    await agregarItemCarrito(request, e.comprador.token, e.productoId, 1);
    const retiro = await crearPedido(request, e.comprador.token, 'RETIRO');
    await confirmarPagoTest(request, retiro, true);
    sql(`UPDATE pedido SET estado = 'LISTO_PARA_RETIRAR' WHERE id = ${retiro};`);
    expect((await apiPut(request, `/test/comercios/${e.dueno.comercioId}/suspension?origen=INDIVIDUAL&minutos=200`, {})).status).toBe(200);
    sql(
      `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES ` +
        `(${retiro}, 'LISTO_PARA_RETIRAR', 'DUENO', ${e.dueno.duenoId}, '${haceMinutos(200)}');`,
    );

    expect((await correrProceso(request, 'avisar-y-autoconfirmar')).status).toBe(200);
    expect((await correrProceso(request, 'autoconfirmar-retiros')).status).toBe(200);

    expect(estado(temprano)).toBe('EN_CAMINO');
    expect(copiasDelTipo(temprano, T30)).toBe(0);
    expect(copiasDelTipo(temprano, 'AVISO_75MIN_SIN_CONFIRMACION')).toBe(1);
    expect(estado(manual)).toBe('ENTREGADO');
    expect(sql(`SELECT fuente_entrega FROM pedido WHERE id = ${manual};`)).toBe('CLIENTE');
    expect(copiasDelTipo(manual, T30)).toBe(0);
    expect(estado(retiro)).toBe('NO_RETIRADO');
    expect(copiasDelTipo(retiro, 'PEDIDO_NO_RETIRADO')).toBe(1);
    expect(copiasDelTipo(retiro, T30)).toBe(0);
  });

  test('autoconfirmación contra confirmación del Cliente: un solo ganador y el aviso del equipo sale solo si ganó el sistema', async ({ request }) => {
    const e = await escenario(request);
    for (let ronda = 0; ronda < 4; ronda += 1) {
      const pedidoId = await pedidoEnCamino(request, e.comprador, e);

      const [proceso, cliente] = await Promise.all([
        correrProceso(request, 'avisar-y-autoconfirmar'),
        apiPut(request, `/pedidos/cliente/${pedidoId}/entregar`, {}, e.comprador.token),
      ]);

      expect(proceso.status).toBe(200);
      expect([200, 409]).toContain(cliente.status);
      expect(estado(pedidoId)).toBe('ENTREGADO');
      expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = 'ENTREGADO';`))).toBe(1);
      const fuente = sql(`SELECT fuente_entrega FROM pedido WHERE id = ${pedidoId};`);
      if (fuente === 'SISTEMA') {
        expect(cliente.status).toBe(409);
        expect(copiasDelTipo(pedidoId, T30)).toBe(3);
        expect(copiasDelTipo(pedidoId, T8)).toBe(1);
      } else {
        expect(fuente).toBe('CLIENTE');
        expect(cliente.status).toBe(200);
        expect(copiasDelTipo(pedidoId, T30)).toBe(0);
        expect(copiasDelTipo(pedidoId, T8)).toBe(0);
      }
    }
  });

  test('repetir el proceso no duplica los avisos', async ({ request }) => {
    const e = await escenario(request);
    const pedidoId = await pedidoEnCamino(request, e.comprador, e);

    for (let i = 0; i < 3; i += 1) {
      expect((await correrProceso(request, 'avisar-y-autoconfirmar')).status).toBe(200);
    }

    expect(copiasDelTipo(pedidoId, T30)).toBe(3);
    expect(copiasDelTipo(pedidoId, T8)).toBe(1);
  });
});
