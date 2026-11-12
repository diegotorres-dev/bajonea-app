import type { APIRequestContext, Page } from '@playwright/test';
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
  sufijoUnico,
} from './backend';
import type { ClienteRegistrado, SesionApi } from './backend';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './empleado';
import { abrirComoUsuario, prepararAprobado } from './multicomercio';
import type { Dueno } from './multicomercio';

const HEADER = 'X-Comercio-Id';

export interface EscenarioComercio {
  adminToken: string;
  localidadId: string;
  dueno: Dueno;
  categoriaId: number;
  productoIds: number[];
  empleado: ClienteRegistrado;
  cliente: ClienteRegistrado;
  pedidos: Record<'pendiente' | 'pendiente2' | 'preparacion' | 'listo' | 'rechazado' | 'entregado', number>;
}

function accion(request: APIRequestContext, dueno: Dueno, pedidoId: number, nombre: string, cuerpo?: unknown) {
  return apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${nombre}`, dueno.token, { [HEADER]: String(dueno.comercioId) }, cuerpo);
}

export async function prepararEscenarioComercio(request: APIRequestContext): Promise<EscenarioComercio> {
  const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
  const localidadId = await obtenerLocalidadRioGrande(request);
  const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
  const dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
  const categoriaId = await crearCategoria(request, adminToken, `Cat E1 ${sufijoUnico()}`);
  const productoIds: number[] = [];
  for (const [nombre, precio] of [['Hamburguesa clásica', 6500], ['Papas fritas', 3200], ['Gaseosa 500 ml', 1800]] as const) {
    productoIds.push(await crearProducto(request, dueno.token, { nombre: `${nombre} ${sufijoUnico()}`, precio, categoriaId, descripcion: 'Producto de prueba del tramo E1' }));
  }
  const cliente = await registrarYVerificarCliente(request, localidadId);
  const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
  const ids: Record<string, number> = {};
  for (const clave of ['pendiente', 'pendiente2', 'preparacion', 'listo', 'rechazado', 'entregado']) {
    await agregarItemCarrito(request, sesionCliente.token, productoIds[0], 2);
    await agregarItemCarrito(request, sesionCliente.token, productoIds[1], 1);
    const pedidoId = await crearPedido(request, sesionCliente.token, 'RETIRO');
    await confirmarPagoTest(request, pedidoId);
    ids[clave] = pedidoId;
  }
  await accion(request, dueno, ids.preparacion, 'aceptar');
  await accion(request, dueno, ids.listo, 'aceptar');
  await accion(request, dueno, ids.listo, 'despachar');
  await accion(request, dueno, ids.entregado, 'aceptar');
  await accion(request, dueno, ids.entregado, 'despachar');
  await accion(request, dueno, ids.entregado, 'entregar');
  await accion(request, dueno, ids.rechazado, 'rechazar', { motivo: 'SIN_STOCK' });

  const empleado = await registrarYVerificarCliente(request, localidadId);
  const tokenDelDueno = (await login(request, dueno.nombreUsuario, dueno.password)).token;
  await sumarAlEquipo(request, dueno.comercioId, empleado, tokenDelDueno);

  return { adminToken, localidadId, dueno, categoriaId, productoIds, empleado, cliente, pedidos: ids as EscenarioComercio['pedidos'] };
}

export async function abrirComoDueno(page: Page, request: APIRequestContext, escenario: EscenarioComercio): Promise<SesionApi> {
  const sesion = await login(request, escenario.dueno.nombreUsuario, escenario.dueno.password);
  await abrirComoUsuario(page, sesion);
  return sesion;
}

export async function abrirComoEmpleado(page: Page, request: APIRequestContext, escenario: EscenarioComercio): Promise<SesionApi> {
  const sesion = await login(request, escenario.empleado.nombreUsuario, escenario.empleado.password);
  await abrirComoUsuarioConContexto(page, sesion, {
    contexto: { tipo: 'EMPLEADO', comercioId: escenario.dueno.comercioId },
    ultimoContexto: `EMPLEADO:${escenario.dueno.comercioId}`,
  });
  return sesion;
}
