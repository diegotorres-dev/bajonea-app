import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiPost,
  apiPut,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './backend';
import type { SesionApi } from './backend';
import { prepararAprobado } from './multicomercio';
import { haceMinutosEnZona } from './zona';
import type { Dueno } from './multicomercio';

export const CARPETA_CAPTURAS_RECLAMOS = path.resolve(__dirname, '../../../../docs/capturas-reclamos');
export const MP_SIMULADO = process.env.E2E_MP_SIMULADO_URL || 'http://localhost:9099';
export const PRECIO_PRODUCTO = 4800;
export const CARGO_CLIENTE = 200;
export const TOTAL_PEDIDO = PRECIO_PRODUCTO + CARGO_CLIENTE;
export const DESCRIPCION_VALIDA = 'Faltó una de las empanadas que pedí y la otra llegó fría.';

export interface Escenario {
  adminToken: string;
  adminSesion: SesionApi;
  localidadId: string;
  categoriaId: number;
  dueno: Dueno;
  productoId: number;
}

export interface Cliente {
  sesion: SesionApi;
  nombreUsuario: string;
  password: string;
  email: string;
}

export async function prepararEscenario(request: APIRequestContext): Promise<Escenario> {
  const adminSesion = await fijarPasswordAdminYLoguear(request);
  const adminToken = adminSesion.token;
  const localidadId = await obtenerLocalidadRioGrande(request);
  const categoriaId = await crearCategoria(request, adminToken, `Cat Reclamos ${sufijoUnico()}`);
  const dueno = await prepararAprobado(request, adminToken, localidadId, true);
  const productoId = await crearProducto(request, dueno.token, { nombre: `Empanadas ${sufijoUnico()}`, precio: PRECIO_PRODUCTO, categoriaId });
  return { adminToken, adminSesion, localidadId, categoriaId, dueno, productoId };
}

export async function nuevoCliente(request: APIRequestContext, localidadId: string): Promise<Cliente> {
  const registro = await registrarYVerificarCliente(request, localidadId);
  const sesion = await login(request, registro.nombreUsuario, registro.password);
  return { sesion, nombreUsuario: registro.nombreUsuario, password: registro.password, email: registro.email };
}

