import { test, expect } from '@playwright/test';
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
  suspenderComercio,
} from './helpers/backend';
import type { ClienteRegistrado } from './helpers/backend';
import { sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

function haceMinutos(minutos: number): string {
  const momento = new Date(Date.now() - minutos * 60_000);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${momento.getFullYear()}-${dos(momento.getMonth() + 1)}-${dos(momento.getDate())} ${dos(momento.getHours())}:${dos(momento.getMinutes())}:${dos(momento.getSeconds())}`;
}

interface Item {
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

test.describe('Actividad del comercio con todo lo que le pasa a sus pedidos (API), bloque A2b de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let otroDueno: Dueno;
  let productoId: number;
  let otroProductoId: number;
  let comprador: ClienteRegistrado;
  let compradorId: number;
  let compradorToken: string;
  let empleado: ClienteRegistrado;
  let empleadoId: number;
  let empleadoToken: string;

  const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
  const operar = (request: APIRequestContext, token: string, comercioId: number, ruta: string) =>
    apiConHeaders(request, 'PUT', ruta, token, conComercio(comercioId), {});
  const correrProceso = (request: APIRequestContext, nombre: string) => apiPost(request, `/test/jobs/pedidos/${nombre}`, {});
  const estadoPedido = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);

  async function actividad(request: APIRequestContext, consulta = 'limite=100', token = dueno.token, comercioId = dueno.comercioId) {
    return apiConHeaders(request, 'GET', `/comercios/equipo/actividad?${consulta}`, token, conComercio(comercioId));
  }

  async function todaLaActividad(request: APIRequestContext): Promise<Item[]> {
    const respuesta = await actividad(request);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data.items as Item[];
  }

  async function delPedido(request: APIRequestContext, pedidoId: number): Promise<Item[]> {
    return (await todaLaActividad(request)).filter((item) => item.entidadTipo === 'PEDIDO' && item.entidadId === pedidoId);
  }

  async function pedidoSinPagar(request: APIRequestContext, producto = productoId): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', compradorToken);
    await agregarItemCarrito(request, compradorToken, producto, 1);
    return crearPedido(request, compradorToken, 'RETIRO');
  }

  async function pedidoPagado(request: APIRequestContext, producto = productoId): Promise<number> {
    const pedidoId = await pedidoSinPagar(request, producto);
    await confirmarPagoTest(request, pedidoId, true);
    return pedidoId;
  }

  function ponerEnCamino(pedidoId: number, duenoId: number): void {
    sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${pedidoId};`);
    sql(
      `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) ` +
        `VALUES (${pedidoId}, 'EN_CAMINO', 'DUENO', ${duenoId}, '${haceMinutos(100)}');`,
    );
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Actividad A2b ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    otroDueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto A2b ${sufijoUnico()}`, precio: 10000, categoriaId });
    otroProductoId = await crearProducto(request, otroDueno.token, { nombre: `Otro producto A2b ${sufijoUnico()}`, precio: 9000, categoriaId });

    comprador = await registrarYVerificarCliente(request, localidadId);
    const sesionComprador = await login(request, comprador.nombreUsuario, comprador.password);
    compradorToken = sesionComprador.token;
    compradorId = sesionComprador.usuario.id;

    empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, empleado, dueno.token);
    const sesionEmpleado = await login(request, empleado.nombreUsuario, empleado.password);
    empleadoToken = sesionEmpleado.token;
    empleadoId = sesionEmpleado.usuario.id;
  });

  test('un pedido sin pagar no aparece y al pagarlo aparece "Pedido recibido" del sistema, sin nombre ni usuario', async ({ request }) => {
    const pedidoId = await pedidoSinPagar(request);
    expect(await delPedido(request, pedidoId)).toEqual([]);
    expect(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = 'PENDIENTE_PAGO';`)).toBe('1');

    await confirmarPagoTest(request, pedidoId, true);

    const items = await delPedido(request, pedidoId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      fuente: 'PEDIDO',
      accion: 'PENDIENTE_CONFIRMACION_COMERCIO',
      accionTexto: 'Pedido recibido',
      actorRol: 'SISTEMA',
      actorRolTexto: 'Sistema',
      actorNombre: null,
      actorUsuarioId: null,
      entidadTipo: 'PEDIDO',
      entidadNombre: `Pedido #${pedidoId}`,
    });
  });

  test('el ciclo completo de un pedido aparece en orden, con el nombre y el rol de cada actor', async ({ request }) => {
    const pedidoId = await pedidoPagado(request);

    expect((await operar(request, empleadoToken, dueno.comercioId, `/pedidos/comercio/${pedidoId}/aceptar`)).status).toBe(200);
    expect((await operar(request, dueno.token, dueno.comercioId, `/pedidos/comercio/${pedidoId}/despachar`)).status).toBe(200);
    expect((await operar(request, empleadoToken, dueno.comercioId, `/pedidos/comercio/${pedidoId}/entregar`)).status).toBe(200);

    const items = await delPedido(request, pedidoId);
    expect(items.map((item) => item.accionTexto)).toEqual([
      'Marcó un pedido como entregado',
      'Dejó un pedido listo para retirar',
      'Aceptó un pedido',
      'Pedido recibido',
    ]);
    expect(items.map((item) => item.actorRol)).toEqual(['EMPLEADO', 'DUENO', 'EMPLEADO', 'SISTEMA']);
    expect(items[0].actorNombre).toBe(`${empleado.nombre} ${empleado.apellido}`);
    expect(items[0].actorUsuarioId).toBe(empleadoId);
    expect(items[1].actorUsuarioId).toBe(dueno.duenoId);
    expect(items[3].actorNombre).toBeNull();
  });

  test('el Cliente que cancela aparece con su nombre completo y el rol Cliente', async ({ request }) => {
    const pedidoId = await pedidoPagado(request);

    const cancelacion = await apiPut(request, `/pedidos/cliente/${pedidoId}/cancelar`, {}, compradorToken);
    expect(cancelacion.status).toBe(200);

    const [ultimo] = await delPedido(request, pedidoId);
    expect(ultimo).toMatchObject({
      accion: 'CANCELADO',
      accionTexto: 'Canceló un pedido',
      actorRol: 'CLIENTE',
      actorRolTexto: 'Cliente',
      actorNombre: `${comprador.nombre} ${comprador.apellido}`,
      actorUsuarioId: compradorId,
    });
  });

  test('el Cliente que confirma la recepción aparece, y la autoconfirmación del sistema también, sin nombre', async ({ request }) => {
    const delCliente = await pedidoPagado(request);
    ponerEnCamino(delCliente, dueno.duenoId);
    expect((await apiPut(request, `/pedidos/cliente/${delCliente}/entregar`, {}, compradorToken)).status).toBe(200);
    const [recepcion] = await delPedido(request, delCliente);
    expect(recepcion).toMatchObject({ accionTexto: 'Confirmó la recepción de un pedido', actorRol: 'CLIENTE', actorUsuarioId: compradorId });

    const delSistema = await pedidoPagado(request);
    ponerEnCamino(delSistema, dueno.duenoId);
    expect((await correrProceso(request, 'avisar-y-autoconfirmar')).status).toBe(200);
    expect(estadoPedido(delSistema)).toBe('ENTREGADO');
    const [auto] = await delPedido(request, delSistema);
    expect(auto).toMatchObject({
      accionTexto: 'Confirmó automáticamente la entrega de un pedido',
      actorRol: 'SISTEMA',
      actorNombre: null,
      actorUsuarioId: null,
    });
  });

  test('el pedido que vence sin respuesta del comercio aparece como una acción del sistema', async ({ request }) => {
    const pedidoId = await pedidoPagado(request);
    sql(`UPDATE historial_estado_pedido SET fecha_hora = '${haceMinutos(45)}' WHERE pedido_id = ${pedidoId} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`);

    expect((await correrProceso(request, 'expirar-sin-respuesta')).status).toBe(200);

    expect(estadoPedido(pedidoId)).toBe('EXPIRADO');
    const items = await delPedido(request, pedidoId);
    expect(items.map((item) => item.accionTexto)).toEqual(['Venció un pedido sin respuesta del comercio', 'Pedido recibido']);
    expect(items[0]).toMatchObject({ actorRol: 'SISTEMA', actorNombre: null, actorUsuarioId: null });
  });

  test('el pedido que vence por falta de pago no aparece: el comercio nunca lo vio', async ({ request }) => {
    const pedidoId = await pedidoSinPagar(request);
    sql(`UPDATE pedido SET fecha_creacion = '${haceMinutos(45)}' WHERE id = ${pedidoId};`);

    expect((await correrProceso(request, 'expirar-pagos')).status).toBe(200);

    expect(estadoPedido(pedidoId)).toBe('CANCELADO_POR_SISTEMA');
    expect(sql(`SELECT motivo_timeout FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = 'CANCELADO_POR_SISTEMA';`)).toBe('TIMEOUT_PAGO');
    expect(await delPedido(request, pedidoId)).toEqual([]);
  });

  test('la cancelación por suspensión del comercio aparece como una acción del sistema y un pedido de otro comercio no aparece', async ({ request }) => {
    const pedidoId = await pedidoPagado(request, otroProductoId);
    expect((await operar(request, otroDueno.token, otroDueno.comercioId, `/pedidos/comercio/${pedidoId}/aceptar`)).status).toBe(200);
    await suspenderComercio(request, adminToken, otroDueno.comercioId, 'Prueba de la actividad A2b');
    expect(estadoPedido(pedidoId)).toBe('CANCELADO_POR_SISTEMA');

    const delOtro = await actividad(request, 'limite=100', otroDueno.token, otroDueno.comercioId);
    expect(delOtro.status).toBe(200);
    const items = (delOtro.body.data.items as Item[]).filter((item) => item.entidadTipo === 'PEDIDO' && item.entidadId === pedidoId);
    expect(items[0]).toMatchObject({
      accionTexto: 'Canceló un pedido por la suspensión del comercio',
      actorRol: 'SISTEMA',
      actorNombre: null,
    });
    expect(await delPedido(request, pedidoId)).toEqual([]);
  });

  test('la lista queda en orden cronológico descendente y la paginación por cursor entrega cada línea una sola vez', async ({ request }) => {
    const completa = await todaLaActividad(request);
    expect(completa.length).toBeGreaterThanOrEqual(15);
    for (let i = 1; i < completa.length; i += 1) {
      expect(new Date(completa[i - 1].fechaHora).getTime() >= new Date(completa[i].fechaHora).getTime(), `${completa[i - 1].fechaHora} vs ${completa[i].fechaHora}`).toBe(true);
    }
    expect(new Set(completa.map((item) => item.id)).size).toBe(completa.length);

    const recorridas: string[] = [];
    let cursor: string | null = null;
    for (let paginas = 0; paginas < 100; paginas += 1) {
      const respuesta = await actividad(request, `limite=4${cursor ? `&cursor=${cursor}` : ''}`);
      expect(respuesta.status).toBe(200);
      (respuesta.body.data.items as Item[]).forEach((item) => recorridas.push(item.id));
      cursor = respuesta.body.data.siguienteCursor;
      if (!respuesta.body.data.hayMas) break;
    }
    expect(recorridas).toEqual(completa.map((item) => item.id));
  });

  test('las acciones de pedidos y las de otras fuentes se ordenan juntas por la hora real', async ({ request }) => {
    const antes = Date.now();
    const edicion = await apiConHeaders(request, 'POST', '/productos', dueno.token, conComercio(dueno.comercioId), {
      nombre: `Producto orden A2b ${sufijoUnico()}`,
      precio: 1500,
      categoriaId,
    });
    expect(edicion.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const pedidoId = await pedidoPagado(request);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const cierre = await apiConHeaders(request, 'PUT', '/comercios/cerrar', dueno.token, conComercio(dueno.comercioId), {});
    expect(cierre.status, JSON.stringify(cierre.body)).toBe(200);
    const despues = Date.now();

    const items = await todaLaActividad(request);
    const posicion = (predicado: (item: Item) => boolean) => items.findIndex(predicado);
    const iCierre = posicion((item) => item.fuente === 'CIERRE' && item.accion === 'CERRADO');
    const iPedido = posicion((item) => item.entidadId === pedidoId && item.accion === 'PENDIENTE_CONFIRMACION_COMERCIO');
    const iEdicion = posicion((item) => item.fuente === 'EDICION' && item.accion === 'CREAR');
    expect(iCierre).toBeGreaterThanOrEqual(0);
    expect(iCierre).toBeLessThan(iPedido);
    expect(iPedido).toBeLessThan(iEdicion);
    for (const indice of [iCierre, iPedido, iEdicion]) {
      const momento = new Date(items[indice].fechaHora).getTime();
      expect(momento, items[indice].fechaHora).toBeGreaterThanOrEqual(antes - 5000);
      expect(momento, items[indice].fechaHora).toBeLessThanOrEqual(despues + 5000);
    }
    await apiConHeaders(request, 'PUT', '/comercios/abrir', dueno.token, conComercio(dueno.comercioId), {});
  });

  test('el Empleado y el Cliente siguen sin ver la actividad', async ({ request }) => {
    const comoEmpleado = await actividad(request, 'limite=10', empleadoToken);
    expect(comoEmpleado.status).toBe(403);
    const comoCliente = await apiConHeaders(request, 'GET', '/comercios/equipo/actividad', compradorToken, conComercio(dueno.comercioId));
    expect(comoCliente.status).toBe(403);
    const sinToken = await apiConHeaders(request, 'GET', '/comercios/equipo/actividad', undefined, conComercio(dueno.comercioId));
    expect(sinToken.status).toBe(401);
  });
});
