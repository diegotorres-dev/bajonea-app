import path from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { expect } from '@playwright/test';
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';

export const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
export const ADMIN_EMAIL = 'admin@bajonea.ar';
export const ADMIN_USUARIO = 'adminbajonea';
export const ADMIN_PASSWORD_CONOCIDA = 'AdminE2E123';

const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

const DIA_POR_INDICE = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

let contadorSufijo = 0;

export function sufijoUnico(): string {
  contadorSufijo += 1;
  return `${Date.now()}${contadorSufijo}${Math.floor(Math.random() * 1000)}`;
}

export function nombreUsuarioUnico(prefijo: string): string {
  const marca = Date.now().toString(36);
  const azar = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  contadorSufijo += 1;
  return `${prefijo}${marca}${azar}${contadorSufijo.toString(36)}`.slice(0, 20);
}

export function diaDeHoy(): string {
  return DIA_POR_INDICE[new Date().getDay()];
}

export function diaDistintoDeHoy(): string {
  const otro = (new Date().getDay() + 1) % 7;
  return DIA_POR_INDICE[otro];
}

async function leerBody(response: APIResponse): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

const HEADER_COMERCIO_ID = 'X-Comercio-Id';
const RUTAS_DEL_DUENO = /^\/(comercios\/(perfil|redes-sociales|cerrar|abrir)|productos|pedidos\/comercio|notificaciones)(?=[/?]|$)/;
const RUTAS_DEL_DUENO_SIN_HEADER = /^\/notificaciones\/comercio\//;
const comercioActivoPorToken = new Map<string, number>();

export function registrarComercioActivo(token: string, comercioId: number): void {
  comercioActivoPorToken.set(token, comercioId);
}

export function olvidarComercioActivo(token: string): void {
  comercioActivoPorToken.delete(token);
}

function cabecerasDe(path: string, token?: string): Record<string, string> | undefined {
  if (!token) {
    return undefined;
  }
  const cabeceras: Record<string, string> = { Authorization: `Bearer ${token}` };
  const comercioId = comercioActivoPorToken.get(token);
  if (comercioId !== undefined && RUTAS_DEL_DUENO.test(path) && !RUTAS_DEL_DUENO_SIN_HEADER.test(path)) {
    cabeceras[HEADER_COMERCIO_ID] = String(comercioId);
  }
  return cabeceras;
}

export async function apiGet(request: APIRequestContext, path: string, token?: string) {
  const response = await request.get(`${API_BASE_URL}${path}`, { headers: cabecerasDe(path, token) });
  return { status: response.status(), body: await leerBody(response) };
}

export async function apiPost(request: APIRequestContext, path: string, data: unknown, token?: string) {
  const response = await request.post(`${API_BASE_URL}${path}`, { data, headers: cabecerasDe(path, token) });
  return { status: response.status(), body: await leerBody(response) };
}

export async function apiPut(request: APIRequestContext, path: string, data: unknown, token?: string) {
  const response = await request.put(`${API_BASE_URL}${path}`, { data, headers: cabecerasDe(path, token) });
  return { status: response.status(), body: await leerBody(response) };
}

export async function apiDelete(request: APIRequestContext, path: string, token?: string) {
  const response = await request.delete(`${API_BASE_URL}${path}`, { headers: cabecerasDe(path, token) });
  return { status: response.status(), body: await leerBody(response) };
}

