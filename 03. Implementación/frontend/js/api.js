import { mostrarPantallaCuentaSuspendida } from './cuenta-suspendida.js';

export const API_BASE_URL = 'http://localhost:8080/api/v1';

const TOKEN_KEY = 'bajonea_token';
const USUARIO_KEY = 'bajonea_usuario';
const COMERCIO_ACTIVO_KEY = 'bajonea_comercio_activo';
const AVISO_INVITACION_KEY = 'bajonea_aviso_invitacion';
const CONTEXTO_KEY = 'bajonea_contexto';
const ULTIMO_COMERCIO_PREFIX = 'bajonea_ultimo_comercio_';
const ULTIMO_CONTEXTO_PREFIX = 'bajonea_ultimo_contexto_';
const CODIGO_COMERCIO_NO_DISPONIBLE = 'COMERCIO_NO_DISPONIBLE';
export const CODIGO_CUENTA_SUSPENDIDA = 'CUENTA_SUSPENDIDA';
const RUTA_SELECTOR_CONTEXTO = 'seleccionar-contexto.html';
const ESPERA_MAXIMA_COMERCIOS_MS = 4000;
const RUTAS_DE_COMERCIO = /^\/(comercios|productos|pedidos\/comercio|notificaciones|oauth)(?=[/?]|$)/;
export const TIPO_CONTEXTO = Object.freeze({
  CLIENTE: 'CLIENTE',
  DUENO: 'DUENO',
  EMPLEADO: 'EMPLEADO',
  ADMINISTRADOR: 'ADMINISTRADOR',
});
const HEADER_COMERCIO_ID = 'X-Comercio-Id';
const RUTAS_DEL_DUENO = /^\/(comercios\/(perfil|redes-sociales|cerrar|abrir|equipo|estadisticas|documentos)|productos|pedidos\/comercio|notificaciones)(?=[/?]|$)/;
const RUTAS_DEL_DUENO_SIN_HEADER = /^\/notificaciones\/comercio\//;
const REQUEST_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(status, mensaje, data) {
    super(mensaje || 'Error de red');
    this.status = status;
    this.data = data;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSesion(token, usuario) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
}

export function getUsuario() {
  const raw = localStorage.getItem(USUARIO_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSesion() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USUARIO_KEY);
  clearComercioActivoId();
  clearContexto();
}

export function getContextoGuardado() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    return null;
  }
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CONTEXTO_KEY));
    if (!guardado || guardado.usuarioId !== usuario.id) {
      return null;
    }
    if (guardado.tipo === TIPO_CONTEXTO.EMPLEADO && Number.isInteger(guardado.comercioId)) {
      return {
        tipo: TIPO_CONTEXTO.EMPLEADO,
        comercioId: guardado.comercioId,
        comercioNombre: typeof guardado.comercioNombre === 'string' && guardado.comercioNombre ? guardado.comercioNombre : null,
      };
    }
    if (guardado.tipo === TIPO_CONTEXTO.CLIENTE) {
      return { tipo: TIPO_CONTEXTO.CLIENTE, comercioId: null };
    }
  } catch {
    return null;
  }
  return null;
}

export function getContexto() {
  const usuario = getUsuario();
  if (!usuario) {
    return null;
  }
  if (usuario.rol === 'DUENO') {
    return { tipo: TIPO_CONTEXTO.DUENO, comercioId: getComercioActivoId() };
  }
  if (usuario.rol === 'ADMINISTRADOR') {
    return { tipo: TIPO_CONTEXTO.ADMINISTRADOR, comercioId: null };
  }
  return getContextoGuardado() || { tipo: TIPO_CONTEXTO.CLIENTE, comercioId: null };
}

export function setContexto(tipo, comercioId = null, recordar = true, comercioNombre = null) {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    return;
  }
  const esEmpleado = tipo === TIPO_CONTEXTO.EMPLEADO;
  sessionStorage.setItem(CONTEXTO_KEY, JSON.stringify({
    usuarioId: usuario.id,
    tipo: esEmpleado ? TIPO_CONTEXTO.EMPLEADO : TIPO_CONTEXTO.CLIENTE,
    comercioId: esEmpleado ? comercioId : null,
    comercioNombre: esEmpleado && comercioNombre ? comercioNombre : null,
  }));
  if (recordar) {
    localStorage.setItem(`${ULTIMO_CONTEXTO_PREFIX}${usuario.id}`, esEmpleado ? `${TIPO_CONTEXTO.EMPLEADO}:${comercioId}` : TIPO_CONTEXTO.CLIENTE);
  }
}

