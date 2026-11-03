import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { apiConHeaders, apiPost, sufijoUnico } from './backend';

export const CARPETA_CAPTURAS_SOPORTE = path.resolve(__dirname, '../../../../docs/capturas-soporte');

export const TEXTO_NO_ENCONTRADA = 'No encontramos una consulta con esos datos. Revisá el email y el código.';
export const TEXTO_INTENTOS = 'Hiciste demasiados intentos. Probá de nuevo en una hora.';
export const TEXTO_REENVIO = 'Si hay consultas con ese email, te mandamos los códigos. Revisá tu bandeja de entrada.';
export const TEXTO_DIARIO = 'Ya enviaste 3 consultas hoy. Probá de nuevo mañana o esperá la respuesta de Soporte.';
export const TEXTO_ABIERTAS = 'Ya tenés 3 consultas abiertas. Esperá a que Soporte las responda para enviar otra.';
export const TEXTO_POR_IP = 'Se enviaron demasiadas consultas desde tu conexión. Probá de nuevo más tarde.';
export const TEXTO_CERRADA = 'Consulta cerrada. Si necesitás algo más, enviá una consulta nueva.';
export const MENSAJE_INICIAL = 'Hola, necesito ayuda con mi cuenta porque no puedo avanzar.';

export function numeroAlAzar(maximo: number): number {
  return Math.floor(Math.random() * maximo);
}

export function ipNueva(): string {
  return `10.${numeroAlAzar(250) + 1}.${numeroAlAzar(250) + 1}.${numeroAlAzar(250) + 1}`;
}

export function emailUnico(prefijo = 'soporte'): string {
  return `${prefijo}.${sufijoUnico()}@bajonea.test`;
}

export async function conIp(page: Page, ip: string): Promise<void> {
  await page.route('**/api/v1/soporte/**', async (ruta) => {
    await ruta.continue({ headers: { ...ruta.request().headers(), 'x-forwarded-for': ip } });
  });
}

export async function capturarSoporte(page: Page, nombre: string, paginaCompleta = false): Promise<void> {
  fs.mkdirSync(CARPETA_CAPTURAS_SOPORTE, { recursive: true });
  const imagen = await page.screenshot({ fullPage: paginaCompleta });
  const destino = path.join(CARPETA_CAPTURAS_SOPORTE, `${nombre}.png`);
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

export interface ConsultaCreada {
  id: number;
  codigo: string;
  email: string;
  ip: string;
}

export async function crearConsultaPublica(
  request: APIRequestContext,
  opciones: { email?: string; tipo?: string; mensaje?: string; ip?: string } = {},
): Promise<ConsultaCreada> {
  const email = opciones.email ?? emailUnico();
  const ip = opciones.ip ?? ipNueva();
  const { status, body } = await apiConHeaders(request, 'POST', '/soporte/publico/consultas', undefined, { 'X-Forwarded-For': ip }, {
    email,
    tipo: opciones.tipo ?? 'OTRA',
    mensaje: opciones.mensaje ?? MENSAJE_INICIAL,
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return { id: body.data.id, codigo: body.data.codigo, email, ip };
}

export async function crearConsultaConSesion(
  request: APIRequestContext,
  token: string,
  opciones: { tipo?: string; mensaje?: string; ip?: string } = {},
): Promise<{ id: number; codigo: string }> {
  const { status, body } = await apiConHeaders(request, 'POST', '/soporte/consultas', token, { 'X-Forwarded-For': opciones.ip ?? ipNueva() }, {
    tipo: opciones.tipo ?? 'OTRA',
    mensaje: opciones.mensaje ?? MENSAJE_INICIAL,
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return { id: body.data.id, codigo: body.data.codigo };
}

export async function responderComoSoporte(request: APIRequestContext, adminToken: string, consultaId: number, texto = 'Estamos revisando tu caso.') {
  const { status, body } = await apiPost(request, `/administrador/soporte/${consultaId}/mensajes`, { texto }, adminToken);
  expect(status, JSON.stringify(body)).toBe(200);
  return body.data;
}

export async function cerrarComoSoporte(request: APIRequestContext, adminToken: string, consultaId: number) {
  const { status, body } = await apiConHeaders(request, 'PUT', `/administrador/soporte/${consultaId}/cerrar`, adminToken, {}, {});
  expect(status, JSON.stringify(body)).toBe(200);
}

export async function responderComoPersonaPublica(
  request: APIRequestContext,
  consulta: ConsultaCreada,
  texto = 'Gracias, te cuento más detalles.',
) {
  const { status, body } = await apiConHeaders(request, 'POST', '/soporte/publico/consultas/responder', undefined, { 'X-Forwarded-For': consulta.ip }, {
    email: consulta.email,
    codigo: consulta.codigo,
    texto,
  });
  expect(status, JSON.stringify(body)).toBe(200);
  return body.data;
}

export async function responderComoPersonaConSesion(request: APIRequestContext, token: string, consultaId: number, texto = 'Gracias, te cuento más detalles.') {
  const { status, body } = await apiConHeaders(request, 'POST', `/soporte/mis-consultas/${consultaId}/mensajes`, token, { 'X-Forwarded-For': ipNueva() }, { texto });
  expect(status, JSON.stringify(body)).toBe(200);
  return body.data;
}

export async function fallarEmailDeSoporte(request: APIRequestContext, cantidad: number): Promise<void> {
  const { status, body } = await apiConHeaders(request, 'PUT', `/test/email-soporte/fallas?cantidad=${cantidad}`, undefined, {}, {});
  expect(status, JSON.stringify(body)).toBe(200);
}

export function formatearCodigoConSeparadores(codigo: string): string {
  return ` ${codigo.slice(0, 4).toLowerCase()} - ${codigo.slice(4).toLowerCase()} `;
}