export async function apiConHeaders(
  request: APIRequestContext,
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  token: string | undefined,
  headers: Record<string, string> = {},
  data?: unknown,
) {
  const response = await request.fetch(`${API_BASE_URL}${path}`, {
    method: metodo,
    data,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: response.status(), body: await leerBody(response) };
}

export async function clonarComercioTest(
  request: APIRequestContext,
  comercioId: number,
  nombre: string,
  estado?: string,
): Promise<number> {
  const query = `nombre=${encodeURIComponent(nombre)}${estado ? `&estado=${estado}` : ''}`;
  const { status, body } = await apiPost(request, `/test/comercios/${comercioId}/clonar?${query}`, {});
  if (status !== 201) {
    throw new Error(`No se pudo clonar el comercio ${comercioId}: ${status} ${JSON.stringify(body)}`);
  }
  return body.data as number;
}

export async function vincularMercadoPagoSimuladoTest(request: APIRequestContext, duenoId: number): Promise<void> {
  const { status, body } = await apiPost(request, `/test/duenos/${duenoId}/mercadopago-simulada`, {});
  if (status !== 200) {
    throw new Error(`No se pudo vincular la cuenta simulada del dueño ${duenoId}: ${status} ${JSON.stringify(body)}`);
  }
}

export function aTitleCase(texto: string): string {
  const minusculas = texto.toLowerCase();
  let resultado = '';
  let inicioDePalabra = true;
  for (const caracter of minusculas) {
    if (inicioDePalabra && /\p{L}/u.test(caracter)) {
      resultado += caracter.toUpperCase();
      inicioDePalabra = false;
    } else {
      resultado += caracter;
      inicioDePalabra = /\s|-|'|\//.test(caracter);
    }
  }
  return resultado;
}

export function generarDni(): string {
  return String(Math.floor(1_000_000 + Math.random() * 90_000_000));
}

export function generarTelefono(): string {
  const local = String(Math.floor(100_000 + Math.random() * 900_000));
  return `2964${local}`;
}

export function generarCuit(): string {
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let intento = 0; intento < 30; intento += 1) {
    const base8 = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
    const base10 = `30${base8}`;
    let suma = 0;
    for (let i = 0; i < 10; i += 1) {
      suma += Number(base10[i]) * multiplicadores[i];
    }
    let dv = 11 - (suma % 11);
    if (dv === 11) dv = 0;
    if (dv === 10) continue;
    return `${base10}${dv}`;
  }
  throw new Error('No se pudo generar un CUIT válido tras 30 intentos');
}

export type TipoTokenTest = 'VERIFICACION_EMAIL' | 'RECUPERACION_PASSWORD' | 'REACTIVACION_CUENTA';

export async function obtenerCodigoTest(request: APIRequestContext, email: string, tipo: TipoTokenTest): Promise<string> {
  const { status, body } = await apiGet(request, `/test/token?email=${encodeURIComponent(email)}&tipo=${tipo}`);
  if (status !== 200) {
    throw new Error(`No se pudo obtener el código de test para ${email}/${tipo}: ${status} ${JSON.stringify(body)}`);
  }
  return body.data as string;
}

export async function obtenerLocalidadRioGrande(request: APIRequestContext): Promise<string> {
  const { body: provinciasBody } = await apiGet(request, '/geografia/provincias');
  const provincia = (provinciasBody.data || []).find((p: any) => p.nombre.startsWith('Tierra del Fuego'));
  if (!provincia) {
    throw new Error('No se encontró la provincia "Tierra del Fuego" en bajonea_test');
  }
  const { body: localidadesBody } = await apiGet(request, `/geografia/localidades?provinciaId=${encodeURIComponent(provincia.id)}`);
  const localidad = (localidadesBody.data || []).find((l: any) => {
    const nombre = l.nombre.toLowerCase();
    return nombre.includes('río grande') || nombre.includes('rio grande');
  });
  if (!localidad) {
    throw new Error('No se encontró la localidad "Río Grande" en bajonea_test');
  }
  return localidad.id as string;
}

function generarTelefonoCompleto(): string {
  return `+549${generarTelefono()}`;
}

