import { getComercioActivoId } from './api.js';
import { milisegundosHasta } from './fechas.js';

const PREFIJO_CLAVE = 'bajonea_pedidos_vistos_';
const respaldoEnMemoria = new Map();

function claveDelComercio() {
  const comercioId = getComercioActivoId();
  return comercioId === null ? null : `${PREFIJO_CLAVE}${comercioId}`;
}

function leer() {
  const clave = claveDelComercio();
  if (clave === null) {
    return null;
  }
  try {
    const crudo = sessionStorage.getItem(clave);
    if (crudo) {
      const datos = JSON.parse(crudo);
      if (datos && Array.isArray(datos.base) && Array.isArray(datos.vistos)) {
        return datos;
      }
    }
    return null;
  } catch {
    return respaldoEnMemoria.get(clave) || null;
  }
}

function escribir(datos) {
  const clave = claveDelComercio();
  if (clave === null) {
    return;
  }
  respaldoEnMemoria.set(clave, datos);
  try {
    sessionStorage.setItem(clave, JSON.stringify(datos));
  } catch {
    return;
  }
}

export function registrarLineaBase(pedidos) {
  if (leer() !== null) {
    return;
  }
  escribir({ base: pedidos.map((pedido) => pedido.id), vistos: [] });
}

export function esPedidoNuevo(pedido) {
  const datos = leer();
  if (datos === null) {
    return false;
  }
  return !datos.base.includes(pedido.id) && !datos.vistos.includes(pedido.id);
}

export function marcarPedidoVisto(pedidoId) {
  const datos = leer();
  if (datos === null || datos.vistos.includes(pedidoId)) {
    return;
  }
  datos.vistos.push(pedidoId);
  escribir(datos);
}

function minutosEntre(desde, hasta) {
  const diferencia = Date.parse(hasta) - Date.parse(desde);
  return Number.isFinite(diferencia) ? Math.round(diferencia / 60000) : null;
}

export function textoVencimientoPedido(pedido, { nuevo = false, ahora = Date.now() } = {}) {
  if (pedido.estado !== 'PENDIENTE_CONFIRMACION_COMERCIO' || !pedido.limiteRespuestaComercio) {
    return null;
  }
  if (nuevo) {
    const plazo = minutosEntre(pedido.fechaPagoAprobado, pedido.limiteRespuestaComercio);
    if (plazo !== null && plazo > 0) {
      return `Respondé antes de ${plazo} minutos`;
    }
  }
  const restante = milisegundosHasta(pedido.limiteRespuestaComercio, ahora);
  if (restante === null) {
    return null;
  }
  const minutos = Math.ceil(restante / 60000);
  if (minutos <= 0) {
    return 'Está por vencer';
  }
  return `Vence en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
}
