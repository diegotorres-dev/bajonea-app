import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  clonarComercioTest,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  resolverComercio,
  sqlTest as sql,
  suspenderComercio,
  sufijoUnico,
} from './helpers/backend';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const MOTIVO_RECHAZO = 'Rechazo de prueba del tramo 4';
const MOTIVO_SUSPENSION = 'Suspension de prueba del tramo 4';

interface ComercioDelDueno {
  id: number;
  estado: string;
  operativo: boolean;
}

async function misComercios(request: APIRequestContext, token: string, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'GET', '/comercios/mis-comercios', token, headers);
}

async function contadoresPorComercio(request: APIRequestContext, token: string): Promise<Record<number, number>> {
  const { status, body } = await misComercios(request, token);
  expect(status).toBe(200);
  return Object.fromEntries((body.data as any[]).map((c) => [c.id, c.cantidadNotificacionesNoLeidas]));
}

async function notificaciones(request: APIRequestContext, token: string, comercioId?: number | string) {
  return apiConHeaders(request, 'GET', '/notificaciones', token, comercioId === undefined ? {} : { [HEADER]: String(comercioId) });
}

async function contador(request: APIRequestContext, token: string, comercioId?: number | string) {
  return apiConHeaders(request, 'GET', '/notificaciones/no-leidas/contador', token, comercioId === undefined ? {} : { [HEADER]: String(comercioId) });
}

async function marcarLeidas(request: APIRequestContext, token: string | undefined, comercioId: number | string, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'PUT', `/notificaciones/comercio/${comercioId}/leidas`, token, headers);
}

const idsEnOrdenDeAlta = (duenoId: number): number[] =>
  sql(`SELECT id FROM comercio WHERE dueno_id = ${duenoId} ORDER BY fecha_registro ASC, id ASC;`)
    .split(/\r?\n/)
    .map(Number);

