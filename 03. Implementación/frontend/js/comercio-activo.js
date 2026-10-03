import {
  apiFetch,
  getUsuario,
  getComercioActivoId,
  setComercioActivoId,
  clearComercioActivoId,
  getUltimoComercioId,
} from './api.js';

export const RUTA_DASHBOARD = 'comercio-dashboard.html';
export const RUTA_LOGIN = 'login.html';
export const INTERVALO_POLLING_COMERCIOS_MS = 15000;

const ORDEN_SIN_OPERATIVO = ['RECHAZADO', 'PENDIENTE', 'RECHAZO_DEFINITIVO'];

export const RUTA_POR_ESTADO = {
  PENDIENTE: 'comercio-pendiente.html',
  RECHAZADO: 'comercio-rechazado.html',
  RECHAZO_DEFINITIVO: 'comercio-rechazo-definitivo.html',
};

const oyentes = new Set();
let comerciosEnMemoria = null;
let resolucionEnCurso = null;
let intervaloPolling = null;

function avisarOyentes() {
  oyentes.forEach((oyente) => {
    try {
      oyente(comerciosEnMemoria);
    } catch {
    }
  });
}

export function rutaDeEstado(comercio) {
  const ruta = RUTA_POR_ESTADO[comercio.estado];
  return ruta ? `${ruta}?id=${comercio.id}` : null;
}

export function getComerciosEnMemoria() {
  return comerciosEnMemoria;
}

export function getComercioActivoEnMemoria() {
  const activoId = getComercioActivoId();
  if (!comerciosEnMemoria || activoId === null) {
    return null;
  }
  return comerciosEnMemoria.find((comercio) => comercio.id === activoId) || null;
}

export function suscribirComercios(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export async function refrescarComercios() {
  const comercios = await apiFetch('/comercios/mis-comercios');
  comerciosEnMemoria = [...comercios].sort(
    (a, b) => String(a.fechaRegistro).localeCompare(String(b.fechaRegistro)) || a.id - b.id,
  );
  avisarOyentes();
  return comerciosEnMemoria;
}

export function elegirDestino(comercios) {
  const operativos = comercios.filter((comercio) => comercio.operativo);
  if (operativos.length > 0) {
    const operativoConId = (id) => (id === null ? undefined : operativos.find((comercio) => comercio.id === id));
    const elegido = operativoConId(getComercioActivoId()) || operativoConId(getUltimoComercioId()) || operativos[0];
    return { tipo: 'operativo', comercio: elegido };
  }
  for (const estado of ORDEN_SIN_OPERATIVO) {
    const comercio = comercios.find((candidato) => candidato.estado === estado);
    if (comercio) {
      return { tipo: 'estado', comercio, ruta: rutaDeEstado(comercio) };
    }
  }
  return { tipo: 'ninguno' };
}

export function resolverComercioActivo() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    return Promise.resolve({ tipo: 'ninguno' });
  }
  if (!resolucionEnCurso) {
    resolucionEnCurso = refrescarComercios()
      .then((comercios) => {
        if (comercios.length === 0) {
          return { tipo: 'sin-comercios' };
        }
        const destino = elegirDestino(comercios);
        if (destino.tipo === 'operativo') {
          setComercioActivoId(destino.comercio.id);
          avisarOyentes();
        }
        return destino;
      })
      .catch((error) => {
        resolucionEnCurso = null;
        throw error;
      });
  }
  return resolucionEnCurso;
}

export function activarComercio(comercioId) {
  setComercioActivoId(comercioId);
  resolucionEnCurso = null;
}

export function reiniciarResolucion() {
  resolucionEnCurso = null;
  comerciosEnMemoria = null;
  clearComercioActivoId();
}

export function destinoDeNavegacion(destino) {
  if (destino.tipo === 'operativo') {
    return RUTA_DASHBOARD;
  }
  if (destino.tipo === 'estado') {
    return destino.ruta;
  }
  return RUTA_LOGIN;
}

export function marcarNotificacionesDelComercioLeidas(comercioId) {
  return apiFetch(`/notificaciones/comercio/${comercioId}/leidas`, { method: 'PUT' });
}

async function verificarComercioActivo() {
  let comercios;
  try {
    comercios = await refrescarComercios();
  } catch {
    return;
  }
  const activoId = getComercioActivoId();
  if (activoId === null) {
    return;
  }
  const activo = comercios.find((comercio) => comercio.id === activoId);
  if (activo && activo.operativo) {
    return;
  }
  clearComercioActivoId();
  resolucionEnCurso = null;
  const destino = comercios.length === 0 ? { tipo: 'ninguno' } : elegirDestino(comercios);
  if (destino.tipo === 'operativo') {
    setComercioActivoId(destino.comercio.id);
  }
  window.location.href = destinoDeNavegacion(destino);
}

export function iniciarPollingComercios() {
  if (intervaloPolling !== null) {
    return;
  }
  intervaloPolling = window.setInterval(verificarComercioActivo, INTERVALO_POLLING_COMERCIOS_MS);
  window.addEventListener('beforeunload', () => {
    window.clearInterval(intervaloPolling);
    intervaloPolling = null;
  });
}

export function contarNotificacionesNoLeidasActivo() {
  const activo = getComercioActivoEnMemoria();
  return activo ? activo.cantidadNotificacionesNoLeidas : 0;
}

export function contarNotificacionesNoLeidasOtros() {
  const activoId = getComercioActivoId();
  if (!comerciosEnMemoria) {
    return 0;
  }
  return comerciosEnMemoria
    .filter((comercio) => comercio.id !== activoId)
    .reduce((total, comercio) => total + comercio.cantidadNotificacionesNoLeidas, 0);
}
