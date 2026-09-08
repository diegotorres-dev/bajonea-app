import { apiFetch, ApiError, getUsuario, mostrarModalCuentaBloqueada } from './api.js';
import { resolverHomePorRol, LABELS_TIPO_COMERCIO } from './auth.js';
import { normalizarCampos, excedeSubtotalMaximo, mensajeSubtotalMaximoExcedido } from './validators.js';

const DIA_POR_INDICE = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

const ICONS = {
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  storeSwap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
};

export function showToast(mensaje, kind = 'success') {
  document.querySelectorAll('.toast').forEach((el) => el.remove());
  const toast = crear('div', 'toast');
  const banner = crear('div', `banner banner-${kind}`);
  const iconWrap = crear('span');
  iconWrap.innerHTML = ICONS.check;
  banner.appendChild(iconWrap.firstElementChild);
  const text = document.createElement('span');
  text.textContent = mensaje;
  banner.appendChild(text);
  toast.appendChild(banner);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

export function manejarBloqueoPorCambioPassword(error) {
  if (!(error instanceof ApiError) || error.status !== 401) {
    return false;
  }
  const intentosRestantes = error.data && typeof error.data.intentosRestantes === 'number' ? error.data.intentosRestantes : null;
  if (intentosRestantes === 0) {
    mostrarModalCuentaBloqueada();
    return true;
  }
  return false;
}

function crear(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatearPrecio(valor) {
  const entero = Math.round(Number(valor));
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function minutosDesdeMedianoche(horaTexto) {
  const partes = horaTexto.split(':');
  return Number(partes[0]) * 60 + Number(partes[1]);
}

export function estadoHorario(horarios) {
  if (!horarios || horarios.length === 0) {
    return { abierto: false, resumenHoy: 'Sin horario cargado' };
  }
  const ahora = new Date();
  const diaHoy = DIA_POR_INDICE[ahora.getDay()];
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const franjasHoy = horarios.filter((horario) => horario.diaSemana === diaHoy);

  if (franjasHoy.length === 0) {
    return { abierto: false, resumenHoy: 'Cerrado hoy', cerradoTodoElDia: true };
  }

  const abierto = franjasHoy.some((franja) => {
    const inicio = minutosDesdeMedianoche(franja.horaApertura);
    const fin = minutosDesdeMedianoche(franja.horaCierre);
    return minutosAhora >= inicio && minutosAhora < fin;
  });

  const resumenHoy = franjasHoy.map((franja) => `${franja.horaApertura.slice(0, 5)} - ${franja.horaCierre.slice(0, 5)}`).join(' / ');
  return { abierto, resumenHoy };
}

async function cargarBadgeNotificaciones(bellLink) {
  try {
    const contador = await apiFetch('/notificaciones/no-leidas/contador');
    if (contador > 0) {
      const dot = crear('span', 'top-bar__badge-dot');
      dot.setAttribute('data-testid', 'contador-notificaciones');
      dot.textContent = contador > 9 ? '9+' : String(contador);
      bellLink.appendChild(dot);
    }
  } catch {
  }
}

export function renderTopBar(container, { mostrarVolver = false, titulo = null, mostrarPerfil = true, mostrarCampana = true, centrarLogo = false, accion = null } = {}) {
  container.innerHTML = '';
  const bar = crear('header', centrarLogo ? 'top-bar top-bar--logo-centrado' : 'top-bar');

  if (mostrarVolver) {
    const backBtn = crear('button', 'top-bar__action');
    backBtn.type = 'button';
    backBtn.setAttribute('data-testid', 'btn-volver');
    backBtn.innerHTML = ICONS.chevronLeft;
    backBtn.addEventListener('click', () => history.back());
    bar.appendChild(backBtn);

    const titleEl = crear('h1', 'app-header__title');
    titleEl.style.position = 'static';
    titleEl.style.transform = 'none';
    titleEl.style.fontSize = '17px';
    titleEl.textContent = titulo || '';
    bar.appendChild(titleEl);

    if (accion) {
      bar.appendChild(accion);
    } else {
      const spacer = crear('span');
      spacer.style.width = '24px';
      bar.appendChild(spacer);
    }
  } else {
    const brand = crear('div', 'top-bar__brand');
    const brandLogo = document.createElement('img');
    brandLogo.className = 'header-logo';
    brandLogo.src = 'assets/img/bajonea-logo-orange-header.png';
    brandLogo.alt = 'Bajoneá';
    brand.appendChild(brandLogo);
    bar.appendChild(brand);

    const usuario = getUsuario();
    if (usuario) {
      if ((usuario.rol === 'CLIENTE' || usuario.rol === 'DUENO') && mostrarCampana) {
        const bellLink = document.createElement('a');
        bellLink.href = 'notificaciones.html';
        bellLink.setAttribute('data-testid', 'btn-notificaciones');
        bellLink.className = 'top-bar__action top-bar__action--bell';
        bellLink.innerHTML = ICONS.bell;
        bar.appendChild(bellLink);
        cargarBadgeNotificaciones(bellLink);
      }

      if (mostrarPerfil) {
        const link = document.createElement('a');
        link.href = usuario.rol === 'DUENO' ? 'comercio-perfil.html' : 'perfil.html';
        link.setAttribute('data-testid', 'btn-perfil');
        link.className = 'top-bar__action';
        link.innerHTML = ICONS.user;
        bar.appendChild(link);
      }
    } else {
      const link = document.createElement('a');
      link.href = 'login.html';
      link.className = 'top-bar__cta';
      link.setAttribute('data-testid', 'btn-ingresar');
      link.textContent = 'Ingresar';
      bar.appendChild(link);
    }
  }

  container.appendChild(bar);
}

export function crearAccionCarritoHeader() {
  const link = document.createElement('a');
  link.href = 'carrito.html';
  link.className = 'top-bar__action';
  link.id = 'header-carrito-link';
  link.style.position = 'relative';
  link.style.color = 'var(--color-primary)';
  link.setAttribute('data-testid', 'btn-carrito-header');
  link.innerHTML = ICONS.cart;
  const badge = crear('span', 'top-bar__badge-dot');
  badge.id = 'header-carrito-badge';
  badge.setAttribute('data-testid', 'contador-carrito-header');
  badge.textContent = '0';
  link.appendChild(badge);
  return link;
}

export async function actualizarContadorCarrito() {
  const usuario = getUsuario();
  let cantidad = 0;
  if (usuario && usuario.rol === 'CLIENTE') {
    try {
      const carrito = await apiFetch('/carrito');
      cantidad = (carrito.items || []).reduce((total, item) => total + item.cantidad, 0);
    } catch {
    }
  }
  const textoContador = cantidad > 9 ? '9+' : String(cantidad);

  const badgeHeader = document.getElementById('header-carrito-badge');
  if (badgeHeader) {
    badgeHeader.textContent = textoContador;
  }

  const linkFooterCarrito = document.querySelector('.bottom-nav__item[data-testid="btn-nav-carrito"] .bottom-nav__icon-wrap');
  if (linkFooterCarrito) {
    linkFooterCarrito.querySelectorAll('.top-bar__badge-dot').forEach((el) => el.remove());
    if (cantidad > 0) {
      const badge = crear('span', 'top-bar__badge-dot');
      badge.setAttribute('data-testid', 'contador-carrito-footer');
      badge.textContent = textoContador;
      linkFooterCarrito.appendChild(badge);
    }
  }
}

async function cargarAvatarFooter(link) {
  try {
    const cliente = await apiFetch('/clientes/perfil');
    normalizarCampos(cliente, ['nombre']);
    const inicial = (cliente.nombre || '?').trim().charAt(0).toUpperCase();
    const avatar = crear('div', 'bottom-nav__avatar');
    pintarAvatarUsuario(avatar, cliente.fotoPerfilUrl, inicial);
    link.innerHTML = '';
    link.appendChild(avatar);
    const label = document.createElement('span');
    label.textContent = 'Perfil';
    link.appendChild(label);
  } catch {
  }
}

export function renderBottomNav(container, activo) {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    return;
  }
  const nav = crear('nav', 'bottom-nav');
  const items = [
    { key: 'inicio', label: 'Inicio', icon: ICONS.home, href: 'index.html' },
    { key: 'explorar', label: 'Explorar', icon: ICONS.compass, href: 'explorar.html' },
    { key: 'carrito', label: 'Carrito', icon: ICONS.cart, href: 'carrito.html' },
    { key: 'pedidos', label: 'Mis pedidos', icon: ICONS.list, href: 'pedidos.html' },
    { key: 'perfil', label: 'Perfil', icon: ICONS.user, href: 'perfil.html' },
  ];
  items.forEach((item) => {
    const link = document.createElement('a');
    link.className = 'bottom-nav__item';
    link.href = item.href;
    link.setAttribute('data-testid', `btn-nav-${item.key}`);
    if (item.key === activo) {
      link.setAttribute('aria-current', 'page');
    }
    const iconWrap = crear('span', 'bottom-nav__icon-wrap');
    iconWrap.innerHTML = item.icon;
    link.appendChild(iconWrap);
    const label = document.createElement('span');
    label.textContent = item.label;
    link.appendChild(label);
    nav.appendChild(link);
    if (item.key === 'perfil') {
      cargarAvatarFooter(link);
    }
  });
  container.appendChild(nav);
  actualizarContadorCarrito();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      actualizarContadorCarrito();
    }
  });
}

