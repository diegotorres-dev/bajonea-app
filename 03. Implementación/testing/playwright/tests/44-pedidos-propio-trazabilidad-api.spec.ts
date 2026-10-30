import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
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
import type { ClienteRegistrado } from './helpers/backend';
import { atajoEstadoRelacion, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const MENSAJE_PROPIO = 'No podés gestionar tus propios pedidos';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const CAMPOS_PASO = ['accionTexto', 'actorNombre', 'actorRol', 'actorRolTexto', 'estado', 'fechaHora', 'motivo'];
const CAMPOS_EMPLEADO = [
  'canceladoPor', 'cargoServicioCliente', 'comentarioRechazo', 'comercioId', 'detalles', 'direccion', 'esPedidoPropio', 'estado', 'fechaCreacion', 'fechaEntrega',
  'fechaPagoAprobado', 'fuenteEntrega', 'id', 'limiteResolucionSuspension', 'motivoAnulacion', 'motivoRechazo', 'noRetiradoDisponibleDesde', 'noRetiradoMinutosRestantes', 'nombreCliente', 'reembolsoEstado', 'reembolsoMonto',
  'subtotal', 'tipoEntrega', 'total',
];

interface Cuenta {
  registro: ClienteRegistrado;
  id: number;
  token: string;
}

test.describe('Pedido propio y trazabilidad del pedido (API), bloque A3 de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let otroDueno: Dueno;
  let productoId: number;
  let otroProductoId: number;
  let comprador: Cuenta;
  let elena: Cuenta;
  let fabiana: Cuenta;
  let ajeno: Cuenta;

  const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
  const accion = (request: APIRequestContext, token: string, pedidoId: number, ruta: string, cuerpo: object = {}, comercioId = dueno.comercioId) =>
    apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${ruta}`, token, conComercio(comercioId), cuerpo);
  const trazabilidad = (request: APIRequestContext, token: string, pedidoId: number, comercioId: number | null = dueno.comercioId) =>
    apiConHeaders(request, 'GET', `/pedidos/comercio/${pedidoId}/trazabilidad`, token, comercioId === null ? {} : conComercio(comercioId));
  const estadoDe = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
  const historialDe = (pedidoId: number): number => Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId};`));

  async function nuevaCuenta(request: APIRequestContext): Promise<Cuenta> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { registro, id: sesion.usuario.id, token: sesion.token };
  }

  async function pedidoPagado(request: APIRequestContext, quien: Cuenta, producto = productoId): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', quien.token);
    await agregarItemCarrito(request, quien.token, producto, 1);
    const pedidoId = await crearPedido(request, quien.token, 'RETIRO');
    await confirmarPagoTest(request, pedidoId, true);
    return pedidoId;
  }

  function reiniciarEn(pedidoId: number, estado: string): void {
    sql(`UPDATE pedido SET estado = '${estado}' WHERE id = ${pedidoId};`);
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Pedido Propio ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    otroDueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto A3 ${sufijoUnico()}`, precio: 10000, categoriaId });
    otroProductoId = await crearProducto(request, otroDueno.token, { nombre: `Otro producto A3 ${sufijoUnico()}`, precio: 9000, categoriaId });
    comprador = await nuevaCuenta(request);
    elena = await nuevaCuenta(request);
    fabiana = await nuevaCuenta(request);
    ajeno = await nuevaCuenta(request);
    await sumarAlEquipo(request, dueno.comercioId, elena.registro, dueno.token);
    await sumarAlEquipo(request, dueno.comercioId, fabiana.registro, dueno.token);
    elena.token = (await login(request, elena.registro.nombreUsuario, elena.registro.password)).token;
    fabiana.token = (await login(request, fabiana.registro.nombreUsuario, fabiana.registro.password)).token;
  });

  test('las cinco acciones sobre un pedido propio dan 409 PEDIDO_PROPIO y no cambian nada', async ({ request }) => {
    const pedidoId = await pedidoPagado(request, elena);
    const historialAntes = historialDe(pedidoId);

    for (const [ruta, estado] of [
      ['aceptar', 'PENDIENTE_CONFIRMACION_COMERCIO'],
      ['rechazar', 'PENDIENTE_CONFIRMACION_COMERCIO'],
      ['despachar', 'EN_PREPARACION'],
      ['entregar', 'LISTO_PARA_RETIRAR'],
      ['anular', 'EN_PREPARACION'],
    ]) {
      reiniciarEn(pedidoId, estado);
      const respuesta = await accion(request, elena.token, pedidoId, ruta, { motivo: 'SIN_STOCK' });
      expect(respuesta.status, `${ruta}: ${JSON.stringify(respuesta.body)}`).toBe(409);
      expect(respuesta.body.data.codigo).toBe('PEDIDO_PROPIO');
      expect(respuesta.body.mensaje).toBe(MENSAJE_PROPIO);
      expect(estadoDe(pedidoId)).toBe(estado);
    }
    expect(historialDe(pedidoId)).toBe(historialAntes);
  });

  test('el pedido propio da PEDIDO_PROPIO aunque el estado no corresponda, y la trazabilidad también', async ({ request }) => {
    const pedidoId = await pedidoPagado(request, elena);
    reiniciarEn(pedidoId, 'ENTREGADO');

    for (const ruta of ['aceptar', 'rechazar', 'despachar', 'entregar', 'anular']) {
      const respuesta = await accion(request, elena.token, pedidoId, ruta, { motivo: 'SIN_STOCK' });
      expect(respuesta.status, ruta).toBe(409);
      expect(respuesta.body.data.codigo, ruta).toBe('PEDIDO_PROPIO');
    }
    const traza = await trazabilidad(request, elena.token, pedidoId);
    expect(traza.status).toBe(409);
    expect(traza.body.data.codigo).toBe('PEDIDO_PROPIO');
    expect(traza.body.mensaje).toBe(MENSAJE_PROPIO);
    expect((await trazabilidad(request, fabiana.token, pedidoId)).status).toBe(200);
    expect((await trazabilidad(request, dueno.token, pedidoId)).status).toBe(200);
  });

  test('la misma persona puede actuar sobre un pedido ajeno en las cinco acciones y recibe la marca en false', async ({ request }) => {
    for (const [ruta, estado, destino] of [
      ['aceptar', 'PENDIENTE_CONFIRMACION_COMERCIO', 'EN_PREPARACION'],
      ['rechazar', 'PENDIENTE_CONFIRMACION_COMERCIO', 'RECHAZADO'],
      ['despachar', 'EN_PREPARACION', 'LISTO_PARA_RETIRAR'],
      ['entregar', 'LISTO_PARA_RETIRAR', 'ENTREGADO'],
      ['anular', 'EN_PREPARACION', 'ANULADO'],
    ]) {
      const pedidoId = await pedidoPagado(request, comprador);
      reiniciarEn(pedidoId, estado);
      const respuesta = await accion(request, elena.token, pedidoId, ruta, { motivo: 'SIN_STOCK' });
      expect(respuesta.status, `${ruta}: ${JSON.stringify(respuesta.body)}`).toBe(200);
      expect(respuesta.body.data.estado).toBe(destino);
      expect(respuesta.body.data.esPedidoPropio).toBe(false);
      expect(Object.keys(respuesta.body.data).sort()).toEqual(CAMPOS_EMPLEADO);
    }
  });

  test('el Dueño y otro Empleado actúan sobre el pedido de Elena sin restricción, y el Dueño no recibe la marca', async ({ request }) => {
    const pedidoId = await pedidoPagado(request, elena);

    const aceptado = await accion(request, dueno.token, pedidoId, 'aceptar');
    expect(aceptado.status).toBe(200);
    expect(aceptado.body.data).not.toHaveProperty('esPedidoPropio');
    expect(aceptado.body.data).toHaveProperty('clienteId');
    const despachado = await accion(request, fabiana.token, pedidoId, 'despachar');
    expect(despachado.status).toBe(200);
    expect(despachado.body.data.esPedidoPropio).toBe(false);
    expect((await accion(request, elena.token, pedidoId, 'entregar')).status).toBe(409);
    expect((await accion(request, dueno.token, pedidoId, 'entregar')).status).toBe(200);
    expect(estadoDe(pedidoId)).toBe('ENTREGADO');
  });

  test('un pedido aceptado por una Empleada lo despacha y entrega otra persona del equipo', async ({ request }) => {
    const pedidoId = await pedidoPagado(request, comprador);

    expect((await accion(request, elena.token, pedidoId, 'aceptar')).status).toBe(200);
    expect((await accion(request, fabiana.token, pedidoId, 'despachar')).status).toBe(200);
    expect((await accion(request, dueno.token, pedidoId, 'entregar')).status).toBe(200);

    const actores = sql(
      `SELECT GROUP_CONCAT(CONCAT(actor_rol, ':', actor_usuario_id) ORDER BY id SEPARATOR ',') FROM historial_estado_pedido ` +
        `WHERE pedido_id = ${pedidoId} AND actor_usuario_id IS NOT NULL;`,
    );
    expect(actores).toBe(`CLIENTE:${comprador.id},EMPLEADO:${elena.id},EMPLEADO:${fabiana.id},DUENO:${dueno.duenoId}`);
  });

  test('la lista marca solo el pedido de quien consulta; el Dueño y el Cliente no reciben la marca', async ({ request }) => {
    const propio = await pedidoPagado(request, elena);
    const delCliente = await pedidoPagado(request, comprador);

    const deElena = await apiConHeaders(request, 'GET', '/pedidos/comercio', elena.token, conComercio(dueno.comercioId));
    const deFabiana = await apiConHeaders(request, 'GET', '/pedidos/comercio', fabiana.token, conComercio(dueno.comercioId));
    const delDueno = await apiConHeaders(request, 'GET', '/pedidos/comercio', dueno.token, conComercio(dueno.comercioId));
    const delComprador = await apiConHeaders(request, 'GET', '/pedidos/cliente', comprador.token);

    const deElenaComoCliente = new Set(
      sql(`SELECT id FROM pedido WHERE cliente_id = ${elena.id} AND comercio_id = ${dueno.comercioId};`).split('\n').map(Number),
    );
    expect(deElenaComoCliente.has(propio)).toBe(true);
    expect(deElenaComoCliente.has(delCliente)).toBe(false);
    for (const pedido of deElena.body.data) {
      expect(pedido.esPedidoPropio, `pedido ${pedido.id}`).toBe(deElenaComoCliente.has(pedido.id));
      expect(Object.keys(pedido).sort()).toEqual(CAMPOS_EMPLEADO);
      for (const excluido of ['clienteId', 'pagoEstado', 'cargoServicioComercio']) {
        expect(pedido).not.toHaveProperty(excluido);
      }
    }
    expect(deElena.body.data.map((p: { id: number }) => p.id)).toEqual(expect.arrayContaining([propio, delCliente]));
    for (const pedido of deFabiana.body.data) {
      expect(pedido.esPedidoPropio).toBe(false);
    }
    for (const pedido of delDueno.body.data) {
      expect(pedido).not.toHaveProperty('esPedidoPropio');
    }
    for (const pedido of delComprador.body.data) {
      expect(pedido).not.toHaveProperty('esPedidoPropio');
    }
  });

  test('la trazabilidad muestra el recorrido con actores, hora, texto y motivo, y nada más', async ({ request }) => {
    const pedidoId = await pedidoPagado(request, comprador);
    expect((await accion(request, elena.token, pedidoId, 'aceptar')).status).toBe(200);
    const anulado = await accion(request, dueno.token, pedidoId, 'anular', { motivo: 'OTRO', comentario: 'Se acabó la masa' });
    expect(anulado.status).toBe(200);

    const respuesta = await trazabilidad(request, fabiana.token, pedidoId);
    expect(respuesta.status).toBe(200);
    const pasos = respuesta.body.data.pasos;

    expect(respuesta.body.data.pedidoId).toBe(pedidoId);
    expect(pasos.map((p: { accionTexto: string }) => p.accionTexto)).toEqual(['Pedido recibido', 'Aceptó el pedido', 'Anuló el pedido']);
    expect(pasos.map((p: { actorRol: string }) => p.actorRol)).toEqual(['SISTEMA', 'EMPLEADO', 'DUENO']);
    expect(pasos[0].actorNombre).toBeNull();
    expect(pasos[1].actorNombre).toBe(`${elena.registro.nombre} ${elena.registro.apellido}`);
    expect(pasos[2].actorNombre).toBeTruthy();
    expect(pasos[2].motivo).toBe(anulado.body.data.motivoAnulacion);
    expect(pasos[1].motivo).toBeNull();
    for (const paso of pasos) {
      expect(Object.keys(paso).sort()).toEqual(CAMPOS_PASO);
    }
    const horas = pasos.map((p: { fechaHora: string }) => new Date(p.fechaHora).getTime());
    expect(horas).toEqual([...horas].sort((a, b) => a - b));
    expect(JSON.stringify(respuesta.body)).not.toMatch(/dni|telefono|email|clienteId|actorUsuarioId/i);
  });

  test('el paso del Cliente lleva su nombre completo y el pedido sin pagar no tiene trazabilidad', async ({ request }) => {
    const cancelado = await pedidoPagado(request, comprador);
    expect((await apiConHeaders(request, 'PUT', `/pedidos/cliente/${cancelado}/cancelar`, comprador.token, {}, {})).status).toBe(200);
    await apiConHeaders(request, 'DELETE', '/carrito', comprador.token);
    await agregarItemCarrito(request, comprador.token, productoId, 1);
    const sinPagar = await crearPedido(request, comprador.token, 'RETIRO');

    const respuesta = await trazabilidad(request, dueno.token, cancelado);
    const ultimo = respuesta.body.data.pasos.at(-1);
    expect(ultimo).toMatchObject({
      accionTexto: 'Canceló el pedido',
      actorRol: 'CLIENTE',
      actorRolTexto: 'Cliente',
      actorNombre: `${comprador.registro.nombre} ${comprador.registro.apellido}`,
    });
    expect((await trazabilidad(request, dueno.token, sinPagar)).status).toBe(404);
  });

  test('un Cliente sin relación recibe 400 sin header y 404 con header; sin token 401; el Administrador 403', async ({ request }) => {
    const pedidoId = await pedidoPagado(request, comprador);

    expect((await trazabilidad(request, ajeno.token, pedidoId, null)).status).toBe(400);
    const conHeader = await trazabilidad(request, ajeno.token, pedidoId);
    expect(conHeader.status).toBe(404);
    expect(conHeader.body.data.codigo).toBe('COMERCIO_NO_DISPONIBLE');
    expect((await trazabilidad(request, comprador.token, pedidoId)).status).toBe(404);
    const sinToken = await apiConHeaders(request, 'GET', `/pedidos/comercio/${pedidoId}/trazabilidad`, undefined, conComercio(dueno.comercioId));
    expect(sinToken.status).toBe(401);
    expect((await trazabilidad(request, adminToken, pedidoId)).status).toBe(403);
  });

  test('un Empleado de otro comercio o con la relación inactiva recibe COMERCIO_NO_DISPONIBLE, y los pedidos ajenos 404', async ({ request }) => {
    const pedidoId = await pedidoPagado(request, comprador);
    const deOtroComercio = await pedidoPagado(request, comprador, otroProductoId);
    await sumarAlEquipo(request, otroDueno.comercioId, ajeno.registro, otroDueno.token);
    ajeno.token = (await login(request, ajeno.registro.nombreUsuario, ajeno.registro.password)).token;

    const deOtro = await trazabilidad(request, ajeno.token, pedidoId);
    expect(deOtro.status).toBe(404);
    expect(deOtro.body.data.codigo).toBe('COMERCIO_NO_DISPONIBLE');
    expect((await trazabilidad(request, ajeno.token, pedidoId, otroDueno.comercioId)).status).toBe(404);
    expect((await trazabilidad(request, dueno.token, deOtroComercio)).status).toBe(404);
    expect((await trazabilidad(request, dueno.token, 99999999)).status).toBe(404);

    await atajoEstadoRelacion(request, dueno.comercioId, fabiana.id, 'INACTIVO');
    const inactiva = await trazabilidad(request, fabiana.token, pedidoId);
    expect(inactiva.status).toBe(404);
    expect(inactiva.body.data.codigo).toBe('COMERCIO_NO_DISPONIBLE');
    await atajoEstadoRelacion(request, dueno.comercioId, fabiana.id, 'ACTIVO');
  });
});