export async function subirFotoPreRegistro(request: APIRequestContext, tipo: 'cliente' | 'comercio'): Promise<string> {
  const path = tipo === 'comercio' ? '/auth/registro/comercio/foto-firma' : '/auth/registro/cliente/foto-firma';
  const firmaResponse = await request.post(`${API_BASE_URL}${path}`);
  const firma = (await leerBody(firmaResponse)).data;
  if (!firmaResponse.ok() || !firma) {
    throw new Error(`No se pudo obtener la firma de Cloudinary de pre-registro (${tipo}): ${firmaResponse.status()}`);
  }

  const uploadResponse = await request.post(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
    multipart: {
      file: { name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER },
      api_key: firma.apiKey,
      timestamp: String(firma.timestamp),
      signature: firma.signature,
      folder: firma.folder,
      upload_preset: firma.uploadPreset,
    },
  });
  const uploadBody = await leerBody(uploadResponse);
  if (!uploadResponse.ok() || !uploadBody.secure_url) {
    throw new Error(`No se pudo subir la foto de pre-registro (${tipo}) a Cloudinary: ${uploadResponse.status()} ${JSON.stringify(uploadBody)}`);
  }
  return uploadBody.secure_url as string;
}

export interface ClienteRegistrado {
  nombreUsuario: string;
  email: string;
  password: string;
  nombre: string;
  apellido: string;
}

export async function registrarCliente(
  request: APIRequestContext,
  localidadId: string,
  overrides: Partial<{ email: string; password: string; nombreUsuario: string }> = {},
): Promise<ClienteRegistrado> {
  const suf = sufijoUnico();
  const nombreUsuario = overrides.nombreUsuario || nombreUsuarioUnico('cli');
  const email = overrides.email || `cliente.e2e.${suf}@bajonea.test`;
  const password = overrides.password || 'Testing123';
  const nombre = 'Clienta';
  const apellido = 'Playwright';
  const payload = {
    nombre,
    apellido,
    dni: generarDni(),
    fechaNacimiento: '1995-05-20',
    telefono: generarTelefonoCompleto(),
    nombreUsuario,
    email,
    password,
    aceptaTerminos: true,
    direccion: {
      calle: 'Calle Siempre Viva',
      numero: '123',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId,
      principal: true,
    },
  };
  const { status, body } = await apiPost(request, '/auth/registro/cliente', payload);
  if (status !== 201) {
    throw new Error(`No se pudo registrar el cliente ${email}: ${status} ${JSON.stringify(body)}`);
  }
  return { nombreUsuario, email, password, nombre, apellido };
}

export async function verificarCuenta(request: APIRequestContext, email: string): Promise<void> {
  const codigo = await obtenerCodigoTest(request, email, 'VERIFICACION_EMAIL');
  const { status, body } = await apiPost(request, '/auth/verificar', { email, codigo });
  if (status !== 200) {
    throw new Error(`No se pudo verificar la cuenta ${email}: ${status} ${JSON.stringify(body)}`);
  }
}

export async function registrarYVerificarCliente(
  request: APIRequestContext,
  localidadId: string,
  overrides: Partial<{ email: string; password: string; nombreUsuario: string }> = {},
): Promise<ClienteRegistrado> {
  const cliente = await registrarCliente(request, localidadId, overrides);
  await verificarCuenta(request, cliente.email);
  return cliente;
}

export interface HorarioInput {
  diaSemana: string;
  horaApertura: string;
  horaCierre: string;
}

export interface ComercioRegistrado {
  nombreUsuario: string;
  email: string;
  password: string;
  nombre: string;
}