export function pintarEstadoComercio(el, abierto) {
  el.className = `comercio-estado-badge${abierto ? ' comercio-estado-badge--open' : ' comercio-estado-badge--closed'}`;
  el.setAttribute('data-testid', 'estado-comercio');
  el.innerHTML = '';
  const dot = crear('span', 'comercio-estado-badge__dot');
  el.appendChild(dot);
  const label = document.createElement('span');
  label.textContent = abierto ? 'Abierto' : 'Cerrado';
  el.appendChild(label);
}

export function renderPedidoEstadoHeader(container, { iconClass, icono, label, texto, numeroTexto, motivoRechazo }) {
  container.innerHTML = '';
  const header = crear('div', 'pedido-detail__header');
  header.setAttribute('data-testid', 'cabecera-estado-pedido');
  const iconWrap = crear('div', `pedido-detail__icon ${iconClass}`);
  iconWrap.innerHTML = icono;
  header.appendChild(iconWrap);
  const h1 = document.createElement('h1');
  h1.className = 'title-md';
  h1.textContent = label;
  header.appendChild(h1);
  const estadoTexto = crear('p', 'pedido-detail__estado-texto');
  estadoTexto.setAttribute('data-testid', 'estado-pedido');
  estadoTexto.textContent = texto;
  header.appendChild(estadoTexto);
  const numero = crear('p', 'pedido-detail__numero');
  numero.setAttribute('data-testid', 'numero-pedido');
  numero.textContent = numeroTexto;
  header.appendChild(numero);
  if (motivoRechazo) {
    header.appendChild(renderAvisoRechazo(motivoRechazo));
  }
  container.appendChild(header);
}

