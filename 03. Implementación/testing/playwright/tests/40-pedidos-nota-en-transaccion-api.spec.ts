import { test, expect } from './helpers/prueba';
import { haceMinutosEnZona } from './helpers/zona';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiGet,
  apiPost,
  apiPut,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
  suspenderComercio,
} from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const TOTAL_DEL_PEDIDO = 10200;

const haceMinutos = haceMinutosEnZona;

const estado = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
const notas = (pedidoId: number): number =>
  Number(sql(`SELECT COUNT(*) FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${pedidoId};`));
const motivoDeLaNota = (pedidoId: number): string =>
  sql(`SELECT n.motivo FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${pedidoId} LIMIT 1;`);
const filas = (pedidoId: number, estadoFila: string): number =>
  Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = '${estadoFila}';`));
const avisos = (pedidoId: number, tipo: string): number =>
  Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} AND tipo = '${tipo}';`));
const mensajeDelAviso = (pedidoId: number, tipo: string): string =>
  sql(`SELECT mensaje FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} AND tipo = '${tipo}' LIMIT 1;`);
const envejecerPendiente = (pedidoId: number): void =>
  void sql(`UPDATE historial_estado_pedido SET fecha_hora = '${haceMinutos(45)}' WHERE pedido_id = ${pedidoId} AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO';`);

const MOTIVOS = ['SIN_STOCK', 'CERRADO', 'ALTO_VOLUMEN_PEDIDOS', 'PRODUCTO_NO_DISPONIBLE_TEMPORAL', 'SIN_DELIVERY_DISPONIBLE', 'PROBLEMA_TECNICO'];

