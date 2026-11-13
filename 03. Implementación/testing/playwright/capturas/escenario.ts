import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { prepararEscenarioAdmin } from '../tests/helpers/admin-escritorio';
import { prepararEscenarioCliente } from '../tests/helpers/escritorio-cliente';

export const ARCHIVO_ESCENARIO = path.join(process.env.TEMP || os.tmpdir(), 'bajonea-e4-escenario.json');

export interface EscenarioCompleto {
  admin: { comercioPendienteId: number; resolicitudId: number; documentoId: number; comercioBaseId: number; consultaId: number };
  cliente: {
    pedidos: Record<string, number>;
    pedidoEnCamino: number;
    pedidoReclamable: number;
    consultaId: number;
    productoIds: number[];
    dueno: { nombreUsuario: string; password: string; comercioId: number };
    empleado: { nombreUsuario: string; password: string };
    cliente: { nombreUsuario: string; password: string };
  };
}

export async function cargarOCrearEscenario(request: APIRequestContext): Promise<EscenarioCompleto> {
  if (existsSync(ARCHIVO_ESCENARIO) && !process.env.ESCENARIO_NUEVO) {
    return JSON.parse(readFileSync(ARCHIVO_ESCENARIO, 'utf8'));
  }
  const cliente = await prepararEscenarioCliente(request);
  const admin = await prepararEscenarioAdmin(request);
  const completo: EscenarioCompleto = {
    admin: {
      comercioPendienteId: admin.pendientes[0].comercioId,
      resolicitudId: admin.resolicitud.comercioId,
      documentoId: admin.documentoIds[0],
      comercioBaseId: admin.base.dueno.comercioId,
      consultaId: admin.consultas.esperando[0],
    },
    cliente: {
      pedidos: cliente.pedidos,
      pedidoEnCamino: cliente.pedidoEnCamino,
      pedidoReclamable: cliente.pedidoReclamable,
      consultaId: cliente.consultaId,
      productoIds: cliente.productoIds,
      dueno: { nombreUsuario: cliente.dueno.nombreUsuario, password: cliente.dueno.password, comercioId: cliente.dueno.comercioId },
      empleado: { nombreUsuario: cliente.empleado.nombreUsuario, password: cliente.empleado.password },
      cliente: { nombreUsuario: cliente.cliente.nombreUsuario, password: cliente.cliente.password },
    },
  };
  writeFileSync(ARCHIVO_ESCENARIO, JSON.stringify(completo, null, 1));
  return completo;
}