function renderAvisoRechazo({ motivoLabel, comentario }) {
  const aviso = crear('div', 'aviso-punto aviso-punto--rechazo');
  aviso.setAttribute('data-testid', 'motivo-rechazo-pedido');
  const dot = crear('span', 'aviso-punto__dot');
  aviso.appendChild(dot);
  const texto = document.createElement('div');
  const motivo = crear('p', 'aviso-punto__motivo');
  motivo.textContent = motivoLabel;
  texto.appendChild(motivo);
  if (comentario) {
    const detalle = crear('p', 'aviso-punto__comentario');
    detalle.textContent = comentario;
    texto.appendChild(detalle);
  }
  aviso.appendChild(texto);
  return aviso;
}

export function pintarAvatarComercio(container, comercio) {
  container.innerHTML = '';
  if (comercio.fotoPerfilUrl) {
    const img = document.createElement('img');
    img.src = comercio.fotoPerfilUrl;
    img.alt = '';
    container.appendChild(img);
  } else {
    const inicial = document.createElement('span');
    inicial.className = 'avatar-inicial';
    inicial.textContent = (comercio.nombre || '?').trim().charAt(0).toUpperCase();
    container.appendChild(inicial);
  }
}

export function pintarAvatarUsuario(container, fotoPerfilUrl, textoAlternativo) {
  container.innerHTML = '';
  if (fotoPerfilUrl) {
    const img = document.createElement('img');
    img.src = fotoPerfilUrl;
    img.alt = '';
    container.appendChild(img);
  } else {
    const inicial = document.createElement('span');
    inicial.className = 'avatar-inicial';
    inicial.textContent = textoAlternativo;
    container.appendChild(inicial);
  }
}

export function renderComercioCard(comercio) {
  const card = document.createElement('a');
  card.className = 'comercio-card';
  card.href = `comercio-detalle.html?id=${comercio.id}`;
  card.setAttribute('data-testid', `comercio-card-${comercio.id}`);

  const avatar = crear('div', 'comercio-card__avatar');
  pintarAvatarComercio(avatar, comercio);
  card.appendChild(avatar);

  const body = crear('div', 'comercio-card__body');

  const { abierto, resumenHoy } = estadoHorario(comercio.horarios);
  const top = crear('div', 'comercio-card__top');
  const nombre = document.createElement('h3');
  nombre.textContent = comercio.nombre;
  top.appendChild(nombre);
  const badge = document.createElement('span');
  pintarEstadoComercio(badge, abierto);
  top.appendChild(badge);
  body.appendChild(top);

  const tipoTexto = LABELS_TIPO_COMERCIO[comercio.tipoComercio] || comercio.tipoComercio;
  const meta = crear('p', 'comercio-card__meta');
  meta.textContent = resumenHoy ? `${tipoTexto} · ${resumenHoy}` : tipoTexto;
  body.appendChild(meta);

  const pills = crear('div', 'pill-row');
  if (comercio.aceptaDelivery) {
    const pill = crear('span', 'pill');
    pill.innerHTML = `${ICONS.truck}<span>Delivery</span>`;
    pills.appendChild(pill);
  }
  if (comercio.aceptaRetiro) {
    const pill = crear('span', 'pill');
    pill.innerHTML = `${ICONS.bag}<span>Retiro</span>`;
    pills.appendChild(pill);
  }
  body.appendChild(pills);

  card.appendChild(body);
  return card;
}

export function renderEmptyState(container, titulo, texto, { textoBoton, hrefBoton, inline = false } = {}) {
  container.innerHTML = '';
  const wrapper = crear('div', inline ? 'state-page state-page--inline' : 'state-page');
  wrapper.setAttribute('data-testid', 'estado-vacio');
  const icon = crear('div', 'state-page__icon');
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="3" y1="9" x2="21" y2="9"/></svg>';
  wrapper.appendChild(icon);
  const h2 = document.createElement('h2');
  h2.className = 'state-page__title';
  h2.textContent = titulo;
  wrapper.appendChild(h2);
  if (texto) {
    const p = document.createElement('p');
    p.className = 'state-page__text';
    p.textContent = texto;
    wrapper.appendChild(p);
  }
  if (textoBoton && hrefBoton) {
    const boton = document.createElement('a');
    boton.className = 'btn btn-primary';
    boton.style.marginTop = '16px';
    boton.href = hrefBoton;
    boton.setAttribute('data-testid', 'btn-estado-vacio-accion');
    boton.textContent = textoBoton;
    wrapper.appendChild(boton);
  }
  container.appendChild(wrapper);
}

