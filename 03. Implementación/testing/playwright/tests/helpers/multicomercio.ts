import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  ADMIN_PASSWORD_CONOCIDA,
  ADMIN_USUARIO,
  apiConHeaders,
  buscarComercioPendientePorEmail,
  clonarComercioTest,
  diaDeHoy,
  login,
  registrarYVerificarComercio,
  resolverComercio,
  sqlTest as sql,
  vincularMercadoPagoSimuladoTest,
} from './backend';
import type { HorarioInput, SesionApi } from './backend';

export interface Dueno {
  sesion: SesionApi;
  token: string;
  duenoId: number;
  email: string;
  nombreUsuario: string;
  password: string;
  comercioId: number;
  nombre: string;
}

export const MOTIVO_RECHAZO = 'Falta información del local';

export async function registrarPendiente(
  request: APIRequestContext,
  adminToken: string,
  localidadId: string,
  nombre?: string,
  horarios: HorarioInput[] = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
): Promise<Dueno> {
  const comercio = await registrarYVerificarComercio(request, localidadId, {
    nombre,
    horarios,
    aceptaDelivery: false,
    aceptaRetiro: true,
  });
  const pendiente = await buscarComercioPendientePorEmail(request, adminToken, comercio.email);
  const sesion = await login(request, comercio.nombreUsuario, comercio.password);
  return {
    sesion,
    token: sesion.token,
    duenoId: sesion.usuario.id,
    email: comercio.email,
    nombreUsuario: comercio.nombreUsuario,
    password: comercio.password,
    comercioId: pendiente.id,
    nombre: comercio.nombre,
  };
}

export async function prepararRechazado(
  request: APIRequestContext,
  adminToken: string,
  localidadId: string,
  motivo = MOTIVO_RECHAZO,
  nombre?: string,
): Promise<Dueno> {
  const dueno = await registrarPendiente(request, adminToken, localidadId, nombre);
  await resolverComercio(request, adminToken, dueno.comercioId, false, motivo);
  return dueno;
}

export async function prepararAprobado(
  request: APIRequestContext,
  adminToken: string,
  localidadId: string,
  conMercadoPago = false,
  horarios?: HorarioInput[],
): Promise<Dueno> {
  const dueno = await registrarPendiente(request, adminToken, localidadId, undefined, horarios);
  if (conMercadoPago) {
    await vincularMercadoPagoSimuladoTest(request, dueno.duenoId);
  }
  await resolverComercio(request, adminToken, dueno.comercioId, true);
  return dueno;
}

export function reemplazarHorarios(comercioId: number, horarios: HorarioInput[]): void {
  sql(`DELETE FROM horario WHERE comercio_id = ${comercioId};`);
  horarios.forEach((horario) => {
    sql(
      `INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) ` +
        `VALUES (${comercioId}, '${horario.diaSemana}', '${horario.horaApertura}', '${horario.horaCierre}');`,
    );
  });
}

export async function agregarComercioApto(
  request: APIRequestContext,
  dueno: Dueno,
  nombre: string,
  horarios?: HorarioInput[],
): Promise<number> {
  const comercioId = await clonarComercioTest(request, dueno.comercioId, nombre, 'APTO_VENTA');
  if (horarios) {
    reemplazarHorarios(comercioId, horarios);
  }
  return comercioId;
}

export async function clonarConRedes(request: APIRequestContext, comercioId: number, nombre: string, estado: string): Promise<number> {
  const clonId = await clonarComercioTest(request, comercioId, nombre, estado);
  sql(
    `INSERT INTO red_social (comercio_id, tipo, url, fecha_creacion) ` +
      `SELECT ${clonId}, tipo, url, NOW() FROM red_social WHERE comercio_id = ${comercioId} AND fecha_baja IS NULL;`,
  );
  return clonId;
}

export const estadoDe = (comercioId: number): string => sql(`SELECT estado FROM comercio WHERE id = ${comercioId};`);

export const cantidadResolicitudesDe = (comercioId: number): number =>
  Number(sql(`SELECT cantidad_resolicitudes FROM comercio WHERE id = ${comercioId};`));

export function camposDeLosCambios(comercioId: number): string[] {
  const filas = sql(
    `SELECT campo FROM historial_cambio_comercio ` +
      `WHERE historial_estado_comercio_id = (SELECT MAX(id) FROM historial_estado_comercio WHERE comercio_id = ${comercioId} AND estado_destino = 'PENDIENTE') ` +
      `ORDER BY campo;`,
  );
  return filas ? filas.split(/\r?\n/) : [];
}

export const correccionDe = (request: APIRequestContext, token: string, comercioId: number) =>
  apiConHeaders(request, 'GET', `/comercios/${comercioId}/correccion`, token);

export const reenviar = (request: APIRequestContext, token: string, comercioId: number, body: unknown) =>
  apiConHeaders(request, 'PUT', `/comercios/${comercioId}/resolicitud`, token, {}, body);

export function payloadDesde(correccion: any, cambios: Record<string, unknown> = {}) {
  return {
    nombre: correccion.nombre,
    descripcion: correccion.descripcion,
    telefono: correccion.telefono,
    emailContacto: correccion.emailContacto,
    tipoComercio: correccion.tipoComercio,
    aceptaDelivery: correccion.aceptaDelivery,
    aceptaRetiro: correccion.aceptaRetiro,
    fotoPerfilUrl: correccion.fotoPerfilUrl,
    direccion: {
      calle: correccion.direccion.calle,
      numero: correccion.direccion.numero,
      pisoDepto: correccion.direccion.pisoDepto,
      codigoPostal: correccion.direccion.codigoPostal,
      localidadId: correccion.direccion.localidadId,
      principal: false,
    },
    horarios: correccion.horarios.map((h: any) => ({ diaSemana: h.diaSemana, horaApertura: h.horaApertura, horaCierre: h.horaCierre })),
    redesSociales: correccion.redesSociales.map((r: any) => ({ tipo: r.tipo, url: r.url })),
    tokenVersion: correccion.tokenVersion,
    ...cambios,
  };
}

export async function reenviarConCambioSimple(request: APIRequestContext, dueno: Dueno, texto: string) {
  const correccion = await correccionDe(request, dueno.token, dueno.comercioId);
  expect(correccion.status).toBe(200);
  const respuesta = await reenviar(request, dueno.token, dueno.comercioId, payloadDesde(correccion.body.data, { descripcion: texto }));
  expect(respuesta.status).toBe(200);
  return correccion.body.data;
}

export async function metricasDelAdmin(request: APIRequestContext, adminToken: string) {
  const { status, body } = await apiConHeaders(request, 'GET', '/administrador/metricas', adminToken);
  expect(status).toBe(200);
  return body.data as { comerciosPendientes: number; resolicitudesPendientes: number };
}

export async function abrirComoUsuario(page: Page, sesion: SesionApi) {
  await page.addInitScript(
    ([token, usuario]) => {
      localStorage.setItem('bajonea_token', token);
      localStorage.setItem('bajonea_usuario', usuario);
    },
    [sesion.token, JSON.stringify(sesion.usuario)],
  );
}

export async function loginUi(page: Page, nombreUsuario: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(nombreUsuario);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
}

export async function loginAdminUi(page: Page) {
  await loginUi(page, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA);
  await page.waitForURL('**/admin-dashboard.html');
}

export async function capturar(page: Page, nombre: string) {
  if (process.env.CAPTURAS) {
    await page.screenshot({ path: `tmp-capturas/3b-${process.env.CAPTURAS}-${nombre}.png`, fullPage: true });
  }
}
