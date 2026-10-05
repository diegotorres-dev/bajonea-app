import { apiFetch, ApiError } from './api.js';

export const ESTADO_CON_CIERRE = 'APTO_VENTA';

const MENSAJES_CIERRE_EQUIVALENTE_A_EXITO = ['dentro de tu horario', 'no está operativo'];
const MENSAJES_CONFLICTO_DE_CIERRE = ['Este comercio está cerrado', 'Este comercio no está aceptando'];

export const ETIQUETA_CERRADO = 'Cerrado';
export const ETIQUETA_CERRADO_TEMPORALMENTE = 'Cerrado temporalmente';

export function tieneCierre(comercio) {
  return comercio.estado === ESTADO_CON_CIERRE;
}

export function estaCerrado(comercio) {
  return Boolean(comercio.cerradoManualmente) || !comercio.abiertoAhora;
}

export function mostrarChipCerrado(comercio) {
  return tieneCierre(comercio) && estaCerrado(comercio);
}

export function esCerrable(comercio) {
  return tieneCierre(comercio) && !comercio.cerradoManualmente && Boolean(comercio.abiertoAhora) && Boolean(comercio.puedeCambiarCierre);
}

export function comerciosCerrables(comercios) {
  return (comercios || []).filter(esCerrable);
}

export function modoSwitchCierre(comercio) {
  if (comercio.cerradoManualmente) {
    return 'PAUSADO';
  }
  if (!comercio.abiertoAhora) {
    return 'FUERA_DE_HORARIO';
  }
  return 'ABIERTO';
}

export function estaAbiertoParaClientes(comercio) {
  return comercio.estadoApertura === 'ABIERTO';
}

export function etiquetaCierrePublica(comercio) {
  return comercio.estadoApertura === 'CERRADO_TEMPORALMENTE' ? ETIQUETA_CERRADO_TEMPORALMENTE : ETIQUETA_CERRADO;
}

export function esConflictoDeCierre(error) {
  return error instanceof ApiError
    && error.status === 409
    && MENSAJES_CONFLICTO_DE_CIERRE.some((texto) => String(error.message || '').includes(texto));
}

function llamarCierre(accion, comercioId) {
  return apiFetch(`/comercios/${accion}`, {
    method: 'PUT',
    comercioId,
    handle5xxGlobally: false,
    handleRedGlobally: false,
  });
}

export function cerrarComercio(comercioId) {
  return llamarCierre('cerrar', comercioId);
}

export function abrirComercio(comercioId) {
  return llamarCierre('abrir', comercioId);
}

function equivaleAExito(error) {
  return error instanceof ApiError
    && error.status === 409
    && MENSAJES_CIERRE_EQUIVALENTE_A_EXITO.some((texto) => String(error.message || '').includes(texto));
}

export async function cerrarVariosComercios(comercios) {
  const fallidos = [];
  for (const comercio of comercios) {
    try {
      await cerrarComercio(comercio.id);
    } catch (error) {
      if (!equivaleAExito(error)) {
        fallidos.push(comercio);
      }
    }
  }
  return fallidos;
}

export function crearBannerCierre(mensaje) {
  const banner = document.createElement('div');
  banner.className = 'banner banner-error';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('data-testid', 'banner-cierre-comercio');
  banner.textContent = mensaje;
  return banner;
}

export function crearBotonVolverAlCatalogo() {
  const volver = document.createElement('a');
  volver.className = 'btn btn-primary';
  volver.href = 'index.html';
  volver.setAttribute('data-testid', 'btn-volver-al-catalogo');
  volver.textContent = 'Volver al catálogo';
  return volver;
}

export function crearAvisoCierre(mensaje) {
  const contenedor = document.createElement('div');
  contenedor.className = 'aviso-cierre';
  contenedor.setAttribute('data-testid', 'aviso-cierre-comercio');
  contenedor.append(crearBannerCierre(mensaje), crearBotonVolverAlCatalogo());
  return contenedor;
}