export async function registrarComercio(
  request: APIRequestContext,
  localidadId: string,
  opciones: {
    horarios: HorarioInput[];
    tipoComercio?: 'RESTAURANTE' | 'EMPRENDIMIENTO';
    aceptaDelivery?: boolean;
    aceptaRetiro?: boolean;
    nombre?: string;
  },
): Promise<ComercioRegistrado> {
  const suf = sufijoUnico();
  const email = `comercio.e2e.${suf}@bajonea.test`;
  const nombreUsuario = nombreUsuarioUnico('com');
  const password = 'Testing123';
  const nombre = opciones.nombre || `Comercio E2E ${suf}`;
  const fotoPerfilUrl = await subirFotoPreRegistro(request, 'comercio');
  const payload = {
    fotoPerfilUrl,
    razonSocial: `Razon Social E2E ${suf}`,
    cuit: generarCuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. San Martín 100',
    fechaInicioActividades: '2020-01-01',
    nombre,
    descripcion: 'Comercio de prueba generado por Playwright (Fase 17)',
    telefono: generarTelefonoCompleto(),
    emailContacto: email,
    tipoComercio: opciones.tipoComercio || 'RESTAURANTE',
    aceptaDelivery: opciones.aceptaDelivery ?? true,
    aceptaRetiro: opciones.aceptaRetiro ?? false,
    nombreUsuario,
    email,
    password,
    direccion: {
      calle: 'Av. San Martín',
      numero: '100',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId,
      principal: true,
    },
    horarios: opciones.horarios,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/comercio.e2e.${suf}` }],
    nombreRepresentante: 'Representante',
    apellidoRepresentante: 'Playwright',
    dniRepresentante: generarDni(),
    telefonoRepresentante: generarTelefonoCompleto(),
    fechaNacimientoRepresentante: '1985-03-15',
  };
  const { status, body } = await apiPost(request, '/auth/registro/comercio', payload);
  if (status !== 201) {
    throw new Error(`No se pudo registrar el comercio ${email}: ${status} ${JSON.stringify(body)}`);
  }
  return { nombreUsuario, email, password, nombre: aTitleCase(nombre) };
}

export async function registrarYVerificarComercio(
  request: APIRequestContext,
  localidadId: string,
  opciones: Parameters<typeof registrarComercio>[2],
): Promise<ComercioRegistrado> {
  const comercio = await registrarComercio(request, localidadId, opciones);
  await verificarCuenta(request, comercio.email);
  return comercio;
}

export interface SesionApi {
  token: string;
  usuario: { id: number; rol: string };
}

export async function login(request: APIRequestContext, nombreUsuario: string, password: string): Promise<SesionApi> {
  const { status, body } = await apiPost(request, '/auth/login', { nombreUsuario, password });
  if (status !== 200) {
    throw new Error(`Login falló para ${nombreUsuario}: ${status} ${JSON.stringify(body)}`);
  }
  const sesion = body.data as SesionApi;
  if (sesion.usuario?.rol === 'DUENO') {
    await registrarComercioActivoDelDueno(request, sesion.token);
  }
  return sesion;
}

const PRIORIDAD_ESTADOS_POR_DEFECTO = [['APROBADO', 'APTO_VENTA'], ['RECHAZADO'], ['PENDIENTE']];

async function registrarComercioActivoDelDueno(request: APIRequestContext, token: string): Promise<void> {
  const respuesta = await request.get(`${API_BASE_URL}/comercios/mis-comercios`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok()) {
    return;
  }
  const comercios: Array<{ id: number; estado: string }> = (await leerBody(respuesta)).data ?? [];
  if (comercios.length === 0) {
    return;
  }
  for (const estados of PRIORIDAD_ESTADOS_POR_DEFECTO) {
    const elegido = comercios.find((comercio) => estados.includes(comercio.estado));
    if (elegido) {
      registrarComercioActivo(token, elegido.id);
      return;
    }
  }
  registrarComercioActivo(token, comercios[0].id);
}

export async function fijarPasswordAdminYLoguear(request: APIRequestContext): Promise<SesionApi> {
  const intentosMaximos = 4;
  let ultimoError: unknown;

  for (let intento = 1; intento <= intentosMaximos; intento += 1) {
    try {
      await apiPost(request, '/auth/recuperar-password', { email: ADMIN_EMAIL });
      const codigo = await obtenerCodigoTest(request, ADMIN_EMAIL, 'RECUPERACION_PASSWORD');
      const { status, body } = await apiPost(request, '/auth/recuperar-password/confirmar', {
        email: ADMIN_EMAIL,
        codigo,
        nuevaPassword: ADMIN_PASSWORD_CONOCIDA,
      });
      if (status !== 200) {
        throw new Error(`No se pudo fijar la contraseña conocida de administrador: ${status} ${JSON.stringify(body)}`);
      }
      return await login(request, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA);
    } catch (error) {
      ultimoError = error;
      if (intento < intentosMaximos) {
        await new Promise((resolve) => setTimeout(resolve, 150 + Math.floor(Math.random() * 250)));
      }
    }
  }

  throw new Error(
    `fijarPasswordAdminYLoguear agotó ${intentosMaximos} intentos (carrera real sobre la cuenta ` +
      `admin@bajonea.ar compartida entre specs) -- último error: ${
        ultimoError instanceof Error ? ultimoError.message : String(ultimoError)
      }`,
  );
}

export async function resolverComercio(
  request: APIRequestContext,
  adminToken: string,
  comercioId: number,
  aprobar: boolean,
  motivo?: string,
  definitivo?: boolean,
): Promise<void> {
  const { status, body } = await apiPut(
    request,
    `/administrador/comercios/${comercioId}/resolver`,
    { aprobar, motivo, ...(definitivo === undefined ? {} : { definitivo }) },
    adminToken,
  );
  if (status !== 200) {
    throw new Error(`No se pudo resolver el comercio ${comercioId}: ${status} ${JSON.stringify(body)}`);
  }
}

export async function marcarAptoVenta(request: APIRequestContext, comercioId: number): Promise<void> {
  const { status, body } = await apiPut(request, `/test/comercios/${comercioId}/apto-venta`, {});
  if (status !== 200) {
    throw new Error(`No se pudo marcar APTO_VENTA el comercio ${comercioId}: ${status} ${JSON.stringify(body)}`);
  }
}

export async function confirmarPagoTest(request: APIRequestContext, pedidoId: number): Promise<void> {
  const { status, body } = await apiPut(request, `/test/pedidos/${pedidoId}/pago-aprobado`, {});
  if (status !== 200) {
    throw new Error(`No se pudo confirmar el pago del pedido ${pedidoId}: ${status} ${JSON.stringify(body)}`);
  }
}

export async function buscarComercioPendientePorEmail(request: APIRequestContext, adminToken: string, email: string) {
  const { body } = await apiGet(request, '/administrador/comercios/pendientes', adminToken);
  const comercio = (body.data || []).find((c: any) => c.emailCuenta === email);
  if (!comercio) {
    throw new Error(`No se encontró el comercio pendiente con emailCuenta ${email}`);
  }
  return comercio as { id: number; nombre: string; emailCuenta: string };
}

export async function buscarClienteAdminPorEmail(request: APIRequestContext, adminToken: string, email: string) {
  const { body } = await apiGet(request, '/administrador/clientes', adminToken);
  const cliente = (body.data || []).find((c: any) => c.email === email);
  if (!cliente) {
    throw new Error(`No se encontró el cliente con email ${email} en /administrador/clientes`);
  }
  return cliente as { id: number; nombre: string; apellido: string; dni: string; email: string; estado: string };
}

export async function eliminarTodasLasRedesSociales(request: APIRequestContext, comercioToken: string): Promise<void> {
  const { body } = await apiGet(request, '/comercios/redes-sociales', comercioToken);
  const redes = (body.data || []) as Array<{ id: number }>;
  for (const red of redes) {
    const { status, body: bodyBaja } = await apiDelete(request, `/comercios/redes-sociales/${red.id}`, comercioToken);
    if (status !== 200) {
      throw new Error(`No se pudo dar de baja la red social ${red.id}: ${status} ${JSON.stringify(bodyBaja)}`);
    }
  }
}

export async function crearCategoria(request: APIRequestContext, adminToken: string, nombre: string): Promise<number> {
  const { status, body } = await apiPost(request, '/categorias', { nombre }, adminToken);
  if (status !== 201) {
    throw new Error(`No se pudo crear la categoría "${nombre}": ${status} ${JSON.stringify(body)}`);
  }
  return body.data.id as number;
}

export async function crearTag(request: APIRequestContext, adminToken: string, nombre: string): Promise<number> {
  const { status, body } = await apiPost(request, '/tags', { nombre }, adminToken);
  if (status !== 201) {
    throw new Error(`No se pudo crear el tag "${nombre}": ${status} ${JSON.stringify(body)}`);
  }
  return body.data.id as number;
}

export async function crearProducto(
  request: APIRequestContext,
  comercioToken: string,
  datos: { nombre: string; precio: number; categoriaId: number; descripcion?: string },
): Promise<number> {
  const { status, body } = await apiPost(request, '/productos', datos, comercioToken);
  if (status !== 201) {
    throw new Error(`No se pudo crear el producto "${datos.nombre}": ${status} ${JSON.stringify(body)}`);
  }
  return body.data.id as number;
}

export async function agregarItemCarrito(
  request: APIRequestContext,
  clienteToken: string,
  productoId: number,
  cantidad: number = 1,
): Promise<void> {
  const { status, body } = await apiPost(request, '/carrito/items', { productoId, cantidad }, clienteToken);
  if (status !== 201) {
    throw new Error(`No se pudo agregar el producto ${productoId} al carrito: ${status} ${JSON.stringify(body)}`);
  }
}

export async function crearPedido(
  request: APIRequestContext,
  clienteToken: string,
  tipoEntrega: 'DOMICILIO' | 'RETIRO',
  direccionId: number | null = null,
): Promise<number> {
  const { status, body } = await apiPost(request, '/pedidos/cliente', { tipoEntrega, direccionId }, clienteToken);
  if (status !== 201) {
    throw new Error(`No se pudo crear el pedido: ${status} ${JSON.stringify(body)}`);
  }
  return body.data.id as number;
}

export async function esperarImagenCargadaEnRecorte(page: Page): Promise<void> {
  await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId('canvas-recorte').evaluate((canvas: HTMLCanvasElement) => {
        const pixeles = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixeles.length; i += 4) {
          if (pixeles[i] !== 0) return true;
        }
        return false;
      }),
    )
    .toBe(true);
}

export function nombreArchivoFixture(): string {
  return `bajonea-e2e-producto-${sufijoUnico()}.png`;
}

export async function subirImagenProductoDirecto(
  request: APIRequestContext,
  comercioToken: string,
  productoId: number,
  imagenBuffer: Buffer,
  opciones: { orden: number; esPrincipal?: boolean },
): Promise<number> {
  const rutaFirma = `/productos/${productoId}/cloudinary/firma`;
  const firmaResponse = await request.post(`${API_BASE_URL}${rutaFirma}`, {
    headers: cabecerasDe(rutaFirma, comercioToken),
  });
  const firma = (await leerBody(firmaResponse)).data;
  if (!firmaResponse.ok() || !firma) {
    throw new Error(`No se pudo obtener la firma de Cloudinary para el producto ${productoId}: ${firmaResponse.status()}`);
  }

  const uploadResponse = await request.post(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
    multipart: {
      file: { name: nombreArchivoFixture(), mimeType: 'image/png', buffer: imagenBuffer },
      api_key: firma.apiKey,
      timestamp: String(firma.timestamp),
      signature: firma.signature,
      folder: firma.folder,
      upload_preset: firma.uploadPreset,
    },
  });
  const uploadBody = await leerBody(uploadResponse);
  if (!uploadResponse.ok() || !uploadBody.secure_url) {
    throw new Error(`No se pudo subir la imagen directa a Cloudinary: ${uploadResponse.status()} ${JSON.stringify(uploadBody)}`);
  }

  const { status, body } = await apiPost(request, `/productos/${productoId}/imagenes`, {
    url: uploadBody.secure_url,
    orden: opciones.orden,
    esPrincipal: opciones.esPrincipal ?? false,
  }, comercioToken);
  if (status !== 201) {
    throw new Error(`No se pudo registrar la imagen subida directo a Cloudinary: ${status} ${JSON.stringify(body)}`);
  }
  return body.data.id as number;
}

export async function subirFotoNuevoComercio(request: APIRequestContext, duenoToken: string): Promise<string> {
  const firmaResponse = await request.post(`${API_BASE_URL}/comercios/nuevo/foto/firma`, {
    headers: { Authorization: `Bearer ${duenoToken}` },
  });
  const firma = (await leerBody(firmaResponse)).data;
  if (!firmaResponse.ok() || !firma) {
    throw new Error(`No se pudo obtener la firma de Cloudinary del alta adicional: ${firmaResponse.status()}`);
  }

  const uploadResponse = await request.post(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
    multipart: {
      file: { name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER },
      api_key: firma.apiKey,
      timestamp: String(firma.timestamp),
      signature: firma.signature,
      folder: firma.folder,
      upload_preset: firma.uploadPreset,
    },
  });
  const uploadBody = await leerBody(uploadResponse);
  if (!uploadResponse.ok() || !uploadBody.secure_url) {
    throw new Error(`No se pudo subir la foto del alta adicional a Cloudinary: ${uploadResponse.status()} ${JSON.stringify(uploadBody)}`);
  }
  return uploadBody.secure_url as string;
}

export async function subirFotoCorreccionComercio(request: APIRequestContext, duenoToken: string, comercioId: number): Promise<string> {
  const firmaResponse = await request.post(`${API_BASE_URL}/comercios/${comercioId}/correccion/foto/firma`, {
    headers: { Authorization: `Bearer ${duenoToken}` },
  });
  const firma = (await leerBody(firmaResponse)).data;
  if (!firmaResponse.ok() || !firma) {
    throw new Error(`No se pudo obtener la firma de Cloudinary de la corrección: ${firmaResponse.status()}`);
  }
  const uploadResponse = await request.post(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
    multipart: {
      file: { name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER },
      api_key: firma.apiKey,
      timestamp: String(firma.timestamp),
      signature: firma.signature,
      folder: firma.folder,
      upload_preset: firma.uploadPreset,
    },
  });
  const uploadBody = await leerBody(uploadResponse);
  if (!uploadResponse.ok() || !uploadBody.secure_url) {
    throw new Error(`No se pudo subir la foto de la corrección a Cloudinary: ${uploadResponse.status()} ${JSON.stringify(uploadBody)}`);
  }
  return uploadBody.secure_url as string;
}

export interface DatosAltaAdicional {
  nombre: string;
  descripcion: string;
  telefono: string;
  emailContacto: string;
  tipoComercio: string;
  aceptaDelivery: boolean;
  aceptaRetiro: boolean;
  fotoPerfilUrl: string;
  direccion: {
    calle: string;
    numero: string;
    pisoDepto: string | null;
    codigoPostal: string;
    localidadId: string;
    principal: boolean;
  };
  horarios: HorarioInput[];
  redesSociales: Array<{ tipo: string; url: string }>;
}

export function payloadAltaAdicional(
  localidadId: string,
  fotoPerfilUrl: string,
  overrides: Partial<DatosAltaAdicional> = {},
): DatosAltaAdicional {
  const suf = sufijoUnico();
  return {
    nombre: `Adicional E2E ${suf}`,
    descripcion: 'Comercio adicional generado por Playwright (multi-comercio, tramo 2A)',
    telefono: generarTelefonoCompleto(),
    emailContacto: `adicional.e2e.${suf}@bajonea.test`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: false,
    fotoPerfilUrl,
    direccion: {
      calle: 'Belgrano',
      numero: '250',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId,
      principal: false,
    },
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/adicional.e2e.${suf}` }],
    ...overrides,
  };
}

