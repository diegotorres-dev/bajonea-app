import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  aceptarInvitacion,
  apiPut,
  invitarEmpleado,
  obtenerCodigoInvitacionTest,
  sqlTest as sql,
} from './backend';
import type { ClienteRegistrado, SesionApi } from './backend';

export const CLAVE_CONTEXTO = 'bajonea_contexto';
export const CLAVE_ULTIMO_CONTEXTO_PREFIJO = 'bajonea_ultimo_contexto_';
export const MENSAJE_ACCESO_PERDIDO = 'Ya no tenés acceso a este comercio';

export async function sumarAlEquipo(
  request: APIRequestContext,
  comercioId: number,
  cuenta: ClienteRegistrado,
  tokenDelDueno: string,
): Promise<void> {
  const invitacion = await invitarEmpleado(request, tokenDelDueno, comercioId, cuenta.email);
  expect(invitacion.status, JSON.stringify(invitacion.body)).toBe(201);
  const codigo = await obtenerCodigoInvitacionTest(request, cuenta.email, comercioId);
  const aceptada = await aceptarInvitacion(request, { email: cuenta.email, codigo });
  expect(aceptada.status, JSON.stringify(aceptada.body)).toBe(200);
}

export function atajoEstadoRelacion(
  request: APIRequestContext,
  comercioId: number,
  empleadoId: number,
  estado: 'ACTIVO' | 'INACTIVO',
  motivo?: 'BAJA_DUENO' | 'RENUNCIA',
) {
  const sufijo = motivo ? `&motivo=${motivo}` : '';
  return apiPut(request, `/test/comercios/${comercioId}/empleados/${empleadoId}/estado?estado=${estado}${sufijo}`, {});
}

export function ponerEstadoComercio(comercioId: number, estado: string): void {
  sql(`UPDATE comercio SET estado = '${estado}' WHERE id = ${comercioId};`);
}

export interface OpcionesApertura {
  ultimoContexto?: string;
  contexto?: { tipo: 'CLIENTE' | 'EMPLEADO'; comercioId?: number };
}

export async function abrirComoUsuarioConContexto(page: Page, sesion: SesionApi, opciones: OpcionesApertura = {}) {
  await page.addInitScript(
    ([token, usuarioJson, usuarioId, ultimo, contextoJson, claveContexto, prefijoUltimo]) => {
      if (localStorage.getItem('bajonea_token')) {
        return;
      }
      localStorage.setItem('bajonea_token', token as string);
      localStorage.setItem('bajonea_usuario', usuarioJson as string);
      if (ultimo !== null) {
        localStorage.setItem(`${prefijoUltimo}${usuarioId}`, ultimo as string);
      }
      if (contextoJson !== null) {
        const contexto = JSON.parse(contextoJson as string);
        sessionStorage.setItem(claveContexto as string, JSON.stringify({ usuarioId, tipo: contexto.tipo, comercioId: contexto.comercioId ?? null }));
      }
    },
    [
      sesion.token,
      JSON.stringify(sesion.usuario),
      sesion.usuario.id,
      opciones.ultimoContexto ?? null,
      opciones.contexto ? JSON.stringify(opciones.contexto) : null,
      CLAVE_CONTEXTO,
      CLAVE_ULTIMO_CONTEXTO_PREFIJO,
    ],
  );
}

export async function contextoEnSesion(page: Page): Promise<{ usuarioId: number; tipo: string; comercioId: number | null } | null> {
  return page.evaluate((clave) => {
    const crudo = sessionStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  }, CLAVE_CONTEXTO);
}

export async function ultimoContextoGuardado(page: Page, usuarioId: number): Promise<string | null> {
  return page.evaluate(([prefijo, id]) => localStorage.getItem(`${prefijo}${id}`), [CLAVE_ULTIMO_CONTEXTO_PREFIJO, usuarioId] as const);
}

export function sembrarNotaCredito(pedidoId: number, estado: string): void {
  sql(
    `INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_confirmacion) ` +
      `SELECT id, total, 'approved', 'sintetico-${pedidoId}', NOW() FROM pedido WHERE id = ${pedidoId};`,
  );
  sql(
    `INSERT INTO nota_credito (pago_id, monto, motivo, estado, intentos, mp_payment_id, ultimo_error, fecha_emision) ` +
      `SELECT p.id, p.monto, 'RECHAZO_COMERCIO', '${estado}', 2, p.id_transaccion_mp, 'error tecnico sintetico del spec 38', NOW() ` +
      `FROM pago p WHERE p.pedido_id = ${pedidoId};`,
  );
}

export function limpiarNotasCredito(pedidoIds: number[]): void {
  if (pedidoIds.length === 0) {
    return;
  }
  sql(`DELETE FROM nota_credito WHERE pago_id IN (SELECT id FROM pago WHERE pedido_id IN (${pedidoIds.join(',')}));`);
  sql(`DELETE FROM pago WHERE pedido_id IN (${pedidoIds.join(',')}) AND id_transaccion_mp LIKE 'sintetico-%';`);
}
