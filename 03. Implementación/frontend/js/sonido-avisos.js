import { apiFetch } from './api.js';

const CLAVE_PREFERENCIA = 'bajonea_sonido_avisos';
const FRECUENCIA_INICIAL = 880;
const FRECUENCIA_FINAL = 1175;
const DURACION_SEGUNDOS = 0.42;

let contextoAudio = null;
let escuchandoGesto = false;
const oyentes = new Set();
const vigilantes = new Map();

export function sonidoActivado() {
  try {
    return localStorage.getItem(CLAVE_PREFERENCIA) !== '0';
  } catch {
    return true;
  }
}

function avisarCambio() {
  oyentes.forEach((oyente) => {
    try {
      oyente();
    } catch {
      return;
    }
  });
}

export function fijarSonido(activo) {
  try {
    localStorage.setItem(CLAVE_PREFERENCIA, activo ? '1' : '0');
  } catch {
    return;
  } finally {
    avisarCambio();
  }
}

export function suscribirSonido(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

function obtenerContexto() {
  if (contextoAudio) {
    return contextoAudio;
  }
  const Constructor = window.AudioContext || window.webkitAudioContext;
  if (!Constructor) {
    return null;
  }
  try {
    contextoAudio = new Constructor();
    if (typeof contextoAudio.addEventListener === 'function') {
      contextoAudio.addEventListener('statechange', avisarCambio);
    }
  } catch {
    contextoAudio = null;
  }
  return contextoAudio;
}

function desbloquearConGesto() {
  const contexto = obtenerContexto();
  if (contexto && contexto.state !== 'running' && typeof contexto.resume === 'function') {
    Promise.resolve(contexto.resume()).then(avisarCambio).catch(() => {});
  }
}

export function prepararAudio() {
  if (escuchandoGesto) {
    return;
  }
  escuchandoGesto = true;
  ['click', 'keydown'].forEach((evento) => {
    document.addEventListener(evento, desbloquearConGesto, { passive: true, capture: true });
  });
}

export function audioBloqueado() {
  const contexto = obtenerContexto();
  return Boolean(contexto) && contexto.state !== 'running';
}

export function activarAudio() {
  const contexto = obtenerContexto();
  if (!contexto || typeof contexto.resume !== 'function') {
    return Promise.resolve();
  }
  return Promise.resolve(contexto.resume()).then(avisarCambio).catch(() => {});
}

export function reproducirDing({ forzar = false } = {}) {
  if (!forzar && !sonidoActivado()) {
    return false;
  }
  const contexto = obtenerContexto();
  if (!contexto) {
    return false;
  }
  if (contexto.state !== 'running' && typeof contexto.resume === 'function') {
    Promise.resolve(contexto.resume()).catch(() => {});
  }
  try {
    const inicio = contexto.currentTime;
    const oscilador = contexto.createOscillator();
    const volumen = contexto.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.setValueAtTime(FRECUENCIA_INICIAL, inicio);
    oscilador.frequency.setValueAtTime(FRECUENCIA_FINAL, inicio + 0.14);
    volumen.gain.setValueAtTime(0.0001, inicio);
    volumen.gain.exponentialRampToValueAtTime(0.25, inicio + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + DURACION_SEGUNDOS);
    oscilador.connect(volumen);
    volumen.connect(contexto.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + DURACION_SEGUNDOS + 0.05);
    return true;
  } catch {
    return false;
  }
}

async function idMasNuevoSinLeer() {
  const avisos = await apiFetch('/notificaciones', { segundoPlano: true });
  return avisos.filter((aviso) => !aviso.leida).reduce((maximo, aviso) => Math.max(maximo, aviso.id), 0);
}

async function procesarContador(estado, noLeidas) {
  if (estado.ocupado) {
    return;
  }
  if (estado.previo === null) {
    estado.ocupado = true;
    try {
      estado.ultimoId = noLeidas > 0 ? await idMasNuevoSinLeer() : 0;
      estado.previo = noLeidas;
    } catch {
      estado.previo = null;
    } finally {
      estado.ocupado = false;
    }
    return;
  }
  if (noLeidas === estado.previo) {
    return;
  }
  if (noLeidas === 0) {
    estado.previo = 0;
    return;
  }
  estado.ocupado = true;
  try {
    const nuevo = await idMasNuevoSinLeer();
    if (nuevo > estado.ultimoId) {
      estado.ultimoId = nuevo;
      reproducirDing();
    }
    estado.previo = noLeidas;
  } catch {
    return;
  } finally {
    estado.ocupado = false;
  }
}

export function vigilarAvisos(clave, noLeidas) {
  prepararAudio();
  let estado = vigilantes.get(clave);
  if (!estado) {
    estado = { previo: null, ultimoId: 0, ocupado: false };
    vigilantes.set(clave, estado);
  }
  procesarContador(estado, noLeidas);
}
