import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { APIRequestContext, APIResponse } from '@playwright/test';

export const API_BASE_URL = 'http://localhost:8080/api/v1';
export const ADMIN_EMAIL = 'admin@bajonea.ar';
export const ADMIN_PASSWORD_CONOCIDA = 'AdminE2E123';

const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

const DIA_POR_INDICE = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

let contadorSufijo = 0;

export function sufijoUnico(): string {
  contadorSufijo += 1;
  return `${Date.now()}${contadorSufijo}${Math.floor(Math.random() * 1000)}`;
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

export async function apiGet(request: APIRequestContext, path: string, token?: string) {
  const response = await request.get(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return { status: response.status(), body: await leerBody(response) };
}

export async function apiPost(request: APIRequestContext, path: string, data: unknown, token?: string) {
  const response = await request.post(`${API_BASE_URL}${path}`, {
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return { status: response.status(), body: await leerBody(response) };
}

export async function apiPut(request: APIRequestContext, path: string, data: unknown, token?: string) {
  const response = await request.put(`${API_BASE_URL}${path}`, {
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return { status: response.status(), body: await leerBody(response) };
}

export async function apiDelete(request: APIRequestContext, path: string, token?: string) {
  const response = await request.delete(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return { status: response.status(), body: await leerBody(response) };
}

/**
 * Mismo algoritmo que TextoUtils.aTitleCase (backend) / aTitleCase (frontend/js/validators.js):
 * RegistroService normaliza nombre/apellido, razonSocial, nombre de comercio y calle a Title
 * Case antes de persistir (Fase 2 del lote de ajustes post-migración, ver docs/DECISIONES.md).
 * Un valor como "Comercio E2E" no vuelve intacto -- vuelve "Comercio E2e" -- así que cualquier
 * assert contra el nombre real guardado en la base necesita pasar por esta misma transformación,
 * no comparar contra el string tal cual se mandó en el registro.
 */
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

/**
 * @ValidarTelefonoArgentino ahora exige el formato completo "+549" + 10 dígitos (antes
 * toleraba variantes) -- lo que el frontend arma vía construirTelefono() a partir de lo que
 * el usuario tipea en el input (solo los 10 dígitos). Los tests que llenan el input de la UI
 * usan generarTelefono() tal cual (correcto, el propio JS antepone "+549"); un payload de API
 * directo como los de esta función necesita el número YA completo.
 */
function generarTelefonoCompleto(): string {
  return `+549${generarTelefono()}`;
}

/**
 * Sube una foto real a Cloudinary a través de las firmas de pre-registro (públicas, sin
 * comercioId/usuarioId todavía) que exige RegistroComercioRequestDTO.fotoPerfilUrl /
 * RegistroClienteRequestDTO.fotoPerfilUrl -- mismo criterio ya establecido en
 * subirImagenProductoDirecto (spec 06): cuenta real de Cloudinary del proyecto, no bypaseada.
 */
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
  email: string;
  password: string;
  nombre: string;
  apellido: string;
}

export async function registrarCliente(
  request: APIRequestContext,
  localidadId: string,
  overrides: Partial<{ email: string; password: string }> = {},
): Promise<ClienteRegistrado> {
  const suf = sufijoUnico();
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
    email,
    password,
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
  return { email, password, nombre, apellido };
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
  overrides: Partial<{ email: string; password: string }> = {},
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
  return { email, password, nombre: aTitleCase(nombre) };
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

export async function login(request: APIRequestContext, email: string, password: string): Promise<SesionApi> {
  const { status, body } = await apiPost(request, '/auth/login', { email, password });
  if (status !== 200) {
    throw new Error(`Login falló para ${email}: ${status} ${JSON.stringify(body)}`);
  }
  return body.data as SesionApi;
}

/**
 * Mismo mecanismo ya usado manualmente por Diego en sesiones previas (docs/DECISIONES.md,
 * Fase 14/Tramo 16.29): admin@bajonea.ar nace en V13__seed_admin.sql con un hash cuyo
 * texto plano no está documentado, así que la única forma real (no mockeada) de loguearse
 * como Administrador en un bajonea_test recién reseteado es pasar por el flujo real de
 * recuperación de contraseña con el bypass de código de /api/v1/test.
 */
export async function fijarPasswordAdminYLoguear(request: APIRequestContext): Promise<SesionApi> {
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
  return login(request, ADMIN_EMAIL, ADMIN_PASSWORD_CONOCIDA);
}

export async function resolverComercio(
  request: APIRequestContext,
  adminToken: string,
  comercioId: number,
  aprobar: boolean,
  motivo?: string,
): Promise<void> {
  const { status, body } = await apiPut(request, `/administrador/comercios/${comercioId}/resolver`, { aprobar, motivo }, adminToken);
  if (status !== 200) {
    throw new Error(`No se pudo resolver el comercio ${comercioId}: ${status} ${JSON.stringify(body)}`);
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

/**
 * Nombre de archivo reconocible para que Diego pueda identificar (y borrar manualmente si
 * quiere) las imágenes que dejó la suite E2E en la cuenta real de Cloudinary del proyecto
 * (decisión explícita: spec 06 usa credenciales reales, no bypass -- ver docs/DECISIONES.md).
 */
export function nombreArchivoFixture(): string {
  return `bajonea-e2e-producto-${sufijoUnico()}.png`;
}

/**
 * Sube una imagen directo a Cloudinary (misma firma real que usa js/cloudinary.js,
 * subirImagenProducto) sin pasar por el navegador -- usado para pre-sembrar imágenes de forma
 * rápida en el test del límite de 5 imágenes por producto, que de otro modo necesitaría repetir
 * el editor de recorte real 5 veces solo para llegar al caso negativo. Consume cuota real de
 * Cloudinary igual que la subida por UI (misma cuenta, mismo upload_preset).
 */
export async function subirImagenProductoDirecto(
  request: APIRequestContext,
  comercioToken: string,
  productoId: number,
  imagenBuffer: Buffer,
  opciones: { orden: number; esPrincipal?: boolean },
): Promise<number> {
  const firmaResponse = await request.post(`${API_BASE_URL}/productos/${productoId}/cloudinary/firma`, {
    headers: { Authorization: `Bearer ${comercioToken}` },
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
