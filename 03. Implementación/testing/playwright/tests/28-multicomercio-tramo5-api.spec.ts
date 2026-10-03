import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiGet,
  apiPost,
  clonarComercioTest,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import { prepararAprobado } from './helpers/multicomercio';

const HEADER = 'X-Comercio-Id';
const MENSAJE_YA_VINCULADA = 'Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra.';
const MENSAJE_EN_USO = 'Esa cuenta de Mercado Pago ya está en uso por otro Dueño. Usá otra cuenta, o pedí que la desvinculen primero.';
const MENSAJE_SIN_CUENTA = 'El Dueño no tiene ninguna cuenta de Mercado Pago vinculada';
const MENSAJE_SIN_ACEPTAR_PEDIDOS = 'Este comercio no está aceptando pedidos en este momento';
const ESTADOS_EN_CURSO = ['PENDIENTE_CONFIRMACION_COMERCIO', 'EN_PREPARACION', 'EN_CAMINO', 'LISTO_PARA_RETIRAR'];

const cuentaMp = (prefijo: string) => `${prefijo}-${sufijoUnico()}`;

async function vincular(request: APIRequestContext, duenoId: number, mpUserId?: string) {
  const query = mpUserId ? `?mpUserId=${encodeURIComponent(mpUserId)}` : '';
  return apiPost(request, `/test/duenos/${duenoId}/mercadopago-simulada${query}`, {});
}

async function desvincular(request: APIRequestContext, token: string, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'DELETE', '/oauth/mercadopago/desvincular', token, headers);
}

async function previa(request: APIRequestContext, token: string | undefined, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'GET', '/oauth/mercadopago/desvinculacion/previa', token, headers);
}

async function iniciar(request: APIRequestContext, token: string) {
  return apiConHeaders(request, 'GET', '/oauth/mercadopago/iniciar', token);
}

const estadoDe = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);
const cuentaActivaDe = (duenoId: number): string => sql(`SELECT IFNULL(MAX(mp_user_id), '') FROM cuenta_mercado_pago WHERE dueno_id = ${duenoId} AND activa = 1;`);
const filasDeCuenta = (duenoId: number): number => Number(sql(`SELECT COUNT(*) FROM cuenta_mercado_pago WHERE dueno_id = ${duenoId};`));
const estadoPedido = (pedidoId: number): string => sql(`SELECT estado FROM pedido WHERE id = ${pedidoId};`);
const filasDeHistorialDesvinculacion = (comercioId: number): number =>
  Number(
    sql(
      `SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${comercioId} AND estado_origen = 'APTO_VENTA' ` +
        `AND estado_destino = 'APROBADO' AND motivo LIKE 'Desvinculaci%n de cuenta de Mercado Pago';`,
    ),
  );
const reintentoEsperadoDe = (pedidoId: number): string =>
  sql(`SELECT DATE_FORMAT(DATE_ADD(fecha_creacion, INTERVAL 30 MINUTE), '%Y-%m-%dT%H:%i:%s') FROM pedido WHERE id = ${pedidoId};`);
const horaEsperadaDe = (pedidoId: number): string =>
  sql(`SELECT DATE_FORMAT(DATE_ADD(fecha_creacion, INTERVAL 30 MINUTE), '%H:%i') FROM pedido WHERE id = ${pedidoId};`);

