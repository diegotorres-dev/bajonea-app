import { apiFetch, getUsuario } from './api.js';
import { renderTopBar, showToast } from './catalogo.js';
import { prepararPaginaComercio } from './selector-comercio.js';
import { refrescarComercios } from './comercio-activo.js';
import { RUTA_SELECTOR_CONTEXTO, resolverContextoDeLaPestania } from './contexto.js';

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
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${partes}, ${hora}`;
}

function renderEmptyState(container, enComercio) {
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
  p.textContent = enComercio
    ? 'Te vamos a avisar acá cuando haya novedades en este comercio.'
    : 'Te vamos a avisar acá cuando haya novedades sobre tus pedidos.';
  wrapper.appendChild(p);
  container.appendChild(wrapper);
}

function renderNotificacion(notificacion, enComercio) {
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
  let textoEnlace = 'Ver pedido';
  let testidEnlace = `btn-ver-pedido-notificacion-${notificacion.id}`;
  const destinoDeTipo = enComercio ? DESTINO_POR_TIPO[notificacion.tipo] : null;
  if (notificacion.entidadTipo === 'PEDIDO') {
    href = enComercio
      ? `comercio-pedido-detalle.html?id=${notificacion.entidadId}`
      : `pedido-detalle.html?id=${notificacion.entidadId}`;
  } else if (destinoDeTipo) {
    href = destinoDeTipo.href;
    textoEnlace = destinoDeTipo.texto;
    testidEnlace = `btn-ver-destino-notificacion-${notificacion.id}`;
  }
  if (href) {
    const enlace = document.createElement('a');
    enlace.className = 'link notification-item__ver-pedido';
    enlace.href = href;
    enlace.setAttribute('data-testid', testidEnlace);
    enlace.textContent = textoEnlace;
    enlace.style.display = 'inline-block';
    enlace.style.marginTop = '6px';
    enlace.addEventListener('click', async (event) => {
      event.preventDefault();
      await marcarLeida();
      window.location.href = href;
    });
    body.appendChild(enlace);
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

const DESTINO_POR_TIPO = {
  DOCUMENTO_APROBADO: { href: 'comercio-documentacion.html', texto: 'Ver documentación' },
  DOCUMENTO_RECHAZADO: { href: 'comercio-documentacion.html', texto: 'Ver documentación' },
  COMERCIO_APTO_VENTA: { href: 'comercio-dashboard.html', texto: 'Ir al panel' },
  COMERCIO_SIN_APTITUD: { href: 'comercio-dashboard.html', texto: 'Ver qué falta' },
};

function crearAccionMarcarTodas(alMarcar) {
  const boton = crear('button', 'top-bar__accion-texto');
  boton.type = 'button';
  boton.textContent = 'Marcar todas';
  boton.disabled = true;
  boton.setAttribute('data-testid', 'btn-marcar-todas-leidas');
  boton.addEventListener('click', alMarcar);
  return boton;
}

export async function initNotificaciones() {
  const usuario = getUsuario();
  if (!usuario || (usuario.rol !== 'CLIENTE' && usuario.rol !== 'DUENO')) {
    window.location.href = 'login.html';
    return;
  }
  let enComercio = usuario.rol === 'DUENO';
  if (usuario.rol === 'CLIENTE') {
    const contexto = await resolverContextoDeLaPestania();
    if (!contexto) {
      window.location.href = RUTA_SELECTOR_CONTEXTO;
      return;
    }
    enComercio = contexto.tipo === 'EMPLEADO';
  }

  let botonMarcarTodas = null;
  let marcando = false;
  let haySinLeer = false;
  let cargarLista = async () => {};

  async function marcarTodas() {
    if (marcando) {
      return;
    }
    marcando = true;
    botonMarcarTodas.disabled = true;
    try {
      await apiFetch('/notificaciones/leidas', { method: 'PUT' });
      showToast('Marcaste todos los avisos como leídos');
      await Promise.allSettled([refrescarComercios(), cargarLista()]);
    } catch {
      showToast('No pudimos marcar las notificaciones como leídas', 'error');
    } finally {
      marcando = false;
      botonMarcarTodas.disabled = !haySinLeer;
    }
  }

  if (enComercio) {
    botonMarcarTodas = crearAccionMarcarTodas(marcarTodas);
  }
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Notificaciones', accion: botonMarcarTodas });

  if (enComercio && !(await prepararPaginaComercio())) {
    return;
  }

  const container = document.getElementById('notif-content');
  let ultimaFirma = '';

  function pintar(notificaciones) {
    haySinLeer = notificaciones.some((notificacion) => !notificacion.leida);
    if (botonMarcarTodas) {
      botonMarcarTodas.disabled = marcando || !haySinLeer;
    }
    if (!notificaciones || notificaciones.length === 0) {
      renderEmptyState(container, enComercio);
      return;
    }
    const list = crear('div', 'notification-list');
    notificaciones.forEach((notificacion) => {
      list.appendChild(renderNotificacion(notificacion, enComercio));
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
  cargarLista = cargar;

  await cargar();

  const intervalId = window.setInterval(() => {
    cargar().catch(() => {});
  }, POLLING_INTERVAL_MS);

  window.addEventListener('beforeunload', () => window.clearInterval(intervalId));
}
