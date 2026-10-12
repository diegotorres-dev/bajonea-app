import {
  apiFetch,
  getContextoGuardado,
  getUltimoContexto,
  getUsuario,
  olvidarUltimoContexto,
  setContexto,
  TIPO_CONTEXTO,
} from './api.js';

export const RUTA_LOGIN = 'login.html';
export const RUTA_SELECTOR_CONTEXTO = 'seleccionar-contexto.html';
export const RUTA_INICIO_CLIENTE = 'index.html';
export const RUTA_INICIO_COMERCIO = 'comercio-dashboard.html';

let resolucionContexto = null;

export function consultarComerciosDelEmpleado() {
  return apiFetch('/empleados/mis-comercios', { handle5xxGlobally: false, handleRedGlobally: false });
}

export function rutaInicioDeContexto(tipo) {
  return tipo === TIPO_CONTEXTO.EMPLEADO || tipo === TIPO_CONTEXTO.DUENO ? RUTA_INICIO_COMERCIO : RUTA_INICIO_CLIENTE;
}

export function entrarEnContexto(tipo, comercioId = null) {
  setContexto(tipo, comercioId);
  window.location.href = rutaInicioDeContexto(tipo);
}

async function restaurarUltimoContexto() {
  const ultimo = getUltimoContexto();
  if (!ultimo || ultimo.tipo !== TIPO_CONTEXTO.EMPLEADO) {
    setContexto(TIPO_CONTEXTO.CLIENTE, null, false);
    return getContextoGuardado();
  }
  let comercios;
  try {
    comercios = await consultarComerciosDelEmpleado();
  } catch {
    setContexto(TIPO_CONTEXTO.CLIENTE, null, false);
    return getContextoGuardado();
  }
  if (comercios.some((comercio) => comercio.id === ultimo.comercioId)) {
    setContexto(TIPO_CONTEXTO.EMPLEADO, ultimo.comercioId);
    return getContextoGuardado();
  }
  olvidarUltimoContexto();
  if (comercios.length > 0) {
    return null;
  }
  setContexto(TIPO_CONTEXTO.CLIENTE, null, false);
  return getContextoGuardado();
}

export function resolverContextoDeLaPestania() {
  if (!resolucionContexto) {
    const guardado = getContextoGuardado();
    resolucionContexto = guardado ? Promise.resolve(guardado) : restaurarUltimoContexto();
  }
  return resolucionContexto;
}

export async function exigirContextoCliente() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    return true;
  }
  const contexto = await resolverContextoDeLaPestania();
  if (!contexto) {
    window.location.href = RUTA_SELECTOR_CONTEXTO;
    return false;
  }
  if (contexto.tipo === TIPO_CONTEXTO.EMPLEADO) {
    window.location.href = RUTA_INICIO_COMERCIO;
    return false;
  }
  return true;
}

export async function exigirContextoComercio() {
  const usuario = getUsuario();
  if (!usuario) {
    window.location.href = RUTA_LOGIN;
    return null;
  }
  if (usuario.rol === 'DUENO') {
    return TIPO_CONTEXTO.DUENO;
  }
  if (usuario.rol !== 'CLIENTE') {
    window.location.href = RUTA_LOGIN;
    return null;
  }
  const contexto = await resolverContextoDeLaPestania();
  if (!contexto) {
    window.location.href = RUTA_SELECTOR_CONTEXTO;
    return null;
  }
  if (contexto.tipo !== TIPO_CONTEXTO.EMPLEADO) {
    window.location.href = RUTA_LOGIN;
    return null;
  }
  return TIPO_CONTEXTO.EMPLEADO;
}

export async function exigirDueno() {
  const usuario = getUsuario();
  if (usuario && usuario.rol === 'DUENO') {
    return true;
  }
  const tipo = await exigirContextoComercio();
  if (tipo === TIPO_CONTEXTO.EMPLEADO) {
    window.location.href = RUTA_INICIO_COMERCIO;
  }
  return false;
}
