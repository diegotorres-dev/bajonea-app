import type { APIRequestContext } from '@playwright/test';
import { apiConHeaders, sqlTest, fijarPasswordAdminYLoguear, login, subirDocumentoTest, sufijoUnico } from './backend';
import type { SesionApi } from './backend';
import { prepararEscenarioComercio } from './escritorio-comercio';
import type { EscenarioComercio } from './escritorio-comercio';
import { prepararRechazado, reenviarConCambioSimple, registrarPendiente } from './multicomercio';
import type { Dueno } from './multicomercio';
import { crearConsultaPublica, crearConsultaConSesion, responderComoSoporte, cerrarComoSoporte } from './soporte';
import { reclamarPorApi } from './reclamos';
import { sembrarNotaCredito } from './empleado';

export interface EscenarioAdmin {
  admin: SesionApi;
  base: EscenarioComercio;
  pendientes: Dueno[];
  resolicitud: Dueno;
  documentoIds: number[];
  consultas: { esperando: number[]; respondida: number; cerrada: number };
  reclamoPedidoId: number;
  reembolsoPedidoId: number;
}

async function documentosDe(request: APIRequestContext, token: string, comercioId: number): Promise<number[]> {
  const { body } = await apiConHeaders(request, 'GET', '/comercios/documentos', token, { 'X-Comercio-Id': String(comercioId) });
  const lista = (body.data.documentos ?? body.data) as Array<{ id: number }>;
  return lista.map((documento) => documento.id);
}

export async function prepararEscenarioAdmin(request: APIRequestContext): Promise<EscenarioAdmin> {
  const base = await prepararEscenarioComercio(request);
  const tokenDueno = (await login(request, base.dueno.nombreUsuario, base.dueno.password)).token;
  const admin = await fijarPasswordAdminYLoguear(request);
  const pendientes: Dueno[] = [];
  for (const nombre of ['Pizzería La Esquina', 'Café del Fin del Mundo', 'Sushi Austral']) {
    pendientes.push(await registrarPendiente(request, admin.token, base.localidadId, `${nombre} ${sufijoUnico().slice(-4)}`));
  }
  const resolicitud = await prepararRechazado(request, admin.token, base.localidadId);
  await reenviarConCambioSimple(request, resolicitud, 'Descripción corregida después del rechazo');

  await subirDocumentoTest(request, tokenDueno, base.dueno.comercioId, { tipo: 'LIBRETA_SANITARIA', nombre: 'libreta.pdf' });
  await subirDocumentoTest(request, tokenDueno, base.dueno.comercioId, { tipo: 'CARNET_MANIPULACION_ALIMENTOS', nombre: 'carnet.pdf' });
  await subirDocumentoTest(request, tokenDueno, base.dueno.comercioId, { tipo: 'OTRO', descripcion: 'Seguro del local', nombre: 'seguro.pdf' });
  const documentoIds = await documentosDe(request, tokenDueno, base.dueno.comercioId);

  const esperando = [
    (await crearConsultaPublica(request, { tipo: 'NO_PUEDO_ENTRAR', mensaje: 'No puedo entrar a mi cuenta desde ayer, me dice que está bloqueada.' })).id,
    (await crearConsultaPublica(request, { tipo: 'APELACION_CUENTA', mensaje: 'Me suspendieron la cuenta y quiero apelar la decisión.' })).id,
  ];
  esperando.push((await crearConsultaConSesion(request, tokenDueno, { tipo: 'OTRA', mensaje: 'Necesito cambiar el CUIT de mi comercio, ¿cómo lo hago?' })).id);
  const respondida = (await crearConsultaPublica(request, { tipo: 'OTRA', mensaje: 'Quería saber cuándo me acreditan las ventas.' })).id;
  await responderComoSoporte(request, admin.token, respondida, 'Las ventas se acreditan en tu cuenta de Mercado Pago.');
  const cerrada = (await crearConsultaPublica(request, { tipo: 'OTRA', mensaje: 'Gracias, ya pude resolverlo.' })).id;
  await responderComoSoporte(request, admin.token, cerrada, 'Perfecto, cerramos la consulta.');
  await cerrarComoSoporte(request, admin.token, cerrada);

  const sesionCliente = await login(request, base.cliente.nombreUsuario, base.cliente.password);
  sqlTest(`INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_confirmacion) SELECT id, total, 'approved', 'sintetico-rec-${base.pedidos.entregado}', NOW() FROM pedido WHERE id = ${base.pedidos.entregado};`);
  const reclamo = await reclamarPorApi(request, { sesion: sesionCliente, nombreUsuario: base.cliente.nombreUsuario, password: base.cliente.password, email: base.cliente.email }, base.pedidos.entregado);
  void reclamo;
  sembrarNotaCredito(base.pedidos.rechazado, 'FALLIDO');

  return { admin, base, pendientes, resolicitud, documentoIds, consultas: { esperando, respondida, cerrada }, reclamoPedidoId: base.pedidos.entregado, reembolsoPedidoId: base.pedidos.rechazado };
}

export const PAGINAS_ADMIN = [
  'admin-dashboard.html',
  'admin-comercios-pendientes.html',
  'admin-comercios.html',
  'admin-resolicitudes.html',
  'admin-documentos.html',
  'admin-soporte.html',
  'admin-clientes.html',
  'admin-duenos.html',
  'admin-reembolsos.html',
  'admin-tarifas.html',
  'admin-categorias.html',
  'admin-tags.html',
  'admin-reclamos.html',
] as const;