export async function initCatalogo() {
  const usuario = getUsuario();
  if (usuario && usuario.rol !== 'CLIENTE') {
    const destino = await resolverHomePorRol(usuario).catch(() => null);
    window.location.href = destino || 'login.html';
    return;
  }

  const topBarSlot = document.getElementById('top-bar-slot');
  renderTopBar(topBarSlot, { mostrarPerfil: false, centrarLogo: true });

  const greetingTitle = document.getElementById('greeting-title');
  const greetingSubtitle = document.getElementById('greeting-subtitle');
  if (usuario) {
    greetingTitle.textContent = 'Hola 👋';
    greetingSubtitle.textContent = '¿Qué comemos hoy?';
    if (usuario.rol === 'CLIENTE') {
      try {
        const cliente = await apiFetch('/clientes/perfil');
        normalizarCampos(cliente, ['nombre']);
        greetingTitle.textContent = `Hola, ${cliente.nombre} 👋`;
      } catch {
      }
    }
  } else {
    greetingTitle.textContent = 'Iniciá sesión para bajonear ;)';
    greetingSubtitle.textContent = '';
  }

  const comercios = await apiFetch('/catalogo/comercios', { auth: false });
  comercios.forEach((c) => {
    normalizarCampos(c, ['nombre', 'razonSocial']);
    normalizarCampos(c.direccion, ['calle']);
  });

  const chipRow = document.getElementById('chip-row');
  const listContainer = document.getElementById('comercio-list');
  const bottomNavSlot = document.getElementById('bottom-nav-slot');
  renderBottomNav(bottomNavSlot, 'inicio');

  const filtros = [
    { key: 'todos', label: 'Todos', test: () => true },
    { key: 'delivery', label: 'Delivery', test: (c) => c.aceptaDelivery },
    { key: 'retiro', label: 'Retiro', test: (c) => c.aceptaRetiro },
    { key: 'abierto', label: 'Abierto ahora', test: (c) => estadoHorario(c.horarios).abierto },
  ];

  let filtroActivo = 'todos';

  function pintarLista() {
    const filtro = filtros.find((f) => f.key === filtroActivo);
    const visibles = comercios.filter(filtro.test).sort((a, b) => {
      const abiertoA = estadoHorario(a.horarios).abierto;
      const abiertoB = estadoHorario(b.horarios).abierto;
      return (abiertoB ? 1 : 0) - (abiertoA ? 1 : 0);
    });

    if (comercios.length === 0) {
      renderEmptyState(listContainer, 'Todavía no hay comercios disponibles', 'Estamos incorporando negocios locales en Tierra del Fuego. Volvé a revisar pronto.');
      return;
    }

    if (visibles.length === 0) {
      renderEmptyState(listContainer, 'Sin resultados para este filtro', 'Probá con otro filtro para ver más comercios disponibles.');
      return;
    }

    listContainer.innerHTML = '';
    listContainer.className = 'comercio-list';
    visibles.forEach((comercio) => listContainer.appendChild(renderComercioCard(comercio)));
  }

  filtros.forEach((filtro) => {
    const chip = crear('button', 'chip');
    chip.type = 'button';
    chip.textContent = filtro.label;
    chip.setAttribute('data-testid', `chip-filtro-${filtro.key}`);
    chip.setAttribute('aria-pressed', String(filtro.key === filtroActivo));
    chip.addEventListener('click', () => {
      filtroActivo = filtro.key;
      chipRow.querySelectorAll('.chip').forEach((el) => el.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      pintarLista();
    });
    chipRow.appendChild(chip);
  });

  pintarLista();
}

function renderProductoRow(producto, onOpen) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'product-row';
  row.setAttribute('data-testid', `producto-item-${producto.id}`);
  row.addEventListener('click', () => onOpen(producto));

  const info = crear('div', 'product-row__info');
  const nombre = document.createElement('h3');
  nombre.textContent = producto.nombre;
  info.appendChild(nombre);

  if (producto.descripcion) {
    const desc = document.createElement('p');
    desc.textContent = producto.descripcion;
    info.appendChild(desc);
  }

  const precio = crear('span', 'product-row__price');
  precio.textContent = formatearPrecio(producto.precio);
  info.appendChild(precio);
  row.appendChild(info);

  const thumbWrapper = crear('div', `product-row__thumb${producto.estado === 'AGOTADO' ? ' product-row__thumb--agotado' : ''}`);
  const principal = producto.imagenes.find((imagen) => imagen.esPrincipal) || producto.imagenes[0];
  if (principal) {
    const img = document.createElement('img');
    img.src = principal.url;
    img.alt = '';
    thumbWrapper.appendChild(img);
  }
  row.appendChild(thumbWrapper);

  return row;
}

let comercioCerradoActual = false;

function crearAvisoPunto(texto) {
  const aviso = crear('div', 'aviso-punto');
  const dot = crear('span', 'aviso-punto__dot');
  aviso.appendChild(dot);
  const label = document.createElement('span');
  label.textContent = texto;
  aviso.appendChild(label);
  return aviso;
}

function abrirZoomImagen(url) {
  const backdrop = crear('div', 'image-zoom-backdrop');
  backdrop.setAttribute('data-testid', 'modal-zoom-producto');

  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  backdrop.appendChild(img);

  const closeBtn = crear('button', 'image-zoom-backdrop__close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('data-testid', 'btn-cerrar-zoom-producto');
  closeBtn.innerHTML = ICONS.close;
  closeBtn.addEventListener('click', () => backdrop.remove());
  backdrop.appendChild(closeBtn);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });

  document.body.appendChild(backdrop);
}