export function actualizarNombreContexto(comercioNombre) {
  const contexto = getContextoGuardado();
  if (!contexto || contexto.tipo !== TIPO_CONTEXTO.EMPLEADO || !comercioNombre || contexto.comercioNombre === comercioNombre) {
    return;
  }
  setContexto(TIPO_CONTEXTO.EMPLEADO, contexto.comercioId, false, comercioNombre);
}

export function clearContexto() {
  sessionStorage.removeItem(CONTEXTO_KEY);
}

export function getUltimoContexto() {
  const usuario = getUsuario();
  if (!usuario) {
    return null;
  }
  const crudo = localStorage.getItem(`${ULTIMO_CONTEXTO_PREFIX}${usuario.id}`);
  if (crudo === TIPO_CONTEXTO.CLIENTE) {
    return { tipo: TIPO_CONTEXTO.CLIENTE, comercioId: null };
  }
  const coincidencia = /^EMPLEADO:(\d+)$/.exec(crudo || '');
  if (coincidencia && Number(coincidencia[1]) > 0) {
    return { tipo: TIPO_CONTEXTO.EMPLEADO, comercioId: Number(coincidencia[1]) };
  }
  return null;
}

export function olvidarUltimoContexto() {
  const usuario = getUsuario();
  if (usuario) {
    localStorage.removeItem(`${ULTIMO_CONTEXTO_PREFIX}${usuario.id}`);
  }
}

export function esContextoEmpleado() {
  const contexto = getContexto();
  return Boolean(contexto) && contexto.tipo === TIPO_CONTEXTO.EMPLEADO;
}

export function esContextoDueno() {
  const contexto = getContexto();
  return Boolean(contexto) && contexto.tipo === TIPO_CONTEXTO.DUENO;
}

export function esContextoComercio() {
  return esContextoDueno() || esContextoEmpleado();
}

export function contextoPuedeGestionarPedidos() {
  return esContextoComercio();
}

export function contextoPuedeEditarCatalogo() {
  return esContextoComercio();
}

export function contextoPuedeCerrarComercio() {
  return esContextoComercio();
}

export function marcarAvisoInvitacion() {
  try {
    sessionStorage.setItem(AVISO_INVITACION_KEY, '1');
  } catch {
    return;
  }
}

export function consumirAvisoInvitacion() {
  try {
    const hayAviso = sessionStorage.getItem(AVISO_INVITACION_KEY) === '1';
    sessionStorage.removeItem(AVISO_INVITACION_KEY);
    return hayAviso;
  } catch {
    return false;
  }
}

export function getComercioActivoId() {
  const usuario = getUsuario();
  if (!usuario) {
    return null;
  }
  const contextoGuardado = getContextoGuardado();
  if (contextoGuardado && contextoGuardado.tipo === TIPO_CONTEXTO.EMPLEADO) {
    return contextoGuardado.comercioId;
  }
  try {
    const guardado = JSON.parse(sessionStorage.getItem(COMERCIO_ACTIVO_KEY));
    if (guardado && guardado.usuarioId === usuario.id && Number.isInteger(guardado.comercioId)) {
      return guardado.comercioId;
    }
  } catch {
    return null;
  }
  return null;
}

export function getUltimoComercioId() {
  const usuario = getUsuario();
  if (!usuario) {
    return null;
  }
  const valor = Number(localStorage.getItem(`${ULTIMO_COMERCIO_PREFIX}${usuario.id}`));
  return Number.isInteger(valor) && valor > 0 ? valor : null;
}

export function setComercioActivoId(comercioId) {
  const usuario = getUsuario();
  if (!usuario) {
    return;
  }
  sessionStorage.setItem(COMERCIO_ACTIVO_KEY, JSON.stringify({ usuarioId: usuario.id, comercioId }));
  localStorage.setItem(`${ULTIMO_COMERCIO_PREFIX}${usuario.id}`, String(comercioId));
}

