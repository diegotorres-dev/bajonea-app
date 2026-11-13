import { apiFetch, getUsuario } from './api.js';
import { renderTopBar, showToast } from './catalogo.js';
import { prepararPaginaComercio } from './selector-comercio.js';
import { montarBarraLateralCompartida } from './comercio-escritorio.js';
import { getComerciosEnMemoria, refrescarComercios } from './comercio-activo.js';
import { ROL_AVISO, destinoDeAviso } from './destino-aviso.js';
import { mostrarEsqueleto, mostrarErrorDeCarga } from './esqueletos.js';
import { RUTA_SELECTOR_CONTEXTO, resolverContextoDeLaPestania } from './contexto.js';
import { montarBarraClienteEnEscritorio, refrescarAvisosCliente } from './cliente-escritorio.js';

const POLLING_INTERVAL_MS = 15000;
const TOPE_MARCA_ANTES_DE_NAVEGAR_MS = 1500;
const HEADER_SIGUIENTE_CURSOR = 'X-Siguiente-Cursor';

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
  container.replaceChildren(wrapper);
}

function crearChevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('notification-item__chevron');
  const trazo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  trazo.setAttribute('d', 'M9 6l6 6-6 6');
  svg.appendChild(trazo);
  return svg;
}

function esperarConTope(promesa, tope) {
  return Promise.race([
    promesa.catch(() => {}),
    new Promise((resolver) => window.setTimeout(resolver, tope)),
  ]);
}

function marcaDeTiempo(notificacion) {
  return new Date(notificacion.fechaCreacion).getTime();
}

function esMasVieja(a, b) {
  const tiempoA = marcaDeTiempo(a);
  const tiempoB = marcaDeTiempo(b);
  if (tiempoA !== tiempoB) {
    return tiempoA < tiempoB;
  }
  return a.id < b.id;
}

function renderNotificacion(notificacion, rol) {
  const destino = destinoDeAviso(notificacion, rol, getComerciosEnMemoria());
  const enlace = Boolean(destino);
  const accionable = enlace || !notificacion.leida;
  const clase = `notification-item${notificacion.leida ? ' notification-item--leida' : ''}`;
  const item = crear(enlace ? 'a' : (accionable ? 'button' : 'div'), clase);
  item.dataset.id = String(notificacion.id);
  item.setAttribute('data-testid', `notificacion-item-${notificacion.id}`);
  if (enlace) {
    item.href = destino.href;
  } else if (accionable) {
    item.type = 'button';
  }

  const dot = crear('span', 'notification-item__dot');
  dot.setAttribute('aria-hidden', 'true');
  item.appendChild(dot);

  const body = crear('span', 'notification-item__body');
  const estado = crear('span', 'sr-only');
  estado.textContent = notificacion.leida ? '' : 'No leída. ';
  estado.setAttribute('data-testid', `notificacion-estado-${notificacion.id}`);
  body.appendChild(estado);
  const texto = crear('span', 'notification-item__texto');
  texto.textContent = notificacion.mensaje;
  body.appendChild(texto);
  const fecha = crear('span', 'notification-item__fecha');
  fecha.textContent = formatearFecha(notificacion.fechaCreacion);
  body.appendChild(fecha);
  if (enlace) {
    const etiqueta = crear('span', 'notification-item__destino');
    etiqueta.textContent = destino.texto;
    etiqueta.setAttribute(
      'data-testid',
      notificacion.entidadTipo === 'PEDIDO'
        ? `btn-ver-pedido-notificacion-${notificacion.id}`
        : `btn-ver-destino-notificacion-${notificacion.id}`,
    );
    body.appendChild(etiqueta);
  }
  item.appendChild(body);
  const estadoTabla = crear('span', 'notification-item__estado');
  estadoTabla.setAttribute('data-testid', `notificacion-estado-tabla-${notificacion.id}`);
  estadoTabla.textContent = notificacion.leida ? 'Leído' : 'Sin leer';
  item.appendChild(estadoTabla);
  if (enlace) {
    item.appendChild(crearChevron());
  }

  if (!accionable) {
    return item;
  }

  function reemplazarPorElementoSinAccion() {
    const reemplazo = renderNotificacion(notificacion, rol);
    const teniaFoco = document.activeElement === item;
    item.replaceWith(reemplazo);
    if (teniaFoco) {
      reemplazo.tabIndex = -1;
      reemplazo.focus({ preventScroll: true });
    }
  }

  function marcarLeida() {
    if (notificacion.leida) {
      return Promise.resolve();
    }
    return apiFetch(`/notificaciones/${notificacion.id}/leida`, { method: 'PUT', handleRedGlobally: false, handle5xxGlobally: false })
      .then((actualizada) => {
        notificacion.leida = actualizada.leida;
        refrescarAvisosCliente();
        if (enlace) {
          item.classList.add('notification-item--leida');
          estado.textContent = '';
          estadoTabla.textContent = 'Leído';
          return;
        }
        reemplazarPorElementoSinAccion();
      });
  }

  item.addEventListener('click', (evento) => {
    if (!enlace) {
      marcarLeida().catch(() => {});
      return;
    }
    const conModificador = evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey || evento.button !== 0;
    if (conModificador) {
      marcarLeida().catch(() => {});
      return;
    }
    evento.preventDefault();
    esperarConTope(marcarLeida(), TOPE_MARCA_ANTES_DE_NAVEGAR_MS).then(() => {
      window.location.href = destino.href;
    });
  });

  return item;
}