export async function registrarComercioAdicional(
  request: APIRequestContext,
  duenoToken: string,
  localidadId: string,
  overrides: Partial<DatosAltaAdicional> = {},
  headers: Record<string, string> = {},
) {
  const fotoPerfilUrl = overrides.fotoPerfilUrl ?? (await subirFotoNuevoComercio(request, duenoToken));
  const payload = payloadAltaAdicional(localidadId, fotoPerfilUrl, overrides);
  const respuesta = await apiConHeaders(request, 'POST', '/comercios', duenoToken, headers, payload);
  return { ...respuesta, payload };
}

export function sqlTest(consulta: string): string {
  return execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '--default-character-set=utf8mb4', '-N', '-B', 'bajonea_test', '-e', consulta])
    .toString()
    .trim();
}

export async function suspenderComercio(request: APIRequestContext, adminToken: string, comercioId: number, motivo: string): Promise<void> {
  const { status, body } = await apiPut(request, `/administrador/comercios/${comercioId}/suspender`, { motivo }, adminToken);
  if (status !== 200) {
    throw new Error(`No se pudo suspender el comercio ${comercioId}: ${status} ${JSON.stringify(body)}`);
  }
}

const cabeceraComercio = (comercioId: number): Record<string, string> => ({ [HEADER_COMERCIO_ID]: String(comercioId) });

