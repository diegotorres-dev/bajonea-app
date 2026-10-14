import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiGet,
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
import { atajoEstadoRelacion, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
const textoT36 = (pedidoId: number) =>
  `Tu pedido #${pedidoId} no fue retirado y el comercio lo cerró. Como ya estaba preparado, no hay devolución del pago.`;

interface Cuenta {
  registro: ClienteRegistrado;
  id: number;
  token: string;
}

test.describe('Cerrar un retiro como no retirado (API), bloque A4b de E3', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let otroDueno: Dueno;
  let productoId: number;
  let comprador: Cuenta;
  let elena: Cuenta;
  let fabiana: Cuenta;
  let ajeno: Cuenta;

  const conComercio = (comercioId: number): Record<string, string> => ({ [HEADER]: String(comercioId) });
  const accion = (request: APIRequestContext, token: string, pedidoId: number, ruta: string, comercioId = dueno.comercioId) =>
    apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${ruta}`, token, conComercio(comercioId), {});
  const cerrar = (request: APIRequestContext, token: string, pedidoId: number, comercioId = dueno.comercioId) =>
    accion(request, token, pedidoId, 'no-retirado', comercioId);
  const estadoDe = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
  const historialDe = (pedidoId: number): number => Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId};`));
  const notasDe = (pedidoId: number): number =>
    Number(sql(`SELECT COUNT(*) FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${pedidoId};`));
  const avisos = (pedidoId: number, tipo: string): number =>
    Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} AND tipo = '${tipo}';`));
  const envejecer = (request: APIRequestContext, pedidoId: number, minutos: number) =>
    apiConHeaders(request, 'PUT', `/test/pedidos/${pedidoId}/envejecer-listo?minutos=${minutos}`, undefined, {}, {});

  async function nuevaCuenta(request: APIRequestContext): Promise<Cuenta> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { registro, id: sesion.usuario.id, token: sesion.token };
  }

  async function pedidoListo(request: APIRequestContext, quien: Cuenta, minutosListo = 90, tipo: 'RETIRO' | 'DOMICILIO' = 'RETIRO'): Promise<number> {
    await apiConHeaders(request, 'DELETE', '/carrito', quien.token);
    await agregarItemCarrito(request, quien.token, productoId, 1);
    const pedidoId = await crearPedido(request, quien.token, tipo, null);
    await confirmarPagoTest(request, pedidoId, true);
    expect((await accion(request, dueno.token, pedidoId, 'aceptar')).status).toBe(200);
    expect((await accion(request, dueno.token, pedidoId, 'despachar')).status).toBe(200);
    if (minutosListo > 0) {
      expect((await envejecer(request, pedidoId, minutosListo)).status).toBe(200);
    }
    return pedidoId;
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat No Retirado ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    otroDueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto A4b ${sufijoUnico()}`, precio: 10000, categoriaId });
    comprador = await nuevaCuenta(request);
    elena = await nuevaCuenta(request);
    fabiana = await nuevaCuenta(request);
    ajeno = await nuevaCuenta(request);
    await sumarAlEquipo(request, dueno.comercioId, elena.registro, dueno.token);
    await sumarAlEquipo(request, dueno.comercioId, fabiana.registro, dueno.token);
    elena.token = (await login(request, elena.registro.nombreUsuario, elena.registro.password)).token;
    fabiana.token = (await login(request, fabiana.registro.nombreUsuario, fabiana.registro.password)).token;
  });

  test('antes de los 60 minutos responde 409 RETIRO_EN_ESPERA con los minutos y desde cuándo, y no cambia nada', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 45);
    const historialAntes = historialDe(pedidoId);

    const respuesta = await cerrar(request, dueno.token, pedidoId);

    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(409);
    expect(respuesta.body.data.codigo).toBe('RETIRO_EN_ESPERA');
    expect(respuesta.body.data.minutosRestantes).toBeGreaterThanOrEqual(14);
    expect(respuesta.body.data.minutosRestantes).toBeLessThanOrEqual(15);
    expect(typeof respuesta.body.data.disponibleDesde).toBe('string');
    expect(respuesta.body.mensaje).toMatch(/^Todavía no podés cerrar este pedido como no retirado\. Esperá 1[45] minutos más \(desde las \d\d:\d\d\)\.$/);
    expect(estadoDe(pedidoId)).toBe('LISTO_PARA_RETIRAR');
    expect(historialDe(pedidoId)).toBe(historialAntes);
    expect(avisos(pedidoId, 'PEDIDO_NO_RETIRADO')).toBe(0);
  });

  test('después de la espera el Dueño lo cierra: NO_RETIRADO, sin fuente de entrega, sin nota de crédito y con el aviso T36 al Cliente', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 61);

    const respuesta = await cerrar(request, dueno.token, pedidoId);

    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body.mensaje).toBe('Pedido cerrado como no retirado');
    expect(respuesta.body.data.estado).toBe('NO_RETIRADO');
    expect(respuesta.body.data.fuenteEntrega ?? null).toBeNull();
    expect(respuesta.body.data.fechaEntrega ?? null).toBeNull();
    expect(respuesta.body.data.cargoServicioComercio).toBeDefined();
    expect(respuesta.body.data.esPedidoPropio).toBeUndefined();
    expect(estadoDe(pedidoId)).toBe('NO_RETIRADO');
    expect(notasDe(pedidoId)).toBe(0);
    expect(sql(`SELECT CONCAT(actor_rol, ':', COALESCE(motivo_timeout, '-')) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = 'NO_RETIRADO';`))
      .toBe('DUENO:-');
    expect(avisos(pedidoId, 'PEDIDO_NO_RETIRADO')).toBe(1);
    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} AND tipo = 'PEDIDO_NO_RETIRADO' AND comercio_id IS NULL;`))).toBe(1);

    const lista = await apiConHeaders(request, 'GET', '/pedidos/cliente', comprador.token);
    const delCliente = (lista.body.data as any[]).find((pedido) => pedido.id === pedidoId);
    expect(delCliente.estado).toBe('NO_RETIRADO');
    expect(delCliente.reembolsoEstado ?? null).toBeNull();
    const notificaciones = await apiConHeaders(request, 'GET', '/notificaciones', comprador.token);
    const t36 = (notificaciones.body.data as any[]).filter((aviso) => aviso.entidadId === pedidoId);
    expect(t36.map((aviso) => aviso.mensaje)).toContain(textoT36(pedidoId));
    expect(JSON.stringify(t36)).not.toContain(dueno.nombreUsuario);
  });

  test('el aviso T36 no llega al Dueño ni a los Empleados', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 90);
    expect((await cerrar(request, dueno.token, pedidoId)).status).toBe(200);

    expect(Number(sql(`SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ${pedidoId} AND tipo = 'PEDIDO_NO_RETIRADO' AND usuario_id <> ${comprador.id};`))).toBe(0);
  });

  test('un Empleado lo cierra: recibe el DTO reducido y queda como actor EMPLEADO', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 90);

    const respuesta = await cerrar(request, elena.token, pedidoId);

    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body.data.estado).toBe('NO_RETIRADO');
    expect(respuesta.body.data.esPedidoPropio).toBe(false);
    for (const campo of ['cargoServicioCliente', 'cargoServicioComercio', 'clienteId', 'pagoEstado']) {
      expect(respuesta.body.data[campo], campo).toBeUndefined();
    }
    expect(sql(`SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = 'NO_RETIRADO';`))
      .toBe(`EMPLEADO:${elena.id}`);
  });

  test('un Empleado no cierra su propio pedido: 409 PEDIDO_PROPIO; el Dueño y otro Empleado sí', async ({ request }) => {
    const pedidoId = await pedidoListo(request, elena, 90);

    const propio = await cerrar(request, elena.token, pedidoId);
    expect(propio.status).toBe(409);
    expect(propio.body.data.codigo).toBe('PEDIDO_PROPIO');
    expect(estadoDe(pedidoId)).toBe('LISTO_PARA_RETIRAR');

    expect((await cerrar(request, fabiana.token, pedidoId)).status).toBe(200);
    expect(estadoDe(pedidoId)).toBe('NO_RETIRADO');
  });

  test('solo desde LISTO_PARA_RETIRAR y solo en un pedido de retiro', async ({ request }) => {
    const entregado = await pedidoListo(request, comprador, 90);
    expect((await accion(request, dueno.token, entregado, 'entregar')).status).toBe(200);
    const domicilio = await pedidoListo(request, comprador, 0, 'RETIRO');
    sql(`UPDATE pedido SET modalidad_entrega = 'DOMICILIO' WHERE id = ${domicilio};`);
    expect((await envejecer(request, domicilio, 90)).status).toBe(200);

    for (const pedidoId of [entregado, domicilio]) {
      const antes = estadoDe(pedidoId);
      const historialAntes = historialDe(pedidoId);
      const respuesta = await cerrar(request, dueno.token, pedidoId);
      expect(respuesta.status, String(pedidoId)).toBe(409);
      expect(estadoDe(pedidoId)).toBe(antes);
      expect(historialDe(pedidoId)).toBe(historialAntes);
    }
    expect((await cerrar(request, dueno.token, entregado)).body.mensaje).toBe('El pedido no está listo para retirar');
  });

  test('cerrar dos veces o cerrar tras entregar da 409 sin escribir una segunda transición', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 90);
    expect((await cerrar(request, dueno.token, pedidoId)).status).toBe(200);
    const historialAntes = historialDe(pedidoId);

    expect((await cerrar(request, dueno.token, pedidoId)).status).toBe(409);
    expect((await accion(request, dueno.token, pedidoId, 'entregar')).status).toBe(409);

    expect(historialDe(pedidoId)).toBe(historialAntes);
    expect(avisos(pedidoId, 'PEDIDO_NO_RETIRADO')).toBe(1);
  });

  test('quién no puede: Cliente sin relación, Dueño de otro comercio, Administrador y sin sesión', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 90);

    expect((await cerrar(request, ajeno.token, pedidoId)).status).toBe(404);
    expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/no-retirado`, ajeno.token)).status).toBe(400);
    expect((await cerrar(request, otroDueno.token, pedidoId)).status).toBe(404);
    expect((await cerrar(request, otroDueno.token, pedidoId, otroDueno.comercioId)).status).toBe(404);
    expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/no-retirado`, adminToken, {})).status).toBe(403);
    expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/no-retirado`, undefined, conComercio(dueno.comercioId))).status).toBe(401);
    expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/no-retirado`, dueno.token, {})).status).toBe(400);
    expect(estadoDe(pedidoId)).toBe('LISTO_PARA_RETIRAR');
  });

  test('un Empleado desactivado recibe el 404 de siempre y no cambia nada', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 90);
    expect((await atajoEstadoRelacion(request, dueno.comercioId, fabiana.id, 'INACTIVO')).status).toBe(200);

    const respuesta = await cerrar(request, fabiana.token, pedidoId);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.data.codigo).toBe('COMERCIO_NO_DISPONIBLE');
    expect(estadoDe(pedidoId)).toBe('LISTO_PARA_RETIRAR');
    expect((await atajoEstadoRelacion(request, dueno.comercioId, fabiana.id, 'ACTIVO')).status).toBe(200);
  });

  test('"Facturado hoy" lo cuenta: la cifra no cambia al pasar de listo a no retirado (Dueño neto, Empleado bruto)', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 90);
    const resumen = async (token: string) =>
      Number((await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', token, conComercio(dueno.comercioId))).body.data.totalFacturadoHoy);
    const duenoAntes = await resumen(dueno.token);
    const empleadoAntes = await resumen(elena.token);

    expect((await cerrar(request, dueno.token, pedidoId)).status).toBe(200);

    expect(await resumen(dueno.token)).toBe(duenoAntes);
    expect(await resumen(elena.token)).toBe(empleadoAntes);
    expect(empleadoAntes - duenoAntes).toBeGreaterThan(0);
  });

  test('la trazabilidad y la Actividad muestran el cierre con su texto, y el atajo falla sin fila de listo', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 90);
    expect((await cerrar(request, elena.token, pedidoId)).status).toBe(200);

    const traza = await apiConHeaders(request, 'GET', `/pedidos/comercio/${pedidoId}/trazabilidad`, dueno.token, conComercio(dueno.comercioId));
    const pasos = traza.body.data.pasos as any[];
    const ultimo = pasos[pasos.length - 1];
    expect(ultimo.estado).toBe('NO_RETIRADO');
    expect(ultimo.accionTexto).toBe('Cerró el pedido como no retirado');
    expect(ultimo.actorRolTexto).toBe('Empleado');
    const actividad = await apiConHeaders(request, 'GET', '/comercios/equipo/actividad', dueno.token, conComercio(dueno.comercioId));
    expect((actividad.body.data.items as any[])[0].accionTexto).toBe('Cerró un pedido como no retirado');

    expect((await envejecer(request, 999999999, 5)).status).toBe(404);
  });

  test('el comercio suspendido: el Empleado puede cerrar tras la espera y el proceso automático cierra el que venció su plazo, sin reembolso y sin la espera', async ({ request }) => {
    const manual = await pedidoListo(request, comprador, 90);
    const automatico = await pedidoListo(request, comprador, 1);
    const pendientes = [manual, automatico];
    await suspenderComercio(request, adminToken, dueno.comercioId, 'Suspensión de prueba A4b');
    for (const pedidoId of pendientes) {
      expect(estadoDe(pedidoId)).toBe('LISTO_PARA_RETIRAR');
      expect(sql(`SELECT suspension_retiro_expira IS NOT NULL FROM pedido WHERE id = ${pedidoId};`)).toBe('1');
    }

    const cerrado = await cerrar(request, elena.token, manual);
    expect(cerrado.status, JSON.stringify(cerrado.body)).toBe(200);

    const ahora = sql(`SELECT DATE_FORMAT(suspension_retiro_expira + INTERVAL 1 HOUR, '%Y-%m-%dT%H:%i:%s') FROM pedido WHERE id = ${automatico};`);
    const job = await apiConHeaders(request, 'POST', `/test/jobs/pedidos/autoconfirmar-retiros?ahora=${ahora}`, undefined, {}, {});
    expect(job.status).toBe(200);

    expect(estadoDe(automatico)).toBe('NO_RETIRADO');
    expect(sql(`SELECT CONCAT(actor_rol, ':', COALESCE(motivo_timeout, '-'), ':', COALESCE(actor_usuario_id, '-')) FROM historial_estado_pedido WHERE pedido_id = ${automatico} AND estado = 'NO_RETIRADO';`))
      .toBe('SISTEMA:TIMEOUT_RETIRO_SUSPENSION:-');
    expect(notasDe(automatico)).toBe(0);
    expect(avisos(automatico, 'PEDIDO_NO_RETIRADO')).toBe(1);
    expect(avisos(automatico, 'PEDIDO_CERRADO_TIMER_SUSPENSION')).toBe(0);
    expect(sql(`SELECT mensaje FROM notificacion WHERE entidad_id = ${automatico} AND tipo = 'PEDIDO_NO_RETIRADO';`)).toBe(textoT36(automatico));
    expect(sql(`SELECT fuente_entrega IS NULL AND fecha_entrega IS NULL FROM pedido WHERE id = ${automatico};`)).toBe('1');

    ponerEstadoComercio(dueno.comercioId, 'APTO_VENTA');
  });

  test('la lista del comercio informa cuándo se habilita el cierre (minutos hacia arriba, 0 al cumplirse) y el Cliente nunca lo recibe', async ({ request }) => {
    const retiro = await pedidoListo(request, comprador, 0);
    const domicilio = await pedidoListo(request, comprador, 0);
    sql(`UPDATE pedido SET modalidad_entrega = 'DOMICILIO' WHERE id = ${domicilio};`);
    const delPedido = (cuerpo: any[], id: number) => cuerpo.find((pedido) => pedido.id === id);
    const listar = (token: string) => apiConHeaders(request, 'GET', '/pedidos/comercio', token, conComercio(dueno.comercioId));

    for (const token of [dueno.token, elena.token]) {
      const lista = (await listar(token)).body.data;
      expect(delPedido(lista, retiro).noRetiradoMinutosRestantes).toBe(60);
      expect(typeof delPedido(lista, retiro).noRetiradoDisponibleDesde).toBe('string');
      expect(delPedido(lista, domicilio).noRetiradoMinutosRestantes ?? null).toBeNull();
      expect(delPedido(lista, domicilio).noRetiradoDisponibleDesde ?? null).toBeNull();
    }

    expect((await envejecer(request, retiro, 45)).status).toBe(200);
    const aMitad = delPedido((await listar(dueno.token)).body.data, retiro);
    expect(aMitad.noRetiradoMinutosRestantes).toBeGreaterThanOrEqual(14);
    expect(aMitad.noRetiradoMinutosRestantes).toBeLessThanOrEqual(15);

    expect((await envejecer(request, retiro, 20)).status).toBe(200);
    const cumplido = delPedido((await listar(elena.token)).body.data, retiro);
    expect(cumplido.noRetiradoMinutosRestantes).toBe(0);
    expect(typeof cumplido.noRetiradoDisponibleDesde).toBe('string');

    const delCliente = delPedido((await apiGet(request, '/pedidos/cliente', comprador.token)).body.data, retiro);
    expect(delCliente.estado).toBe('LISTO_PARA_RETIRAR');
    expect(delCliente.noRetiradoMinutosRestantes ?? null).toBeNull();
    expect(delCliente.noRetiradoDisponibleDesde ?? null).toBeNull();

    expect((await cerrar(request, dueno.token, retiro)).status).toBe(200);
    const cerrado = delPedido((await listar(dueno.token)).body.data, retiro);
    expect(cerrado.estado).toBe('NO_RETIRADO');
    expect(cerrado.noRetiradoMinutosRestantes ?? null).toBeNull();
  });

  test('seis cierres simultáneos del mismo pedido dejan un solo ganador, un solo historial y un solo aviso', async ({ request }) => {
    const pedidoId = await pedidoListo(request, comprador, 90);

    const respuestas = await Promise.all([
      cerrar(request, dueno.token, pedidoId),
      cerrar(request, elena.token, pedidoId),
      cerrar(request, fabiana.token, pedidoId),
      cerrar(request, dueno.token, pedidoId),
      cerrar(request, elena.token, pedidoId),
      cerrar(request, fabiana.token, pedidoId),
    ]);

    expect(respuestas.map((r) => r.status).filter((estado) => estado === 200)).toHaveLength(1);
    expect(respuestas.filter((r) => r.status === 409)).toHaveLength(5);
    expect(respuestas.every((r) => r.status < 500)).toBe(true);
    expect(estadoDe(pedidoId)).toBe('NO_RETIRADO');
    expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ${pedidoId} AND estado = 'NO_RETIRADO';`))).toBe(1);
    expect(avisos(pedidoId, 'PEDIDO_NO_RETIRADO')).toBe(1);
    expect(notasDe(pedidoId)).toBe(0);
  });
});
