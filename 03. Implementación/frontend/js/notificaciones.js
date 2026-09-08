import { apiFetch, getUsuario } from './api.js';
import { renderTopBar } from './catalogo.js';

const POLLING_INTERVAL_MS = 15000;

const ICONS = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
};

function crear(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatearFecha(fechaIso) {
  const fecha = new Date(fechaIso);
  const partes = fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${partes}, ${hora}`;
}

function renderEmptyState(container) {
  container.innerHTML = '';
  const wrapper = crear('div', 'state-page');
  wrapper.setAttribute('data-testid', 'estado-vacio');
  const icon = crear('div', 'state-page__icon');
  icon.innerHTML = ICONS.bell;
  wrapper.appendChild(icon);
  const h1 = document.createElement('h1');
  h1.className = 'state-page__title';
  h1.textContent = 'Todavía no tenés notificaciones';
  wrapper.appendChild(h1);
  const p = document.createElement('p');
  p.className = 'state-page__text';
  p.textContent = 'Te vamos a avisar acá cuando haya novedades sobre tus pedidos.';
  wrapper.appendChild(p);
  container.appendChild(wrapper);
}

function renderNotificacion(notificacion, rol) {
  const item = crear('div', `notification-item${notificacion.leida ? ' notification-item--leida' : ''}`);
  item.dataset.id = String(notificacion.id);
  item.setAttribute('data-testid', `notificacion-item-${notificacion.id}`);

  const dot = crear('span', 'notification-item__dot');
  item.appendChild(dot);

  async function marcarLeida() {
    if (notificacion.leida) {
      return;
    }
    try {
      const actualizada = await apiFetch(`/notificaciones/${notificacion.id}/leida`, { method: 'PUT' });
      notificacion.leida = actualizada.leida;
      item.classList.add('notification-item--leida');
    } catch {
    }
  }

  const body = crear('div', 'notification-item__body');
  const texto = crear('p', 'notification-item__texto');
  texto.textContent = notificacion.mensaje;
  body.appendChild(texto);
  const fecha = crear('p', 'notification-item__fecha');
  fecha.textContent = formatearFecha(notificacion.fechaCreacion);
  body.appendChild(fecha);

  let href = null;
  if (notificacion.entidadTipo === 'PEDIDO') {
    href = rol === 'DUENO'
      ? `comercio-pedido-detalle.html?id=${notificacion.entidadId}`
      : `pedido-detalle.html?id=${notificacion.entidadId}`;
    const verPedido = document.createElement('a');
    verPedido.className = 'link notification-item__ver-pedido';
    verPedido.href = href;
    verPedido.setAttribute('data-testid', `btn-ver-pedido-notificacion-${notificacion.id}`);
    verPedido.textContent = 'Ver pedido';
    verPedido.style.display = 'inline-block';
    verPedido.style.marginTop = '6px';
    verPedido.addEventListener('click', async (event) => {
      event.preventDefault();
      await marcarLeida();
      window.location.href = href;
    });
    body.appendChild(verPedido);
  }

  item.appendChild(body);

  item.addEventListener('click', async (event) => {
    if (event.target.closest('a')) {
      return;
    }
    await marcarLeida();
    if (href) {
      window.location.href = href;
    }
  });

  return item;
}

export async function initNotificaciones() {
  const usuario = getUsuario();
  if (!usuario || (usuario.rol !== 'CLIENTE' && usuario.rol !== 'DUENO')) {
    window.location.href = 'login.html';
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Notificaciones' });

  const container = document.getElementById('notif-content');
  let ultimaFirma = '';

  function pintar(notificaciones) {
    if (!notificaciones || notificaciones.length === 0) {
      renderEmptyState(container);
      return;
    }
    const list = crear('div', 'notification-list');
    notificaciones.forEach((notificacion) => {
      list.appendChild(renderNotificacion(notificacion, usuario.rol));
    });
    container.innerHTML = '';
    container.appendChild(list);
  }

  async function cargar() {
    const notificaciones = await apiFetch('/notificaciones');
    const firma = JSON.stringify(notificaciones.map((n) => `${n.id}:${n.leida}`));
    if (firma !== ultimaFirma) {
      ultimaFirma = firma;
      pintar(notificaciones);
    }
  }

  await cargar();

  const intervalId = window.setInterval(() => {
    cargar().catch(() => {});
  }, POLLING_INTERVAL_MS);

  window.addEventListener('beforeunload', () => window.clearInterval(intervalId));
}