function crearCabeceraTabla() {
  const cabecera = crear('div', 'notification-cabecera');
  cabecera.setAttribute('aria-hidden', 'true');
  ['Aviso', 'Fecha', 'Estado'].forEach((texto) => {
    const celda = document.createElement('span');
    celda.textContent = texto;
    cabecera.appendChild(celda);
  });
  return cabecera;
}

function crearAccionMarcarTodas(alMarcar, { ocultaSinAvisos }) {
  const boton = crear('button', 'top-bar__accion-texto');
  boton.type = 'button';
  boton.textContent = 'Marcar todas';
  boton.disabled = true;
  boton.hidden = ocultaSinAvisos;
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
  let rol = usuario.rol === 'DUENO' ? ROL_AVISO.DUENO : ROL_AVISO.CLIENTE;
  if (usuario.rol === 'CLIENTE') {
    const contexto = await resolverContextoDeLaPestania();
    if (!contexto) {
      window.location.href = RUTA_SELECTOR_CONTEXTO;
      return;
    }
    enComercio = contexto.tipo === 'EMPLEADO';
    rol = enComercio ? ROL_AVISO.EMPLEADO : ROL_AVISO.CLIENTE;
  }

  const estado = { items: [], siguienteCursor: null, cargandoMas: false, errorMas: false };
  let botonMarcarTodas = null;
  let marcando = false;
  let ultimaFirma = null;
  let cargarPrimeraPagina = async () => {};

  async function hayAvisosSinLeer() {
    if (estado.items.some((notificacion) => !notificacion.leida)) {
      return true;
    }
    if (!estado.siguienteCursor) {
      return false;
    }
    try {
      return (await apiFetch('/notificaciones/no-leidas/contador', { segundoPlano: true })) > 0;
    } catch {
      return false;
    }
  }

  async function actualizarBotonMarcarTodas() {
    if (!botonMarcarTodas) {
      return;
    }
    const hay = await hayAvisosSinLeer();
    botonMarcarTodas.disabled = marcando || !hay;
    if (!enComercio) {
      botonMarcarTodas.hidden = !hay;
    }
  }

  async function marcarTodas() {
    if (marcando) {
      return;
    }
    marcando = true;
    botonMarcarTodas.disabled = true;
    try {
      await apiFetch(enComercio ? '/notificaciones/leidas' : '/notificaciones/personales/leidas', { method: 'PUT' });
      estado.items.forEach((notificacion) => {
        notificacion.leida = true;
      });
      showToast('Marcaste todos los avisos como leídos');
      refrescarAvisosCliente();
      pintar();
      await Promise.allSettled([enComercio ? refrescarComercios() : Promise.resolve(), cargarPrimeraPagina()]);
    } catch {
      showToast('No pudimos marcar las notificaciones como leídas', 'error');
    } finally {
      marcando = false;
      await actualizarBotonMarcarTodas();
    }
  }

  botonMarcarTodas = crearAccionMarcarTodas(marcarTodas, { ocultaSinAvisos: !enComercio });
  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, primerNivel: true, titulo: 'Notificaciones', accion: botonMarcarTodas, destinoVolver: enComercio ? 'comercio-dashboard.html' : 'index.html' });
  if (!enComercio) {
    montarBarraClienteEnEscritorio({ activo: 'avisos' });
  }

  if (enComercio) {
    await montarBarraLateralCompartida('panel', 'avisos');
  }
  if (enComercio && !(await prepararPaginaComercio())) {
    return;
  }

  const container = document.getElementById('notif-content');

  function firmaActual() {
    return JSON.stringify([
      estado.items.map((notificacion) => `${notificacion.id}:${notificacion.leida}`),
      estado.siguienteCursor,
      estado.cargandoMas,
      estado.errorMas,
    ]);
  }

  function crearPie() {
    if (estado.errorMas) {
      const pie = crear('div', 'notification-mas');
      const banner = crear('div', 'banner banner-error');
      banner.setAttribute('role', 'alert');
      banner.setAttribute('data-testid', 'notificaciones-error-mas');
      const mensaje = crear('div');
      mensaje.textContent = 'No pudimos cargar más avisos.';
      banner.appendChild(mensaje);
      pie.appendChild(banner);
      const reintentar = crear('button', 'btn btn-secondary');
      reintentar.type = 'button';
      reintentar.textContent = 'Reintentar';
      reintentar.setAttribute('data-testid', 'btn-reintentar-notificaciones-mas');
      reintentar.addEventListener('click', cargarMas);
      pie.appendChild(reintentar);
      return pie;
    }
    if (!estado.siguienteCursor) {
      return null;
    }
    const pie = crear('div', 'notification-mas');
    const verMas = crear('button', 'btn btn-secondary');
    verMas.type = 'button';
    verMas.textContent = estado.cargandoMas ? 'Cargando…' : 'Ver más';
    verMas.disabled = estado.cargandoMas;
    verMas.setAttribute('aria-busy', String(estado.cargandoMas));
    verMas.setAttribute('data-testid', 'btn-notificaciones-ver-mas');
    verMas.addEventListener('click', cargarMas);
    pie.appendChild(verMas);
    return pie;
  }

  function pintar() {
    ultimaFirma = firmaActual();
    if (estado.items.length === 0) {
      renderEmptyState(container, enComercio);
      actualizarBotonMarcarTodas();
      return;
    }
    const list = crear('div', 'notification-list notification-list--tabla');
    list.appendChild(crearCabeceraTabla());
    estado.items.forEach((notificacion) => {
      list.appendChild(renderNotificacion(notificacion, rol));
    });
    const pie = crearPie();
    container.replaceChildren(...(pie ? [list, pie] : [list]));
    actualizarBotonMarcarTodas();
  }

  function repintarSiCambio() {
    if (firmaActual() !== ultimaFirma) {
      pintar();
    }
  }

  async function pedirPagina(cursor, opciones) {
    const ruta = cursor ? `/notificaciones?cursor=${encodeURIComponent(cursor)}` : '/notificaciones';
    const { data, cabeceras } = await apiFetch(ruta, { ...opciones, conCabeceras: true });
    return { items: data, siguienteCursor: cabeceras.get(HEADER_SIGUIENTE_CURSOR) };
  }

  function fusionarPrimeraPagina(primera) {
    if (!primera.siguienteCursor) {
      estado.items = primera.items;
      estado.siguienteCursor = null;
      return;
    }
    const ultima = primera.items[primera.items.length - 1];
    const idsNuevos = new Set(primera.items.map((notificacion) => notificacion.id));
    const masViejas = estado.items.filter((notificacion) => !idsNuevos.has(notificacion.id) && esMasVieja(notificacion, ultima));
    if (masViejas.length === 0) {
      estado.items = primera.items;
      estado.siguienteCursor = primera.siguienteCursor;
      return;
    }
    estado.items = [...primera.items, ...masViejas];
  }

  async function cargar(opciones) {
    const primera = await pedirPagina(null, opciones);
    fusionarPrimeraPagina(primera);
    repintarSiCambio();
  }
  cargarPrimeraPagina = cargar;

  async function cargarMas() {
    if (estado.cargandoMas || !estado.siguienteCursor) {
      return;
    }
    const antes = estado.items.length;
    estado.cargandoMas = true;
    estado.errorMas = false;
    pintar();
    try {
      const pagina = await pedirPagina(estado.siguienteCursor, { handleRedGlobally: false, handle5xxGlobally: false });
      const conocidos = new Set(estado.items.map((notificacion) => notificacion.id));
      estado.items = [...estado.items, ...pagina.items.filter((notificacion) => !conocidos.has(notificacion.id))];
      estado.siguienteCursor = pagina.siguienteCursor;
      estado.cargandoMas = false;
      pintar();
      const primeraNueva = container.querySelectorAll('.notification-item')[antes];
      if (primeraNueva) {
        primeraNueva.tabIndex = primeraNueva.matches('a, button') ? 0 : -1;
        primeraNueva.focus({ preventScroll: true });
      }
    } catch {
      estado.cargandoMas = false;
      estado.errorMas = true;
      pintar();
      const reintentar = container.querySelector('[data-testid="btn-reintentar-notificaciones-mas"]');
      if (reintentar) {
        reintentar.focus({ preventScroll: true });
      }
    }
  }

  mostrarEsqueleto(container, 'avisos');
  try {
    await cargar();
  } catch {
    mostrarErrorDeCarga(container, 'No pudimos cargar tus avisos.');
    return;
  }

  function paginaVisible() {
    return document.visibilityState !== 'hidden';
  }

  const intervalId = window.setInterval(() => {
    if (!paginaVisible()) {
      return;
    }
    cargar({ segundoPlano: true }).catch(() => {});
  }, POLLING_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (paginaVisible()) {
      cargar({ segundoPlano: true }).catch(() => {});
    }
  });

  window.addEventListener('beforeunload', () => window.clearInterval(intervalId));
}