export const MENSAJE_CODIGO_INVALIDO = 'El código es incorrecto o la invitación ya no está vigente. Pedí que te reenvíen la invitación.';

export function invitarEmpleado(request: APIRequestContext, token: string, comercioId: number, email: string) {
  return apiConHeaders(request, 'POST', '/comercios/equipo/invitaciones', token, cabeceraComercio(comercioId), { email });
}

export function reenviarInvitacion(request: APIRequestContext, token: string, comercioId: number, invitacionId: number) {
  return apiConHeaders(request, 'POST', `/comercios/equipo/invitaciones/${invitacionId}/reenviar`, token, cabeceraComercio(comercioId));
}

export function cancelarInvitacion(request: APIRequestContext, token: string, comercioId: number, invitacionId: number) {
  return apiConHeaders(request, 'PUT', `/comercios/equipo/invitaciones/${invitacionId}/cancelar`, token, cabeceraComercio(comercioId));
}

export function equipoComercio(request: APIRequestContext, token: string, comercioId: number) {
  return apiConHeaders(request, 'GET', '/comercios/equipo', token, cabeceraComercio(comercioId));
}

export function validarInvitacion(request: APIRequestContext, email: string, codigo: string) {
  return apiPost(request, '/auth/invitaciones-empleado/validar', { email, codigo });
}