test.describe('Toda devolución nace con su nota de crédito en la transacción del cambio de estado (API), bloque A0b de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;
  let clienteToken: string;

  const aceptar = (request: APIRequestContext, id: number) => apiPut(request, `/pedidos/comercio/${id}/aceptar`, {}, dueno.token);
  const rechazar = (request: APIRequestContext, id: number, cuerpo: Record<string, unknown> = { motivo: 'SIN_STOCK' }) =>
    apiPut(request, `/pedidos/comercio/${id}/rechazar`, cuerpo, dueno.token);
  const anular = (request: APIRequestContext, id: number, cuerpo: Record<string, unknown>) =>
    apiPut(request, `/pedidos/comercio/${id}/anular`, cuerpo, dueno.token);
  const cancelarCliente = (request: APIRequestContext, id: number) => apiPut(request, `/pedidos/cliente/${id}/cancelar`, {}, clienteToken);
  const correrProceso = (request: APIRequestContext, nombre: string) => apiPost(request, `/test/jobs/pedidos/${nombre}`, {});

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Pedidos A0b ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto A0b ${sufijoUnico()}`, precio: 10000, categoriaId });
    const cliente = await registrarYVerificarCliente(request, localidadId);
    clienteToken = (await login(request, cliente.nombreUsuario, cliente.password)).token;
  });

  async function pedidoPagado(request: APIRequestContext, opciones: { registrarPago?: boolean; token?: string; producto?: number } = {}): Promise<number> {
    await agregarItemCarrito(request, clienteToken, opciones.producto ?? productoId, 1);
    const pedidoId = await crearPedido(request, clienteToken, 'RETIRO');
    await confirmarPagoTest(request, pedidoId, opciones.registrarPago ?? true);
    return pedidoId;
  }

  async function pedidoEnPreparacion(request: APIRequestContext): Promise<number> {
    const pedidoId = await pedidoPagado(request);
    expect((await aceptar(request, pedidoId)).status).toBe(200);
    return pedidoId;
  }

  test.describe('Rechazar', () => {
    test('rechazar un pedido pagado crea la nota por el total, la respuesta trae el reembolso y el aviso dice que la devolución está en gestión', async ({ request }) => {
      const pedidoId = await pedidoPagado(request);

      const respuesta = await rechazar(request, pedidoId, { motivo: 'SIN_STOCK' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.estado).toBe('RECHAZADO');
      expect(respuesta.body.data.reembolsoEstado).toBe('PENDIENTE_REVISION_MANUAL');
      expect(Number(respuesta.body.data.reembolsoMonto)).toBe(TOTAL_DEL_PEDIDO);
      expect(notas(pedidoId)).toBe(1);
      expect(motivoDeLaNota(pedidoId)).toBe('RECHAZO_COMERCIO');
      expect(filas(pedidoId, 'RECHAZADO')).toBe(1);
      expect(mensajeDelAviso(pedidoId, 'PEDIDO_RECHAZADO')).toContain('gestionando la devolución de tu pago');

      const reembolsos = await apiGet(request, '/administrador/reembolsos', adminToken);
      const nota = (reembolsos.body.data as any[]).find((n) => n.pedidoId === pedidoId);
      expect(nota.motivo).toBe('RECHAZO_COMERCIO');
      expect(Number(nota.monto)).toBe(TOTAL_DEL_PEDIDO);
    });

    test('rechazar dos veces da 409 y deja una sola nota; sin pago registrado no hay nota ni se promete una devolución', async ({ request }) => {
      const pedidoId = await pedidoPagado(request);
      expect((await rechazar(request, pedidoId)).status).toBe(200);
      expect((await rechazar(request, pedidoId)).status).toBe(409);
      expect(notas(pedidoId)).toBe(1);

      const sinPago = await pedidoPagado(request, { registrarPago: false });
      const respuesta = await rechazar(request, sinPago, { motivo: 'OTRO', comentario: 'No tenemos gas' });
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.reembolsoEstado).toBeNull();
      expect(notas(sinPago)).toBe(0);
      expect(mensajeDelAviso(sinPago, 'PEDIDO_RECHAZADO')).not.toContain('devolución');
    });
  });

  test.describe('Cancelación del Cliente', () => {
    test('cancelar un pedido con pago aprobado crea la nota por el total, la respuesta trae el reembolso y el comercio recibe el aviso T9', async ({ request }) => {
      const pedidoId = await pedidoPagado(request);

      const respuesta = await cancelarCliente(request, pedidoId);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.estado).toBe('CANCELADO');
      expect(respuesta.body.data.reembolsoEstado).toBe('PENDIENTE_REVISION_MANUAL');
      expect(Number(respuesta.body.data.reembolsoMonto)).toBe(TOTAL_DEL_PEDIDO);
      expect(notas(pedidoId)).toBe(1);
      expect(motivoDeLaNota(pedidoId)).toBe('CANCELACION_CLIENTE');
      expect(filas(pedidoId, 'CANCELADO')).toBe(1);
      expect(avisos(pedidoId, 'PEDIDO_CANCELADO_CLIENTE')).toBe(1);

      const pedidos = await apiGet(request, '/pedidos/cliente', clienteToken);
      const delCliente = (pedidos.body.data as any[]).find((p) => p.id === pedidoId);
      expect(delCliente.estado).toBe('CANCELADO');
      expect(delCliente.reembolsoEstado).toBe('PENDIENTE_REVISION_MANUAL');
    });

    test('cancelar desde EN_PREPARACION también crea la nota, una segunda cancelación da 409 y deja una sola nota', async ({ request }) => {
      const pedidoId = await pedidoEnPreparacion(request);

      expect((await cancelarCliente(request, pedidoId)).status).toBe(200);
      expect((await cancelarCliente(request, pedidoId)).status).toBe(409);

      expect(notas(pedidoId)).toBe(1);
      expect(filas(pedidoId, 'CANCELADO')).toBe(1);
      expect(avisos(pedidoId, 'PEDIDO_CANCELADO_CLIENTE')).toBe(1);
    });

    test('cancelar un pedido sin pago aprobado registrado no genera nota', async ({ request }) => {
      const pedidoId = await pedidoPagado(request, { registrarPago: false });

      const respuesta = await cancelarCliente(request, pedidoId);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data.reembolsoEstado).toBeNull();
      expect(notas(pedidoId)).toBe(0);
      expect(avisos(pedidoId, 'PEDIDO_CANCELADO_CLIENTE')).toBe(1);
    });

    test('cancelar contra rechazar al mismo tiempo: un solo ganador y una sola nota', async ({ request }) => {
      for (let ronda = 0; ronda < 4; ronda += 1) {
        const pedidoId = await pedidoPagado(request);

        const [c, r] = await Promise.all([cancelarCliente(request, pedidoId), rechazar(request, pedidoId)]);

        expect([c.status, r.status].sort()).toEqual([200, 409]);
        expect(notas(pedidoId)).toBe(1);
        expect(motivoDeLaNota(pedidoId)).toBe(c.status === 200 ? 'CANCELACION_CLIENTE' : 'RECHAZO_COMERCIO');
        expect(estado(pedidoId)).toBe(c.status === 200 ? 'CANCELADO' : 'RECHAZADO');
      }
    });
  });

  test.describe('Expiración sin respuesta del comercio', () => {
    test('el proceso expira el pedido con su nota; correrlo otra vez no duplica nada; sin pago registrado no hay nota', async ({ request }) => {
      const pagado = await pedidoPagado(request);
      const sinPago = await pedidoPagado(request, { registrarPago: false });
      envejecerPendiente(pagado);
      envejecerPendiente(sinPago);

      expect((await correrProceso(request, 'expirar-sin-respuesta')).status).toBe(200);

      expect(estado(pagado)).toBe('EXPIRADO');
      expect(notas(pagado)).toBe(1);
      expect(motivoDeLaNota(pagado)).toBe('EXPIRACION_SIN_RESPUESTA');
      expect(avisos(pagado, 'PEDIDO_EXPIRADO_CLIENTE')).toBe(1);
      expect(avisos(pagado, 'PEDIDO_EXPIRADO_COMERCIO')).toBe(1);
      expect(estado(sinPago)).toBe('EXPIRADO');
      expect(notas(sinPago)).toBe(0);

      expect((await correrProceso(request, 'expirar-sin-respuesta')).status).toBe(200);
      expect(notas(pagado)).toBe(1);
      expect(filas(pagado, 'EXPIRADO')).toBe(1);
    });

    test('un pedido que el comercio acepta antes de la corrida no se expira ni genera nota', async ({ request }) => {
      const pedidoId = await pedidoPagado(request);
      envejecerPendiente(pedidoId);
      expect((await aceptar(request, pedidoId)).status).toBe(200);

      expect((await correrProceso(request, 'expirar-sin-respuesta')).status).toBe(200);

      expect(estado(pedidoId)).toBe('EN_PREPARACION');
      expect(notas(pedidoId)).toBe(0);
    });
  });

  test.describe('Suspensión del comercio', () => {
    test('al suspender nada se cancela en el acto; a los 90 minutos el sistema cancela solo lo que sigue en preparación, con su nota y su aviso', async ({ request }) => {
      const otro = await prepararAprobado(request, adminToken, localidadId, false);
      await marcarAptoVenta(request, otro.comercioId);
      const otroProducto = await crearProducto(request, otro.token, { nombre: `Producto susp ${sufijoUnico()}`, precio: 10000, categoriaId });
      const otroDeCarrito = (id: number) => apiPut(request, `/pedidos/comercio/${id}/aceptar`, {}, otro.token);

      const pendiente = await pedidoPagado(request, { producto: otroProducto });
      const enPreparacion = await pedidoPagado(request, { producto: otroProducto });
      expect((await otroDeCarrito(enPreparacion)).status).toBe(200);
      const sinPagoRegistrado = await pedidoPagado(request, { producto: otroProducto, registrarPago: false });

      await suspenderComercio(request, adminToken, otro.comercioId, 'Suspensión de prueba A0b');

      expect(estado(pendiente)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      expect(estado(enPreparacion)).toBe('EN_PREPARACION');
      expect(estado(sinPagoRegistrado)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      for (const id of [pendiente, enPreparacion, sinPagoRegistrado]) {
        expect(notas(id)).toBe(0);
        expect(avisos(id, 'PEDIDO_CANCELADO_SISTEMA')).toBe(0);
      }

      expect((await apiPut(request, `/test/comercios/${otro.comercioId}/envejecer-suspension?minutos=91`, {})).status).toBe(200);
      expect((await correrProceso(request, 'cancelar-preparacion-suspension')).status).toBe(200);

      expect(estado(enPreparacion)).toBe('CANCELADO_POR_SISTEMA');
      expect(notas(enPreparacion)).toBe(1);
      expect(motivoDeLaNota(enPreparacion)).toBe('SUSPENSION_COMERCIO');
      expect(avisos(enPreparacion, 'PEDIDO_CANCELADO_SISTEMA')).toBe(1);
      expect(estado(pendiente)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      expect(notas(pendiente)).toBe(0);
      expect(estado(sinPagoRegistrado)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
    });
  });

  test.describe('Motivo de anulación por lista', () => {
    test('sin motivo, con un texto libre, con un motivo que no existe, o con OTRO sin comentario, el servidor responde 400 y no cambia nada', async ({ request }) => {
      const pedidoId = await pedidoEnPreparacion(request);

      for (const cuerpo of [
        {},
        { comentario: 'Sin motivo' },
        { motivo: 'Se rompió el horno' },
        { motivo: 'NO_EXISTE' },
        { motivo: null },
        { motivo: 'OTRO' },
        { motivo: 'OTRO', comentario: '   ' },
        { motivo: 'SIN_STOCK', comentario: 'x'.repeat(501) },
      ]) {
        const respuesta = await anular(request, pedidoId, cuerpo);
        expect(respuesta.status, JSON.stringify(cuerpo).slice(0, 80)).toBe(400);
      }

      expect(estado(pedidoId)).toBe('EN_PREPARACION');
      expect(notas(pedidoId)).toBe(0);
      expect(filas(pedidoId, 'ANULADO')).toBe(0);
    });

    test('cada motivo de la lista anula el pedido, guarda el enum y el comentario, y el Cliente y el comercio lo ven', async ({ request }) => {
      for (const motivo of MOTIVOS) {
        const pedidoId = await pedidoEnPreparacion(request);

        const respuesta = await anular(request, pedidoId, { motivo, comentario: 'Aviso al cliente' });

        expect(respuesta.status, motivo).toBe(200);
        expect(respuesta.body.data.estado).toBe('ANULADO');
        expect(respuesta.body.data.motivoRechazo).toBe(motivo);
        expect(respuesta.body.data.comentarioRechazo).toBe('Aviso al cliente');
        expect(respuesta.body.data.motivoAnulacion).toContain('Aviso al cliente');
        expect(sql(`SELECT motivo_rechazo FROM pedido WHERE id = ${pedidoId};`)).toBe(motivo);
        expect(notas(pedidoId)).toBe(1);
      }

      const pedidoId = await pedidoEnPreparacion(request);
      const sinComentario = await anular(request, pedidoId, { motivo: 'OTRO', comentario: 'Se cortó la luz' });
      expect(sinComentario.status).toBe(200);
      expect(sinComentario.body.data.motivoAnulacion).toBe('Otro. Se cortó la luz');
      expect(mensajeDelAviso(pedidoId, 'PEDIDO_ANULADO_COMERCIO')).toContain('Motivo: Otro. Se cortó la luz');

      const siguiente = await pedidoEnPreparacion(request);
      const sinTexto = await anular(request, siguiente, { motivo: 'SIN_STOCK' });
      expect(sinTexto.status).toBe(200);
      expect(sinTexto.body.data.comentarioRechazo).toBeNull();
      expect(sinTexto.body.data.motivoAnulacion).toBe('Sin stock');

      const delCliente = ((await apiGet(request, '/pedidos/cliente', clienteToken)).body.data as any[]).find((p) => p.id === siguiente);
      expect(delCliente.motivoAnulacion).toBe('Sin stock');
      expect(delCliente.motivoRechazo).toBe('SIN_STOCK');
    });

    test('un pedido anulado antes del cambio, con texto libre, sigue mostrándose con su motivo y sin enum', async ({ request }) => {
      const pedidoId = await pedidoEnPreparacion(request);
      sql(`UPDATE pedido SET estado = 'ANULADO', cancelado_por = 'COMERCIO', motivo = 'Texto libre de antes', motivo_rechazo = NULL, comentario_rechazo = NULL WHERE id = ${pedidoId};`);

      const delCliente = ((await apiGet(request, '/pedidos/cliente', clienteToken)).body.data as any[]).find((p) => p.id === pedidoId);
      expect(delCliente.estado).toBe('ANULADO');
      expect(delCliente.motivoAnulacion).toBe('Texto libre de antes');
      expect(delCliente.motivoRechazo).toBeNull();

      const delComercio = ((await apiGet(request, '/pedidos/comercio', dueno.token)).body.data as any[]).find((p) => p.id === pedidoId);
      expect(delComercio.motivoAnulacion).toBe('Texto libre de antes');
    });
  });
});
