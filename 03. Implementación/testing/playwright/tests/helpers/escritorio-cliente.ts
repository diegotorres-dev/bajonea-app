import type { APIRequestContext, Page } from '@playwright/test';
import { agregarItemCarrito, apiConHeaders, apiDelete, apiGet, apiPost, confirmarPagoTest, crearPedido, login, sqlTest } from './backend';
import type { SesionApi } from './backend';
import { abrirComoUsuario } from './multicomercio';
import { prepararEscenarioComercio } from './escritorio-comercio';
import type { EscenarioComercio } from './escritorio-comercio';
import { crearConsultaConSesion } from './soporte';

const HEADER = 'X-Comercio-Id';
const RIO_GRANDE = '94008010';
const USHUAIA = '94015020';

export interface EscenarioCliente extends EscenarioComercio {
  pedidoEnCamino: number;
  pedidoSinPagar: number;
  pedidoReclamable: number;
  consultaId: number;
}

function accion(request: APIRequestContext, escenario: EscenarioComercio, tokenDueno: string, pedidoId: number, nombre: string) {
  return apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${nombre}`, tokenDueno, { [HEADER]: String(escenario.dueno.comercioId) });
}

export async function prepararEscenarioCliente(request: APIRequestContext): Promise<EscenarioCliente> {
  const base = await prepararEscenarioComercio(request);
  sqlTest(`UPDATE comercio SET acepta_delivery = 1 WHERE id = ${base.dueno.comercioId};`);
  const sesion = await login(request, base.cliente.nombreUsuario, base.cliente.password);
  const tokenDueno = (await login(request, base.dueno.nombreUsuario, base.dueno.password)).token;
  const direcciones = await apiGet(request, '/clientes/direcciones', sesion.token);
  const principal = (direcciones.body.data as any[]).find((d) => d.principal) || direcciones.body.data[0];
  await apiPost(request, '/clientes/direcciones', { calle: 'Perito Moreno', numero: '2450', pisoDepto: '3B', codigoPostal: '9420', localidadId: RIO_GRANDE, nombre: 'Trabajo', referencia: 'Portón negro, tocar timbre' }, sesion.token);
  await apiPost(request, '/clientes/direcciones', { calle: 'San Martín', numero: '800', codigoPostal: '9410', localidadId: USHUAIA, nombre: 'Casa de mi mamá' }, sesion.token);

  await agregarItemCarrito(request, sesion.token, base.productoIds[0], 1);
  const pedidoEnCamino = await crearPedido(request, sesion.token, 'DOMICILIO', principal.id);
  await confirmarPagoTest(request, pedidoEnCamino);
  await accion(request, base, tokenDueno, pedidoEnCamino, 'aceptar');
  await accion(request, base, tokenDueno, pedidoEnCamino, 'despachar');

  await agregarItemCarrito(request, sesion.token, base.productoIds[2], 1);
  const pedidoReclamable = await crearPedido(request, sesion.token, 'RETIRO');
  await confirmarPagoTest(request, pedidoReclamable, true);
  for (const nombre of ['aceptar', 'despachar', 'entregar']) {
    const respuesta = await accion(request, base, tokenDueno, pedidoReclamable, nombre);
    if (respuesta.status !== 200) {
      throw new Error(`No se pudo ${nombre} el pedido reclamable: ${respuesta.status}`);
    }
  }

  await agregarItemCarrito(request, sesion.token, base.productoIds[1], 2);
  const pedidoSinPagar = await crearPedido(request, sesion.token, 'RETIRO');

  const consulta = await crearConsultaConSesion(request, sesion.token, { tipo: 'OTRA', mensaje: 'Necesito ayuda con un pedido que no me llegó completo.' });
  return { ...base, pedidoEnCamino, pedidoSinPagar, pedidoReclamable, consultaId: consulta.id };
}

export async function dejarCarritoConItems(request: APIRequestContext, escenario: EscenarioComercio, token: string): Promise<void> {
  const actual = await apiGet(request, '/carrito', token);
  if ((actual.body.data.items || []).length === 2) {
    return;
  }
  await apiDelete(request, '/carrito', token);
  await agregarItemCarrito(request, token, escenario.productoIds[0], 2);
  await agregarItemCarrito(request, token, escenario.productoIds[1], 1);
}

export async function abrirComoCliente(page: Page, request: APIRequestContext, escenario: EscenarioComercio): Promise<SesionApi> {
  const sesion = await login(request, escenario.cliente.nombreUsuario, escenario.cliente.password);
  await abrirComoUsuario(page, sesion);
  return sesion;
}
