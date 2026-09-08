export const API_BASE_URL = 'https://bajonea-app-production.up.railway.app/api/v1';

const TOKEN_KEY = 'bajonea_token';
const USUARIO_KEY = 'bajonea_usuario';
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

export async function apiFetch(path, { method = 'GET', body, auth = true, handle401Globally = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  const hadToken = Boolean(auth && token);
  if (hadToken) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      redirectTo('errores/timeout.html', true);
    } else {
      redirectTo('errores/sin-conexion.html', true);
    }
    throw error;
  }
  clearTimeout(timeoutId);

  const parsed = await parseBody(response);

  if (response.status >= 500) {
    redirectTo('errores/500.html', true);
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  if (response.status === 401 && hadToken && handle401Globally) {
    clearSesion();
    showSesionCerradaModal();
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  if (response.status === 403 && hadToken) {
    redirectTo('errores/acceso-denegado.html');
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  if (!response.ok) {
    throw new ApiError(response.status, parsed.mensaje, parsed.data);
  }

  return parsed.data;
}