function abrirModalProducto(producto) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.id = 'product-modal-backdrop';
  backdrop.setAttribute('data-testid', 'modal-detalle-producto');

  const sheet = crear('div', 'product-modal-sheet');

  const handle = crear('div', 'product-modal-sheet__handle');
  handle.innerHTML = '<span></span>';
  sheet.appendChild(handle);

  const imagenes = producto.imagenes && producto.imagenes.length > 0 ? [...producto.imagenes].sort((a, b) => a.orden - b.orden) : [];

  if (imagenes.length > 1) {
    const gallery = crear('div', 'product-gallery');

    const main = crear('div', 'product-gallery__main');
    const mainImg = document.createElement('img');
    mainImg.src = imagenes[0].url;
    mainImg.alt = '';
    main.appendChild(mainImg);

    const closeBtn = crear('button', 'product-modal-sheet__close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('data-testid', 'btn-cerrar-modal-producto');
    closeBtn.innerHTML = ICONS.close;
    closeBtn.addEventListener('click', () => backdrop.remove());
    main.appendChild(closeBtn);

    const zoomBtn = crear('button', 'gallery-zoom-btn');
    zoomBtn.type = 'button';
    zoomBtn.setAttribute('data-testid', 'btn-zoom-producto');
    zoomBtn.innerHTML = ICONS.zoom;
    zoomBtn.addEventListener('click', () => abrirZoomImagen(mainImg.src));
    main.appendChild(zoomBtn);

    gallery.appendChild(main);

    const thumbs = crear('div', 'product-gallery__thumbs');
    const thumbButtons = [];
    imagenes.forEach((imagen, index) => {
      const thumb = crear('button', 'product-gallery__thumb');
      thumb.type = 'button';
      thumb.setAttribute('data-testid', 'btn-miniatura-producto');
      thumb.setAttribute('data-active', String(index === 0));
      const thumbImg = document.createElement('img');
      thumbImg.src = imagen.url;
      thumbImg.alt = '';
      thumb.appendChild(thumbImg);
      thumb.addEventListener('click', () => {
        mainImg.src = imagen.url;
        thumbButtons.forEach((btn, btnIndex) => btn.setAttribute('data-active', String(btnIndex === index)));
      });
      thumbs.appendChild(thumb);
      thumbButtons.push(thumb);
    });
    gallery.appendChild(thumbs);

    sheet.appendChild(gallery);
  } else if (imagenes.length === 1) {
    const gallery = crear('div', 'product-modal-sheet__gallery');
    const img = document.createElement('img');
    img.src = imagenes[0].url;
    img.alt = '';
    gallery.appendChild(img);

    const closeBtn = crear('button', 'product-modal-sheet__close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('data-testid', 'btn-cerrar-modal-producto');
    closeBtn.innerHTML = ICONS.close;
    closeBtn.addEventListener('click', () => backdrop.remove());
    gallery.appendChild(closeBtn);

    const zoomBtn = crear('button', 'gallery-zoom-btn');
    zoomBtn.type = 'button';
    zoomBtn.setAttribute('data-testid', 'btn-zoom-producto');
    zoomBtn.innerHTML = ICONS.zoom;
    zoomBtn.addEventListener('click', () => abrirZoomImagen(img.src));
    gallery.appendChild(zoomBtn);

    sheet.appendChild(gallery);
  }

  const body = crear('div', 'product-modal-sheet__body');

  const titleRow = crear('div', 'product-modal-sheet__title-row');
  const h2 = document.createElement('h2');
  h2.textContent = producto.nombre;
  titleRow.appendChild(h2);
  const precio = document.createElement('span');
  precio.textContent = formatearPrecio(producto.precio);
  titleRow.appendChild(precio);
  body.appendChild(titleRow);

  if (producto.estado === 'AGOTADO') {
    body.appendChild(crearAvisoPunto('Este producto está agotado en este momento.'));
  }

  if (comercioCerradoActual) {
    body.appendChild(crearAvisoPunto('Este comercio está cerrado en este momento.'));
  }

  const pills = crear('div', 'pill-row');
  pills.style.marginBottom = '16px';
  const categoriaPill = crear('span', 'pill');
  categoriaPill.textContent = producto.nombreCategoria;
  pills.appendChild(categoriaPill);
  (producto.tags || []).forEach((tag) => {
    const pill = crear('span', 'pill');
    pill.textContent = tag;
    pills.appendChild(pill);
  });
  body.appendChild(pills);

  if (producto.descripcion) {
    const desc = crear('p', 'product-modal-sheet__description');
    desc.textContent = producto.descripcion;
    body.appendChild(desc);
  }

  if (producto.estado === 'DISPONIBLE' && !comercioCerradoActual) {
    const usuario = getUsuario();
    if (usuario && usuario.rol === 'CLIENTE') {
      body.appendChild(crear('div', 'divider'));

      let cantidad = 1;

      const quantityRow = crear('div', 'quantity-input-row');
      const quantityLabel = document.createElement('span');
      quantityLabel.className = 'field__label';
      quantityLabel.textContent = 'Cantidad';
      quantityRow.appendChild(quantityLabel);

      const stepper = crear('div', 'stepper');
      const minusBtn = crear('button', 'stepper__btn');
      minusBtn.type = 'button';
      minusBtn.innerHTML = ICONS.minus;
      minusBtn.setAttribute('aria-label', 'Restar cantidad');
      minusBtn.setAttribute('data-testid', 'btn-restar-cantidad-producto');
      const valueSpan = crear('span', 'stepper__value');
      valueSpan.setAttribute('data-testid', 'cantidad-producto-modal');
      valueSpan.textContent = String(cantidad);
      const plusBtn = crear('button', 'stepper__btn');
      plusBtn.type = 'button';
      plusBtn.innerHTML = ICONS.plus;
      plusBtn.setAttribute('aria-label', 'Sumar cantidad');
      plusBtn.setAttribute('data-testid', 'btn-sumar-cantidad-producto');
      minusBtn.disabled = cantidad <= 1;
      stepper.appendChild(minusBtn);
      stepper.appendChild(valueSpan);
      stepper.appendChild(plusBtn);
      quantityRow.appendChild(stepper);
      body.appendChild(quantityRow);

      const notaField = crear('div', 'field');
      notaField.style.marginTop = '12px';
      const notaLabel = document.createElement('label');
      notaLabel.className = 'field__label';
      notaLabel.textContent = 'Nota (opcional)';
      notaLabel.setAttribute('for', 'producto-nota-input');
      notaField.appendChild(notaLabel);
      const notaShell = crear('div', 'input-shell');
      const notaInput = document.createElement('input');
      notaInput.type = 'text';
      notaInput.id = 'producto-nota-input';
      notaInput.maxLength = 255;
      notaInput.placeholder = 'Ej: sin cebolla';
      notaInput.setAttribute('data-testid', 'input-nota-producto');
      notaShell.appendChild(notaInput);
      notaField.appendChild(notaShell);
      body.appendChild(notaField);

      const addBtn = crear('button', 'btn btn-primary');
      addBtn.type = 'button';
      addBtn.style.marginTop = '18px';
      addBtn.setAttribute('data-testid', 'btn-agregar-carrito');
      addBtn.textContent = `Agregar al carrito - ${formatearPrecio(producto.precio * cantidad)}`;
      body.appendChild(addBtn);

      function actualizarStepper() {
        valueSpan.textContent = String(cantidad);
        minusBtn.disabled = cantidad <= 1;
        plusBtn.disabled = cantidad >= 20;
        addBtn.textContent = `Agregar al carrito - ${formatearPrecio(producto.precio * cantidad)}`;
      }

      minusBtn.addEventListener('click', () => {
        cantidad = Math.max(1, cantidad - 1);
        actualizarStepper();
      });
      plusBtn.addEventListener('click', () => {
        if (excedeSubtotalMaximo(producto.precio, cantidad + 1)) {
          showToast(mensajeSubtotalMaximoExcedido(), 'error');
          return;
        }
        cantidad = Math.min(20, cantidad + 1);
        actualizarStepper();
      });

      addBtn.addEventListener('click', async () => {
        if (excedeSubtotalMaximo(producto.precio, cantidad)) {
          showToast(mensajeSubtotalMaximoExcedido(), 'error');
          return;
        }
        addBtn.disabled = true;
        const originalText = addBtn.textContent;
        addBtn.textContent = 'Agregando...';
        try {
          await agregarAlCarrito(producto, cantidad, notaInput.value.trim());
          backdrop.remove();
          showToast('Producto agregado al carrito');
          actualizarContadorCarrito();
        } catch (error) {
          if (error instanceof ApiError && error.status === 409 && error.message && error.message.includes('otro comercio')) {
            backdrop.remove();
            await mostrarModalConflictoComercio(producto, cantidad, notaInput.value.trim());
          } else {
            addBtn.disabled = false;
            addBtn.textContent = originalText;
            showToast(error instanceof ApiError ? error.message : 'No pudimos agregar el producto. Intentá nuevamente.', 'error');
          }
        }
      });
    } else {
      body.appendChild(crear('div', 'divider'));
      const loginLink = document.createElement('a');
      loginLink.className = 'btn btn-primary';
      loginLink.href = 'login.html';
      loginLink.setAttribute('data-testid', 'btn-ir-a-login');
      loginLink.textContent = 'Iniciá sesión para pedir';
      body.appendChild(loginLink);
    }
  }

  sheet.appendChild(body);
  backdrop.appendChild(sheet);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });

  document.body.appendChild(backdrop);
}

