import type { APIRequestContext } from '@playwright/test';
import { login, obtenerLocalidadRioGrande, registrarYVerificarCliente, sqlTest as sql } from './backend';
import type { SesionApi } from './backend';

export interface ClienteDeAvisos {
  sesion: SesionApi;
  usuarioId: number;
}

export async function prepararClienteDeAvisos(request: APIRequestContext): Promise<ClienteDeAvisos> {
  const localidadId = await obtenerLocalidadRioGrande(request);
  const registro = await registrarYVerificarCliente(request, localidadId);
  const sesion = await login(request, registro.nombreUsuario, registro.password);
  return { sesion, usuarioId: sesion.usuario.id };
}

export interface OpcionesDeSiembra {
  tipo?: string;
  leida?: boolean;
  comercioId?: number | null;
  canal?: 'PUSH' | 'EMAIL';
  desfaseSegundos?: number;
  prefijo?: string;
}

export function sembrarAvisos(usuarioId: number, cantidad: number, opciones: OpcionesDeSiembra = {}): number[] {
  const { tipo = 'PRODUCTO_REMOVIDO_CARRITO', leida = false, comercioId = null, canal = 'PUSH', desfaseSegundos = 0, prefijo = 'Aviso' } = opciones;
  const filas: string[] = [];
  for (let n = cantidad; n >= 1; n -= 1) {
    const segundos = desfaseSegundos + n;
    filas.push(
      `(${usuarioId}, '${tipo}', '${prefijo} ${n}', ${leida ? 1 : 0}, DATE_SUB(NOW(), INTERVAL ${segundos} SECOND), '${canal}', 'PENDIENTE', ${comercioId === null ? 'NULL' : comercioId})`,
    );
  }
  const primero = Number(sql('SELECT COALESCE(MAX(id), 0) FROM notificacion;'));
  for (let desde = 0; desde < filas.length; desde += 80) {
    sql(
      `INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, comercio_id) VALUES ${filas.slice(desde, desde + 80).join(', ')};`,
    );
  }
  const ids = sql(`SELECT id FROM notificacion WHERE usuario_id = ${usuarioId} AND id > ${primero} ORDER BY id;`).split('\n').map(Number);
  return ids;
}

export function borrarAvisos(usuarioId: number): void {
  sql(`DELETE FROM notificacion WHERE usuario_id = ${usuarioId};`);
}