const noLeidasEnBase = (usuarioId: number): number => Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${usuarioId} AND leida = 0;`));

test.describe('Multi-comercio, tramo 4 (API): mis-comercios y notificaciones por comercio', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let clienteToken: string;
  let dueno: Dueno;
  let otroDueno: Dueno;
  let comercioA: number;
  let comercioB: number;
  let comercioC: number;
  let comercioPendiente: number;
  let comercioRechazado: number;
  let comercioSuspendido: number;
  let comercioRechazoDefinitivo: number;
  let comercioCerradoTemporalmente: number;
  let comercioInactivo: number;
  let pedidoDeA: number;
  let pedidosDeB: number[] = [];

  test.beforeAll(async ({ request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const categoriaId = await crearCategoria(request, adminToken, `Categoria Tramo4 ${sufijoUnico()}`);

    dueno = await prepararAprobado(request, adminToken, localidadId);
    comercioA = dueno.comercioId;
    await marcarAptoVenta(request, comercioA);
    otroDueno = await prepararAprobado(request, adminToken, localidadId);

    comercioB = await clonarComercioTest(request, comercioA, `Tramo4 B ${sufijoUnico()}`, 'APTO_VENTA');
    comercioC = await clonarComercioTest(request, comercioA, `Tramo4 C ${sufijoUnico()}`, 'APROBADO');
    comercioPendiente = await clonarComercioTest(request, comercioA, `Tramo4 Pendiente ${sufijoUnico()}`, 'PENDIENTE');
    comercioRechazoDefinitivo = await clonarComercioTest(request, comercioA, `Tramo4 Definitivo ${sufijoUnico()}`, 'RECHAZO_DEFINITIVO');
    comercioCerradoTemporalmente = await clonarComercioTest(request, comercioA, `Tramo4 Cerrado ${sufijoUnico()}`, 'CERRADO_TEMPORALMENTE');
    comercioInactivo = await clonarComercioTest(request, comercioA, `Tramo4 Inactivo ${sufijoUnico()}`, 'INACTIVO');

    comercioRechazado = await clonarComercioTest(request, comercioA, `Tramo4 Rechazado ${sufijoUnico()}`, 'PENDIENTE');
    await resolverComercio(request, adminToken, comercioRechazado, false, MOTIVO_RECHAZO);
    comercioSuspendido = await clonarComercioTest(request, comercioA, `Tramo4 Suspendido ${sufijoUnico()}`, 'APROBADO');
    await suspenderComercio(request, adminToken, comercioSuspendido, MOTIVO_SUSPENSION);

    const productoA = await crearProducto(request, dueno.token, { nombre: `Producto Tramo4 A ${sufijoUnico()}`, precio: 1500, categoriaId });
    const productoBRespuesta = await apiConHeaders(request, 'POST', '/productos', dueno.token, { [HEADER]: String(comercioB) }, {
      nombre: `Producto Tramo4 B ${sufijoUnico()}`,
      precio: 2500,
      categoriaId,
    });
    expect(productoBRespuesta.status).toBe(201);
    const productoB = productoBRespuesta.body.data.id as number;

    const cliente = await registrarYVerificarCliente(request, localidadId);
    clienteToken = (await login(request, cliente.nombreUsuario, cliente.password)).token;
    await agregarItemCarrito(request, clienteToken, productoA, 1);
    pedidoDeA = await crearPedido(request, clienteToken, 'RETIRO');
    await confirmarPagoTest(request, pedidoDeA);
    const aceptado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoDeA}/aceptar`, dueno.token, { [HEADER]: String(comercioA) });
    expect(aceptado.status).toBe(200);
    for (let i = 0; i < 2; i += 1) {
      await agregarItemCarrito(request, clienteToken, productoB, 1);
      const pedido = await crearPedido(request, clienteToken, 'RETIRO');
      await confirmarPagoTest(request, pedido);
      pedidosDeB.push(pedido);
    }
  });

  test.describe('GET /comercios/mis-comercios', () => {
    test('devuelve todos los comercios del Dueño, en cualquier estado, en orden de alta, con su forma', async ({ request }) => {
      const { status, body } = await misComercios(request, dueno.token);
      expect(status).toBe(200);
      const comercios = body.data as any[];

      expect(comercios.map((c) => c.id)).toEqual(idsEnOrdenDeAlta(dueno.duenoId));
      expect(comercios).toHaveLength(9);
      for (const c of comercios) {
        expect(Object.keys(c).sort()).toEqual(['abiertoAhora', 'cantidadNotificacionesNoLeidas', 'cerradoManualmente', 'estado', 'fechaRegistro', 'fotoPerfilUrl', 'id', 'nombre', 'operativo', 'puedeCambiarCierre', 'textoReapertura']);
        expect(typeof c.nombre).toBe('string');
        expect(typeof c.fotoPerfilUrl).toBe('string');
        expect(typeof c.fechaRegistro).toBe('string');
        expect(typeof c.cantidadNotificacionesNoLeidas).toBe('number');
      }
      const estados = new Map<number, ComercioDelDueno>(comercios.map((c) => [c.id, c]));
      expect(estados.get(comercioA)!.estado).toBe('APTO_VENTA');
      expect(estados.get(comercioB)!.estado).toBe('APTO_VENTA');
      expect(estados.get(comercioC)!.estado).toBe('APROBADO');
      expect(estados.get(comercioPendiente)!.estado).toBe('PENDIENTE');
      expect(estados.get(comercioRechazado)!.estado).toBe('RECHAZADO');
      expect(estados.get(comercioSuspendido)!.estado).toBe('SUSPENDIDO');
      expect(estados.get(comercioRechazoDefinitivo)!.estado).toBe('RECHAZO_DEFINITIVO');
      expect(estados.get(comercioCerradoTemporalmente)!.estado).toBe('CERRADO_TEMPORALMENTE');
      expect(estados.get(comercioInactivo)!.estado).toBe('INACTIVO');
    });

    test('operativo es verdadero solo para APROBADO y APTO_VENTA', async ({ request }) => {
      const { body } = await misComercios(request, dueno.token);
      for (const c of body.data as any[]) {
        expect(c.operativo, `${c.id} ${c.estado}`).toBe(c.estado === 'APROBADO' || c.estado === 'APTO_VENTA');
      }
    });

    test('el contador de cada comercio cuenta las no leidas propias y las de sus pedidos, y es 0 si no hay', async ({ request }) => {
      const contadores = await contadoresPorComercio(request, dueno.token);
      expect(contadores[comercioA]).toBe(2);
      expect(contadores[comercioB]).toBe(2);
      expect(contadores[comercioRechazado]).toBe(1);
      expect(contadores[comercioSuspendido]).toBe(1);
      for (const id of [comercioC, comercioPendiente, comercioRechazoDefinitivo, comercioCerradoTemporalmente, comercioInactivo]) {
        expect(contadores[id], `comercio ${id}`).toBe(0);
      }
      expect(Object.values(contadores).reduce((a, b) => a + b, 0)).toBe(noLeidasEnBase(dueno.duenoId));
    });

    test('ignora el header X-Comercio-Id por completo, sea valido, ajeno, inexistente o no numerico', async ({ request }) => {
      const sinHeader = (await misComercios(request, dueno.token)).body.data;
      for (const valor of [String(comercioB), String(otroDueno.comercioId), '99999999', 'abc', '']) {
        const { status, body } = await misComercios(request, dueno.token, { [HEADER]: valor });
        expect(status, `header "${valor}"`).toBe(200);
        expect(body.data).toEqual(sinHeader);
      }
    });

    test('un Dueño no ve los comercios de otro', async ({ request }) => {
      const { status, body } = await misComercios(request, otroDueno.token);
      expect(status).toBe(200);
      expect((body.data as any[]).map((c) => c.id)).toEqual([otroDueno.comercioId]);
      const idsDelDueno = (await misComercios(request, dueno.token)).body.data.map((c: any) => c.id);
      expect(idsDelDueno).not.toContain(otroDueno.comercioId);
    });

    test('sin token da 401 y con token de Cliente o de Administrador da 403', async ({ request }) => {
      expect((await misComercios(request, undefined as unknown as string)).status).toBe(401);
      expect((await misComercios(request, clienteToken)).status).toBe(403);
      expect((await misComercios(request, adminToken)).status).toBe(403);
    });
  });

  test.describe('GET /notificaciones y su contador, por comercio activo', () => {
    test('con el header de un comercio lista solo las suyas, las propias y las de sus pedidos', async ({ request }) => {
      const deA = await notificaciones(request, dueno.token, comercioA);
      expect(deA.status).toBe(200);
      const itemsA = deA.body.data as any[];
      expect(itemsA).toHaveLength(2);
      expect(itemsA.map((n) => `${n.entidadTipo}:${n.entidadId}`).sort()).toEqual([`COMERCIO:${comercioA}`, `PEDIDO:${pedidoDeA}`].sort());

      const deB = await notificaciones(request, dueno.token, comercioB);
      const itemsB = deB.body.data as any[];
      expect(itemsB.map((n) => `${n.entidadTipo}:${n.entidadId}`).sort()).toEqual(pedidosDeB.map((p) => `PEDIDO:${p}`).sort());

      const deR = (await notificaciones(request, dueno.token, comercioRechazado)).body.data as any[];
      expect(deR).toHaveLength(1);
      expect(deR[0].entidadTipo).toBe('COMERCIO');
      expect(deR[0].mensaje).toContain(MOTIVO_RECHAZO);

      const deS = (await notificaciones(request, dueno.token, comercioSuspendido)).body.data as any[];
      expect(deS).toHaveLength(1);
      expect(deS[0].mensaje).toContain(MOTIVO_SUSPENSION);

      expect((await notificaciones(request, dueno.token, comercioC)).body.data).toEqual([]);
    });

    test('las listas de los comercios son disjuntas y juntas son todas las del Dueño con entidad', async ({ request }) => {
      const todas = new Set<number>();
      let total = 0;
      for (const id of [comercioA, comercioB, comercioC, comercioPendiente, comercioRechazado, comercioSuspendido, comercioRechazoDefinitivo, comercioCerradoTemporalmente, comercioInactivo]) {
        for (const n of (await notificaciones(request, dueno.token, id)).body.data as any[]) {
          todas.add(n.id);
          total += 1;
        }
      }
      expect(total).toBe(todas.size);
      expect(total).toBe(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${dueno.duenoId} AND entidad_tipo IS NOT NULL;`)));
    });

    test('sin header, con header vacio o en blanco responde 400 en la lista y en el contador', async ({ request }) => {
      for (const cabeceras of [{}, { [HEADER]: '' }, { [HEADER]: '   ' }]) {
        const lista = await apiConHeaders(request, 'GET', '/notificaciones', dueno.token, cabeceras);
        expect(lista.status, JSON.stringify(cabeceras)).toBe(400);
        expect(lista.body.mensaje).toContain(HEADER);
        const cuenta = await apiConHeaders(request, 'GET', '/notificaciones/no-leidas/contador', dueno.token, cabeceras);
        expect(cuenta.status, JSON.stringify(cabeceras)).toBe(400);
        expect(cuenta.body.mensaje).toContain(HEADER);
      }
    });

    test('el contador por comercio coincide con las no leidas de su lista y con mis-comercios', async ({ request }) => {
      const contadores = await contadoresPorComercio(request, dueno.token);
      for (const id of [comercioA, comercioB, comercioRechazado, comercioSuspendido, comercioC]) {
        const respuesta = await contador(request, dueno.token, id);
        expect(respuesta.status).toBe(200);
        expect(respuesta.body.data, `comercio ${id}`).toBe(contadores[id]);
        const lista = (await notificaciones(request, dueno.token, id)).body.data as any[];
        expect(lista.filter((n) => !n.leida).length, `lista del comercio ${id}`).toBe(contadores[id]);
      }
    });

    test('un header de un comercio ajeno o inexistente da el mismo 404 y uno no numerico da 400', async ({ request }) => {
      for (const ruta of [notificaciones, contador]) {
        const ajeno = await ruta(request, dueno.token, otroDueno.comercioId);
        const inexistente = await ruta(request, dueno.token, 99999999);
        expect(ajeno.status).toBe(404);
        expect(inexistente.status).toBe(404);
        expect(JSON.stringify(ajeno.body)).toBe(JSON.stringify(inexistente.body));
        const noNumerico = await ruta(request, dueno.token, 'abc');
        expect(noNumerico.status).toBe(400);
        expect(noNumerico.body.mensaje).toContain(HEADER);
      }
    });

    test('el Cliente ve todas las suyas e ignora el header, aunque sea invalido, ajeno o inexistente', async ({ request }) => {
      const sinHeader = await notificaciones(request, clienteToken);
      expect(sinHeader.status).toBe(200);
      expect((sinHeader.body.data as any[]).length).toBeGreaterThan(0);
      const contadorSinHeader = (await contador(request, clienteToken)).body.data;
      for (const valor of ['abc', String(comercioA), String(otroDueno.comercioId), '99999999']) {
        const conHeader = await notificaciones(request, clienteToken, valor);
        expect(conHeader.status, `header ${valor}`).toBe(200);
        expect(conHeader.body.data).toEqual(sinHeader.body.data);
        const contadorConHeader = await contador(request, clienteToken, valor);
        expect(contadorConHeader.status).toBe(200);
        expect(contadorConHeader.body.data).toBe(contadorSinHeader);
      }
    });

    test('el Administrador tampoco usa el header', async ({ request }) => {
      const sinHeader = await notificaciones(request, adminToken);
      expect(sinHeader.status).toBe(200);
      expect((await notificaciones(request, adminToken, 'abc')).status).toBe(200);
      expect((await contador(request, adminToken, 99999999)).status).toBe(200);
    });

    test('PUT /notificaciones/{id}/leida sigue igual: marca una y solo una', async ({ request }) => {
      const lista = (await notificaciones(request, dueno.token, comercioC)).body.data as any[];
      expect(lista).toEqual([]);
      const deB = (await notificaciones(request, dueno.token, comercioB)).body.data as any[];
      const respuesta = await apiConHeaders(request, 'PUT', `/notificaciones/${deB[0].id}/leida`, dueno.token, { [HEADER]: 'abc' });
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.leida).toBe(true);
      expect((await contadoresPorComercio(request, dueno.token))[comercioB]).toBe(1);
      const ajena = await apiConHeaders(request, 'PUT', `/notificaciones/${deB[0].id}/leida`, otroDueno.token);
      expect(ajena.status).toBe(404);
    });
  });

  test.describe('PUT /notificaciones/comercio/{id}/leidas', () => {
    test('marca las no leidas del comercio, devuelve cuantas y no toca los otros comercios, ni a otros usuarios', async ({ request }) => {
      const ajenasAntes = noLeidasEnBase(otroDueno.duenoId);
      const clienteAntes = (await contador(request, clienteToken)).body.data;
      const antes = await contadoresPorComercio(request, dueno.token);

      const respuesta = await marcarLeidas(request, dueno.token, comercioB, { [HEADER]: String(comercioA) });
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data).toBe(antes[comercioB]);

      const despues = await contadoresPorComercio(request, dueno.token);
      expect(despues[comercioB]).toBe(0);
      expect(despues[comercioA]).toBe(antes[comercioA]);
      expect(despues[comercioRechazado]).toBe(antes[comercioRechazado]);
      expect(despues[comercioSuspendido]).toBe(antes[comercioSuspendido]);
      expect(noLeidasEnBase(otroDueno.duenoId)).toBe(ajenasAntes);
      expect((await contador(request, clienteToken)).body.data).toBe(clienteAntes);
    });

    test('es idempotente: repetirlo responde 200 y 0, sin error', async ({ request }) => {
      for (let i = 0; i < 2; i += 1) {
        const respuesta = await marcarLeidas(request, dueno.token, comercioB);
        expect(respuesta.status).toBe(200);
        expect(respuesta.body.data).toBe(0);
      }
    });

    test('las notificaciones marcadas siguen listadas, ahora leidas', async ({ request }) => {
      const deB = (await notificaciones(request, dueno.token, comercioB)).body.data as any[];
      expect(deB).toHaveLength(2);
      expect(deB.every((n) => n.leida)).toBe(true);
    });

    test('el comercio de la ruta manda sobre el header: sin header y con un header distinto marcan el mismo comercio', async ({ request }) => {
      const antes = await contadoresPorComercio(request, dueno.token);
      const respuesta = await marcarLeidas(request, dueno.token, comercioA);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data).toBe(antes[comercioA]);
      const despues = await contadoresPorComercio(request, dueno.token);
      expect(despues[comercioA]).toBe(0);
      expect(despues[comercioRechazado]).toBe(antes[comercioRechazado]);
    });

    test('funciona con un comercio que no esta operativo (rechazado, suspendido)', async ({ request }) => {
      for (const id of [comercioRechazado, comercioSuspendido]) {
        const primera = await marcarLeidas(request, dueno.token, id);
        expect(primera.status, `comercio ${id}`).toBe(200);
        expect(primera.body.data).toBe(1);
        const segunda = await marcarLeidas(request, dueno.token, id);
        expect(segunda.status).toBe(200);
        expect(segunda.body.data).toBe(0);
      }
      const contadores = await contadoresPorComercio(request, dueno.token);
      expect(Object.values(contadores).every((n) => n === 0)).toBe(true);
    });

    test('funciona con un comercio sin ninguna notificacion y con uno en cualquier otro estado', async ({ request }) => {
      for (const id of [comercioC, comercioPendiente, comercioRechazoDefinitivo, comercioCerradoTemporalmente, comercioInactivo]) {
        const respuesta = await marcarLeidas(request, dueno.token, id);
        expect(respuesta.status, `comercio ${id}`).toBe(200);
        expect(respuesta.body.data).toBe(0);
      }
    });

    test('un comercio de otro Dueño o inexistente da el mismo 404 y no cambia nada', async ({ request }) => {
      const antesDelOtro = noLeidasEnBase(otroDueno.duenoId);
      const ajeno = await marcarLeidas(request, dueno.token, otroDueno.comercioId);
      const inexistente = await marcarLeidas(request, dueno.token, 99999999);
      expect(ajeno.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(JSON.stringify(ajeno.body)).toBe(JSON.stringify(inexistente.body));
      const alReves = await marcarLeidas(request, otroDueno.token, comercioA);
      expect(alReves.status).toBe(404);
      expect(noLeidasEnBase(otroDueno.duenoId)).toBe(antesDelOtro);
    });

    test('solo el Dueño puede: sin token 401, Cliente y Administrador 403', async ({ request }) => {
      expect((await marcarLeidas(request, undefined, comercioA)).status).toBe(401);
      expect((await marcarLeidas(request, clienteToken, comercioA)).status).toBe(403);
      expect((await marcarLeidas(request, adminToken, comercioA)).status).toBe(403);
    });

    test('las notificaciones sin entidad no pertenecen a ningun comercio y no se tocan', async ({ request }) => {
      sql(
        `INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado) ` +
          `VALUES (${dueno.duenoId}, 'COMERCIO_APROBADO', 'Sin entidad', 0, NOW(), 'PUSH', 'PENDIENTE');`,
      );
      for (const id of [comercioA, comercioB, comercioC]) {
        expect((await marcarLeidas(request, dueno.token, id)).body.data).toBe(0);
      }
      expect(noLeidasEnBase(dueno.duenoId)).toBe(1);
      const contadores = await contadoresPorComercio(request, dueno.token);
      expect(Object.values(contadores).every((n) => n === 0)).toBe(true);
    });

    test('una notificacion nueva despues de marcar vuelve a sumar solo a su comercio', async ({ request }) => {
      const productoRespuesta = await apiConHeaders(request, 'GET', '/productos', dueno.token, { [HEADER]: String(comercioA) });
      expect(productoRespuesta.status).toBe(200);
      const productoA = (productoRespuesta.body.data as any[])[0].id as number;
      await agregarItemCarrito(request, clienteToken, productoA, 1);
      const pedido = await crearPedido(request, clienteToken, 'RETIRO');
      await confirmarPagoTest(request, pedido);

      const contadores = await contadoresPorComercio(request, dueno.token);
      expect(contadores[comercioA]).toBe(1);
      expect(contadores[comercioB]).toBe(0);
      expect((await contador(request, dueno.token, comercioA)).body.data).toBe(1);
      expect((await contador(request, dueno.token, comercioB)).body.data).toBe(0);
    });
  });
});