async function agregarAlCarrito(producto, cantidad, nota) {
  await apiFetch('/carrito/items', {
    method: 'POST',
    body: { productoId: producto.id, cantidad, nota: nota || undefined },
  });
}

async function mostrarModalConflictoComercio(producto, cantidad, nota) {
  const carritoActual = await apiFetch('/carrito');
  normalizarCampos(carritoActual, ['nombreComercio']);

  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-conflicto-comercio');
  const sheet = crear('div', 'modal-sheet');

  const icon = crear('div', 'modal-sheet__icon');
  icon.innerHTML = ICONS.storeSwap;
  sheet.appendChild(icon);

  const title = document.createElement('h2');
  title.className = 'modal-sheet__title';
  title.textContent = 'Tu carrito tiene productos de otro comercio';
  sheet.appendChild(title);

  const text = document.createElement('p');
  text.className = 'modal-sheet__text';
  text.textContent = `Para agregar productos de "${producto.nombreComercio}" necesitás vaciar el carrito con los artículos de "${carritoActual.nombreComercio}".`;
  sheet.appendChild(text);

  const actualCard = crear('div', 'conflict-card');
  actualCard.style.marginBottom = '10px';
  const actualIcon = crear('div', 'conflict-card__icon');
  actualIcon.innerHTML = ICONS.bag;
  actualCard.appendChild(actualIcon);
  const actualBody = crear('div', 'conflict-card__body');
  const actualLabel = crear('p', 'conflict-card__label');
  actualLabel.textContent = 'Comercio actual';
  actualBody.appendChild(actualLabel);
  const actualName = crear('p', 'conflict-card__name');
  actualName.textContent = carritoActual.nombreComercio;
  actualBody.appendChild(actualName);
  const actualCount = crear('p', 'conflict-card__count');
  actualCount.textContent = `${carritoActual.items.length} producto${carritoActual.items.length === 1 ? '' : 's'}`;
  actualBody.appendChild(actualCount);
  actualCard.appendChild(actualBody);
  sheet.appendChild(actualCard);

  const nuevoCard = crear('div', 'conflict-card conflict-card--new');
  nuevoCard.style.marginBottom = '24px';
  const nuevoIcon = crear('div', 'conflict-card__icon');
  nuevoIcon.innerHTML = ICONS.bag;
  nuevoCard.appendChild(nuevoIcon);
  const nuevoBody = crear('div', 'conflict-card__body');
  const nuevoLabel = crear('p', 'conflict-card__label');
  nuevoLabel.textContent = 'Nuevo pedido';
  nuevoBody.appendChild(nuevoLabel);
  const nuevoName = crear('p', 'conflict-card__name');
  nuevoName.textContent = producto.nombreComercio;
  nuevoBody.appendChild(nuevoName);
  const nuevoCount = crear('p', 'conflict-card__count');
  nuevoCount.textContent = `1 producto`;
  nuevoBody.appendChild(nuevoCount);
  nuevoCard.appendChild(nuevoBody);
  sheet.appendChild(nuevoCard);

  const confirmBtn = crear('button', 'btn btn-primary');
  confirmBtn.type = 'button';
  confirmBtn.style.marginBottom = '12px';
  confirmBtn.setAttribute('data-testid', 'btn-vaciar-y-agregar');
  confirmBtn.textContent = 'Vaciar carrito y agregar';
  sheet.appendChild(confirmBtn);

  const cancelBtn = crear('button', 'btn btn-tertiary');
  cancelBtn.type = 'button';
  cancelBtn.setAttribute('data-testid', 'btn-cancelar-conflicto-comercio');
  cancelBtn.textContent = 'Cancelar';
  sheet.appendChild(cancelBtn);

  backdrop.appendChild(sheet);

  cancelBtn.addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Vaciando...';
    try {
      await apiFetch('/carrito', { method: 'DELETE' });
      await agregarAlCarrito(producto, cantidad, nota);
      backdrop.remove();
      showToast('Producto agregado al carrito');
      actualizarContadorCarrito();
    } catch (error) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Vaciar carrito y agregar';
      showToast(error instanceof ApiError ? error.message : 'No pudimos completar la acción. Intentá nuevamente.', 'error');
    }
  });

  document.body.appendChild(backdrop);
}