test.describe('Multi-comercio, tramo 5 (API): Mercado Pago con varios comercios', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Tramo5 ${sufijoUnico()}`);
  });

  async function duenoConProducto(request: APIRequestContext, conMercadoPago: boolean, mpUserId?: string) {
    const dueno = await prepararAprobado(request, adminToken, localidadId, false);
    const productoId = await crearProducto(request, dueno.token, {
      nombre: `Producto Tramo5 ${sufijoUnico()}`,
      precio: 1500,
      categoriaId,
    });
    if (conMercadoPago) {
      const respuesta = await vincular(request, dueno.duenoId, mpUserId);
      expect(respuesta.status).toBe(200);
      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
    }
    return { dueno, productoId };
  }

  async function clienteLogueado(request: APIRequestContext) {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    return (await login(request, cliente.nombreUsuario, cliente.password)).token;
  }

  async function pedidoNuevo(request: APIRequestContext, clienteToken: string, productoId: number): Promise<number> {
    await agregarItemCarrito(request, clienteToken, productoId, 1);
    return crearPedido(request, clienteToken, 'RETIRO');
  }

  function sembrarPagoAprobado(pedidoId: number) {
    sql(
      `INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_confirmacion) ` +
        `SELECT id, total, 'approved', 'sintetico-t5-${pedidoId}', NOW() FROM pedido WHERE id = ${pedidoId};`,
    );
  }

  test.describe('Una cuenta de Mercado Pago no puede estar activa en dos Dueños', () => {
    test('el segundo Dueño recibe 409 sin pistas de quién la tiene, y puede vincularla cuando el primero desvincula', async ({ request }) => {
      const cuenta = cuentaMp('MP-UNICA');
      const primero = await prepararAprobado(request, adminToken, localidadId, false);
      const segundo = await prepararAprobado(request, adminToken, localidadId, false);

      expect((await vincular(request, primero.duenoId, cuenta)).status).toBe(200);
      expect(estadoDe(primero.comercioId)).toBe('APTO_VENTA');

      const rechazada = await vincular(request, segundo.duenoId, cuenta);
      expect(rechazada.status).toBe(409);
      expect(rechazada.body.mensaje).toBe(MENSAJE_EN_USO);
      expect(JSON.stringify(rechazada.body)).not.toContain(String(primero.duenoId));
      expect(filasDeCuenta(segundo.duenoId)).toBe(0);
      expect(estadoDe(segundo.comercioId)).toBe('APROBADO');

      expect((await desvincular(request, primero.token)).status).toBe(200);
      expect(cuentaActivaDe(primero.duenoId)).toBe('');
      expect(estadoDe(primero.comercioId)).toBe('APROBADO');

      expect((await vincular(request, segundo.duenoId, cuenta)).status).toBe(200);
      expect(cuentaActivaDe(segundo.duenoId)).toBe(cuenta);
      expect(estadoDe(segundo.comercioId)).toBe('APTO_VENTA');
      expect(Number(sql(`SELECT COUNT(*) FROM cuenta_mercado_pago WHERE mp_user_id = '${cuenta}';`))).toBe(2);
      expect(Number(sql(`SELECT COUNT(*) FROM cuenta_mercado_pago WHERE mp_user_id = '${cuenta}' AND activa = 1;`))).toBe(1);
    });

    test('el Dueño que desvinculó puede volver a vincular la misma cuenta si nadie la tomó, y otra distinta', async ({ request }) => {
      const cuenta = cuentaMp('MP-REVINCULAR');
      const dueno = await prepararAprobado(request, adminToken, localidadId, false);
      expect((await vincular(request, dueno.duenoId, cuenta)).status).toBe(200);
      expect((await desvincular(request, dueno.token)).status).toBe(200);

      expect((await vincular(request, dueno.duenoId, cuenta)).status).toBe(200);
      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
      expect((await desvincular(request, dueno.token)).status).toBe(200);

      const otra = cuentaMp('MP-OTRA');
      expect((await vincular(request, dueno.duenoId, otra)).status).toBe(200);
      expect(cuentaActivaDe(dueno.duenoId)).toBe(otra);
      expect(filasDeCuenta(dueno.duenoId)).toBe(1);
    });
  });

  test.describe('Un Dueño tiene una sola cuenta de Mercado Pago', () => {
    test('vincular la misma cuenta otra vez es idempotente y vincular otra distinta da 409 sin tocar nada', async ({ request }) => {
      const cuenta = cuentaMp('MP-MISMA');
      const { dueno } = await duenoConProducto(request, true, cuenta);
      const comercioClon = await clonarComercioTest(request, dueno.comercioId, `Tramo5 Clon ${sufijoUnico()}`, 'APTO_VENTA');
      const fechaAntes = sql(`SELECT fecha_vinculacion FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`);

      const repetida = await vincular(request, dueno.duenoId, cuenta);
      expect(repetida.status).toBe(200);
      expect(filasDeCuenta(dueno.duenoId)).toBe(1);
      expect(cuentaActivaDe(dueno.duenoId)).toBe(cuenta);
      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
      expect(estadoDe(comercioClon)).toBe('APTO_VENTA');
      expect(sql(`SELECT fecha_vinculacion >= '${fechaAntes}' FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`)).toBe('1');

      const otra = await vincular(request, dueno.duenoId, cuentaMp('MP-DISTINTA'));
      expect(otra.status).toBe(409);
      expect(otra.body.mensaje).toBe(MENSAJE_YA_VINCULADA);
      expect(cuentaActivaDe(dueno.duenoId)).toBe(cuenta);
      expect(filasDeCuenta(dueno.duenoId)).toBe(1);
    });

    test('iniciar la vinculación: 200 sin cuenta activa y 409 con una cuenta activa', async ({ request }) => {
      const { dueno } = await duenoConProducto(request, false);

      const sinCuenta = await iniciar(request, dueno.token);
      expect(sinCuenta.status).toBe(200);
      expect(typeof sinCuenta.body.data.url).toBe('string');
      expect(sinCuenta.body.data.url).toContain('mercadopago.com');
      expect(sinCuenta.body.data.url).toContain('state=');

      expect((await vincular(request, dueno.duenoId, cuentaMp('MP-INICIAR'))).status).toBe(200);
      const conCuenta = await iniciar(request, dueno.token);
      expect(conCuenta.status).toBe(409);
      expect(conCuenta.body.mensaje).toBe(MENSAJE_YA_VINCULADA);

      expect((await desvincular(request, dueno.token)).status).toBe(200);
      expect((await iniciar(request, dueno.token)).status).toBe(200);
    });
  });

  test.describe('GET /oauth/mercadopago/desvinculacion/previa', () => {
    test('lista todos los comercios del Dueño, en cualquier estado, con los cuatro estados en curso y su forma', async ({ request }) => {
      const { dueno } = await duenoConProducto(request, true, cuentaMp('MP-PREVIA'));
      const comercioPendiente = await clonarComercioTest(request, dueno.comercioId, `Tramo5 Pendiente ${sufijoUnico()}`, 'PENDIENTE');
      const comercioRechazado = await clonarComercioTest(request, dueno.comercioId, `Tramo5 Rechazado ${sufijoUnico()}`, 'RECHAZADO');

      const { status, body } = await previa(request, dueno.token);

      expect(status).toBe(200);
      expect(body.mensaje).toBeTruthy();
      expect(Object.keys(body.data).sort()).toEqual(['comercios', 'pagosPendientes', 'puedeDesvincular']);
      expect(body.data.puedeDesvincular).toBe(true);
      expect(body.data.pagosPendientes).toEqual({ cantidadTotal: 0, puedeReintentarDesde: null });
      expect(body.data.comercios.map((c: any) => c.id)).toEqual([dueno.comercioId, comercioPendiente, comercioRechazado]);
      for (const comercio of body.data.comercios) {
        expect(Object.keys(comercio).sort()).toEqual(['cantidadPagosPendientes', 'id', 'nombre', 'pedidosEnCurso']);
        expect(comercio.cantidadPagosPendientes).toBe(0);
        expect(comercio.pedidosEnCurso.map((p: any) => p.estado)).toEqual(ESTADOS_EN_CURSO);
        expect(comercio.pedidosEnCurso.every((p: any) => p.cantidad === 0)).toBe(true);
      }
      expect(typeof body.data.comercios[0].nombre).toBe('string');
      expect(body.data.comercios[0].nombre.length).toBeGreaterThan(0);
    });

    test('cuenta los pedidos en curso por comercio y estado y los pagos pendientes con la hora para reintentar', async ({ request }) => {
      const { dueno, productoId } = await duenoConProducto(request, true, cuentaMp('MP-PREVIA2'));
      const clon = await clonarComercioTest(request, dueno.comercioId, `Tramo5 Clon ${sufijoUnico()}`, 'APTO_VENTA');
      const productoClon = (
        await apiConHeaders(request, 'POST', '/productos', dueno.token, { [HEADER]: String(clon) }, {
          nombre: `Producto Clon ${sufijoUnico()}`,
          precio: 900,
          categoriaId,
        })
      ).body.data.id as number;
      const cliente = await clienteLogueado(request);

      const aceptado = await pedidoNuevo(request, cliente, productoId);
      await confirmarPagoTest(request, aceptado);
      expect((await apiConHeaders(request, 'PUT', `/pedidos/comercio/${aceptado}/aceptar`, dueno.token, { [HEADER]: String(dueno.comercioId) })).status).toBe(200);
      const sinResponder = await pedidoNuevo(request, cliente, productoId);
      await confirmarPagoTest(request, sinResponder);
      const pagoPendiente = await pedidoNuevo(request, cliente, productoClon);

      const { status, body } = await previa(request, dueno.token);

      expect(status).toBe(200);
      expect(body.data.puedeDesvincular).toBe(false);
      const principal = body.data.comercios.find((c: any) => c.id === dueno.comercioId);
      const delClon = body.data.comercios.find((c: any) => c.id === clon);
      const cantidadDe = (comercio: any, estado: string) => comercio.pedidosEnCurso.find((p: any) => p.estado === estado).cantidad;
      expect(cantidadDe(principal, 'EN_PREPARACION')).toBe(1);
      expect(cantidadDe(principal, 'PENDIENTE_CONFIRMACION_COMERCIO')).toBe(1);
      expect(principal.cantidadPagosPendientes).toBe(0);
      expect(delClon.cantidadPagosPendientes).toBe(1);
      expect(body.data.pagosPendientes.cantidadTotal).toBe(1);
      expect(body.data.pagosPendientes.puedeReintentarDesde).toBe(reintentoEsperadoDe(pagoPendiente));
    });

    test('404 sin cuenta activa, con el texto de cuenta', async ({ request }) => {
      const { dueno } = await duenoConProducto(request, false);

      const { status, body } = await previa(request, dueno.token);

      expect(status).toBe(404);
      expect(body.mensaje).toBe(MENSAJE_SIN_CUENTA);
    });

    test('un Cliente y un Administrador reciben 403 y sin token 401', async ({ request }) => {
      const cliente = await clienteLogueado(request);

      expect((await previa(request, cliente)).status).toBe(403);
      expect((await previa(request, adminToken)).status).toBe(403);
      expect((await previa(request, undefined)).status).toBe(401);
    });

    test('ignora X-Comercio-Id y solo muestra los comercios del Dueño autenticado', async ({ request }) => {
      const { dueno } = await duenoConProducto(request, true, cuentaMp('MP-AISLA'));
      const { dueno: otroDueno } = await duenoConProducto(request, true, cuentaMp('MP-AISLA-B'));

      const base = await previa(request, dueno.token);
      const conBasura = await previa(request, dueno.token, { [HEADER]: 'abc' });
      const conAjeno = await previa(request, dueno.token, { [HEADER]: String(otroDueno.comercioId) });
      const delOtro = await previa(request, otroDueno.token);

      expect(base.status).toBe(200);
      expect(conBasura.status).toBe(200);
      expect(conAjeno.status).toBe(200);
      expect(conBasura.body.data).toEqual(base.body.data);
      expect(conAjeno.body.data).toEqual(base.body.data);
      expect(base.body.data.comercios.map((c: any) => c.id)).toEqual([dueno.comercioId]);
      expect(delOtro.body.data.comercios.map((c: any) => c.id)).toEqual([otroDueno.comercioId]);
    });
  });

  test.describe('DELETE /oauth/mercadopago/desvincular', () => {
    test('con un pedido en PENDIENTE_PAGO de cualquier comercio del Dueño da 409 con la hora para reintentar y no cambia nada', async ({ request }) => {
      const { dueno } = await duenoConProducto(request, true, cuentaMp('MP-BLOQ'));
      const clon = await clonarComercioTest(request, dueno.comercioId, `Tramo5 Clon ${sufijoUnico()}`, 'APTO_VENTA');
      const productoClon = (
        await apiConHeaders(request, 'POST', '/productos', dueno.token, { [HEADER]: String(clon) }, {
          nombre: `Producto Clon ${sufijoUnico()}`,
          precio: 900,
          categoriaId,
        })
      ).body.data.id as number;
      const cliente = await clienteLogueado(request);
      const pedido = await pedidoNuevo(request, cliente, productoClon);

      const bloqueada = await desvincular(request, dueno.token);

      expect(bloqueada.status).toBe(409);
      expect(bloqueada.body.mensaje).toBe(
        `Hay 1 pedido de un cliente que todavía está pagando. Probá de nuevo alrededor de las ${horaEsperadaDe(pedido)}.`,
      );
      expect(bloqueada.body.data.cantidadPagosPendientes).toBe(1);
      expect(bloqueada.body.data.puedeReintentarDesde).toBe(reintentoEsperadoDe(pedido));
      expect(cuentaActivaDe(dueno.duenoId)).not.toBe('');
      expect(estadoDe(dueno.comercioId)).toBe('APTO_VENTA');
      expect(estadoDe(clon)).toBe('APTO_VENTA');
      expect(estadoPedido(pedido)).toBe('PENDIENTE_PAGO');
      expect(filasDeHistorialDesvinculacion(dueno.comercioId)).toBe(0);

      await confirmarPagoTest(request, pedido);
      const liberada = await desvincular(request, dueno.token);

      expect(liberada.status).toBe(200);
      expect(cuentaActivaDe(dueno.duenoId)).toBe('');
      expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
      expect(estadoDe(clon)).toBe('APROBADO');
      expect(filasDeHistorialDesvinculacion(dueno.comercioId)).toBe(1);
      expect(filasDeHistorialDesvinculacion(clon)).toBe(1);
      expect(sql(`SELECT access_token <> '' FROM cuenta_mercado_pago WHERE dueno_id = ${dueno.duenoId};`)).toBe('1');
    });

    test('con pedidos en curso y sin pagos pendientes desvincula, y los pedidos siguen su flujo; un rechazo posterior deja la nota en revisión manual', async ({ request }) => {
      const { dueno, productoId } = await duenoConProducto(request, true, cuentaMp('MP-FLUJO'));
      const cliente = await clienteLogueado(request);
      const paraAceptar = await pedidoNuevo(request, cliente, productoId);
      await confirmarPagoTest(request, paraAceptar);
      const paraRechazar = await pedidoNuevo(request, cliente, productoId);
      await confirmarPagoTest(request, paraRechazar);
      sembrarPagoAprobado(paraRechazar);

      const previaAntes = await previa(request, dueno.token);
      expect(previaAntes.body.data.puedeDesvincular).toBe(true);
      expect(previaAntes.body.data.comercios[0].pedidosEnCurso[0]).toEqual({ estado: 'PENDIENTE_CONFIRMACION_COMERCIO', cantidad: 2 });

      expect((await desvincular(request, dueno.token)).status).toBe(200);
      expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
      expect(estadoPedido(paraAceptar)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');
      expect(estadoPedido(paraRechazar)).toBe('PENDIENTE_CONFIRMACION_COMERCIO');

      const cabecera = { [HEADER]: String(dueno.comercioId) };
      const aceptado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${paraAceptar}/aceptar`, dueno.token, cabecera);
      expect(aceptado.status).toBe(200);
      expect(estadoPedido(paraAceptar)).toBe('EN_PREPARACION');
      const despachado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${paraAceptar}/despachar`, dueno.token, cabecera);
      expect(despachado.status).toBe(200);
      expect(estadoPedido(paraAceptar)).toBe('LISTO_PARA_RETIRAR');

      const rechazado = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${paraRechazar}/rechazar`, dueno.token, cabecera, { motivo: 'SIN_STOCK' });
      expect(rechazado.status).toBe(200);
      expect(estadoPedido(paraRechazar)).toBe('RECHAZADO');
      expect(
        sql(
          `SELECT n.estado FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ${paraRechazar} ORDER BY n.id DESC LIMIT 1;`,
        ),
      ).toBe('PENDIENTE_REVISION_MANUAL');
    });

    test('una segunda desvinculación y la de un Dueño sin cuenta dan 404 con el texto de cuenta', async ({ request }) => {
      const { dueno } = await duenoConProducto(request, true, cuentaMp('MP-DOS'));
      expect((await desvincular(request, dueno.token)).status).toBe(200);

      const segunda = await desvincular(request, dueno.token);
      expect(segunda.status).toBe(404);
      expect(segunda.body.mensaje).toBe(MENSAJE_SIN_CUENTA);

      const { dueno: nuncaVinculo } = await duenoConProducto(request, false);
      const sinCuenta = await desvincular(request, nuncaVinculo.token);
      expect(sinCuenta.status).toBe(404);
      expect(sinCuenta.body.mensaje).toBe(MENSAJE_SIN_CUENTA);
    });

    test('un Cliente y un Administrador reciben 403', async ({ request }) => {
      const cliente = await clienteLogueado(request);

      expect((await desvincular(request, cliente)).status).toBe(403);
      expect((await desvincular(request, adminToken)).status).toBe(403);
    });
  });

  test.describe('Crear un pedido revalida que el comercio pueda vender', () => {
    test('con el comercio ya en APROBADO por una desvinculación, crear el pedido da 409 y no deja ningún pedido', async ({ request }) => {
      const { dueno, productoId } = await duenoConProducto(request, true, cuentaMp('MP-PEDIDO'));
      const cliente = await clienteLogueado(request);
      await agregarItemCarrito(request, cliente, productoId, 1);
      expect((await desvincular(request, dueno.token)).status).toBe(200);
      expect(estadoDe(dueno.comercioId)).toBe('APROBADO');

      const { status, body } = await apiPost(request, '/pedidos/cliente', { tipoEntrega: 'RETIRO', direccionId: null }, cliente);

      expect(status).toBe(409);
      expect(body.mensaje).toBe(MENSAJE_SIN_ACEPTAR_PEDIDOS);
      expect(Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId};`))).toBe(0);
    });

    test('con el comercio en APTO_VENTA el pedido se crea en PENDIENTE_PAGO como siempre', async ({ request }) => {
      const { dueno, productoId } = await duenoConProducto(request, true, cuentaMp('MP-NORMAL'));
      const cliente = await clienteLogueado(request);

      const pedido = await pedidoNuevo(request, cliente, productoId);

      expect(estadoPedido(pedido)).toBe('PENDIENTE_PAGO');
      const detalle = await apiGet(request, '/pedidos/cliente', cliente);
      expect(detalle.status).toBe(200);
      expect(detalle.body.data.some((p: any) => p.id === pedido)).toBe(true);
      expect(Number(sql(`SELECT COUNT(*) FROM pedido WHERE comercio_id = ${dueno.comercioId};`))).toBe(1);
    });
  });
});
