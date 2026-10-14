import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  aceptarInvitacion,
  agregarItemCarrito,
  apiConHeaders,
  apiGet,
  apiPut,
  clonarComercioTest,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
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
import { prepararAprobado } from './helpers/multicomercio';

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const HEADER = 'X-Comercio-Id';
const NO_ENCONTRADO = { mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } };
const ACCESIBLES = ['APROBADO', 'APTO_VENTA', 'SUSPENDIDO', 'CERRADO_TEMPORALMENTE'];
const NO_ACCESIBLES = ['PENDIENTE', 'RECHAZADO', 'INACTIVO', 'RECHAZO_DEFINITIVO'];
const CAMPOS_PERFIL_EMPLEADO = [
  'abiertoAhora',
  'aceptaDelivery',
  'aceptaRetiro',
  'cerradoManualmente',
  'descripcion',
  'direccion',
  'emailContacto',
  'estado',
  'fotoPerfilUrl',
  'horarios',
  'id',
  'nombre',
  'puedeCambiarCierre',
  'telefono',
  'textoReapertura',
  'tipoComercio',
];
const CAMPOS_EXCLUIDOS = [
  'cuit',
  'razonSocial',
  'condicionIva',
  'tipoSociedad',
  'domicilioFiscal',
  'fechaInicioActividades',
  'representante',
  'motivoRechazo',
];
const CAMPOS_PEDIDO_EMPLEADO = [
  'canceladoPor',
  'comentarioRechazo',
  'comercioId',
  'detalles',
  'direccion',
  'esPedidoPropio',
  'estado',
  'fechaCreacion',
  'fechaEntrega',
  'fechaPagoAprobado',
  'fuenteEntrega',
  'id',
  'motivoAnulacion',
  'motivoRechazo',
  'nombreCliente',
  'reembolsoEstado',
  'reembolsoMonto',
  'subtotal',
  'tipoEntrega',
  'total',
];
const CAMPOS_PEDIDO_EXCLUIDOS = ['clienteId', 'pagoEstado', 'cargoServicioCliente', 'cargoServicioComercio'];
const CAMPOS_RESUMEN = ['cantidadPedidosHoy', 'cantidadPendientes', 'totalFacturadoHoy'];
const ESTADOS_FACTURADOS = ['EN_PREPARACION', 'EN_CAMINO', 'LISTO_PARA_RETIRAR', 'ENTREGADO'];
const REEMBOLSO_SIMPLE: Record<string, string> = {
  PENDIENTE: 'EN_PROCESO',
  PENDIENTE_REINTENTO: 'EN_PROCESO',
  PROCESADO: 'REEMBOLSADO',
  FALLIDO: 'EN_REVISION',
  PENDIENTE_REVISION_MANUAL: 'EN_REVISION',
};
const CAMPOS_MIS_COMERCIOS = [
  'abiertoAhora',
  'cantidadNotificacionesNoLeidas',
  'cerradoManualmente',
  'estado',
  'fechaAlta',
  'fechaRegistro',
  'fotoPerfilUrl',
  'id',
  'nombre',
  'operativo',
  'puedeCambiarCierre',
  'textoReapertura',
];

const conComercio = (comercioId: number | string): Record<string, string> => ({ [HEADER]: String(comercioId) });
const estadoDe = (comercioId: number, estado: string): string => sql(`UPDATE comercio SET estado = '${estado}' WHERE id = ${comercioId};`);

function perfil(request: APIRequestContext, token: string | undefined, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'GET', '/comercios/perfil', token, headers);
}

function productos(request: APIRequestContext, token: string | undefined, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'GET', '/productos', token, headers);
}

function pedidos(request: APIRequestContext, token: string | undefined, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'GET', '/pedidos/comercio', token, headers);
}

function resumenHoy(request: APIRequestContext, token: string | undefined, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', token, headers);
}

function misComerciosEmpleado(request: APIRequestContext, token: string | undefined, headers: Record<string, string> = {}) {
  return apiConHeaders(request, 'GET', '/empleados/mis-comercios', token, headers);
}

function atajoEstadoRelacion(request: APIRequestContext, comercioId: number, empleadoId: number, estado: 'ACTIVO' | 'INACTIVO') {
  return apiPut(request, `/test/comercios/${comercioId}/empleados/${empleadoId}/estado?estado=${estado}`, {});
}