export function clearComercioActivoId() {
  sessionStorage.removeItem(COMERCIO_ACTIVO_KEY);
}

function comercioParaLaRequest(path, comercioId, sinComercio) {
  if (sinComercio || !esContextoComercio()) {
    return null;
  }
  if (!RUTAS_DEL_DUENO.test(path) || RUTAS_DEL_DUENO_SIN_HEADER.test(path)) {
    return null;
  }
  return comercioId !== undefined && comercioId !== null ? comercioId : getComercioActivoId();
}

function redirectTo(path, includeRetorno = false) {
  const base = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  const destino = includeRetorno
    ? `${path}?retorno=${encodeURIComponent(window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1) + window.location.search)}`
    : path;
  window.location.href = base + destino;
}

function crearModalSesionCerrada({ id, icono, titulo, texto }) {
  if (document.getElementById(id)) {
    return;
  }
  const backdrop = document.createElement('div');
  backdrop.id = id;
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet__icon">
        ${icono}
      </div>
      <h2 class="modal-sheet__title">${titulo}</h2>
      <p class="modal-sheet__text">${texto}</p>
      <button class="btn btn-primary" type="button" id="${id}-cta">Ir al inicio de sesión</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById(`${id}-cta`).addEventListener('click', () => {
    redirectTo('login.html');
  });
}

const ICONO_SESION_CERRADA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M18 13v-1a6 6 0 0 0-8.62-5.4"/><path d="M6 18.5A6 6 0 0 0 18 17.5"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
const ICONO_CUENTA_BLOQUEADA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

function showSesionCerradaModal() {
  crearModalSesionCerrada({
    id: 'sesion-cerrada-modal',
    icono: ICONO_SESION_CERRADA,
    titulo: 'Sesión cerrada',
    texto: 'Detectamos que iniciaste sesión en otro dispositivo. Por seguridad, tu sesión en este dispositivo fue cerrada automáticamente.',
  });
}

export function mostrarModalCuentaBloqueada() {
  clearSesion();
  crearModalSesionCerrada({
    id: 'cuenta-bloqueada-modal',
    icono: ICONO_CUENTA_BLOQUEADA,
    titulo: 'Cuenta bloqueada',
    texto: 'Tu contraseña fue ingresada incorrectamente varias veces y tu cuenta fue bloqueada por seguridad. Para volver a ingresar, recuperá tu contraseña.',
  });
}

async function parseBody(response) {
  try {
    return await response.json();
  } catch {
    return { mensaje: '', data: null };
  }
}

const ICONO_ACCESO_PERDIDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
const ICONO_PERSONA_BAJA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>';
const ICONO_PERSONA_SALIDA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="11"/></svg>';
const ICONO_COMERCIO_NO_DISPONIBLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
const TOAST_PENDIENTE_KEY = 'bajonea_toast_pendiente';
const MOTIVO_BAJA_DUENO = 'BAJA_DUENO';
const MOTIVO_RENUNCIA = 'RENUNCIA';
const TEXTO_ELEGIR_CUENTA = 'Elegí con qué cuenta seguir.';

let accesoPerdido = false;

export function hayAccesoPerdido() {
  return accesoPerdido;
}

export function guardarToastPendiente(mensaje) {
  try {
    sessionStorage.setItem(TOAST_PENDIENTE_KEY, mensaje);
  } catch {
    return;
  }
}

export function consumirToastPendiente() {
  try {
    const mensaje = sessionStorage.getItem(TOAST_PENDIENTE_KEY);
    sessionStorage.removeItem(TOAST_PENDIENTE_KEY);
    return mensaje || null;
  } catch {
    return null;
  }
}

export function completarRenuncia(comercioId, comercioNombre) {
  accesoPerdido = true;
  const ultimo = getUltimoContexto();
  clearContexto();
  if (ultimo && ultimo.tipo === TIPO_CONTEXTO.EMPLEADO && ultimo.comercioId === comercioId) {
    olvidarUltimoContexto();
  }
  guardarToastPendiente(`Dejaste de trabajar en ${comercioNombre || 'el comercio'}`);
  redirectTo(RUTA_SELECTOR_CONTEXTO);
}

