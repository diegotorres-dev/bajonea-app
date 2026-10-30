import { esContextoDueno } from './api.js';
import { getComerciosEnMemoria, getComercioActivoEnMemoria, suscribirComercios } from './comercio-activo.js';
import { fechaCortaDe, horaConDiaDe, horaMinutoDe } from './fechas.js';
import { h } from './form-utils.js';

export const TEXTO_COMERCIO_SUSPENDIDO = 'El comercio está suspendido';

const ESTADOS_CON_LIMITE = ['EN_PREPARACION', 'LISTO_PARA_RETIRAR'];
const ESTADOS_EN_CURSO = ['PENDIENTE_CONFIRMACION_COMERCIO', 'EN_PREPARACION', 'LISTO_PARA_RETIRAR', 'EN_CAMINO'];

export function comercioActivoSuspendido() {
  const activo = getComercioActivoEnMemoria();
  return Boolean(activo) && activo.estado === 'SUSPENDIDO';
}

function parrafo(clase, testid, texto) {
  const nodo = h('p', { class: clase, 'data-testid': testid });
  nodo.textContent = texto;
  return nodo;
}

function textoDesde(activo) {
  if (!activo.suspendidoDesde) {
    return '';
  }
  return `Desde el ${fechaCortaDe(activo.suspendidoDesde)} a las ${horaMinutoDe(activo.suspendidoDesde)}`;
}

export function pintarTarjetaSuspension(slot) {
  const activo = getComercioActivoEnMemoria();
  if (!activo || activo.estado !== 'SUSPENDIDO') {
    slot.replaceChildren();
    return false;
  }
  const dueno = esContextoDueno();
  const tarjeta = h('div', { class: 'suspension-tarjeta', role: 'status', 'data-testid': 'tarjeta-comercio-suspendido' });
  const encabezado = h('div', { class: 'suspension-tarjeta__encabezado' });
  encabezado.append(h('span', { class: 'suspension-tarjeta__punto', 'aria-hidden': 'true' }));
  const titulo = h('p', { class: 'suspension-tarjeta__titulo', 'data-testid': 'titulo-comercio-suspendido' });
  titulo.textContent = dueno ? 'Comercio suspendido' : 'Este comercio está suspendido';
  encabezado.append(titulo);
  tarjeta.append(encabezado);
  const desde = textoDesde(activo);
  if (dueno && desde) {
    tarjeta.append(parrafo('suspension-tarjeta__linea', 'desde-comercio-suspendido', desde));
  }
  if (dueno && activo.motivoSuspension) {
    tarjeta.append(parrafo('suspension-tarjeta__linea suspension-tarjeta__motivo', 'motivo-comercio-suspendido', `Motivo: ${activo.motivoSuspension}`));
  }
  tarjeta.append(parrafo(
    'suspension-tarjeta__ayuda',
    'ayuda-comercio-suspendido',
    dueno
      ? 'No recibe pedidos nuevos y no podés editarlo. Podés resolver los pedidos en curso, subir documentos y vincular Mercado Pago.'
      : 'No recibe pedidos nuevos. Podés resolver los pedidos en curso.',
  ));
  slot.replaceChildren(tarjeta);
  return true;
}

export function algunComercioSuspendido() {
  return (getComerciosEnMemoria() || []).some((comercio) => comercio.estado === 'SUSPENDIDO');
}

export function protegerPorSuspension(elemento, { conTexto = true, cuando = comercioActivoSuspendido, texto = TEXTO_COMERCIO_SUSPENDIDO } = {}) {
  if (!elemento) {
    return;
  }
  function aplicar() {
    const suspendido = cuando();
    const previo = elemento.dataset.bloqueoSuspension;
    if (suspendido) {
      if (!previo) {
        elemento.dataset.bloqueoSuspension = elemento.disabled ? 'ya' : 'si';
      }
      elemento.disabled = true;
      elemento.setAttribute('aria-disabled', 'true');
      if (conTexto && !elemento.nextElementSibling?.matches('[data-bloqueo-suspension-texto]')) {
        const aviso = parrafo('bloqueo-suspension__texto', `bloqueo-suspension-${elemento.id || elemento.dataset.testid || 'control'}`, texto);
        aviso.setAttribute('data-bloqueo-suspension-texto', '');
        elemento.insertAdjacentElement('afterend', aviso);
      }
      return;
    }
    if (previo) {
      if (previo === 'si') {
        elemento.disabled = false;
      }
      elemento.removeAttribute('aria-disabled');
      delete elemento.dataset.bloqueoSuspension;
      if (elemento.nextElementSibling?.matches('[data-bloqueo-suspension-texto]')) {
        elemento.nextElementSibling.remove();
      }
    }
  }
  aplicar();
  suscribirComercios(aplicar);
}

export function limiteMasProximo(pedidos) {
  let elegido = null;
  (pedidos || []).forEach((pedido) => {
    if (!pedido.limiteResolucionSuspension || !ESTADOS_CON_LIMITE.includes(pedido.estado)) {
      return;
    }
    if (elegido === null || String(pedido.limiteResolucionSuspension) < String(elegido)) {
      elegido = pedido.limiteResolucionSuspension;
    }
  });
  return elegido;
}

export function pintarFranjaPedidos(slot, pedidos) {
  if (!comercioActivoSuspendido()) {
    slot.replaceChildren();
    return false;
  }
  const limite = limiteMasProximo(pedidos);
  const hayEnCurso = (pedidos || []).some((pedido) => ESTADOS_EN_CURSO.includes(pedido.estado));
  let texto = 'Comercio suspendido. No tenés pedidos en curso.';
  if (limite) {
    texto = `Comercio suspendido. Tenés hasta las ${horaConDiaDe(limite)} para resolver los pedidos en curso.`;
  } else if (hayEnCurso) {
    texto = 'Comercio suspendido. Resolvé los pedidos en curso.';
  }
  const franja = h('div', { class: 'banner banner-warning suspension-franja', role: 'status', 'data-testid': 'franja-pedidos-suspendido' });
  const contenido = h('div', { 'data-testid': 'franja-pedidos-suspendido-texto' });
  contenido.textContent = texto;
  franja.append(contenido);
  slot.replaceChildren(franja);
  return true;
}

export function textoDePedidoSuspendido(pedido) {
  if (!comercioActivoSuspendido()) {
    return null;
  }
  const hasta = pedido.limiteResolucionSuspension ? ` antes de las ${horaConDiaDe(pedido.limiteResolucionSuspension)}` : '';
  switch (pedido.estado) {
    case 'PENDIENTE_CONFIRMACION_COMERCIO':
      return 'Solo podés rechazarlo.';
    case 'EN_PREPARACION':
      return `Despachalo o anulalo${hasta}.`;
    case 'LISTO_PARA_RETIRAR':
      return `Entregalo o marcalo como no retirado${hasta}.`;
    case 'EN_CAMINO':
      return 'Sigue su curso.';
    default:
      return null;
  }
}