test.describe('Rol Empleado, tramo E2 (API): acceso de lectura a un comercio', () => {
  test.describe.configure({ timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;
  let otroDueno: Dueno;
  let empleado: ClienteRegistrado;
  let empleadoId: number;
  let empleadoToken: string;
  let clienteSinRelacion: ClienteRegistrado;
  let clienteSinRelacionToken: string;
  let categoriaId: number;

  async function sumarAlEquipo(
    request: APIRequestContext,
    comercioId: number,
    cuenta: ClienteRegistrado,
    tokenDelDueno: string = dueno.token,
  ): Promise<void> {
    const invitacion = await invitarEmpleado(request, tokenDelDueno, comercioId, cuenta.email);
    expect(invitacion.status, JSON.stringify(invitacion.body)).toBe(201);
    const codigo = await obtenerCodigoInvitacionTest(request, cuenta.email, comercioId);
    const aceptada = await aceptarInvitacion(request, { email: cuenta.email, codigo });
    expect(aceptada.status, JSON.stringify(aceptada.body)).toBe(200);
  }

  async function comercioDelEquipo(request: APIRequestContext, estado = 'APROBADO'): Promise<number> {
    const comercioId = await clonarComercioTest(request, dueno.comercioId, `Acceso E2 ${sufijoUnico()}`, 'APROBADO');
    await sumarAlEquipo(request, comercioId, empleado);
    if (estado !== 'APROBADO') {
      estadoDe(comercioId, estado);
    }
    return comercioId;
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, false, horarios);
    otroDueno = await prepararAprobado(request, adminToken, localidadId, false, horarios);
    categoriaId = await crearCategoria(request, adminToken, `Cat E2 ${sufijoUnico()}`);
    await crearProducto(request, dueno.token, { nombre: `Producto E2 ${sufijoUnico()}`, precio: 1500, categoriaId });

    empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, empleado);
    const sesionEmpleado = await login(request, empleado.nombreUsuario, empleado.password);
    empleadoToken = sesionEmpleado.token;
    empleadoId = sesionEmpleado.usuario.id;

    clienteSinRelacion = await registrarYVerificarCliente(request, localidadId);
    clienteSinRelacionToken = (await login(request, clienteSinRelacion.nombreUsuario, clienteSinRelacion.password)).token;
  });

  test.describe('Lista blanca de lecturas', () => {
    test('el Empleado lee el perfil del comercio con el DTO reducido, solo con los campos de la lista blanca', async ({ request }) => {
      const respuesta = await perfil(request, empleadoToken, conComercio(dueno.comercioId));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.mensaje).toBe('Perfil obtenido correctamente');
      const datos = respuesta.body.data;
      expect(Object.keys(datos).sort()).toEqual(CAMPOS_PERFIL_EMPLEADO);
      expect(datos.id).toBe(dueno.comercioId);
      const completo = await perfil(request, dueno.token, conComercio(dueno.comercioId));
      expect(datos.nombre).toBe(completo.body.data.nombre);
      expect(datos.estado).toBe('APROBADO');
      expect(typeof datos.abiertoAhora).toBe('boolean');
      expect(datos.cerradoManualmente).toBe(false);
      expect(datos.horarios.length).toBeGreaterThan(0);
      expect(datos.direccion.calle).toBeTruthy();
    });

    test('el perfil reducido suma tipo de comercio, modalidades de entrega, puedeCambiarCierre y textoReapertura, con los mismos valores que ve el Dueño', async ({ request }) => {
      const delEmpleado = (await perfil(request, empleadoToken, conComercio(dueno.comercioId))).body.data;
      const delDueno = (await perfil(request, dueno.token, conComercio(dueno.comercioId))).body.data;

      for (const campo of ['tipoComercio', 'aceptaDelivery', 'aceptaRetiro', 'puedeCambiarCierre', 'textoReapertura']) {
        expect(Object.keys(delEmpleado), campo).toContain(campo);
        expect(delEmpleado[campo], campo).toEqual(delDueno[campo]);
      }
      expect(typeof delEmpleado.tipoComercio).toBe('string');
      expect(typeof delEmpleado.aceptaDelivery).toBe('boolean');
      expect(typeof delEmpleado.aceptaRetiro).toBe('boolean');
      expect(delEmpleado.aceptaDelivery || delEmpleado.aceptaRetiro).toBe(true);
      expect(typeof delEmpleado.puedeCambiarCierre).toBe('boolean');
    });

    test('el DTO reducido no contiene ninguno de los campos excluidos ni los valores fiscales o del titular', async ({ request }) => {
      const completo = await perfil(request, dueno.token, conComercio(dueno.comercioId));
      expect(completo.status).toBe(200);
      const respuesta = await perfil(request, empleadoToken, conComercio(dueno.comercioId));
      const texto = JSON.stringify(respuesta.body);

      for (const campo of CAMPOS_EXCLUIDOS) {
        expect(Object.keys(respuesta.body.data), campo).not.toContain(campo);
      }
      expect(texto).not.toContain(completo.body.data.cuit);
      expect(texto).not.toContain(completo.body.data.razonSocial);
      expect(texto).not.toContain(completo.body.data.domicilioFiscal);
      expect(texto.split(dueno.email).length - 1, 'el email aparece a lo sumo una vez, como emailContacto').toBeLessThanOrEqual(1);
      expect(texto).not.toContain(dueno.nombreUsuario);
      expect(texto.toLowerCase()).not.toContain('mercadopago');
    });

    test('el Dueño sigue recibiendo el DTO completo, con los datos fiscales y el representante', async ({ request }) => {
      const respuesta = await perfil(request, dueno.token, conComercio(dueno.comercioId));

      expect(respuesta.status).toBe(200);
      for (const campo of ['cuit', 'razonSocial', 'condicionIva', 'tipoSociedad', 'domicilioFiscal', 'fechaInicioActividades', 'representante', 'emailContacto', 'puedeCambiarCierre']) {
        expect(Object.keys(respuesta.body.data), campo).toContain(campo);
      }
      expect(respuesta.body.data.representante.dni).toBeTruthy();
    });

    test('el Empleado lee la lista de productos del comercio, igual que el Dueño', async ({ request }) => {
      const delDueno = await productos(request, dueno.token, conComercio(dueno.comercioId));
      const delEmpleado = await productos(request, empleadoToken, conComercio(dueno.comercioId));

      expect(delDueno.status).toBe(200);
      expect(delEmpleado.status).toBe(200);
      expect(delEmpleado.body.data.length).toBeGreaterThan(0);
      expect(delEmpleado.body.data).toEqual(delDueno.body.data);
    });

    test('el Empleado lee los pedidos del comercio y el resumen de hoy', async ({ request }) => {
      const lista = await pedidos(request, empleadoToken, conComercio(dueno.comercioId));
      const resumen = await resumenHoy(request, empleadoToken, conComercio(dueno.comercioId));
      const resumenDueno = await resumenHoy(request, dueno.token, conComercio(dueno.comercioId));

      expect(lista.status).toBe(200);
      expect(Array.isArray(lista.body.data)).toBe(true);
      expect(resumen.status).toBe(200);
      expect(resumen.body.data).toEqual(resumenDueno.body.data);
    });

    test('con dos comercios, cada header devuelve los datos de su comercio y nunca los del otro', async ({ request }) => {
      const segundo = await comercioDelEquipo(request);

      const primero = await perfil(request, empleadoToken, conComercio(dueno.comercioId));
      const otro = await perfil(request, empleadoToken, conComercio(segundo));

      expect(primero.body.data.id).toBe(dueno.comercioId);
      expect(otro.body.data.id).toBe(segundo);
      expect(otro.body.data.nombre).not.toBe(primero.body.data.nombre);
      const productosSegundo = await productos(request, empleadoToken, conComercio(segundo));
      expect(productosSegundo.status).toBe(200);
      expect(productosSegundo.body.data).toEqual([]);
    });

    test('sin token las cuatro lecturas dan 401', async ({ request }) => {
      for (const llamar of [perfil, productos, pedidos, resumenHoy]) {
        expect((await llamar(request, undefined, conComercio(dueno.comercioId))).status).toBe(401);
      }
    });

    test('el Administrador recibe 403 en las cuatro lecturas, con y sin header', async ({ request }) => {
      for (const llamar of [perfil, productos, pedidos, resumenHoy]) {
        expect((await llamar(request, adminToken, conComercio(dueno.comercioId))).status).toBe(403);
        expect((await llamar(request, adminToken)).status).toBe(403);
      }
    });
  });

  test.describe('Pedidos y resumen del día: DTO reducido del Empleado', () => {
    const PRECIO = 3300;
    let duenoMp: Dueno;
    const ids: Record<string, number> = {};
    const pedidosSembrados: number[] = [];

    function sembrarNota(pedidoId: number, estado: string): void {
      sql(
        `INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_confirmacion) ` +
          `SELECT id, total, 'approved', 'sintetico-${pedidoId}', NOW() FROM pedido WHERE id = ${pedidoId};`,
      );
      sql(
        `INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos, mp_payment_id, ultimo_error, fecha_emision) ` +
          `SELECT p.id, p.monto, 'RECHAZO_COMERCIO', '${estado}', 2, p.id_transaccion_mp, 'error tecnico sintetico del spec 37', NOW() ` +
          `FROM pago p WHERE p.pedido_id = ${pedidoId};`,
      );
      pedidosSembrados.push(pedidoId);
    }

    function listaDe(request: APIRequestContext, token: string) {
      return apiConHeaders(request, 'GET', '/pedidos/comercio', token, conComercio(duenoMp.comercioId));
    }

    function resumenDe(request: APIRequestContext, token: string) {
      return apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', token, conComercio(duenoMp.comercioId));
    }

    test.beforeAll(async ({ request }) => {
      const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
      duenoMp = await prepararAprobado(request, adminToken, localidadId, true, horarios);
      const productoId = await crearProducto(request, duenoMp.token, { nombre: `Producto Pedidos E2 ${sufijoUnico()}`, precio: PRECIO, categoriaId });
      await sumarAlEquipo(request, duenoMp.comercioId, empleado, duenoMp.token);

      const cliente = await registrarYVerificarCliente(request, localidadId);
      const clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);
      for (const clave of ['pendiente', 'aceptado', 'rechazado', 'procesado', 'reintento', 'fallido']) {
        await agregarItemCarrito(request, clienteSesion.token, productoId, 1);
        const pedidoId = await crearPedido(request, clienteSesion.token, 'RETIRO');
        await confirmarPagoTest(request, pedidoId);
        ids[clave] = pedidoId;
      }
      const aceptar = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${ids.aceptado}/aceptar`, duenoMp.token, conComercio(duenoMp.comercioId));
      expect(aceptar.status, JSON.stringify(aceptar.body)).toBe(200);
      const rechazar = await apiConHeaders(request, 'PUT', `/pedidos/comercio/${ids.rechazado}/rechazar`, duenoMp.token, conComercio(duenoMp.comercioId), {
        motivo: 'SIN_STOCK',
      });
      expect(rechazar.status, JSON.stringify(rechazar.body)).toBe(200);
      sembrarNota(ids.procesado, 'PROCESADO');
      sembrarNota(ids.reintento, 'PENDIENTE_REINTENTO');
      sembrarNota(ids.fallido, 'FALLIDO');
    });

    test.afterAll(() => {
      if (pedidosSembrados.length > 0) {
        sql(`DELETE FROM nota_credito WHERE pago_id IN (SELECT id FROM pago WHERE pedido_id IN (${pedidosSembrados.join(',')}));`);
        sql(`DELETE FROM pago WHERE pedido_id IN (${pedidosSembrados.join(',')}) AND id_transaccion_mp LIKE 'sintetico-%';`);
      }
    });

    test('cada pedido que recibe el Empleado tiene exactamente los campos de la lista blanca y ninguno de los excluidos', async ({ request }) => {
      const respuesta = await listaDe(request, empleadoToken);

      expect(respuesta.status).toBe(200);
      const lista = respuesta.body.data as Array<Record<string, any>>;
      expect(lista.length).toBe(Object.keys(ids).length);
      for (const pedido of lista) {
        expect(Object.keys(pedido).sort(), `pedido ${pedido.id}`).toEqual(CAMPOS_PEDIDO_EMPLEADO);
        for (const excluido of CAMPOS_PEDIDO_EXCLUIDOS) {
          expect(Object.keys(pedido), excluido).not.toContain(excluido);
        }
        for (const detalle of pedido.detalles) {
          expect(Object.keys(detalle).sort()).toEqual(['cantidad', 'nombreProducto', 'nota', 'precioUnitario', 'productoId', 'subtotal']);
        }
      }
    });

    test('el texto de la respuesta del Empleado no contiene cargos de servicio, comisiones ni datos de Mercado Pago o técnicos del reembolso', async ({ request }) => {
      const texto = JSON.stringify((await listaDe(request, empleadoToken)).body).toLowerCase();

      for (const prohibido of ['cargoservicio', 'marketplace', 'mercadopago', 'mp_', 'ultimoerror', 'intentos', 'error tecnico', 'sintetico', 'pagoestado', 'clienteid', 'fallido', 'revision_manual', 'reintento']) {
        expect(texto, prohibido).not.toContain(prohibido);
      }
    });

    test('los datos compartidos del pedido coinciden con los del Dueño: identificador, estado, cliente, entrega, ítems, subtotal, total, motivos y fechas', async ({ request }) => {
      const delEmpleado = (await listaDe(request, empleadoToken)).body.data as Array<Record<string, any>>;
      const delDueno = (await listaDe(request, duenoMp.token)).body.data as Array<Record<string, any>>;

      expect(delEmpleado.map((p) => p.id)).toEqual(delDueno.map((p) => p.id));
      for (const [i, pedido] of delEmpleado.entries()) {
        const completo = delDueno[i];
        for (const campo of CAMPOS_PEDIDO_EMPLEADO.filter((c) => c !== 'reembolsoEstado' && c !== 'esPedidoPropio')) {
          expect(pedido[campo], `pedido ${pedido.id} ${campo}`).toEqual(completo[campo]);
        }
      }
      const rechazado = delEmpleado.find((p) => p.id === ids.rechazado)!;
      expect(rechazado.estado).toBe('RECHAZADO');
      expect(rechazado.motivoRechazo).toBe('SIN_STOCK');
      expect(rechazado.canceladoPor).toBe('COMERCIO');
      const aceptado = delEmpleado.find((p) => p.id === ids.aceptado)!;
      expect(aceptado.estado).toBe('EN_PREPARACION');
      expect(aceptado.detalles[0].precioUnitario).toBe(PRECIO);
      expect(aceptado.subtotal).toBe(PRECIO);
      expect(aceptado.total).toBeGreaterThanOrEqual(PRECIO);
      expect(aceptado.nombreCliente).toBeTruthy();
      expect(aceptado.tipoEntrega).toBe('RETIRO');
    });

    test('el Dueño sigue recibiendo el DTO completo, con los cargos de servicio, el id del cliente y el estado del pago', async ({ request }) => {
      const lista = (await listaDe(request, duenoMp.token)).body.data as Array<Record<string, any>>;

      expect(lista.length).toBeGreaterThan(0);
      for (const pedido of lista) {
        for (const campo of [...CAMPOS_PEDIDO_EXCLUIDOS, ...CAMPOS_PEDIDO_EMPLEADO.filter((c) => c !== 'esPedidoPropio')]) {
          expect(Object.keys(pedido), `pedido ${pedido.id} ${campo}`).toContain(campo);
        }
        expect(Object.keys(pedido)).not.toContain('esPedidoPropio');
      }
      const aceptado = lista.find((p) => p.id === ids.aceptado)!;
      expect(aceptado.pagoEstado).toBe('PAGADO');
      expect(aceptado.cargoServicioComercio).toBeGreaterThanOrEqual(0);
    });

    test('el reembolso se ve en términos simples: sin reembolso, en proceso, reembolsado y en revisión, con el monto', async ({ request }) => {
      const delEmpleado = (await listaDe(request, empleadoToken)).body.data as Array<Record<string, any>>;
      const delDueno = (await listaDe(request, duenoMp.token)).body.data as Array<Record<string, any>>;
      const porId = (lista: Array<Record<string, any>>, id: number) => lista.find((p) => p.id === id)!;

      expect(porId(delEmpleado, ids.pendiente).reembolsoEstado).toBe('SIN_REEMBOLSO');
      expect(porId(delEmpleado, ids.pendiente).reembolsoMonto).toBeNull();
      expect(porId(delEmpleado, ids.aceptado).reembolsoEstado).toBe('SIN_REEMBOLSO');
      const procesado = porId(delEmpleado, ids.procesado);
      expect(procesado.reembolsoEstado).toBe('REEMBOLSADO');
      expect(procesado.reembolsoMonto).toBe(porId(delDueno, ids.procesado).reembolsoMonto);
      expect(procesado.reembolsoMonto).toBeGreaterThan(0);
      expect(porId(delEmpleado, ids.reintento).reembolsoEstado).toBe('EN_PROCESO');
      expect(porId(delEmpleado, ids.fallido).reembolsoEstado).toBe('EN_REVISION');
      expect(porId(delDueno, ids.fallido).reembolsoEstado).toBe('FALLIDO');
      for (const pedido of delEmpleado) {
        const crudo = porId(delDueno, pedido.id).reembolsoEstado as string | null;
        expect(pedido.reembolsoEstado, `pedido ${pedido.id}`).toBe(crudo === null ? 'SIN_REEMBOLSO' : REEMBOLSO_SIMPLE[crudo]);
      }
    });

    test('el resumen del Empleado trae solo tres campos; el facturado es el bruto de productos y el del Dueño el neto, con los mismos contadores', async ({ request }) => {
      const resumenEmpleado = (await resumenDe(request, empleadoToken)).body.data;
      const resumenDueno = (await resumenDe(request, duenoMp.token)).body.data;
      const completos = (await listaDe(request, duenoMp.token)).body.data as Array<Record<string, any>>;
      const facturados = completos.filter((p) => ESTADOS_FACTURADOS.includes(p.estado));
      const bruto = facturados.reduce((suma, p) => suma + p.subtotal, 0);
      const neto = facturados.reduce((suma, p) => suma + p.subtotal - p.cargoServicioComercio, 0);

      expect(Object.keys(resumenEmpleado).sort()).toEqual(CAMPOS_RESUMEN);
      expect(Object.keys(resumenDueno).sort()).toEqual(CAMPOS_RESUMEN);
      expect(facturados.length).toBe(1);
      expect(resumenEmpleado.totalFacturadoHoy).toBeCloseTo(bruto, 2);
      expect(resumenDueno.totalFacturadoHoy).toBeCloseTo(neto, 2);
      expect(resumenEmpleado.totalFacturadoHoy).toBe(PRECIO);
      expect(resumenEmpleado.cantidadPedidosHoy).toBe(resumenDueno.cantidadPedidosHoy);
      expect(resumenEmpleado.cantidadPedidosHoy).toBe(Object.keys(ids).length);
      expect(resumenEmpleado.cantidadPendientes).toBe(resumenDueno.cantidadPendientes);
      expect(resumenEmpleado.cantidadPendientes).toBe(4);
    });

    test('el Empleado no ve pedidos de otro comercio: con el header de su otro comercio la lista y el resumen están vacíos', async ({ request }) => {
      const vacio = await apiConHeaders(request, 'GET', '/pedidos/comercio', empleadoToken, conComercio(dueno.comercioId));
      const resumen = await apiConHeaders(request, 'GET', '/pedidos/comercio/resumen-hoy', empleadoToken, conComercio(dueno.comercioId));

      expect(vacio.status).toBe(200);
      expect(vacio.body.data).toEqual([]);
      expect(resumen.body.data.totalFacturadoHoy).toBe(0);
      expect(resumen.body.data.cantidadPedidosHoy).toBe(0);
    });
  });

  test.describe('Las escrituras y lo exclusivo del Dueño siguen cerrados', () => {
    test('un Empleado activo recibe 403 en la edicion completa del perfil, la foto y su firma (las escrituras delegadas de E3 A2 se prueban en el spec 42)', async ({ request }) => {
      const cabeceras = conComercio(dueno.comercioId);
      const intentos: Array<[Metodo, string, unknown?]> = [
        ['PUT', '/comercios/perfil', { nombre: 'Hackeado' }],
        ['PUT', '/comercios/perfil/foto', { url: 'https://res.cloudinary.com/demo/image/upload/x.png' }],
        ['POST', '/comercios/perfil/foto/firma'],
      ];
      for (const [metodo, ruta, cuerpo] of intentos) {
        const respuesta = await apiConHeaders(request, metodo, ruta, empleadoToken, cabeceras, cuerpo);
        expect(respuesta.status, `${metodo} ${ruta}`).toBe(403);
      }
    });

    test('un Empleado activo recibe 403 en equipo, redes sociales, Mercado Pago, alta y corrección de comercios', async ({ request }) => {
      const cabeceras = conComercio(dueno.comercioId);
      const intentos: Array<[Metodo, string, unknown?]> = [
        ['GET', '/comercios/equipo'],
        ['POST', '/comercios/equipo/invitaciones', { email: 'x@bajonea.test' }],
        ['GET', '/comercios/redes-sociales'],
        ['POST', '/comercios/redes-sociales', { tipo: 'INSTAGRAM', url: 'https://instagram.com/x' }],
        ['GET', '/comercios/mis-comercios'],
        ['GET', '/comercios/alta-adicional/elegibilidad'],
        ['POST', '/comercios/nuevo/foto/firma'],
        ['GET', `/comercios/${dueno.comercioId}/correccion`],
        ['GET', '/oauth/mercadopago/cuenta'],
        ['GET', '/oauth/mercadopago/iniciar'],
        ['GET', '/oauth/mercadopago/desvinculacion/previa'],
        ['DELETE', '/oauth/mercadopago/desvincular'],
        ['GET', '/pedidos/comercio/1/pago'],
        ['PUT', `/notificaciones/comercio/${dueno.comercioId}/leidas`],
      ];
      for (const [metodo, ruta, cuerpo] of intentos) {
        const respuesta = await apiConHeaders(request, metodo, ruta, empleadoToken, cabeceras, cuerpo);
        expect(respuesta.status, `${metodo} ${ruta}`).toBe(403);
      }
    });
  });

  test.describe('El 404 del resolver no distingue ningún caso', () => {
    test('comercio inexistente, ajeno, sin relación, relación inactiva y estado no accesible dan exactamente el mismo cuerpo', async ({ request }) => {
      const inactivo = await comercioDelEquipo(request);
      expect((await atajoEstadoRelacion(request, inactivo, empleadoId, 'INACTIVO')).status).toBe(200);
      const pendiente = await comercioDelEquipo(request, 'PENDIENTE');
      const sinRelacion = await clonarComercioTest(request, dueno.comercioId, `Sin relacion ${sufijoUnico()}`, 'APROBADO');

      const respuestas = [
        await perfil(request, empleadoToken, conComercio(2_000_000_000)),
        await perfil(request, empleadoToken, conComercio(otroDueno.comercioId)),
        await perfil(request, empleadoToken, conComercio(sinRelacion)),
        await perfil(request, empleadoToken, conComercio(inactivo)),
        await perfil(request, empleadoToken, conComercio(pendiente)),
        await perfil(request, clienteSinRelacionToken, conComercio(dueno.comercioId)),
        await perfil(request, dueno.token, conComercio(otroDueno.comercioId)),
        await perfil(request, dueno.token, conComercio(2_000_000_000)),
      ];

      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(NO_ENCONTRADO);
      }
      expect(new Set(respuestas.map((r) => JSON.stringify(r.body))).size).toBe(1);
    });

    test('el mismo 404 se obtiene en las cuatro rutas delegables', async ({ request }) => {
      for (const llamar of [perfil, productos, pedidos, resumenHoy]) {
        const respuesta = await llamar(request, empleadoToken, conComercio(otroDueno.comercioId));
        expect(respuesta.status).toBe(404);
        expect(respuesta.body).toEqual(NO_ENCONTRADO);
      }
    });

    for (const estado of ACCESIBLES) {
      test(`el Empleado activo accede a un comercio ${estado} en las cuatro lecturas`, async ({ request }) => {
        const comercioId = await comercioDelEquipo(request, estado);

        for (const llamar of [perfil, productos, pedidos, resumenHoy]) {
          expect((await llamar(request, empleadoToken, conComercio(comercioId))).status).toBe(200);
        }
        expect((await perfil(request, empleadoToken, conComercio(comercioId))).body.data.estado).toBe(estado);
      });
    }

    for (const estado of NO_ACCESIBLES) {
      test(`el Empleado activo no accede a un comercio ${estado}: 404 idéntico`, async ({ request }) => {
        const comercioId = await comercioDelEquipo(request, estado);

        for (const llamar of [perfil, productos, pedidos, resumenHoy]) {
          const respuesta = await llamar(request, empleadoToken, conComercio(comercioId));
          expect(respuesta.status).toBe(404);
          expect(respuesta.body).toEqual(NO_ENCONTRADO);
        }
      });
    }

    test('desactivar la relación corta el acceso en la request siguiente, con el mismo token, y reactivarla lo devuelve', async ({ request }) => {
      const comercioId = await comercioDelEquipo(request);
      expect((await perfil(request, empleadoToken, conComercio(comercioId))).status).toBe(200);

      expect((await atajoEstadoRelacion(request, comercioId, empleadoId, 'INACTIVO')).status).toBe(200);
      expect(sql(`SELECT fecha_baja IS NOT NULL FROM empleado_comercio WHERE comercio_id = ${comercioId} AND empleado_id = ${empleadoId};`)).toBe('1');
      const cortado = await perfil(request, empleadoToken, conComercio(comercioId));
      expect(cortado.status).toBe(404);
      expect(cortado.body).toEqual(NO_ENCONTRADO);
      expect((await productos(request, empleadoToken, conComercio(comercioId))).status).toBe(404);

      expect((await atajoEstadoRelacion(request, comercioId, empleadoId, 'ACTIVO')).status).toBe(200);
      expect(sql(`SELECT fecha_baja IS NULL FROM empleado_comercio WHERE comercio_id = ${comercioId} AND empleado_id = ${empleadoId};`)).toBe('1');
      expect((await perfil(request, empleadoToken, conComercio(comercioId))).status).toBe(200);
    });

    test('el atajo de estado de la relación da 404 si el empleado no tiene relación con ese comercio', async ({ request }) => {
      const respuesta = await atajoEstadoRelacion(request, otroDueno.comercioId, empleadoId, 'INACTIVO');

      expect(respuesta.status).toBe(404);
    });
  });

  test.describe('El header', () => {
    test('ausente, vacío o no numérico da 400 con texto neutro, para el Empleado y para el Dueño', async ({ request }) => {
      for (const token of [empleadoToken, dueno.token]) {
        for (const cabeceras of [{}, { [HEADER]: '' }, { [HEADER]: '   ' }, { [HEADER]: 'abc' }, { [HEADER]: '1.5' }]) {
          const respuesta = await perfil(request, token, cabeceras);
          expect(respuesta.status, JSON.stringify(cabeceras)).toBe(400);
          expect(respuesta.body.mensaje).toContain(HEADER);
          expect(respuesta.body.mensaje).not.toContain('Dueño');
        }
      }
    });

    test('un Cliente sin relación con header ausente recibe 400 y con un comercio ajeno 404, nunca 403', async ({ request }) => {
      expect((await perfil(request, clienteSinRelacionToken)).status).toBe(400);
      expect((await perfil(request, clienteSinRelacionToken, conComercio(dueno.comercioId))).status).toBe(404);
    });
  });

  test.describe('GET /empleados/mis-comercios', () => {
    test('lista las relaciones activas con comercio accesible por fecha de alta, con la forma de mis-comercios más fechaAlta', async ({ request }) => {
      const cuenta = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
      const ids: Record<string, number> = {};
      for (const estado of [...ACCESIBLES, ...NO_ACCESIBLES]) {
        const comercioId = await clonarComercioTest(request, dueno.comercioId, `Lista E2 ${estado} ${sufijoUnico()}`, 'APROBADO');
        await sumarAlEquipo(request, comercioId, cuenta);
        estadoDe(comercioId, estado);
        ids[estado] = comercioId;
      }
      const inactivo = await clonarComercioTest(request, dueno.comercioId, `Lista E2 inactiva ${sufijoUnico()}`, 'APROBADO');
      await sumarAlEquipo(request, inactivo, cuenta);
      expect((await atajoEstadoRelacion(request, inactivo, sesion.usuario.id, 'INACTIVO')).status).toBe(200);

      const respuesta = await misComerciosEmpleado(request, sesion.token);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.mensaje).toBe('Comercios obtenidos correctamente');
      const filas = respuesta.body.data as Array<Record<string, any>>;
      expect(filas.map((fila) => fila.id)).toEqual(ACCESIBLES.map((estado) => ids[estado]));
      expect(filas.map((fila) => fila.estado)).toEqual(ACCESIBLES);
      expect(filas.map((fila) => fila.operativo)).toEqual([true, true, false, false]);
      for (const fila of filas) {
        expect(Object.keys(fila).sort()).toEqual(CAMPOS_MIS_COMERCIOS);
        expect(typeof fila.cantidadNotificacionesNoLeidas).toBe('number');
        expect(fila.fechaAlta).toBeTruthy();
        expect(fila.fechaRegistro).toBeTruthy();
      }
      const altas = filas.map((fila) => fila.fechaAlta as string);
      expect([...altas].sort()).toEqual(altas);
      for (const excluido of [...NO_ACCESIBLES.map((estado) => ids[estado]), inactivo]) {
        expect(filas.map((fila) => fila.id)).not.toContain(excluido);
      }
    });

    test('un Cliente sin relaciones recibe una lista vacía', async ({ request }) => {
      const respuesta = await misComerciosEmpleado(request, clienteSinRelacionToken);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.data).toEqual([]);
    });

    test('ignora el header X-Comercio-Id, incluso uno inválido o ajeno', async ({ request }) => {
      const base = await misComerciosEmpleado(request, empleadoToken);

      for (const valor of ['abc', '', String(otroDueno.comercioId), '2000000000']) {
        const respuesta = await misComerciosEmpleado(request, empleadoToken, { [HEADER]: valor });
        expect(respuesta.status, valor).toBe(200);
        expect(respuesta.body.data).toEqual(base.body.data);
      }
    });

    test('sin token da 401 y el Dueño y el Administrador reciben 403', async ({ request }) => {
      expect((await misComerciosEmpleado(request, undefined)).status).toBe(401);
      expect((await misComerciosEmpleado(request, dueno.token)).status).toBe(403);
      expect((await misComerciosEmpleado(request, adminToken)).status).toBe(403);
    });

    test('el listado del Dueño no cambia: sigue sin incluir al Empleado y solo se consulta con rol DUENO', async ({ request }) => {
      const respuesta = await apiGet(request, '/comercios/mis-comercios', dueno.token);

      expect(respuesta.status).toBe(200);
      expect((respuesta.body.data as Array<Record<string, any>>).every((fila) => !('fechaAlta' in fila))).toBe(true);
      expect((await apiGet(request, '/comercios/mis-comercios', empleadoToken)).status).toBe(403);
    });
  });

  test.describe('Notificaciones con el header (E3 A2)', () => {
    test('el Empleado sin header ve las suyas; con el header de su comercio 200; con uno ajeno 404 y con uno no numerico 400', async ({ request }) => {
      for (const [cabeceras, esperado] of [
        [{}, 200],
        [conComercio(dueno.comercioId), 200],
        [{ [HEADER]: 'abc' }, 400],
        [conComercio(otroDueno.comercioId), 404],
      ] as Array<[Record<string, string>, number]>) {
        const lista = await apiConHeaders(request, 'GET', '/notificaciones', empleadoToken, cabeceras);
        const contador = await apiConHeaders(request, 'GET', '/notificaciones/no-leidas/contador', empleadoToken, cabeceras);
        expect(lista.status, JSON.stringify(cabeceras)).toBe(esperado);
        expect(contador.status, JSON.stringify(cabeceras)).toBe(esperado);
      }
    });
  });
});