function consultarAcceso(comercioId) {
  if (!Number.isInteger(comercioId)) {
    return Promise.resolve(null);
  }
  const consulta = apiFetch(`/empleados/comercios/${comercioId}/acceso`, { handle5xxGlobally: false, handleRedGlobally: false })
    .catch(() => null);
  const espera = new Promise((resolve) => {
    window.setTimeout(() => resolve(null), ESPERA_MAXIMA_COMERCIOS_MS);
  });
  return Promise.race([consulta, espera]);
}

function textosDeAccesoPerdido(acceso, nombre) {
  if (acceso && acceso.estado === 'INACTIVO' && acceso.motivoBaja === MOTIVO_BAJA_DUENO) {
    return {
      causa: MOTIVO_BAJA_DUENO,
      icono: ICONO_PERSONA_BAJA,
      iconoPeligro: true,
      titulo: 'Ya no tenés acceso a este comercio',
      texto: `${nombre || 'El comercio'} te dio de baja del equipo. Si creés que fue un error, comunicate con el dueño.`,
    };
  }
  if (acceso && acceso.estado === 'INACTIVO' && acceso.motivoBaja === MOTIVO_RENUNCIA) {
    return {
      causa: MOTIVO_RENUNCIA,
      icono: ICONO_PERSONA_SALIDA,
      iconoPeligro: false,
      titulo: 'Dejaste de trabajar en este comercio',
      texto: `Ya no sos parte del equipo de ${nombre || 'este comercio'}. Si querés volver, el dueño te tiene que invitar de nuevo.`,
    };
  }
  if (acceso && acceso.estado === 'ACTIVO' && acceso.comercioAccesible === false) {
    return {
      causa: CODIGO_COMERCIO_NO_DISPONIBLE,
      icono: ICONO_COMERCIO_NO_DISPONIBLE,
      iconoPeligro: false,
      titulo: 'Este comercio no está disponible',
      texto: `${nombre || 'Este comercio'} no está disponible en este momento. Intentá más tarde o comunicate con el dueño.`,
    };
  }
  return {
    causa: 'SIN_CAUSA',
    icono: ICONO_ACCESO_PERDIDO,
    iconoPeligro: false,
    titulo: 'Ya no tenés acceso a este comercio',
    texto: 'Ya no tenés acceso a este comercio.',
  };
}

function mostrarAvisoAccesoPerdido({ nombre, acceso }) {
  if (document.getElementById('aviso-acceso-perdido')) {
    return;
  }
  const textos = textosDeAccesoPerdido(acceso, nombre);
  const overflowPrevio = document.body.style.overflow;
  const backdrop = document.createElement('div');
  backdrop.id = 'aviso-acceso-perdido';
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-testid', 'aviso-acceso-perdido');
  backdrop.setAttribute('data-causa', textos.causa);
  const hoja = document.createElement('div');
  hoja.className = 'modal-sheet';
  hoja.setAttribute('role', 'dialog');
  hoja.setAttribute('aria-modal', 'true');
  hoja.setAttribute('aria-labelledby', 'aviso-acceso-perdido-titulo');

  const icono = document.createElement('div');
  icono.className = textos.iconoPeligro ? 'modal-sheet__icon modal-sheet__icon--danger' : 'modal-sheet__icon';
  icono.setAttribute('data-testid', 'icono-acceso-perdido');
  icono.innerHTML = textos.icono;
  hoja.appendChild(icono);

  const titulo = document.createElement('h2');
  titulo.id = 'aviso-acceso-perdido-titulo';
  titulo.className = 'modal-sheet__title';
  titulo.setAttribute('data-testid', 'titulo-acceso-perdido');
  titulo.textContent = textos.titulo;
  hoja.appendChild(titulo);

  const texto = document.createElement('p');
  texto.className = 'modal-sheet__text';
  const primera = document.createElement('span');
  primera.style.display = 'block';
  primera.setAttribute('data-testid', 'texto-acceso-perdido-1');
  primera.textContent = textos.texto;
  const segunda = document.createElement('span');
  segunda.style.display = 'block';
  segunda.setAttribute('data-testid', 'texto-acceso-perdido-2');
  segunda.textContent = TEXTO_ELEGIR_CUENTA;
  texto.append(primera, segunda);
  hoja.appendChild(texto);

  const entendido = document.createElement('button');
  entendido.type = 'button';
  entendido.className = 'btn btn-primary';
  entendido.setAttribute('data-testid', 'btn-entendido-acceso-perdido');
  entendido.textContent = 'Entendido';
  hoja.appendChild(entendido);

  backdrop.appendChild(hoja);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  entendido.focus();

  let continuado = false;
  function continuar() {
    if (continuado) {
      return;
    }
    continuado = true;
    document.removeEventListener('keydown', alTeclear);
    document.body.style.overflow = overflowPrevio;
    clearContexto();
    redirectTo(RUTA_SELECTOR_CONTEXTO);
  }
  function alTeclear(evento) {
    if (evento.key === 'Escape') {
      continuar();
    }
  }
  document.addEventListener('keydown', alTeclear);
  entendido.addEventListener('click', continuar);
  backdrop.addEventListener('click', (evento) => {
    if (evento.target === backdrop) {
      continuar();
    }
  });
}