export async function initComercioDetalle() {
  const params = new URLSearchParams(window.location.search);
  const comercioId = Number(params.get('id'));
  const topBarSlot = document.getElementById('top-bar-slot');
  const mainContent = document.getElementById('main-content');

  if (!comercioId) {
    renderTopBar(topBarSlot, { mostrarVolver: true, titulo: 'Comercio' });
    renderEmptyState(mainContent, 'Comercio no encontrado', 'El enlace que seguiste no es válido.');
    return;
  }

  const comercios = await apiFetch('/catalogo/comercios', { auth: false });
  comercios.forEach((c) => {
    normalizarCampos(c, ['nombre', 'razonSocial']);
    normalizarCampos(c.direccion, ['calle']);
  });
  const comercio = comercios.find((c) => c.id === comercioId);

  if (!comercio) {
    renderTopBar(topBarSlot, { mostrarVolver: true, titulo: 'Comercio' });
    renderEmptyState(mainContent, 'Comercio no encontrado', 'Este comercio no está disponible en este momento.');
    return;
  }

  const usuarioActual = getUsuario();
  const accionCarrito = usuarioActual && usuarioActual.rol === 'CLIENTE' ? crearAccionCarritoHeader() : null;
  renderTopBar(topBarSlot, { mostrarVolver: true, titulo: comercio.nombre, accion: accionCarrito });
  if (accionCarrito) {
    actualizarContadorCarrito();
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        actualizarContadorCarrito();
      }
    });
  }

  pintarAvatarComercio(document.getElementById('comercio-hero').parentElement, comercio);

  document.getElementById('comercio-nombre').textContent = comercio.nombre;

  const { abierto, resumenHoy, cerradoTodoElDia } = estadoHorario(comercio.horarios);
  comercioCerradoActual = !abierto;
  const estadoBadge = document.getElementById('comercio-estado-badge');
  pintarEstadoComercio(estadoBadge, abierto);

  const infoBlock = document.getElementById('comercio-info');
  infoBlock.innerHTML = '';
  const estadoRow = crear('div', 'comercio-info__row');
  estadoRow.innerHTML = ICONS.clock;
  const estadoTexto = document.createElement('span');
  estadoTexto.textContent = cerradoTodoElDia
    ? resumenHoy
    : `${abierto ? 'Abierto ahora' : 'Cerrado ahora'} · ${resumenHoy}`;
  estadoRow.appendChild(estadoTexto);
  infoBlock.appendChild(estadoRow);

  if (comercio.direccion) {
    const direccionRow = crear('div', 'comercio-info__row');
    direccionRow.innerHTML = ICONS.pin;
    const direccionTexto = document.createElement('span');
    direccionTexto.textContent = `${comercio.direccion.calle} ${comercio.direccion.numero}, ${comercio.direccion.nombreLocalidad}`;
    direccionRow.appendChild(direccionTexto);
    infoBlock.appendChild(direccionRow);
  }

  const pills = crear('div', 'pill-row');
  pills.style.marginTop = '10px';
  if (comercio.aceptaDelivery) {
    const pill = crear('span', 'pill');
    pill.innerHTML = `${ICONS.truck}<span>Delivery</span>`;
    pills.appendChild(pill);
  }
  if (comercio.aceptaRetiro) {
    const pill = crear('span', 'pill');
    pill.innerHTML = `${ICONS.bag}<span>Retiro</span>`;
    pills.appendChild(pill);
  }
  infoBlock.appendChild(pills);

  const descripcionBlock = document.getElementById('comercio-descripcion');
  if (comercio.descripcion) {
    descripcionBlock.textContent = comercio.descripcion;
  } else {
    descripcionBlock.remove();
  }

  const productos = await apiFetch(`/catalogo/comercios/${comercioId}/productos`, { auth: false });
  productos.forEach((producto) => normalizarCampos(producto, ['nombre']));

  const categorias = [];
  const categoriasVistas = new Set();
  productos.forEach((producto) => {
    if (!categoriasVistas.has(producto.categoriaId)) {
      categoriasVistas.add(producto.categoriaId);
      categorias.push({ id: producto.categoriaId, nombre: producto.nombreCategoria });
    }
  });

  const tagsDisponibles = [];
  const tagsVistos = new Set();
  productos.forEach((producto) => {
    (producto.tags || []).forEach((tag) => {
      if (!tagsVistos.has(tag)) {
        tagsVistos.add(tag);
        tagsDisponibles.push(tag);
      }
    });
  });

  const chipRow = document.getElementById('chip-row');
  const productList = document.getElementById('product-list');

  let categoriaActiva = null;
  let tagActivo = null;

  async function pintarProductos() {
    let listaFiltrada = productos;

    if (categoriaActiva !== null) {
      listaFiltrada = await apiFetch(`/catalogo/comercios/${comercioId}/productos?categoriaId=${categoriaActiva}`, { auth: false });
      listaFiltrada.forEach((producto) => normalizarCampos(producto, ['nombre']));
    }

    if (tagActivo !== null) {
      listaFiltrada = listaFiltrada.filter((producto) => (producto.tags || []).includes(tagActivo));
    }

    productList.innerHTML = '';

    if (productos.length === 0) {
      const wrapper = crear('div', 'product-empty-state');
      const texto = crear('p', 'product-empty-state__text');
      texto.textContent = 'Este comercio aún no cuenta con productos';
      wrapper.appendChild(texto);
      const link = document.createElement('a');
      link.className = 'btn-text';
      link.href = 'index.html';
      link.textContent = 'Explorá otros comercios →';
      wrapper.appendChild(link);
      productList.appendChild(wrapper);
      return;
    }

    if (listaFiltrada.length === 0) {
      renderEmptyState(productList, 'Sin productos para este filtro', 'Probá con otro filtro para ver más opciones del menú.', { inline: true });
      return;
    }

    const porCategoria = [];
    const vistos = new Set();
    listaFiltrada.forEach((producto) => {
      if (!vistos.has(producto.categoriaId)) {
        vistos.add(producto.categoriaId);
        porCategoria.push({ id: producto.categoriaId, nombre: producto.nombreCategoria, items: [] });
      }
      porCategoria.find((grupo) => grupo.id === producto.categoriaId).items.push(producto);
    });

    porCategoria.forEach((grupo) => {
      const section = crear('section', 'product-section');
      const heading = document.createElement('h2');
      heading.textContent = grupo.nombre;
      section.appendChild(heading);
      grupo.items.forEach((producto) => {
        section.appendChild(renderProductoRow(producto, abrirModalProducto));
      });
      productList.appendChild(section);
    });
  }

  function pintarChips() {
    chipRow.innerHTML = '';
    if (productos.length === 0) {
      chipRow.style.display = 'none';
      return;
    }
    chipRow.style.display = '';
    const chipTodos = crear('button', 'chip');
    chipTodos.type = 'button';
    chipTodos.setAttribute('data-testid', 'chip-filtro-todos');
    chipTodos.textContent = 'Todos';
    chipTodos.setAttribute('aria-pressed', String(categoriaActiva === null && tagActivo === null));
    chipTodos.addEventListener('click', () => {
      categoriaActiva = null;
      tagActivo = null;
      pintarChips();
      pintarProductos();
    });
    chipRow.appendChild(chipTodos);

    categorias.forEach((categoria) => {
      const chip = crear('button', 'chip');
      chip.type = 'button';
      chip.textContent = categoria.nombre;
      chip.setAttribute('data-testid', `chip-categoria-${categoria.id}`);
      chip.setAttribute('aria-pressed', String(categoriaActiva === categoria.id));
      chip.addEventListener('click', () => {
        categoriaActiva = categoriaActiva === categoria.id ? null : categoria.id;
        pintarChips();
        pintarProductos();
      });
      chipRow.appendChild(chip);
    });

    tagsDisponibles.forEach((tag) => {
      const chip = crear('button', 'chip');
      chip.type = 'button';
      chip.textContent = `#${tag}`;
      chip.setAttribute('data-testid', `chip-tag-${tag}`);
      chip.setAttribute('aria-pressed', String(tagActivo === tag));
      chip.addEventListener('click', () => {
        tagActivo = tagActivo === tag ? null : tag;
        pintarChips();
        pintarProductos();
      });
      chipRow.appendChild(chip);
    });
  }

  pintarChips();
  await pintarProductos();

  const productoIdParam = Number(params.get('producto'));
  if (productoIdParam) {
    const productoDestino = productos.find((producto) => producto.id === productoIdParam);
    if (productoDestino) {
      abrirModalProducto(productoDestino);
    }
  }
}