export function accionDelComercio(request: APIRequestContext, esc: Escenario, pedidoId: number, ruta: string, token = esc.dueno.token, cuerpo: unknown = {}) {
  return apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${ruta}`, token, { 'X-Comercio-Id': String(esc.dueno.comercioId) }, cuerpo);
}

export async function pagarConMercadoPago(request: APIRequestContext, token: string, pedidoId: number): Promise<void> {
  const preferencia = await apiPost(request, `/pedidos/cliente/${pedidoId}/pago`, {}, token);
  expect(preferencia.status).toBe(200);
  const webhook = await apiPost(request, `/webhooks/mercadopago?pedidoId=${pedidoId}&data.id=${100000 + pedidoId}&type=payment`, {});
  expect(webhook.status).toBe(200);
}

export async function pedidoEntregado(
  request: APIRequestContext,
  esc: Escenario,
  cliente: Cliente,
  { domicilio = false, diasAtras = 0, cantidad = 1 }: { domicilio?: boolean; diasAtras?: number; cantidad?: number } = {},
): Promise<number> {
  await apiConHeaders(request, 'DELETE', '/carrito', cliente.sesion.token);
  await agregarItemCarrito(request, cliente.sesion.token, esc.productoId, cantidad);
  const pedidoId = await crearPedido(request, cliente.sesion.token, 'RETIRO', null);
  await pagarConMercadoPago(request, cliente.sesion.token, pedidoId);
  expect((await accionDelComercio(request, esc, pedidoId, 'aceptar')).status).toBe(200);
  expect((await accionDelComercio(request, esc, pedidoId, 'despachar')).status).toBe(200);
  expect((await accionDelComercio(request, esc, pedidoId, 'entregar')).status).toBe(200);
  if (domicilio) {
    sql(`UPDATE pedido SET modalidad_entrega = 'DOMICILIO' WHERE id = ${pedidoId};`);
  }
  if (diasAtras > 0) {
    expect((await apiPut(request, `/test/pedidos/${pedidoId}/envejecer-entrega?dias=${diasAtras}`, {})).status).toBe(200);
  }
  return pedidoId;
}

export async function pedidoEnEstado(request: APIRequestContext, esc: Escenario, cliente: Cliente, hasta: 'PENDIENTE' | 'RECHAZADO' | 'EN_PREPARACION' | 'CANCELADO'): Promise<number> {
  await apiConHeaders(request, 'DELETE', '/carrito', cliente.sesion.token);
  await agregarItemCarrito(request, cliente.sesion.token, esc.productoId, 1);
  const pedidoId = await crearPedido(request, cliente.sesion.token, 'RETIRO', null);
  await pagarConMercadoPago(request, cliente.sesion.token, pedidoId);
  if (hasta === 'RECHAZADO') {
    expect((await accionDelComercio(request, esc, pedidoId, 'rechazar', esc.dueno.token, { motivo: 'SIN_STOCK' })).status).toBe(200);
  } else if (hasta === 'EN_PREPARACION') {
    expect((await accionDelComercio(request, esc, pedidoId, 'aceptar')).status).toBe(200);
  } else if (hasta === 'CANCELADO') {
    expect((await apiPut(request, `/pedidos/cliente/${pedidoId}/cancelar`, {}, cliente.sesion.token)).status).toBe(200);
  }
  return pedidoId;
}

export async function reclamarPorApi(
  request: APIRequestContext,
  cliente: Cliente,
  pedidoId: number,
  motivo = 'FALTAN_PRODUCTOS',
  descripcion = DESCRIPCION_VALIDA,
): Promise<number> {
  const { status, body } = await apiPost(request, `/pedidos/cliente/${pedidoId}/reclamo`, { motivo, descripcion }, cliente.sesion.token);
  if (status !== 201) {
    throw new Error(`No se pudo reclamar el pedido ${pedidoId}: ${status} ${JSON.stringify(body)}`);
  }
  return body.data.id as number;
}

export function resolverPorApi(request: APIRequestContext, adminToken: string, reclamoId: number, cuerpo: Record<string, unknown>) {
  return apiPut(request, `/administrador/reclamos/${reclamoId}/resolver`, cuerpo, adminToken);
}

export function reclamoIdDe(pedidoId: number): number {
  return Number(sql(`SELECT id FROM reclamo WHERE pedido_id = ${pedidoId};`));
}

export async function fallarProximoReembolso(request: APIRequestContext, mensaje: string): Promise<void> {
  const respuesta = await request.put(`${MP_SIMULADO}/__control/reembolsos/falla?mensaje=${encodeURIComponent(mensaje)}`);
  expect(respuesta.ok()).toBeTruthy();
}

export async function repararReembolsos(request: APIRequestContext): Promise<void> {
  const respuesta = await request.put(`${MP_SIMULADO}/__control/reembolsos/falla`);
  expect(respuesta.ok()).toBeTruthy();
}

export async function conReembolsosFallidos<T>(request: APIRequestContext, mensaje: string, accion: () => Promise<T>): Promise<T> {
  await fallarProximoReembolso(request, mensaje);
  try {
    return await accion();
  } finally {
    await repararReembolsos(request);
  }
}

export async function capturarReclamos(page: Page, nombre: string, paginaCompleta = true): Promise<void> {
  fs.mkdirSync(CARPETA_CAPTURAS_RECLAMOS, { recursive: true });
  const imagen = await page.screenshot({ fullPage: paginaCompleta });
  const destino = path.join(CARPETA_CAPTURAS_RECLAMOS, `${nombre}.png`);
  for (let intento = 0; intento < 5; intento += 1) {
    try {
      fs.writeFileSync(destino, imagen);
      return;
    } catch (error) {
      if (intento === 4) throw error;
      await new Promise((resolver) => setTimeout(resolver, 300));
    }
  }
}

export async function pedidoEnCamino(request: APIRequestContext, esc: Escenario, cliente: Cliente, minutosEnCamino = 100): Promise<number> {
  await apiConHeaders(request, 'DELETE', '/carrito', cliente.sesion.token);
  await agregarItemCarrito(request, cliente.sesion.token, esc.productoId, 1);
  const pedidoId = await crearPedido(request, cliente.sesion.token, 'RETIRO', null);
  await pagarConMercadoPago(request, cliente.sesion.token, pedidoId);
  sql(`UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ${pedidoId};`);
  sql(
    `INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES ` +
      `(${pedidoId}, 'EN_PREPARACION', 'DUENO', ${esc.dueno.duenoId}, '${haceMinutosEnZona(minutosEnCamino + 20)}'), ` +
      `(${pedidoId}, 'EN_CAMINO', 'DUENO', ${esc.dueno.duenoId}, '${haceMinutosEnZona(minutosEnCamino)}');`,
  );
  return pedidoId;
}

export function autoconfirmarEnCamino(request: APIRequestContext) {
  return apiPost(request, '/test/jobs/pedidos/avisar-y-autoconfirmar', {});
}

export async function pedidoNoRetirado(request: APIRequestContext, esc: Escenario, cliente: Cliente): Promise<number> {
  await apiConHeaders(request, 'DELETE', '/carrito', cliente.sesion.token);
  await agregarItemCarrito(request, cliente.sesion.token, esc.productoId, 1);
  const pedidoId = await crearPedido(request, cliente.sesion.token, 'RETIRO', null);
  await pagarConMercadoPago(request, cliente.sesion.token, pedidoId);
  expect((await accionDelComercio(request, esc, pedidoId, 'aceptar')).status).toBe(200);
  expect((await accionDelComercio(request, esc, pedidoId, 'despachar')).status).toBe(200);
  expect((await apiPut(request, `/test/pedidos/${pedidoId}/envejecer-listo?minutos=90`, {})).status).toBe(200);
  expect((await accionDelComercio(request, esc, pedidoId, 'no-retirado')).status).toBe(200);
  return pedidoId;
}