export function aceptarInvitacion(request: APIRequestContext, cuerpo: Record<string, unknown>) {
  return apiPost(request, '/auth/invitaciones-empleado/aceptar', cuerpo);
}

export async function obtenerCodigoInvitacionTest(request: APIRequestContext, email: string, comercioId: number): Promise<string> {
  const { status, body } = await apiGet(request, `/test/invitaciones-empleado/codigo?email=${encodeURIComponent(email)}&comercioId=${comercioId}`);
  if (status !== 200) {
    throw new Error(`No se pudo obtener el código de la invitación de ${email} al comercio ${comercioId}: ${status} ${JSON.stringify(body)}`);
  }
  return body.data as string;
}

export async function vencerInvitacionTest(request: APIRequestContext, invitacionId: number): Promise<void> {
  const { status, body } = await apiPut(request, `/test/invitaciones-empleado/${invitacionId}/vencer`, {});
  if (status !== 200) {
    throw new Error(`No se pudo vencer la invitación ${invitacionId}: ${status} ${JSON.stringify(body)}`);
  }
}

export async function cantidadEmailsRegularizacionTest(request: APIRequestContext, email: string): Promise<number> {
  const { status, body } = await apiGet(request, `/test/emails-regularizacion/cantidad?email=${encodeURIComponent(email)}`);
  if (status !== 200) {
    throw new Error(`No se pudo contar los emails de regularización de ${email}: ${status} ${JSON.stringify(body)}`);
  }
  return Number(body.data);
}

export function cuentaNuevaInvitacion(
  localidadId: string,
  overrides: Partial<{ dni: string; nombreUsuario: string; password: string }> = {},
) {
  return {
    nombre: 'Empleada',
    apellido: 'Invitada',
    dni: overrides.dni ?? generarDni(),
    fechaNacimiento: '1996-08-14',
    telefono: generarTelefonoCompleto(),
    nombreUsuario: overrides.nombreUsuario ?? nombreUsuarioUnico('emp'),
    password: overrides.password ?? `Pw${sufijoUnico()}Aa1`,
    direccion: {
      calle: 'Calle Siempre Viva',
      numero: '742',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId,
      principal: true,
    },
  };
}