export function perderAccesoAlComercio() {
  if (accesoPerdido) {
    return;
  }
  accesoPerdido = true;
  const contexto = getContextoGuardado();
  const ultimo = getUltimoContexto();
  const nombre = contexto ? contexto.comercioNombre : null;
  const comercioId = contexto ? contexto.comercioId : null;
  clearContexto();
  if (contexto && ultimo && ultimo.tipo === TIPO_CONTEXTO.EMPLEADO && ultimo.comercioId === contexto.comercioId) {
    olvidarUltimoContexto();
  }
  consultarAcceso(comercioId).then((acceso) => mostrarAvisoAccesoPerdido({ nombre, acceso }));
}

export async function apiFetch(path, { method = 'GET', body, auth = true, handle401Globally = true, handle5xxGlobally = true, comercioId, sinComercio = false, conMensaje = false, handleRedGlobally = true, comoBlob = false, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const esFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = esFormData ? {} : { 'Content-Type': 'application/json' };
  const token = getToken();
  const hadToken = Boolean(auth && token);
  if (accesoPerdido && hadToken && RUTAS_DE_COMERCIO.test(path)) {
    throw new ApiError(0, 'Acceso perdido', null);
  }
  if (hadToken) {
    headers.Authorization = `Bearer ${token}`;
    const comercio = comercioParaLaRequest(path, comercioId, sinComercio);
    if (comercio !== null) {
      headers[HEADER_COMERCIO_ID] = String(comercio);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : (esFormData ? body : JSON.stringify(body)),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (!handleRedGlobally) {
      throw new ApiError(0, 'Sin conexión', null);
    }
    if (error.name === 'AbortError') {
      redirectTo('errores/timeout.html', true);
    } else {
      redirectTo('errores/sin-conexion.html', true);
    }
    throw error;
  }
  clearTimeout(timeoutId);

  if (comoBlob && response.ok) {
    return response.blob();
  }

  const parsed = await parseBody(response);

  if (response.status >= 500 && handle5xxGlobally) {
    redirectTo('errores/500.html', true);
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  if (
    hadToken
    && (response.status === 401 || response.status === 409)
    && parsed.data
    && parsed.data.codigo === CODIGO_CUENTA_SUSPENDIDA
  ) {
    clearSesion();
    mostrarPantallaCuentaSuspendida({ motivo: parsed.data.motivo, alCerrarSesion: () => redirectTo('login.html') });
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  if (response.status === 401 && hadToken && handle401Globally) {
    clearSesion();
    showSesionCerradaModal();
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  if (
    response.status === 404
    && headers[HEADER_COMERCIO_ID]
    && esContextoEmpleado()
    && parsed.data
    && parsed.data.codigo === CODIGO_COMERCIO_NO_DISPONIBLE
  ) {
    perderAccesoAlComercio();
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  if (response.status === 403 && hadToken) {
    redirectTo('errores/acceso-denegado.html');
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  if (!response.ok) {
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  return conMensaje ? { mensaje: parsed.mensaje, data: parsed.data } : parsed.data;
}
