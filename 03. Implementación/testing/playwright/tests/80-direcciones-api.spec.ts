import { test, expect } from './helpers/prueba';
import type { APIRequestContext } from '@playwright/test';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  confirmarPagoTest,
  crearCategoria,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, HorarioInput } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';

const BASE = '/clientes/direcciones';
const RIO_GRANDE = '94008010';
const USHUAIA = '94015020';
const TOLHUIN = '94011010';
const HEADER = 'X-Comercio-Id';
const todoElDia = (): HorarioInput[] => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

interface Cuenta {
  registro: ClienteRegistrado;
  id: number;
  token: string;
}

const cuerpo = (calle: string, localidadId = RIO_GRANDE, extra: Record<string, unknown> = {}) => ({
  calle,
  numero: '100',
  codigoPostal: '9420',
  localidadId,
  ...extra,
});

test.describe('Fase 3 (API): direcciones múltiples del Cliente', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;

  async function nuevaCuenta(request: APIRequestContext): Promise<Cuenta> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { registro, id: sesion.usuario.id, token: sesion.token };
  }

  const lista = async (request: APIRequestContext, cuenta: Cuenta) => {
    const respuesta = await apiGet(request, BASE, cuenta.token);
    expect(respuesta.status).toBe(200);
    return respuesta.body.data as any[];
  };

  const agregar = async (request: APIRequestContext, cuenta: Cuenta, calle: string, extra: Record<string, unknown> = {}) => {
    const respuesta = await apiPost(request, BASE, cuerpo(calle, RIO_GRANDE, extra), cuenta.token);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return respuesta.body.data.id as number;
  };

  const activas = (clienteId: number): number => Number(sql(`SELECT COUNT(*) FROM direccion WHERE cliente_id = ${clienteId} AND eliminada = 0;`));
  const predeterminadas = (clienteId: number): number =>
    Number(sql(`SELECT COUNT(*) FROM direccion WHERE cliente_id = ${clienteId} AND eliminada = 0 AND principal = 1;`));
  const predeterminadaDe = (clienteId: number): number =>
    Number(sql(`SELECT id FROM direccion WHERE cliente_id = ${clienteId} AND eliminada = 0 AND principal = 1;`));

  async function pedidoADomicilio(request: APIRequestContext, cuenta: Cuenta, direccionId: number | null): Promise<{ status: number; body: any }> {
    await apiConHeaders(request, 'DELETE', '/carrito', cuenta.token);
    await agregarItemCarrito(request, cuenta.token, productoId, 1);
    return apiPost(request, '/pedidos/cliente', { tipoEntrega: 'DOMICILIO', direccionId }, cuenta.token);
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Direcciones ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    sql(`UPDATE comercio SET acepta_delivery = 1, acepta_retiro = 1 WHERE id = ${dueno.comercioId};`);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto Dir ${sufijoUnico()}`, precio: 10000, categoriaId });
  });

  test('sin token da 401 y un Dueño da 403 en todas las rutas', async ({ request }) => {
    expect((await apiGet(request, BASE)).status).toBe(401);
    expect((await apiPost(request, BASE, cuerpo('Mitre'))).status).toBe(401);
    expect((await apiGet(request, BASE, dueno.token)).status).toBe(403);
    expect((await apiPost(request, BASE, cuerpo('Mitre'), dueno.token)).status).toBe(403);
    expect((await apiPut(request, `${BASE}/1`, cuerpo('Mitre'), dueno.token)).status).toBe(403);
    expect((await apiPut(request, `${BASE}/1/principal`, {}, dueno.token)).status).toBe(403);
    expect((await apiDelete(request, `${BASE}/1`, dueno.token)).status).toBe(403);
  });

  test('el registro deja la única dirección como predeterminada', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);

    const direcciones = await lista(request, cuenta);

    expect(direcciones).toHaveLength(1);
    expect(direcciones[0].principal).toBe(true);
    expect(direcciones[0].nombre).toBeNull();
    expect(direcciones[0].referencia).toBeNull();
  });

  test('el alta devuelve 201 y no queda predeterminada salvo que se pida; con principal la mueve', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const inicial = predeterminadaDe(cuenta.id);

    const segunda = await apiPost(request, BASE, cuerpo('Mitre', USHUAIA, { nombre: ' Casa ', referencia: ' Portón verde ' }), cuenta.token);
    const tercera = await apiPost(request, BASE, cuerpo('Belgrano', TOLHUIN, { principal: true }), cuenta.token);

    expect(segunda.status).toBe(201);
    expect(segunda.body.data.principal).toBe(false);
    expect(segunda.body.data.nombre).toBe('Casa');
    expect(segunda.body.data.referencia).toBe('Portón verde');
    expect(segunda.body.data.nombreLocalidad).toBe('Ushuaia');
    expect(tercera.body.data.principal).toBe(true);
    expect(predeterminadaDe(cuenta.id)).toBe(tercera.body.data.id);
    expect(predeterminadas(cuenta.id)).toBe(1);
    expect(inicial).not.toBe(tercera.body.data.id);
    const direcciones = await lista(request, cuenta);
    expect(direcciones[0].id).toBe(tercera.body.data.id);
  });

  test('el cupo es de cinco activas: la sexta da 409 DIRECCIONES_CUPO_MAXIMO y tras una baja se puede agregar', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    let ultima = 0;
    for (let i = 0; i < 4; i += 1) {
      ultima = await agregar(request, cuenta, `Calle ${i}`);
    }

    const sexta = await apiPost(request, BASE, cuerpo('Sexta'), cuenta.token);
    expect(sexta.status).toBe(409);
    expect(sexta.body.data.codigo).toBe('DIRECCIONES_CUPO_MAXIMO');
    expect(activas(cuenta.id)).toBe(5);

    expect((await apiDelete(request, `${BASE}/${ultima}`, cuenta.token)).status).toBe(200);
    await agregar(request, cuenta, 'Nueva');
    expect(activas(cuenta.id)).toBe(5);
  });

  test('la localidad tiene que ser una de las tres habilitadas: otra existente da 400 en localidadId y una inexistente 404', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const otra = sql(`SELECT id FROM localidad WHERE id NOT IN ('${RIO_GRANDE}','${USHUAIA}','${TOLHUIN}') LIMIT 1;`);

    const fuera = await apiPost(request, BASE, cuerpo('Mitre', otra), cuenta.token);
    const inexistente = await apiPost(request, BASE, cuerpo('Mitre', '00000000'), cuenta.token);

    expect(fuera.status).toBe(400);
    expect(fuera.body.data.localidadId).toBeTruthy();
    expect(inexistente.status).toBe(404);
    expect(activas(cuenta.id)).toBe(1);
  });

  test('las validaciones del DTO dan 400 por campo', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);

    const respuesta = await apiPost(request, BASE, {
      calle: '',
      numero: 'abc',
      codigoPostal: '9420',
      localidadId: RIO_GRANDE,
      nombre: 'x'.repeat(41),
      referencia: 'y'.repeat(151),
    }, cuenta.token);

    expect(respuesta.status).toBe(400);
    for (const campo of ['calle', 'numero', 'nombre', 'referencia']) {
      expect(respuesta.body.data[campo], campo).toBeTruthy();
    }
  });

  test('editar cambia los campos, ignora principal y sigue exigiendo una localidad habilitada', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const inicial = predeterminadaDe(cuenta.id);
    const segunda = await agregar(request, cuenta, 'Segunda');

    const editada = await apiPut(request, `${BASE}/${inicial}`, cuerpo('Nueva Calle', USHUAIA, { nombre: 'Trabajo', referencia: 'Timbre 2', principal: false }), cuenta.token);
    const sinSubir = await apiPut(request, `${BASE}/${segunda}`, cuerpo('Segunda', RIO_GRANDE, { principal: true }), cuenta.token);
    const otra = sql(`SELECT id FROM localidad WHERE id NOT IN ('${RIO_GRANDE}','${USHUAIA}','${TOLHUIN}') LIMIT 1;`);
    const estricto = await apiPut(request, `${BASE}/${segunda}`, cuerpo('Segunda', otra, { nombre: 'Solo alias' }), cuenta.token);

    expect(editada.status).toBe(200);
    expect(editada.body.data.calle).toBe('Nueva Calle');
    expect(editada.body.data.nombre).toBe('Trabajo');
    expect(editada.body.data.principal).toBe(true);
    expect(sinSubir.status).toBe(200);
    expect(sinSubir.body.data.principal).toBe(false);
    expect(predeterminadaDe(cuenta.id)).toBe(inicial);
    expect(estricto.status).toBe(400);
  });

  test('marcar como predeterminada deja una sola, devuelve la lista y es idempotente', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const segunda = await agregar(request, cuenta, 'Segunda');

    const primera = await apiPut(request, `${BASE}/${segunda}/principal`, {}, cuenta.token);
    const repetida = await apiPut(request, `${BASE}/${segunda}/principal`, {}, cuenta.token);

    expect(primera.status).toBe(200);
    expect(primera.body.data[0].id).toBe(segunda);
    expect(primera.body.data[0].principal).toBe(true);
    expect(repetida.status).toBe(200);
    expect(predeterminadas(cuenta.id)).toBe(1);
    expect(predeterminadaDe(cuenta.id)).toBe(segunda);
  });

  test('eliminar es lógico, promueve la más reciente si era la predeterminada y no deja eliminar la última', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const inicial = predeterminadaDe(cuenta.id);
    await agregar(request, cuenta, 'Segunda');
    const tercera = await agregar(request, cuenta, 'Tercera');

    const baja = await apiDelete(request, `${BASE}/${inicial}`, cuenta.token);

    expect(baja.status).toBe(200);
    expect(baja.body.mensaje).toBeTruthy();
    expect(baja.body.data).toHaveLength(2);
    expect(predeterminadaDe(cuenta.id)).toBe(tercera);
    expect(Number(sql(`SELECT eliminada FROM direccion WHERE id = ${inicial};`))).toBe(1);
    expect(sql(`SELECT fecha_baja IS NOT NULL FROM direccion WHERE id = ${inicial};`)).toBe('1');

    const restante = baja.body.data.find((d: any) => d.id !== tercera).id as number;
    expect((await apiDelete(request, `${BASE}/${restante}`, cuenta.token)).status).toBe(200);
    const ultima = await apiDelete(request, `${BASE}/${tercera}`, cuenta.token);
    expect(ultima.status).toBe(409);
    expect(ultima.body.data.codigo).toBe('ULTIMA_DIRECCION');
    expect(activas(cuenta.id)).toBe(1);
  });

  test('lo ajeno, lo inexistente y lo ya eliminado dan 404 en editar, predeterminar y eliminar', async ({ request }) => {
    const a = await nuevaCuenta(request);
    const b = await nuevaCuenta(request);
    const deB = predeterminadaDe(b.id);
    const borrada = await agregar(request, a, 'Borrada');
    expect((await apiDelete(request, `${BASE}/${borrada}`, a.token)).status).toBe(200);

    for (const id of [deB, 999999999, borrada]) {
      expect((await apiPut(request, `${BASE}/${id}`, cuerpo('Mitre'), a.token)).status, `editar ${id}`).toBe(404);
      expect((await apiPut(request, `${BASE}/${id}/principal`, {}, a.token)).status, `predeterminar ${id}`).toBe(404);
      expect((await apiDelete(request, `${BASE}/${id}`, a.token)).status, `eliminar ${id}`).toBe(404);
    }
    expect(activas(b.id)).toBe(1);
    expect(sql(`SELECT calle FROM direccion WHERE id = ${deB};`)).toBe('Calle Siempre Viva');
  });

  test('GET /clientes/perfil devuelve la predeterminada con dos direcciones', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const inicial = predeterminadaDe(cuenta.id);
    const segunda = await agregar(request, cuenta, 'Segunda');

    const antes = await apiGet(request, '/clientes/perfil', cuenta.token);
    await apiPut(request, `${BASE}/${segunda}/principal`, {}, cuenta.token);
    const despues = await apiGet(request, '/clientes/perfil', cuenta.token);

    expect(antes.status).toBe(200);
    expect(antes.body.data.direccion.id).toBe(inicial);
    expect(despues.body.data.direccion.id).toBe(segunda);
  });

  test('el pedido a domicilio guarda una copia: editar o eliminar la dirección después no la cambia, y no lleva el alias', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const inicial = predeterminadaDe(cuenta.id);
    await apiPut(request, `${BASE}/${inicial}`, cuerpo('Calle Siempre Viva', RIO_GRANDE, { numero: '123', nombre: 'Casa de mamá', referencia: 'Portón verde' }), cuenta.token);
    const segunda = await agregar(request, cuenta, 'Segunda');

    const pedido = await pedidoADomicilio(request, cuenta, inicial);
    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201);
    const pedidoId = pedido.body.data.id as number;
    await confirmarPagoTest(request, pedidoId, true);
    expect(pedido.body.data.direccion.calle).toBe('Calle Siempre Viva');
    expect(pedido.body.data.direccion.referencia).toBe('Portón verde');
    expect(JSON.stringify(pedido.body.data.direccion)).not.toContain('Casa de mamá');
    expect(pedido.body.data.direccion.nombre).toBeUndefined();

    await apiPut(request, `${BASE}/${inicial}`, cuerpo('Otra Calle', USHUAIA, { numero: '999', referencia: 'Timbre roto' }), cuenta.token);
    expect((await apiDelete(request, `${BASE}/${inicial}`, cuenta.token)).status).toBe(200);

    const delCliente = (await apiGet(request, '/pedidos/cliente', cuenta.token)).body.data.find((p: any) => p.id === pedidoId);
    const delDueno = (await apiConHeaders(request, 'GET', '/pedidos/comercio', dueno.token, { [HEADER]: String(dueno.comercioId) })).body.data.find((p: any) => p.id === pedidoId);
    for (const vista of [delCliente, delDueno]) {
      expect(vista.direccion.calle).toBe('Calle Siempre Viva');
      expect(vista.direccion.numero).toBe('123');
      expect(vista.direccion.nombreLocalidad).toBe('Río Grande');
      expect(vista.direccion.referencia).toBe('Portón verde');
      expect(vista.direccion.nombre).toBeUndefined();
    }
    expect(predeterminadaDe(cuenta.id)).toBe(segunda);
  });

  test('un pedido de retiro no tiene copia de dirección', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    await apiConHeaders(request, 'DELETE', '/carrito', cuenta.token);
    await agregarItemCarrito(request, cuenta.token, productoId, 1);

    const pedido = await apiPost(request, '/pedidos/cliente', { tipoEntrega: 'RETIRO', direccionId: predeterminadaDe(cuenta.id) }, cuenta.token);

    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201);
    expect(pedido.body.data.direccion).toBeNull();
    const fila = sql(`SELECT CONCAT_WS('|', IFNULL(direccion_id,'N'), IFNULL(entrega_calle,'N'), IFNULL(entrega_numero,'N'), IFNULL(entrega_localidad_id,'N'), IFNULL(entrega_referencia,'N')) FROM pedido WHERE id = ${pedido.body.data.id};`);
    expect(fila).toBe('N|N|N|N|N');
  });

  test('un pedido con una dirección ajena, eliminada o inexistente da 404 y sin dirección da 409', async ({ request }) => {
    const a = await nuevaCuenta(request);
    const b = await nuevaCuenta(request);
    const borrada = await agregar(request, a, 'Borrada');
    await apiDelete(request, `${BASE}/${borrada}`, a.token);

    for (const id of [predeterminadaDe(b.id), borrada, 999999999]) {
      expect((await pedidoADomicilio(request, a, id)).status, `direccion ${id}`).toBe(404);
    }
    expect((await pedidoADomicilio(request, a, null)).status).toBe(409);
    expect(Number(sql(`SELECT COUNT(*) FROM pedido WHERE cliente_id = ${a.id};`))).toBe(0);
  });

  test('elegir otra dirección en el pedido no cambia la predeterminada', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const inicial = predeterminadaDe(cuenta.id);
    const segunda = await agregar(request, cuenta, 'Mitre', { referencia: 'Fondo' });

    const pedido = await pedidoADomicilio(request, cuenta, segunda);

    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201);
    expect(pedido.body.data.direccion.calle).toBe('Mitre');
    expect(pedido.body.data.direccion.referencia).toBe('Fondo');
    expect(predeterminadaDe(cuenta.id)).toBe(inicial);
  });

  test('una dirección vieja fuera de las tres habilitadas se lee, sirve para pedir y exige localidad válida al editarla', async ({ request }) => {
    const cuenta = await nuevaCuenta(request);
    const inicial = predeterminadaDe(cuenta.id);
    const otra = sql(`SELECT id FROM localidad WHERE id NOT IN ('${RIO_GRANDE}','${USHUAIA}','${TOLHUIN}') LIMIT 1;`);
    sql(`UPDATE direccion SET localidad_id = '${otra}' WHERE id = ${inicial};`);

    const direcciones = await lista(request, cuenta);
    const pedido = await pedidoADomicilio(request, cuenta, inicial);
    const edicion = await apiPut(request, `${BASE}/${inicial}`, cuerpo('Calle Siempre Viva', otra), cuenta.token);

    expect(direcciones[0].localidadId).toBe(otra);
    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201);
    expect(pedido.body.data.direccion.localidadId).toBe(otra);
    expect(edicion.status).toBe(400);
  });
});
