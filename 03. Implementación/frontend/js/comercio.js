import { apiFetch, ApiError, getUsuario, clearSesion } from './api.js';
import { logout, construirTelefono, resolverHomePorRol, LABELS_TIPO_SOCIEDAD, LABELS_CONDICION_IVA } from './auth.js';
import { estadoHorario, renderTopBar, showToast, pintarAvatarComercio, renderPedidoEstadoHeader, manejarBloqueoPorCambioPassword, crearBloqueMotivoRechazo } from './catalogo.js';
import { SOPORTE_CONTACTO_URL } from './config.js';
import {
  activarComercio,
  contarNotificacionesNoLeidasActivo,
  destinoDeNavegacion,
  getComercioActivoEnMemoria,
  getComerciosEnMemoria,
  marcarNotificacionesDelComercioLeidas,
  refrescarComercios,
  resolverComercioActivo,
  rutaDeEstado,
  suscribirComercios,
  RUTA_DASHBOARD,
} from './comercio-activo.js';
import { abrirPanelComercios, enlazarMantenerApretado, prepararPaginaDueno } from './selector-comercio.js';
import {
  subirImagenProducto,
  eliminarImagenProducto,
  reordenarImagenProducto,
  recortarImagenProducto,
  subirFotoPerfilComercio,
  validarArchivoImagen,
  MAX_IMAGENES_POR_PRODUCTO,
  CloudinaryUploadError,
} from './cloudinary.js';
import { abrirEditorRecorte } from './crop.js';
import {
  mostrarErrorCampo,
  limpiarErrorCampo,
  mapearErroresBackend,
  validarCamposSilencioso,
  validarCamposRequeridosSilencioso,
  esNombreProductoValido,
  esPrecioValido,
  aTitleCase,
  esTextoConContenidoValido,
  esTelefonoValido,
  esEmailValido,
  esPasswordSegura,
  aplicarFortalezaPassword,
  scrollAlPrimerError,
  normalizarCampos,
} from './validators.js';

const MAX_TAGS_POR_PRODUCTO = 5;

function normalizarComercio(comercio) {
  normalizarCampos(comercio, ['nombre', 'razonSocial']);
  normalizarCampos(comercio.direccion, ['calle']);
  normalizarCampos(comercio.representante, ['nombre', 'apellido']);
  return comercio;
}

function normalizarPedido(pedido) {
  normalizarCampos(pedido, ['nombreCliente']);
  normalizarCampos(pedido.direccion, ['calle']);
  (pedido.detalles || []).forEach((detalle) => normalizarCampos(detalle, ['nombreProducto']));
  return pedido;
}

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  logoutIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  kebab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
  ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  xCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1 6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13 16 6a2 2 0 0 1 2 2v15"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
};

const MOTIVOS_RECHAZO = [
  { value: 'SIN_STOCK', label: 'Sin stock' },
  { value: 'CERRADO', label: 'Comercio cerrado' },
  { value: 'ALTO_VOLUMEN_PEDIDOS', label: 'Alto volumen de pedidos' },
  { value: 'PRODUCTO_NO_DISPONIBLE_TEMPORAL', label: 'Producto no disponible temporalmente' },
  { value: 'SIN_DELIVERY_DISPONIBLE', label: 'Sin delivery disponible' },
  { value: 'PROBLEMA_TECNICO', label: 'Problema técnico' },
  { value: 'OTRO', label: 'Otro' },
];

const MOTIVO_RECHAZO_LABEL = Object.fromEntries(MOTIVOS_RECHAZO.map((motivo) => [motivo.value, motivo.label]));

function crear(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatearPrecio(valor) {
  const entero = Math.round(Number(valor));
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatearMilesInput(valorActual) {
  const soloDigitos = valorActual.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!soloDigitos) {
    return '';
  }
  return soloDigitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function precioDesdeInput(valorFormateado) {
  const soloDigitos = valorFormateado.replace(/\D/g, '');
  return soloDigitos ? Number(soloDigitos) : NaN;
}

function formatearFechaHoraCorta(fechaIso) {
  const fecha = new Date(fechaIso);
  const partes = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${partes} ${hora}`;
}

function formatearFecha(fechaIso) {
  const fecha = new Date(fechaIso);
  const partes = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${partes}, ${hora}`;
}

function formatearDireccion(direccion) {
  const partes = [`${direccion.calle} ${direccion.numero}`];
  if (direccion.pisoDepto) {
    partes.push(direccion.pisoDepto);
  }
  partes.push(direccion.nombreLocalidad);
  return partes.join(', ');
}

function renderBanner(slot, kind, texto) {
  if (!texto) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = `<div class="banner banner-${kind}">${ICONS.clock}<div>${texto}</div></div>`;
}

function renderEstadoBanner(slot, abierto, texto) {
  slot.innerHTML = '';
  const row = crear('div', `estado-banner ${abierto ? 'estado-banner--open' : 'estado-banner--closed'}`);
  const dot = crear('span', 'estado-banner__dot');
  row.appendChild(dot);
  const label = document.createElement('span');
  label.textContent = texto;
  row.appendChild(label);
  slot.appendChild(row);
}

function setLoading(button, loadingText, isLoading, originalHtml) {
  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = loadingText;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalHtml || originalHtml;
    button.disabled = false;
  }
}

function bindPasswordToggle(toggleBtn, input) {
  toggleBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

function formatearFechaLarga(fechaTexto) {
  const fecha = new Date(`${fechaTexto}T00:00:00`);
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function redirigirPorDefecto() {
  try {
    window.location.href = destinoDeNavegacion(await resolverComercioActivo());
  } catch {
    window.location.href = 'login.html';
  }
}

function leerComercioIdDeLaUrl() {
  const crudo = new URLSearchParams(window.location.search).get('id');
  const valor = Number(crudo);
  return crudo !== null && Number.isInteger(valor) && valor > 0 ? valor : null;
}

export async function initComercioEstadoPagina(estadoEsperado) {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return null;
  }
  const emailEl = document.getElementById('usuario-email');
  if (emailEl) {
    emailEl.textContent = usuario.email;
  }

  const volverBtn = document.getElementById('volver-comercios-btn');
  if (volverBtn) {
    volverBtn.addEventListener('click', () => abrirPanelComercios());
  }

  const comercioId = leerComercioIdDeLaUrl();
  if (comercioId === null) {
    await redirigirPorDefecto();
    return null;
  }

  let comercio;
  try {
    comercio = await apiFetch('/comercios/perfil', { comercioId });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      await redirigirPorDefecto();
      return null;
    }
    throw error;
  }
  normalizarComercio(comercio);

  if (comercio.estado !== estadoEsperado) {
    if (comercio.estado === 'APROBADO' || comercio.estado === 'APTO_VENTA') {
      activarComercio(comercio.id);
      window.location.href = RUTA_DASHBOARD;
      return null;
    }
    const ruta = rutaDeEstado(comercio);
    if (ruta) {
      window.location.href = ruta;
    } else {
      await redirigirPorDefecto();
    }
    return null;
  }

  try {
    await marcarNotificacionesDelComercioLeidas(comercio.id);
  } catch {
  }
  return comercio;
}

function textoIntentosRestantes(restantes) {
  return restantes === 1 ? 'Te queda 1 intento.' : `Te quedan ${restantes} intentos.`;
}

function mostrarContenidoEstado() {
  document.getElementById('cargando-container').classList.add('is-hidden');
  document.getElementById('contenido-container').classList.remove('is-hidden');
}

export async function initComercioRechazado() {
  const comercio = await initComercioEstadoPagina('RECHAZADO');
  if (!comercio) {
    return;
  }

  let correccion;
  try {
    correccion = await apiFetch(`/comercios/${comercio.id}/correccion`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const destino = await resolverHomePorRol(getUsuario()).catch(() => null);
      window.location.href = destino || 'login.html';
      return;
    }
    throw error;
  }

  const motivo = correccion.motivoRechazo || comercio.motivoRechazo;
  if (motivo) {
    document.getElementById('motivo-rechazo-slot').appendChild(crearBloqueMotivoRechazo({
      titulo: 'Motivo del rechazo',
      motivo,
      testid: 'motivo-rechazo-comercio',
    }));
  }

  const texto = document.getElementById('texto-correccion');
  const corregirBtn = document.getElementById('corregir-btn');
  if (correccion.intentosRestantes > 0) {
    texto.textContent = `Podés corregir los datos y volver a solicitarla. ${textoIntentosRestantes(correccion.intentosRestantes)}`;
    corregirBtn.href = `comercio-corregir.html?id=${comercio.id}`;
    corregirBtn.classList.remove('is-hidden');
  } else {
    texto.textContent = 'Ya usaste todos los intentos para volver a solicitar este comercio. Si creés que se trata de un error, contactá a soporte.';
  }
  mostrarContenidoEstado();
}

export async function initComercioRechazoDefinitivo() {
  const comercio = await initComercioEstadoPagina('RECHAZO_DEFINITIVO');
  if (!comercio) {
    return;
  }

  if (comercio.motivoRechazo) {
    document.getElementById('motivo-rechazo-slot').appendChild(crearBloqueMotivoRechazo({
      titulo: 'Motivo del rechazo',
      motivo: comercio.motivoRechazo,
      testid: 'motivo-rechazo-comercio',
    }));
  }

  const elegibilidad = await apiFetch('/comercios/alta-adicional/elegibilidad');
  if (elegibilidad.elegible) {
    document.getElementById('agregar-comercio-btn').classList.remove('is-hidden');
  }

  if (SOPORTE_CONTACTO_URL) {
    const soporteBtn = document.getElementById('soporte-btn');
    soporteBtn.href = SOPORTE_CONTACTO_URL;
    soporteBtn.classList.remove('is-hidden');
  }
  mostrarContenidoEstado();
}

export function renderBottomNavComercio(container, activo) {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    return;
  }
  const nav = crear('nav', 'bottom-nav');
  const items = [
    { key: 'panel', label: 'Panel', icon: ICONS.home, href: 'comercio-dashboard.html' },
    { key: 'productos', label: 'Productos', icon: ICONS.box, href: 'comercio-productos.html' },
    { key: 'pedidos', label: 'Pedidos', icon: ICONS.list, href: 'comercio-pedidos.html' },
    { key: 'perfil', label: 'Perfil', icon: ICONS.user, href: 'comercio-perfil.html' },
  ];
  let avatarPerfil = null;
  items.forEach((item) => {
    const link = document.createElement('a');
    link.className = 'bottom-nav__item';
    link.href = item.href;
    link.setAttribute('data-testid', `btn-nav-${item.key}`);
    if (item.key === activo) {
      link.setAttribute('aria-current', 'page');
    }
    if (item.key === 'perfil') {
      avatarPerfil = crear('div', 'bottom-nav__avatar');
      avatarPerfil.innerHTML = item.icon;
      link.appendChild(avatarPerfil);
    } else {
      link.innerHTML = item.icon;
    }
    const label = document.createElement('span');
    label.textContent = item.label;
    link.appendChild(label);
    nav.appendChild(link);
  });
  container.appendChild(nav);

  if (avatarPerfil) {
    const perfilLink = avatarPerfil.closest('a');
    perfilLink.classList.add('bottom-nav__item--selector');
    enlazarMantenerApretado(perfilLink, () => abrirPanelComercios());
    let firma = null;
    const pintar = () => {
      const activo = getComercioActivoEnMemoria();
      if (!activo) {
        return;
      }
      const firmaNueva = `${activo.id}|${activo.nombre}|${activo.fotoPerfilUrl || ''}`;
      if (firmaNueva === firma) {
        return;
      }
      firma = firmaNueva;
      pintarAvatarComercio(avatarPerfil, { nombre: activo.nombre, fotoPerfilUrl: activo.fotoPerfilUrl });
      avatarPerfil.querySelectorAll('img').forEach((img) => {
        img.draggable = false;
      });
    };
    pintar();
    suscribirComercios(pintar);
    resolverComercioActivo().then(pintar).catch(() => {
    });
  }
}

function pintarBadgeBell(bellLink) {
  bellLink.querySelectorAll('.top-bar__badge-dot').forEach((el) => el.remove());
  const contador = contarNotificacionesNoLeidasActivo();
  if (contador > 0) {
    const dot = crear('span', 'top-bar__badge-dot');
    dot.setAttribute('data-testid', 'contador-notificaciones');
    dot.textContent = contador > 9 ? '9+' : String(contador);
    bellLink.appendChild(dot);
  }
}

function renderHeaderDashboard(container) {
  container.innerHTML = '';
  const bar = crear('header', 'top-bar top-bar--logo-centrado');

  const brand = crear('div', 'top-bar__brand');
  const brandLogo = document.createElement('img');
  brandLogo.className = 'header-logo';
  brandLogo.src = 'assets/img/bajonea-logo-orange-header.png';
  brandLogo.alt = 'Bajoneá';
  brand.appendChild(brandLogo);
  bar.appendChild(brand);

  const bellLink = document.createElement('a');
  bellLink.href = 'notificaciones.html';
  bellLink.className = 'top-bar__action top-bar__action--bell';
  bellLink.setAttribute('data-testid', 'btn-notificaciones');
  bellLink.innerHTML = ICONS.bell;
  bar.appendChild(bellLink);
  pintarBadgeBell(bellLink);
  suscribirComercios(() => pintarBadgeBell(bellLink));

  container.appendChild(bar);
}

function renderMetricas(container, resumen) {
  container.innerHTML = '';
  container.className = 'stats-bar';

  const metricas = [
    { valor: formatearPrecio(resumen.totalFacturadoHoy), label: 'Facturado hoy' },
    { valor: String(resumen.cantidadPedidosHoy), label: 'Pedidos hoy' },
    { valor: String(resumen.cantidadPendientes), label: 'Pendientes' },
  ];

  metricas.forEach((metrica) => {
    const card = crear('div', 'stats-bar__col');
    const valor = crear('p', 'stats-bar__value');
    valor.textContent = metrica.valor;
    card.appendChild(valor);
    const label = crear('p', 'stats-bar__label');
    label.textContent = metrica.label;
    card.appendChild(label);
    container.appendChild(card);
  });
}

const ESTADO_BADGE_COMERCIO = {
  PENDIENTE_CONFIRMACION_COMERCIO: { label: 'Nuevo', dotClass: 'pedido-estado__dot--pendiente' },
  EN_PREPARACION: { label: 'En preparación', dotClass: 'pedido-estado__dot--positivo' },
  EN_CAMINO: { label: 'En camino', dotClass: 'pedido-estado__dot--positivo' },
  LISTO_PARA_RETIRAR: { label: 'Listo para retirar', dotClass: 'pedido-estado__dot--positivo' },
  ENTREGADO: { label: 'Entregado', dotClass: 'pedido-estado__dot--positivo' },
  RECHAZADO: { label: 'Rechazado', dotClass: 'pedido-estado__dot--rechazado' },
  ANULADO: { label: 'Anulado', dotClass: 'pedido-estado__dot--rechazado' },
  CANCELADO: { label: 'Cancelado', dotClass: 'pedido-estado__dot--rechazado' },
  CANCELADO_POR_SISTEMA: { label: 'Cancelado', dotClass: 'pedido-estado__dot--rechazado' },
  EXPIRADO: { label: 'Expirado', dotClass: 'pedido-estado__dot--rechazado' },
};

function renderPedidoActivoCard(pedido) {
  const card = document.createElement('a');
  card.className = 'pedido-card';
  card.href = `comercio-pedido-detalle.html?id=${pedido.id}`;
  card.setAttribute('data-testid', `pedido-item-${pedido.id}`);

  const top = crear('div', 'pedido-card__top');
  const info = document.createElement('div');
  const clienteEl = crear('p', 'pedido-card__comercio');
  clienteEl.setAttribute('data-testid', 'nombre-cliente-pedido');
  clienteEl.textContent = pedido.nombreCliente;
  info.appendChild(clienteEl);
  const cantidadProductos = pedido.detalles.reduce((total, detalle) => total + detalle.cantidad, 0);
  const fechaEl = crear('p', 'pedido-card__fecha');
  fechaEl.textContent = `Pedido #${pedido.id} · ${cantidadProductos} producto${cantidadProductos === 1 ? '' : 's'} · ${formatearFechaHoraCorta(pedido.fechaPagoAprobado)}`;
  info.appendChild(fechaEl);
  top.appendChild(info);

  const badgeInfo = ESTADO_BADGE_COMERCIO[pedido.estado];
  const badge = crear('span', 'pedido-estado');
  badge.setAttribute('data-testid', 'estado-pedido');
  const dot = crear('span', `pedido-estado__dot ${badgeInfo.dotClass}`);
  badge.appendChild(dot);
  const label = document.createElement('span');
  label.textContent = badgeInfo.label;
  badge.appendChild(label);
  top.appendChild(badge);
  card.appendChild(top);

  const bottom = crear('div', 'pedido-card__bottom');
  const total = crear('span', 'pedido-card__total');
  total.setAttribute('data-testid', 'total-pedido');
  total.textContent = formatearPrecio(pedido.total);
  bottom.appendChild(total);
  const verMas = crear('span', 'link');
  verMas.textContent = 'Ver pedido';
  bottom.appendChild(verMas);
  card.appendChild(bottom);

  return card;
}

const ESTADOS_ACTIVOS_DASHBOARD = ['PENDIENTE_CONFIRMACION_COMERCIO', 'EN_PREPARACION', 'EN_CAMINO', 'LISTO_PARA_RETIRAR'];

function renderPedidosActivos(listContainer, badgeContainer, pedidos) {
  const activos = pedidos
    .filter((pedido) => ESTADOS_ACTIVOS_DASHBOARD.includes(pedido.estado))
    .sort((a, b) => new Date(a.fechaPagoAprobado) - new Date(b.fechaPagoAprobado));

  const nuevos = activos.filter((pedido) => pedido.estado === 'PENDIENTE_CONFIRMACION_COMERCIO').length;
  badgeContainer.innerHTML = '';
  if (nuevos > 0) {
    const badge = crear('span', 'status-badge status-badge--nueva');
    badge.textContent = `${nuevos} nuevo${nuevos === 1 ? '' : 's'}`;
    badgeContainer.appendChild(badge);
  }

  listContainer.innerHTML = '';
  if (activos.length === 0) {
    const empty = crear('p', 'field__hint');
    empty.style.padding = '4px 0 8px';
    empty.textContent = 'No tenés pedidos activos en este momento.';
    listContainer.appendChild(empty);
    return;
  }

  const list = crear('div', 'pedido-list');
  list.style.padding = '4px 0 0';
  activos.forEach((pedido) => list.appendChild(renderPedidoActivoCard(pedido)));
  listContainer.appendChild(list);
}

export async function initComercioDashboard() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return;
  }
  renderHeaderDashboard(document.getElementById('top-bar-slot'));
  renderBottomNavComercio(document.getElementById('bottom-nav-slot'), 'panel');
  const activo = await prepararPaginaDueno({ slotFranja: document.getElementById('franja-comercio-slot') });
  if (!activo) {
    return;
  }
  const comercio = await apiFetch('/comercios/perfil');
  normalizarComercio(comercio);

  const { abierto, resumenHoy } = estadoHorario(comercio.horarios);
  renderEstadoBanner(
    document.getElementById('banner-estado-slot'),
    abierto,
    abierto ? `Tu comercio está abierto ahora. ${resumenHoy}` : 'Tu comercio está cerrado en este momento',
  );

  const nombreCorto = comercio.nombre;
  document.getElementById('saludo-titulo').textContent = `Hola, ${nombreCorto} 👋`;
  document.getElementById('saludo-fecha').textContent = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  async function cargarResumenYPedidos() {
    const [resumen, pedidos] = await Promise.all([
      apiFetch('/pedidos/comercio/resumen-hoy'),
      apiFetch('/pedidos/comercio'),
    ]);
    pedidos.forEach(normalizarPedido);
    renderMetricas(document.getElementById('metrics-row'), resumen);
    renderPedidosActivos(document.getElementById('pedidos-activos-list'), document.getElementById('badge-pedidos-activos'), pedidos);
  }

  await cargarResumenYPedidos();

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      cargarResumenYPedidos();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      cargarResumenYPedidos();
    }
  });
}

const FILTROS_PEDIDOS = [
  { key: null, label: 'Todos' },
  { key: 'PENDIENTE_CONFIRMACION_COMERCIO', label: 'Pendientes' },
  { key: 'EN_PREPARACION', label: 'En preparación' },
  { key: 'EN_CAMINO', label: 'En camino' },
  { key: 'LISTO_PARA_RETIRAR', label: 'Listo para retirar' },
  { key: 'RECHAZADO', label: 'Rechazados' },
];

const PRIORIDAD_ESTADO_PEDIDO = {
  PENDIENTE_CONFIRMACION_COMERCIO: 0,
  EN_PREPARACION: 1,
  EN_CAMINO: 2,
  LISTO_PARA_RETIRAR: 2,
  RECHAZADO: 3,
  ANULADO: 3,
  ENTREGADO: 4,
  CANCELADO: 4,
  CANCELADO_POR_SISTEMA: 4,
  EXPIRADO: 4,
  PENDIENTE_PAGO: 5,
};

export async function initComercioPedidos() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Pedidos' });
  renderBottomNavComercio(document.getElementById('bottom-nav-slot'), 'pedidos');
  if (!(await prepararPaginaDueno({ slotFranja: document.getElementById('franja-comercio-slot') }))) {
    return;
  }

  const pedidos = await apiFetch('/pedidos/comercio');
  pedidos.forEach(normalizarPedido);

  let filtroEstado = null;

  const filtrosSlot = document.getElementById('filtros-slot');
  const chipRow = crear('div', 'chip-row');
  FILTROS_PEDIDOS.forEach((filtro) => {
    const chip = crear('button', 'chip');
    chip.type = 'button';
    chip.textContent = filtro.label;
    chip.setAttribute('data-testid', `chip-filtro-${(filtro.key || 'todos').toLowerCase()}`);
    chip.setAttribute('aria-pressed', String(filtroEstado === filtro.key));
    chip.addEventListener('click', () => {
      filtroEstado = filtro.key;
      chipRow.querySelectorAll('.chip').forEach((otro) => otro.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      renderLista();
    });
    chipRow.appendChild(chip);
  });
  filtrosSlot.appendChild(chipRow);

  const contentEl = document.getElementById('pedidos-content');

  function renderLista() {
    contentEl.innerHTML = '';
    const filtrados = pedidos
      .filter((pedido) => filtroEstado === null || pedido.estado === filtroEstado)
      .sort((a, b) => {
        const diferenciaPrioridad = PRIORIDAD_ESTADO_PEDIDO[a.estado] - PRIORIDAD_ESTADO_PEDIDO[b.estado];
        return diferenciaPrioridad !== 0 ? diferenciaPrioridad : new Date(b.fechaPagoAprobado) - new Date(a.fechaPagoAprobado);
      });

    if (filtrados.length === 0) {
      const empty = crear('p', 'field__hint');
      empty.style.padding = '24px 0';
      empty.style.textAlign = 'center';
      empty.textContent = pedidos.length === 0
        ? 'Todavía no recibiste ningún pedido.'
        : 'No hay pedidos con este filtro.';
      contentEl.appendChild(empty);
      return;
    }

    const list = crear('div', 'pedido-list');
    filtrados.forEach((pedido) => list.appendChild(renderPedidoActivoCard(pedido)));
    contentEl.appendChild(list);
  }

  renderLista();
}

const ESTADO_DETALLE_COMERCIO = {
  PENDIENTE_CONFIRMACION_COMERCIO: {
    label: 'Pendiente',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.clock,
    texto: 'Este pedido está esperando tu confirmación.',
  },
  EN_PREPARACION: {
    label: 'En preparación',
    iconClass: 'pedido-detail__icon--preparacion',
    icon: ICONS.flame,
    texto: 'Aceptaste este pedido. Lo tenés en preparación.',
  },
  EN_CAMINO: {
    label: 'En camino',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.truck,
    texto: 'Despachaste este pedido. Está en camino al cliente.',
  },
  LISTO_PARA_RETIRAR: {
    label: 'Listo para retirar',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.bag,
    texto: 'Este pedido está listo, esperando que el cliente lo retire.',
  },
  ENTREGADO: {
    label: 'Entregado',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.check,
    texto: 'Este pedido fue entregado.',
  },
  RECHAZADO: {
    label: 'Rechazado',
    iconClass: 'pedido-detail__icon--rechazado',
    icon: ICONS.xCircle,
    texto: 'Rechazaste este pedido.',
  },
  ANULADO: {
    label: 'Anulado',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.xCircle,
    texto: 'Anulaste este pedido.',
  },
  CANCELADO: {
    label: 'Cancelado',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.xCircle,
    texto: 'El cliente canceló este pedido.',
  },
  CANCELADO_POR_SISTEMA: {
    label: 'Cancelado',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.xCircle,
    texto: 'Este pedido se canceló automáticamente.',
  },
  EXPIRADO: {
    label: 'Expirado',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.clock,
    texto: 'Este pedido expiró por falta de respuesta a tiempo.',
  },
};

function mostrarModalRechazarPedido(pedido, onConfirmar) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-rechazar-pedido');
  const opcionesHtml = MOTIVOS_RECHAZO.map((motivo) => `<option value="${motivo.value}">${motivo.label}</option>`).join('');
  backdrop.innerHTML = `
    <div class="product-modal-sheet">
      <div class="product-modal-sheet__handle"><span></span></div>
      <div class="product-modal-sheet__body">
        <h2 style="font-size:19px;margin-bottom:16px;">Rechazar pedido #${pedido.id}</h2>
        <form class="form" id="form-rechazar-pedido" novalidate>
          <div class="field">
            <label class="field__label" for="rechazo-motivo">Motivo del rechazo</label>
            <div class="select-shell">
              <select id="rechazo-motivo" required data-testid="select-motivo-rechazo">
                <option value="" disabled selected>Seleccioná un motivo</option>
                ${opcionesHtml}
              </select>
              <svg class="select-shell__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="field__error" id="rechazo-error-motivo" style="display:none;" data-testid="mensaje-error-motivo-rechazo"></div>
          </div>
          <div class="field">
            <label class="field__label" for="rechazo-comentario" id="rechazo-comentario-label">Comentario (opcional)</label>
            <div class="textarea-shell" id="rechazo-comentario-shell"><textarea id="rechazo-comentario" maxlength="500" placeholder="Agregá una aclaración para el cliente" data-testid="input-comentario-rechazo"></textarea></div>
            <div class="field__error" id="rechazo-error-comentario" style="display:none;" data-testid="mensaje-error-comentario-rechazo"></div>
          </div>
          <button class="btn btn-primary" type="submit" style="background:var(--color-error);margin-bottom:10px;" data-testid="btn-confirmar-rechazo">Rechazar pedido</button>
          <button class="btn btn-tertiary" type="button" id="cancelar-rechazo-btn" data-testid="btn-cancelar-rechazo">Cancelar</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const form = backdrop.querySelector('#form-rechazar-pedido');
  const selectMotivo = form.querySelector('#rechazo-motivo');
  const comentarioLabel = form.querySelector('#rechazo-comentario-label');
  const comentarioShell = form.querySelector('#rechazo-comentario-shell');
  const comentarioTextarea = form.querySelector('#rechazo-comentario');

  function limpiarErrorComentario() {
    comentarioShell.classList.remove('textarea-shell--error');
    limpiarErrorCampo('rechazo-error-comentario');
  }

  selectMotivo.addEventListener('change', () => {
    comentarioLabel.textContent = selectMotivo.value === 'OTRO' ? 'Comentario' : 'Comentario (opcional)';
    limpiarErrorComentario();
  });
  comentarioTextarea.addEventListener('input', limpiarErrorComentario);

  backdrop.querySelector('#cancelar-rechazo-btn').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const motivo = selectMotivo.value;
    if (!motivo) {
      mostrarErrorCampo('rechazo-error-motivo', 'Seleccioná un motivo de rechazo.');
      return;
    }
    limpiarErrorCampo('rechazo-error-motivo');
    const comentario = comentarioTextarea.value.trim();
    if (motivo === 'OTRO' && !comentario) {
      comentarioShell.classList.add('textarea-shell--error');
      mostrarErrorCampo('rechazo-error-comentario', 'Ingresá un comentario para especificar el motivo del rechazo.');
      return;
    }
    limpiarErrorComentario();
    backdrop.remove();
    onConfirmar({ motivo, comentario });
  });
}

function renderAccionesPendiente(container, pedido, onActualizado) {
  container.innerHTML = '';

  const aceptarBtn = crear('button', 'btn btn-primary');
  aceptarBtn.type = 'button';
  aceptarBtn.style.marginBottom = '10px';
  aceptarBtn.setAttribute('data-testid', 'btn-aceptar-pedido');
  aceptarBtn.textContent = 'Aceptar pedido';
  aceptarBtn.addEventListener('click', async () => {
    setLoading(aceptarBtn, 'Aceptando...', true);
    try {
      const actualizado = await apiFetch(`/pedidos/comercio/${pedido.id}/aceptar`, { method: 'PUT' });
      normalizarPedido(actualizado);
      showToast('Pedido aceptado');
      onActualizado(actualizado);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'No pudimos aceptar el pedido', 'error');
      setLoading(aceptarBtn, '', false, 'Aceptar pedido');
    }
  });
  container.appendChild(aceptarBtn);

  const rechazarBtn = crear('button', 'btn btn-secondary');
  rechazarBtn.type = 'button';
  rechazarBtn.style.borderColor = 'var(--color-error)';
  rechazarBtn.style.color = 'var(--color-error)';
  rechazarBtn.setAttribute('data-testid', 'btn-rechazar-pedido');
  rechazarBtn.textContent = 'Rechazar pedido';
  rechazarBtn.addEventListener('click', () => {
    mostrarModalRechazarPedido(pedido, async ({ motivo, comentario }) => {
      try {
        const actualizado = await apiFetch(`/pedidos/comercio/${pedido.id}/rechazar`, {
          method: 'PUT',
          body: { motivo, comentario: comentario || null },
        });
        normalizarPedido(actualizado);
        showToast('Pedido rechazado');
        onActualizado(actualizado);
      } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'No pudimos rechazar el pedido', 'error');
      }
    });
  });
  container.appendChild(rechazarBtn);
}

function mostrarModalAnularPedido(pedido, onConfirmar) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-anular-pedido');
  backdrop.innerHTML = `
    <div class="product-modal-sheet">
      <div class="product-modal-sheet__handle"><span></span></div>
      <div class="product-modal-sheet__body">
        <h2 style="font-size:19px;margin-bottom:16px;">Anular pedido #${pedido.id}</h2>
        <form class="form" id="form-anular-pedido" novalidate>
          <div class="field">
            <label class="field__label" for="anulacion-motivo">Motivo de la anulación</label>
            <div class="textarea-shell" id="anulacion-motivo-shell"><textarea id="anulacion-motivo" maxlength="500" placeholder="Contale al cliente por qué se anula el pedido" data-testid="input-motivo-anulacion"></textarea></div>
            <div class="field__error" id="anulacion-error-motivo" style="display:none;" data-testid="mensaje-error-motivo-anulacion"></div>
          </div>
          <button class="btn btn-primary" type="submit" style="background:var(--color-error);margin-bottom:10px;" data-testid="btn-confirmar-anulacion">Anular pedido</button>
          <button class="btn btn-tertiary" type="button" id="cancelar-anulacion-btn" data-testid="btn-cancelar-anulacion">Cancelar</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const form = backdrop.querySelector('#form-anular-pedido');
  const motivoShell = form.querySelector('#anulacion-motivo-shell');
  const motivoTextarea = form.querySelector('#anulacion-motivo');

  motivoTextarea.addEventListener('input', () => {
    motivoShell.classList.remove('textarea-shell--error');
    limpiarErrorCampo('anulacion-error-motivo');
  });

  backdrop.querySelector('#cancelar-anulacion-btn').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const motivo = motivoTextarea.value.trim();
    if (!motivo) {
      motivoShell.classList.add('textarea-shell--error');
      mostrarErrorCampo('anulacion-error-motivo', 'Ingresá el motivo de la anulación.');
      return;
    }
    backdrop.remove();
    onConfirmar({ motivo });
  });
}

function renderAccionesEnPreparacion(container, pedido, onActualizado) {
  container.innerHTML = '';

  const despacharBtn = crear('button', 'btn btn-primary');
  despacharBtn.type = 'button';
  despacharBtn.style.marginBottom = '10px';
  despacharBtn.setAttribute('data-testid', 'btn-despachar-pedido');
  despacharBtn.textContent = pedido.tipoEntrega === 'DOMICILIO' ? 'Marcar como despachado' : 'Marcar como listo para retirar';
  despacharBtn.addEventListener('click', async () => {
    setLoading(despacharBtn, 'Actualizando...', true);
    try {
      const actualizado = await apiFetch(`/pedidos/comercio/${pedido.id}/despachar`, { method: 'PUT' });
      normalizarPedido(actualizado);
      showToast('Pedido actualizado');
      onActualizado(actualizado);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'No pudimos actualizar el pedido', 'error');
      setLoading(despacharBtn, '', false, pedido.tipoEntrega === 'DOMICILIO' ? 'Marcar como despachado' : 'Marcar como listo para retirar');
    }
  });
  container.appendChild(despacharBtn);

  const anularBtn = crear('button', 'btn btn-secondary');
  anularBtn.type = 'button';
  anularBtn.style.borderColor = 'var(--color-error)';
  anularBtn.style.color = 'var(--color-error)';
  anularBtn.setAttribute('data-testid', 'btn-anular-pedido');
  anularBtn.textContent = 'Anular pedido';
  anularBtn.addEventListener('click', () => {
    mostrarModalAnularPedido(pedido, async ({ motivo }) => {
      try {
        const actualizado = await apiFetch(`/pedidos/comercio/${pedido.id}/anular`, { method: 'PUT', body: { motivo } });
        normalizarPedido(actualizado);
        showToast('Pedido anulado');
        onActualizado(actualizado);
      } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'No pudimos anular el pedido', 'error');
      }
    });
  });
  container.appendChild(anularBtn);
}

function renderAccionesListoParaRetirar(container, pedido, onActualizado) {
  container.innerHTML = '';

  const entregarBtn = crear('button', 'btn btn-primary');
  entregarBtn.type = 'button';
  entregarBtn.setAttribute('data-testid', 'btn-confirmar-retiro');
  entregarBtn.textContent = 'Confirmar retiro';
  entregarBtn.addEventListener('click', async () => {
    setLoading(entregarBtn, 'Confirmando...', true);
    try {
      const actualizado = await apiFetch(`/pedidos/comercio/${pedido.id}/entregar`, { method: 'PUT' });
      normalizarPedido(actualizado);
      showToast('Retiro confirmado');
      onActualizado(actualizado);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'No pudimos confirmar el retiro', 'error');
      setLoading(entregarBtn, '', false, 'Confirmar retiro');
    }
  });
  container.appendChild(entregarBtn);
}

function renderPedidoDetalleComercio(container, pedido, onActualizado) {
  const info = ESTADO_DETALLE_COMERCIO[pedido.estado];

  let motivoInfo = null;
  if (pedido.estado === 'RECHAZADO' && pedido.motivoRechazo) {
    motivoInfo = { motivoLabel: MOTIVO_RECHAZO_LABEL[pedido.motivoRechazo] || pedido.motivoRechazo, comentario: pedido.comentarioRechazo };
  } else if (pedido.estado === 'ANULADO' && pedido.motivoAnulacion) {
    motivoInfo = { motivoLabel: pedido.motivoAnulacion, comentario: null };
  }

  renderPedidoEstadoHeader(container, {
    iconClass: info.iconClass,
    icono: info.icon,
    label: info.label,
    texto: info.texto,
    numeroTexto: `Pedido #${pedido.id} · ${formatearFecha(pedido.fechaPagoAprobado)}`,
    motivoRechazo: motivoInfo,
  });

  const body = crear('div', 'screen-body screen-body--tight');

  const clienteCard = crear('div', 'summary-card');
  const clienteIcon = crear('div', 'summary-card__icon');
  clienteIcon.innerHTML = ICONS.user;
  clienteCard.appendChild(clienteIcon);
  const clienteBody = crear('div', 'summary-card__body');
  const clienteTitulo = document.createElement('h3');
  clienteTitulo.setAttribute('data-testid', 'nombre-cliente-pedido');
  clienteTitulo.textContent = pedido.nombreCliente;
  clienteBody.appendChild(clienteTitulo);
  const clienteTexto = document.createElement('p');
  clienteTexto.textContent = 'Cliente';
  clienteBody.appendChild(clienteTexto);
  clienteCard.appendChild(clienteBody);
  body.appendChild(clienteCard);

  const modalidadCard = crear('div', 'summary-card');
  modalidadCard.style.marginTop = '12px';
  const modalidadIcon = crear('div', 'summary-card__icon');
  modalidadIcon.innerHTML = pedido.tipoEntrega === 'DOMICILIO' ? ICONS.truck : ICONS.bag;
  modalidadCard.appendChild(modalidadIcon);
  const modalidadBody = crear('div', 'summary-card__body');
  const modalidadTitulo = document.createElement('h3');
  modalidadTitulo.textContent = pedido.tipoEntrega === 'DOMICILIO' ? 'Envío a domicilio' : 'Retiro en el local';
  modalidadBody.appendChild(modalidadTitulo);
  const modalidadTexto = document.createElement('p');
  modalidadTexto.textContent = pedido.tipoEntrega === 'DOMICILIO' && pedido.direccion
    ? formatearDireccion(pedido.direccion)
    : 'El cliente retira el pedido en tu local.';
  modalidadBody.appendChild(modalidadTexto);
  modalidadCard.appendChild(modalidadBody);
  body.appendChild(modalidadCard);

  const desglose = crear('div', 'section-heading');
  desglose.style.marginTop = '20px';
  desglose.textContent = 'Desglose del pedido';
  body.appendChild(desglose);

  pedido.detalles.forEach((detalle) => {
    const line = crear('div', 'order-line');
    const label = document.createElement('span');
    label.textContent = `${detalle.cantidad}x ${detalle.nombreProducto}`;
    line.appendChild(label);
    const value = document.createElement('span');
    value.textContent = formatearPrecio(detalle.subtotal);
    line.appendChild(value);
    body.appendChild(line);
    if (detalle.nota) {
      const nota = crear('p', 'field__hint');
      nota.style.marginTop = '-4px';
      nota.style.marginBottom = '6px';
      nota.textContent = `Nota: "${detalle.nota}"`;
      body.appendChild(nota);
    }
  });

  const cargoLine = crear('div', 'order-line');
  const cargoLabel = document.createElement('span');
  cargoLabel.textContent = 'Cargo por servicio (1%)';
  cargoLine.appendChild(cargoLabel);
  const cargoValue = document.createElement('span');
  cargoValue.textContent = `-${formatearPrecio(pedido.cargoServicioComercio)}`;
  cargoLine.appendChild(cargoValue);
  body.appendChild(cargoLine);

  const totalLine = crear('div', 'order-line order-line--total');
  const totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total';
  totalLine.appendChild(totalLabel);
  const totalValue = document.createElement('span');
  totalValue.textContent = formatearPrecio(pedido.subtotal - pedido.cargoServicioComercio);
  totalLine.appendChild(totalValue);
  body.appendChild(totalLine);

  if (pedido.estado === 'PENDIENTE_CONFIRMACION_COMERCIO' || pedido.estado === 'EN_PREPARACION' || pedido.estado === 'LISTO_PARA_RETIRAR') {
    const accionesSlot = crear('div');
    accionesSlot.style.marginTop = '24px';
    body.appendChild(accionesSlot);
    if (pedido.estado === 'PENDIENTE_CONFIRMACION_COMERCIO') {
      renderAccionesPendiente(accionesSlot, pedido, onActualizado);
    } else if (pedido.estado === 'EN_PREPARACION') {
      renderAccionesEnPreparacion(accionesSlot, pedido, onActualizado);
    } else {
      renderAccionesListoParaRetirar(accionesSlot, pedido, onActualizado);
    }
  }

  container.appendChild(body);
}

function renderPedidoNoEncontrado(container) {
  container.innerHTML = '';
  const wrapper = crear('div', 'state-page');
  const icon = crear('div', 'state-page__icon');
  icon.innerHTML = ICONS.alert;
  wrapper.appendChild(icon);
  const h1 = document.createElement('h1');
  h1.className = 'state-page__title';
  h1.textContent = 'No encontramos este pedido';
  wrapper.appendChild(h1);
  const p = document.createElement('p');
  p.className = 'state-page__text';
  p.textContent = 'El pedido que buscás no existe o no pertenece a tu comercio.';
  wrapper.appendChild(p);
  const actions = crear('div', 'state-page__actions');
  const cta = document.createElement('a');
  cta.className = 'btn btn-primary';
  cta.href = 'comercio-pedidos.html';
  cta.setAttribute('data-testid', 'btn-ver-mis-pedidos');
  cta.textContent = 'Ver mis pedidos';
  actions.appendChild(cta);
  wrapper.appendChild(actions);
  container.appendChild(wrapper);
}

export async function initComercioPedidoDetalle() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Pedido' });
  if (!(await prepararPaginaDueno())) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const pedidoId = Number(params.get('id'));
  const container = document.getElementById('detalle-content');

  if (!pedidoId) {
    renderPedidoNoEncontrado(container);
    return;
  }

  const pedidos = await apiFetch('/pedidos/comercio');
  pedidos.forEach(normalizarPedido);
  let pedido = pedidos.find((p) => p.id === pedidoId);

  if (!pedido) {
    renderPedidoNoEncontrado(container);
    return;
  }

  function renderActual() {
    renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: `Pedido #${pedido.id}` });
    renderPedidoDetalleComercio(container, pedido, (actualizado) => {
      pedido = actualizado;
      renderActual();
    });
  }

  renderActual();
}

function mostrarVista(id) {
  document.querySelectorAll('.perfil-view').forEach((view) => {
    view.classList.toggle('is-hidden', view.id !== id);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostrarModalConfirmarLogout() {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-confirmar-logout');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet__icon">${ICONS.logoutIcon}</div>
      <h2 class="modal-sheet__title">¿Cerrar sesión?</h2>
      <p class="modal-sheet__text">Podés volver a ingresar en cualquier momento.</p>
      <button class="btn btn-primary" type="button" id="confirmar-logout-btn" style="margin-bottom:12px;" data-testid="btn-confirmar-logout">Sí, cerrar sesión</button>
      <button class="btn btn-tertiary" type="button" id="cancelar-logout-btn" data-testid="btn-cancelar-logout">Cancelar</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('cancelar-logout-btn').addEventListener('click', () => backdrop.remove());
  document.getElementById('confirmar-logout-btn').addEventListener('click', () => logout());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

const TEXTO_PEDIDOS_EN_CURSO = {
  PENDIENTE_CONFIRMACION_COMERCIO: { singular: 'esperando tu confirmación', plural: 'esperando tu confirmación' },
  EN_PREPARACION: { singular: ESTADO_BADGE_COMERCIO.EN_PREPARACION.label.toLowerCase(), plural: ESTADO_BADGE_COMERCIO.EN_PREPARACION.label.toLowerCase() },
  EN_CAMINO: { singular: ESTADO_BADGE_COMERCIO.EN_CAMINO.label.toLowerCase(), plural: ESTADO_BADGE_COMERCIO.EN_CAMINO.label.toLowerCase() },
  LISTO_PARA_RETIRAR: { singular: ESTADO_BADGE_COMERCIO.LISTO_PARA_RETIRAR.label.toLowerCase(), plural: 'listos para retirar' },
};

const MENSAJES_VINCULACION_MP = {
  exito: { texto: 'Tu cuenta de Mercado Pago quedó vinculada', tipo: 'success' },
  error: { texto: 'No pudimos vincular tu cuenta de Mercado Pago. Probá de nuevo.', tipo: 'error' },
  'cuenta-en-uso': { texto: 'Esa cuenta de Mercado Pago ya está en uso por otro Dueño. Usá otra cuenta, o pedí que la desvinculen primero.', tipo: 'error' },
  'cuenta-ya-vinculada': { texto: 'Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra.', tipo: 'error' },
};

function lineasPedidosEnCurso(comercios) {
  return comercios
    .map((comercio) => {
      const partes = comercio.pedidosEnCurso
        .filter((pedidos) => pedidos.cantidad > 0 && TEXTO_PEDIDOS_EN_CURSO[pedidos.estado])
        .map((pedidos) => {
          const textos = TEXTO_PEDIDOS_EN_CURSO[pedidos.estado];
          return `${pedidos.cantidad} ${pedidos.cantidad === 1 ? textos.singular : textos.plural}`;
        });
      return partes.length > 0 ? `${comercio.nombre}: ${partes.join(', ')}` : null;
    })
    .filter(Boolean);
}

function textoBloqueoPagosPendientes(previa) {
  const cantidad = previa.pagosPendientes.cantidadTotal;
  const detalle = previa.comercios
    .filter((comercio) => comercio.cantidadPagosPendientes > 0)
    .map((comercio) => `${comercio.nombre}: ${comercio.cantidadPagosPendientes}`)
    .join(', ');
  const sujeto = cantidad === 1 ? '1 cliente pagando un pedido' : `${cantidad} clientes pagando un pedido`;
  const consecuencia = cantidad === 1 ? 'ese pago no se podría confirmar' : 'esos pagos no se podrían confirmar';
  return `Hay ${sujeto} en Mercado Pago (${detalle}). Si desvinculás ahora, ${consecuencia}.`;
}

function textoPieBloqueo(previa) {
  const hora = /T(\d{2}:\d{2})/.exec(previa.pagosPendientes.puedeReintentarDesde || '');
  const vencimiento = 'Un pedido sin pagar vence a los 30 minutos.';
  return hora ? `Probá de nuevo alrededor de las ${hora[1]}. ${vencimiento}` : vencimiento;
}

function crearIconoModalMp() {
  const icono = crear('div', 'modal-sheet__icon');
  icono.innerHTML = ICONS.alert;
  return icono;
}

function crearParrafoMp(className, texto, testid) {
  const parrafo = crear('p', className);
  parrafo.textContent = texto;
  if (testid) {
    parrafo.setAttribute('data-testid', testid);
  }
  return parrafo;
}

function crearTituloModalMp(texto) {
  const titulo = crear('h2', 'modal-sheet__title');
  titulo.textContent = texto;
  titulo.setAttribute('data-testid', 'titulo-desvincular-mp');
  return titulo;
}

function crearBotonMp(className, texto, testid) {
  const boton = crear('button', className);
  boton.type = 'button';
  boton.textContent = texto;
  boton.setAttribute('data-testid', testid);
  return boton;
}

function abrirModalDesvincularMp({ alTerminar }) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-desvincular-mp');
  const hoja = crear('div', 'modal-sheet');
  backdrop.appendChild(hoja);
  document.body.appendChild(backdrop);
  let ocupado = false;

  function cerrar() {
    backdrop.remove();
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop && !ocupado) {
      cerrar();
    }
  });

  function mostrarCargando() {
    const esqueleto = crear('div', 'desvincular-mp__esqueleto');
    esqueleto.setAttribute('aria-busy', 'true');
    esqueleto.setAttribute('data-testid', 'esqueleto-desvincular-mp');
    esqueleto.appendChild(crear('div', 'skeleton mp-esqueleto-linea'));
    esqueleto.appendChild(crear('div', 'skeleton mp-esqueleto-linea'));
    esqueleto.appendChild(crear('div', 'skeleton mp-esqueleto-linea mp-esqueleto-linea--corta'));
    hoja.replaceChildren(esqueleto);
  }

  function mostrarBloqueo(previa) {
    const entendido = crearBotonMp('btn btn-primary', 'Entendido', 'btn-entendido-desvincular-mp');
    entendido.addEventListener('click', cerrar);
    hoja.replaceChildren(
      crearIconoModalMp(),
      crearTituloModalMp('Todavía no se puede desvincular'),
      crearParrafoMp('modal-sheet__text desvincular-mp__texto-bloqueo', textoBloqueoPagosPendientes(previa), 'texto-bloqueo-desvincular-mp'),
      crearParrafoMp('desvincular-mp__pie', textoPieBloqueo(previa), 'pie-bloqueo-desvincular-mp'),
      entendido,
    );
  }

  function crearBloquePedidosEnCurso(previa) {
    const lineas = lineasPedidosEnCurso(previa.comercios);
    const bloque = crear('div', 'desvincular-mp__bloque');
    if (lineas.length === 0) {
      bloque.textContent = 'No tenés pedidos en curso';
      bloque.setAttribute('data-testid', 'sin-pedidos-en-curso-desvincular-mp');
      return bloque;
    }
    bloque.setAttribute('data-testid', 'bloque-pedidos-en-curso-desvincular-mp');
    const titulo = crear('p', 'desvincular-mp__bloque-titulo');
    titulo.textContent = 'Pedidos en curso, siguen su camino';
    const lista = crear('ul', 'desvincular-mp__lista');
    lineas.forEach((linea) => {
      const item = crear('li');
      item.textContent = linea;
      item.setAttribute('data-testid', 'linea-pedidos-en-curso-desvincular-mp');
      lista.appendChild(item);
    });
    bloque.appendChild(titulo);
    bloque.appendChild(lista);
    return bloque;
  }

  function mostrarConfirmacion(previa) {
    const desvincular = crearBotonMp('btn btn-primary desvincular-mp__confirmar', 'Desvincular', 'btn-confirmar-desvincular-mp');
    const cancelar = crearBotonMp('btn btn-tertiary', 'Cancelar', 'btn-cancelar-desvincular-mp');
    cancelar.addEventListener('click', cerrar);
    desvincular.addEventListener('click', () => confirmar(desvincular, cancelar));
    hoja.replaceChildren(
      crearIconoModalMp(),
      crearTituloModalMp('¿Desvincular Mercado Pago?'),
      crearParrafoMp('modal-sheet__text', 'Tus comercios dejarán de recibir pedidos nuevos y saldrán del catálogo hasta que vuelvas a vincular una cuenta.', 'texto-desvincular-mp'),
      crearBloquePedidosEnCurso(previa),
      crearParrafoMp('desvincular-mp__nota', 'Si hay que devolver el dinero de alguno de estos pedidos, lo gestiona el equipo de Bajoneá de forma manual.', 'nota-desvincular-mp'),
      desvincular,
      cancelar,
    );
  }

  function resolverPrevia(previa) {
    if (previa.puedeDesvincular) {
      mostrarConfirmacion(previa);
    } else {
      mostrarBloqueo(previa);
    }
  }

  async function terminarConAviso(mensaje, tipo) {
    cerrar();
    showToast(mensaje, tipo);
    await alTerminar();
  }

  async function confirmar(desvincular, cancelar) {
    if (ocupado) {
      return;
    }
    ocupado = true;
    desvincular.disabled = true;
    cancelar.disabled = true;
    try {
      const { mensaje } = await apiFetch('/oauth/mercadopago/desvincular', { method: 'DELETE', conMensaje: true });
      await terminarConAviso(mensaje, 'success');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : null;
      if (status === 409) {
        try {
          const previaNueva = await apiFetch('/oauth/mercadopago/desvinculacion/previa');
          ocupado = false;
          resolverPrevia(previaNueva);
        } catch (errorPrevia) {
          await terminarConAviso(errorPrevia instanceof ApiError ? errorPrevia.message : error.message, 'error');
        }
        return;
      }
      await terminarConAviso(error instanceof ApiError ? error.message : 'No pudimos desvincular la cuenta', 'error');
    }
  }

  async function cargar() {
    mostrarCargando();
    try {
      resolverPrevia(await apiFetch('/oauth/mercadopago/desvinculacion/previa'));
    } catch (error) {
      const esNoEncontrada = error instanceof ApiError && error.status === 404;
      cerrar();
      showToast(error instanceof ApiError ? error.message : 'No pudimos verificar tu cuenta de Mercado Pago', 'error');
      if (esNoEncontrada) {
        await alTerminar();
      }
    }
  }

  return cargar();
}

function pintarComerciosOperativos(lista) {
  lista.replaceChildren();
  (getComerciosEnMemoria() || [])
    .filter((comercio) => comercio.operativo)
    .forEach((comercio) => {
      const item = crear('li');
      item.textContent = comercio.nombre;
      item.setAttribute('data-testid', 'mp-comercio-operativo');
      lista.appendChild(item);
    });
}

async function cargarEstadoMercadoPago() {
  const cargandoBox = document.getElementById('mp-estado-cargando');
  const pendienteBox = document.getElementById('mp-estado-pendiente');
  const vinculadoBox = document.getElementById('mp-estado-vinculado');
  cargandoBox.classList.remove('is-hidden');
  pendienteBox.classList.add('is-hidden');
  vinculadoBox.classList.add('is-hidden');
  try {
    const estado = await apiFetch('/oauth/mercadopago/cuenta');
    if (estado.vinculada) {
      document.getElementById('mp-cuenta-usuario').textContent = `Cuenta de Mercado Pago vinculada: ${estado.mpUserId}`;
      document.getElementById('mp-cuenta-fecha').textContent = `Vinculada el ${formatearFecha(estado.fechaVinculacion)}`;
      pintarComerciosOperativos(document.getElementById('mp-lista-comercios-vinculada'));
      vinculadoBox.classList.remove('is-hidden');
    } else {
      pintarComerciosOperativos(document.getElementById('mp-lista-comercios-sin-vincular'));
      pendienteBox.classList.remove('is-hidden');
    }
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : 'No pudimos obtener el estado de Mercado Pago', 'error');
  } finally {
    cargandoBox.classList.add('is-hidden');
  }
}

async function actualizarCuentaMercadoPago() {
  await Promise.allSettled([cargarEstadoMercadoPago(), refrescarComercios()]);
}

function limpiarParametrosMercadoPago() {
  const parametros = new URLSearchParams(window.location.search);
  parametros.delete('vinculacionMp');
  parametros.delete('vista');
  const resto = parametros.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${resto ? `?${resto}` : ''}`);
}

function mostrarModalFotoPerfilComercio({ onEditar }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-testid', 'modal-foto-perfil-comercio');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-sheet__title">Foto de perfil</h2>
      <div class="profile-link-list" style="width:100%;margin-bottom:12px;">
        <button class="profile-link" type="button" id="modal-editar-foto-btn" data-testid="btn-editar-foto-perfil-comercio">
          ${ICONS.edit}
          <span>Editar foto</span>
        </button>
      </div>
      <button class="btn btn-tertiary" type="button" id="modal-cancelar-foto-btn" style="width:100%;" data-testid="btn-cancelar-foto-perfil-comercio">Cancelar</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('modal-editar-foto-btn').addEventListener('click', () => {
    backdrop.remove();
    onEditar();
  });
  document.getElementById('modal-cancelar-foto-btn').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

export async function initComercioPerfil() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarPerfil: false, mostrarCampana: false, centrarLogo: true });
  renderBottomNavComercio(document.getElementById('bottom-nav-slot'), 'perfil');
  if (!(await prepararPaginaDueno({ slotFranja: document.getElementById('franja-comercio-slot') }))) {
    return;
  }

  const comercio = await apiFetch('/comercios/perfil');
  normalizarComercio(comercio);

  document.getElementById('perfil-nombre').textContent = comercio.nombre;
  document.getElementById('perfil-email').textContent = comercio.emailContacto;

  const avatarPerfil = document.getElementById('perfil-avatar');

  function actualizarAvatares() {
    pintarAvatarComercio(avatarPerfil, comercio);
  }
  actualizarAvatares();

  document.getElementById('legal-razon-social').textContent = comercio.razonSocial;
  document.getElementById('legal-cuit').textContent = comercio.cuit;
  document.getElementById('legal-condicion-iva').textContent = LABELS_CONDICION_IVA[comercio.condicionIva] || comercio.condicionIva;
  document.getElementById('legal-tipo-sociedad').textContent = LABELS_TIPO_SOCIEDAD[comercio.tipoSociedad] || comercio.tipoSociedad;
  document.getElementById('legal-domicilio-fiscal').textContent = comercio.domicilioFiscal;
  document.getElementById('legal-fecha-inicio').textContent = formatearFechaLarga(comercio.fechaInicioActividades);

  document.getElementById('ver-legales-link').addEventListener('click', () => {
    mostrarVista('view-datos-legales');
  });

  document.getElementById('editar-perfil-link').addEventListener('click', () => {
    document.getElementById('editar-nombre').value = comercio.nombre;
    document.getElementById('editar-descripcion').value = comercio.descripcion || '';
    document.getElementById('editar-telefono').value = comercio.telefono.replace(/^\+549/, '');
    document.getElementById('editar-emailContacto').value = comercio.emailContacto;
    const switchDelivery = document.getElementById('switch-delivery');
    const switchRetiro = document.getElementById('switch-retiro');
    switchDelivery.setAttribute('aria-pressed', String(comercio.aceptaDelivery));
    switchDelivery.parentElement.setAttribute('aria-pressed', String(comercio.aceptaDelivery));
    switchRetiro.setAttribute('aria-pressed', String(comercio.aceptaRetiro));
    switchRetiro.parentElement.setAttribute('aria-pressed', String(comercio.aceptaRetiro));
    renderBanner(document.getElementById('editar-banner-slot'), 'info', '');
    mostrarVista('view-editar-perfil');
  });

  const editarTelefonoInput = document.getElementById('editar-telefono');
  editarTelefonoInput.addEventListener('input', () => {
    editarTelefonoInput.value = editarTelefonoInput.value.replace(/\D/g, '').slice(0, 10);
  });

  document.getElementById('cambiar-password-link').addEventListener('click', () => {
    document.getElementById('form-cambiar-password').reset();
    renderBanner(document.getElementById('password-banner-slot'), 'info', '');
    mostrarVista('view-cambiar-password');
  });

  document.querySelectorAll('[data-volver-perfil]').forEach((btn) => {
    btn.addEventListener('click', () => mostrarVista('view-principal'));
  });

  document.getElementById('cerrar-sesion-link').addEventListener('click', mostrarModalConfirmarLogout);

  document.getElementById('mercadopago-link').addEventListener('click', () => {
    mostrarVista('view-mercadopago');
    cargarEstadoMercadoPago();
  });

  document.getElementById('btn-vincular-mp').addEventListener('click', async () => {
    try {
      const { url } = await apiFetch('/oauth/mercadopago/iniciar');
      window.location.href = url;
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'No pudimos iniciar la vinculación con Mercado Pago', 'error');
    }
  });

  document.getElementById('btn-desvincular-mp').addEventListener('click', () => {
    if (document.getElementById('modal-desvincular-mp')) {
      return;
    }
    abrirModalDesvincularMp({ alTerminar: actualizarCuentaMercadoPago });
  });

  const parametrosUrl = new URLSearchParams(window.location.search);
  const resultadoVinculacionMp = MENSAJES_VINCULACION_MP[parametrosUrl.get('vinculacionMp')];
  if (resultadoVinculacionMp) {
    showToast(resultadoVinculacionMp.texto, resultadoVinculacionMp.tipo);
  }
  if (resultadoVinculacionMp || parametrosUrl.get('vista') === 'mercadopago') {
    mostrarVista('view-mercadopago');
    actualizarCuentaMercadoPago();
  }
  if (parametrosUrl.has('vinculacionMp') || parametrosUrl.has('vista')) {
    limpiarParametrosMercadoPago();
  }

  const inputAvatar = document.getElementById('input-avatar');
  inputAvatar.addEventListener('change', async () => {
    const file = inputAvatar.files[0];
    inputAvatar.value = '';
    if (!file) {
      return;
    }
    const errorValidacion = validarArchivoImagen(file);
    if (errorValidacion) {
      showToast(errorValidacion, 'error');
      return;
    }
    abrirEditorRecorte({
      origen: { file },
      aspectRatio: 1,
      onConfirmar: async (blob) => {
        const archivoRecortado = new File([blob], file.name, { type: 'image/jpeg' });
        try {
          const actualizado = await subirFotoPerfilComercio(archivoRecortado);
          comercio.fotoPerfilUrl = actualizado.fotoPerfilUrl;
          actualizarAvatares();
          refrescarComercios().catch(() => {});
          showToast('Foto de perfil actualizada', 'success');
        } catch (error) {
          const esErrorConocido = error instanceof CloudinaryUploadError || error instanceof ApiError;
          showToast(esErrorConocido ? error.message : 'No pudimos subir la foto.', 'error');
        }
      },
    });
  });

  avatarPerfil.addEventListener('click', () => {
    if (!comercio.fotoPerfilUrl) {
      inputAvatar.click();
      return;
    }
    mostrarModalFotoPerfilComercio({
      onEditar: () => inputAvatar.click(),
    });
  });

  const switchDelivery = document.getElementById('switch-delivery');
  const switchRetiro = document.getElementById('switch-retiro');
  function bindSwitch(button) {
    button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!pressed));
      button.parentElement.setAttribute('aria-pressed', String(!pressed));
    });
  }
  bindSwitch(switchDelivery);
  bindSwitch(switchRetiro);

  const formEditar = document.getElementById('form-editar-perfil');
  const bannerEditar = document.getElementById('editar-banner-slot');
  const submitBtn = document.getElementById('guardar-perfil-btn');
  formEditar.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerEditar, 'info', '');
    const camposValidos = validarCamposRequeridosSilencioso([
      { inputId: 'editar-nombre', errorId: 'error-editar-nombre', validador: esTextoConContenidoValido, mensajeVacio: 'Ingresá el nombre de tu comercio.', mensajeInvalido: 'El nombre no puede contener solo caracteres especiales.' },
      { inputId: 'editar-telefono', errorId: 'error-editar-telefono', validador: esTelefonoValido, mensajeVacio: 'Ingresá tu teléfono.', mensajeInvalido: 'Ingresá un teléfono argentino válido (código de área + número).' },
      { inputId: 'editar-emailContacto', errorId: 'error-editar-emailContacto', validador: esEmailValido, mensajeVacio: 'El email de contacto es obligatorio.', mensajeInvalido: 'Ingresá un email de contacto con formato válido.' },
    ]);
    if (!camposValidos) {
      scrollAlPrimerError();
      return;
    }
    if (switchDelivery.getAttribute('aria-pressed') !== 'true' && switchRetiro.getAttribute('aria-pressed') !== 'true') {
      mostrarErrorCampo('error-editar-modalidad', 'Debés ofrecer al menos una modalidad de entrega.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-editar-modalidad');
    setLoading(submitBtn, 'Guardando...', true);
    try {
      const actualizado = await apiFetch('/comercios/perfil', {
        method: 'PUT',
        body: {
          nombre: document.getElementById('editar-nombre').value.trim(),
          descripcion: document.getElementById('editar-descripcion').value.trim() || null,
          telefono: construirTelefono(document.getElementById('editar-telefono').value.trim()),
          emailContacto: document.getElementById('editar-emailContacto').value.trim(),
          aceptaDelivery: switchDelivery.getAttribute('aria-pressed') === 'true',
          aceptaRetiro: switchRetiro.getAttribute('aria-pressed') === 'true',
        },
      });
      normalizarCampos(actualizado, ['nombre']);
      comercio.nombre = actualizado.nombre;
      comercio.descripcion = actualizado.descripcion;
      comercio.telefono = actualizado.telefono;
      comercio.emailContacto = actualizado.emailContacto;
      comercio.aceptaDelivery = actualizado.aceptaDelivery;
      comercio.aceptaRetiro = actualizado.aceptaRetiro;
      document.getElementById('perfil-nombre').textContent = actualizado.nombre;
      document.getElementById('perfil-email').textContent = actualizado.emailContacto;
      refrescarComercios().catch(() => {});
      mostrarVista('view-principal');
      showToast('Datos actualizados correctamente');
    } catch (error) {
      const mapaErrores = {
        nombre: 'error-editar-nombre',
        telefono: 'error-editar-telefono',
        emailContacto: 'error-editar-emailContacto',
      };
      if (!(error instanceof ApiError && error.data && mapearErroresBackend(error.data, mapaErrores))) {
        renderBanner(bannerEditar, 'error', error instanceof ApiError ? error.message : 'No pudimos guardar los cambios. Intentá nuevamente.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(submitBtn, '', false, 'Guardar cambios');
    }
  });

  const formPassword = document.getElementById('form-cambiar-password');
  const bannerPassword = document.getElementById('password-banner-slot');
  const submitPasswordBtn = document.getElementById('guardar-password-btn');
  const passwordActualInput = document.getElementById('password-actual');
  const passwordNuevaInput = document.getElementById('password-nueva');
  const passwordConfirmarInput = document.getElementById('password-confirmar');
  const shellPasswordActual = document.getElementById('shell-password-actual');
  const errorPasswordActual = document.getElementById('error-password-actual');
  bindPasswordToggle(document.getElementById('toggle-password-actual'), passwordActualInput);
  bindPasswordToggle(document.getElementById('toggle-password-nueva'), passwordNuevaInput);
  bindPasswordToggle(document.getElementById('toggle-password-confirmar'), passwordConfirmarInput);
  passwordNuevaInput.addEventListener('input', () => {
    aplicarFortalezaPassword(passwordNuevaInput.value, document.getElementById('strength-bars'), document.getElementById('strength-label'));
  });
  passwordConfirmarInput.addEventListener('input', () => limpiarErrorCampo('error-password-confirmar'));

  formPassword.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerPassword, 'info', '');
    shellPasswordActual.classList.remove('input-shell--error');
    errorPasswordActual.style.display = 'none';
    const camposValidos = validarCamposSilencioso([
      { inputId: 'password-actual', errorId: 'error-password-actual', mensaje: 'Ingresá tu contraseña actual.' },
      { inputId: 'password-nueva', errorId: 'error-password-nueva', mensaje: 'Ingresá una nueva contraseña.' },
      { inputId: 'password-confirmar', errorId: 'error-password-confirmar', mensaje: 'Repetí tu nueva contraseña.' },
    ]);
    if (!camposValidos) {
      scrollAlPrimerError();
      return;
    }
    if (!esPasswordSegura(passwordNuevaInput.value)) {
      mostrarErrorCampo('error-password-nueva', 'Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-password-nueva');
    if (passwordNuevaInput.value !== passwordConfirmarInput.value) {
      mostrarErrorCampo('error-password-confirmar', 'Las contraseñas ingresadas no coinciden.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-password-confirmar');
    setLoading(submitPasswordBtn, 'Guardando...', true);
    try {
      await apiFetch('/auth/cambiar-password', {
        method: 'POST',
        handle401Globally: false,
        body: {
          passwordActual: passwordActualInput.value,
          passwordNueva: passwordNuevaInput.value,
        },
      });
      formPassword.reset();
      clearSesion();
      window.location.href = 'login.html?passwordActualizada=1';
    } catch (error) {
      if (manejarBloqueoPorCambioPassword(error)) {
        return;
      }
      const mapaErrores = { passwordNueva: 'error-password-nueva' };
      if (error instanceof ApiError && error.status === 401) {
        shellPasswordActual.classList.add('input-shell--error');
        errorPasswordActual.textContent = 'La contraseña actual no es correcta.';
        errorPasswordActual.style.display = 'flex';
        const intentosRestantes = error.data && typeof error.data.intentosRestantes === 'number' ? error.data.intentosRestantes : null;
        if (intentosRestantes === 1) {
          renderBanner(bannerPassword, 'warning', 'Cuidado: si fallás una vez más, tu cuenta se bloqueará.');
        }
      } else if (!(error instanceof ApiError && error.data && mapearErroresBackend(error.data, mapaErrores))) {
        renderBanner(bannerPassword, 'error', error instanceof ApiError ? error.message : 'No pudimos cambiar tu contraseña. Intentá nuevamente.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(submitPasswordBtn, '', false, 'Guardar nueva contraseña');
    }
  });
}

const ESTADO_PRODUCTO_BADGE = {
  AGOTADO: { label: 'Agotado', className: 'status-badge--agotado' },
  DESCONTINUADO: { label: 'Descontinuado', className: 'status-badge--descontinuado' },
};

function renderProductoRow(producto, onKebab) {
  const row = crear('div', producto.estado === 'DESCONTINUADO' ? 'product-row product-row--descontinuado' : 'product-row');
  row.style.cursor = 'default';
  row.setAttribute('data-testid', `producto-item-${producto.id}`);

  const thumb = crear('div', 'product-row__thumb');
  if (producto.estado === 'AGOTADO') {
    thumb.classList.add('product-row__thumb--agotado');
  } else if (producto.estado === 'DESCONTINUADO') {
    thumb.classList.add('product-row__thumb--descontinuado');
  }
  const principal = producto.imagenes.find((imagen) => imagen.esPrincipal) || producto.imagenes[0];
  if (principal) {
    const img = document.createElement('img');
    img.src = principal.url;
    img.alt = '';
    thumb.appendChild(img);
  }
  row.appendChild(thumb);

  const info = crear('div', 'product-row__info');
  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '8px';
  titleRow.style.flexWrap = 'wrap';
  const h3 = document.createElement('h3');
  h3.textContent = producto.nombre;
  titleRow.appendChild(h3);
  const badgeInfo = ESTADO_PRODUCTO_BADGE[producto.estado];
  if (badgeInfo) {
    const badge = crear('span', `status-badge ${badgeInfo.className}`);
    badge.textContent = badgeInfo.label;
    titleRow.appendChild(badge);
  }
  info.appendChild(titleRow);
  const precio = crear('p', 'product-row__price');
  precio.textContent = formatearPrecio(producto.precio);
  info.appendChild(precio);
  row.appendChild(info);

  const kebab = crear('button', 'product-row__kebab');
  kebab.type = 'button';
  kebab.setAttribute('aria-label', 'Acciones del producto');
  kebab.setAttribute('data-testid', `btn-acciones-producto-${producto.id}`);
  kebab.innerHTML = ICONS.kebab;
  kebab.addEventListener('click', () => onKebab(producto));
  row.appendChild(kebab);

  return row;
}

function mostrarModalAccionProducto(producto, { onEditar, onCambiarEstado, onDescontinuar }) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-acciones-producto');
  const sheet = crear('div', 'product-modal-sheet');
  const handle = crear('div', 'product-modal-sheet__handle');
  handle.innerHTML = '<span></span>';
  sheet.appendChild(handle);

  const body = crear('div', 'product-modal-sheet__body');
  const titleRow = crear('div', 'product-modal-sheet__title-row');
  titleRow.style.marginBottom = '4px';
  const h2 = document.createElement('h2');
  h2.style.fontSize = '17px';
  h2.textContent = producto.nombre;
  titleRow.appendChild(h2);
  body.appendChild(titleRow);
  const precio = crear('p', 'product-modal-sheet__description');
  precio.style.marginBottom = '16px';
  precio.textContent = formatearPrecio(producto.precio);
  body.appendChild(precio);

  if (producto.estado === 'DESCONTINUADO') {
    const aviso = crear('p', 'field__hint');
    aviso.textContent = 'Este producto está descontinuado y no admite más cambios.';
    body.appendChild(aviso);
  } else {
    const list = crear('div', 'profile-link-list');

    const editarBtn = crear('button', 'profile-link');
    editarBtn.type = 'button';
    editarBtn.setAttribute('data-testid', 'btn-editar-producto');
    editarBtn.innerHTML = `${ICONS.edit}<span>Editar producto</span>`;
    editarBtn.addEventListener('click', () => {
      backdrop.remove();
      onEditar();
    });
    list.appendChild(editarBtn);

    const estadoBtn = crear('button', 'profile-link');
    estadoBtn.type = 'button';
    estadoBtn.setAttribute('data-testid', 'btn-cambiar-estado-producto');
    if (producto.estado === 'DISPONIBLE') {
      estadoBtn.innerHTML = `${ICONS.ban}<span>Marcar como agotado</span>`;
      estadoBtn.addEventListener('click', () => {
        backdrop.remove();
        onCambiarEstado('AGOTADO');
      });
    } else {
      estadoBtn.innerHTML = `${ICONS.check}<span>Marcar como disponible</span>`;
      estadoBtn.addEventListener('click', () => {
        backdrop.remove();
        onCambiarEstado('DISPONIBLE');
      });
    }
    list.appendChild(estadoBtn);

    const descontinuarBtn = crear('button', 'profile-link profile-link--danger');
    descontinuarBtn.type = 'button';
    descontinuarBtn.setAttribute('data-testid', 'btn-descontinuar-producto');
    descontinuarBtn.innerHTML = `${ICONS.xCircle}<span>Descontinuar producto</span>`;
    descontinuarBtn.addEventListener('click', () => {
      backdrop.remove();
      onDescontinuar();
    });
    list.appendChild(descontinuarBtn);

    body.appendChild(list);
  }

  const cancelBtn = crear('button', 'btn btn-tertiary');
  cancelBtn.type = 'button';
  cancelBtn.style.marginTop = '16px';
  cancelBtn.setAttribute('data-testid', 'btn-cancelar-modal-acciones');
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => backdrop.remove());
  body.appendChild(cancelBtn);

  sheet.appendChild(body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

function mostrarModalConfirmarDescontinuar(producto, onConfirmar) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-confirmar-descontinuar');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet__icon modal-sheet__icon--danger">${ICONS.alert}</div>
      <h2 class="modal-sheet__title" id="descontinuar-modal-titulo"></h2>
      <p class="modal-sheet__text">Esta acción no se puede deshacer. El producto va a dejar de mostrarse en tu catálogo público, se va a quitar de los carritos activos que lo tengan, y no vas a poder volver a marcarlo como disponible.</p>
      <div class="checkbox-row">
        <input type="checkbox" id="confirmar-irreversible-check" data-testid="input-confirmar-irreversible" />
        <label for="confirmar-irreversible-check">Entiendo que esta acción es irreversible</label>
      </div>
      <button class="btn btn-primary" type="button" id="confirmar-descontinuar-btn" style="margin-top:16px;margin-bottom:12px;background:var(--color-error);" disabled data-testid="btn-confirmar-descontinuar">Sí, descontinuar</button>
      <button class="btn btn-tertiary" type="button" id="cancelar-descontinuar-btn" data-testid="btn-cancelar-descontinuar">Cancelar</button>
    </div>
  `;
  backdrop.querySelector('#descontinuar-modal-titulo').textContent = `¿Descontinuar "${producto.nombre}"?`;
  document.body.appendChild(backdrop);
  const confirmarBtn = document.getElementById('confirmar-descontinuar-btn');
  document.getElementById('confirmar-irreversible-check').addEventListener('change', (event) => {
    confirmarBtn.disabled = !event.target.checked;
  });
  document.getElementById('cancelar-descontinuar-btn').addEventListener('click', () => backdrop.remove());
  confirmarBtn.addEventListener('click', () => {
    backdrop.remove();
    onConfirmar();
  });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

export async function initComercioProductos() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Mis productos' });
  renderBottomNavComercio(document.getElementById('bottom-nav-slot'), 'productos');
  if (!(await prepararPaginaDueno({ slotFranja: document.getElementById('franja-comercio-slot') }))) {
    return;
  }

  const paramsProductos = new URLSearchParams(window.location.search);
  if (paramsProductos.get('productoCreado') === '1') {
    showToast('Producto creado con éxito');
  } else if (paramsProductos.get('productoActualizado') === '1') {
    showToast('Producto actualizado con éxito');
  }

  const productos = await apiFetch('/productos');
  productos.forEach((producto) => normalizarCampos(producto, ['nombre']));

  let filtroEstado = null;
  let busqueda = '';

  const filtrosSlot = document.getElementById('filtros-slot');
  const chipRow = crear('div', 'chip-row');
  const filtros = [
    { key: null, label: 'Todos' },
    { key: 'DISPONIBLE', label: 'Disponibles' },
    { key: 'AGOTADO', label: 'Agotados' },
    { key: 'DESCONTINUADO', label: 'Descontinuados' },
  ];
  filtros.forEach((filtro) => {
    const chip = crear('button', 'chip');
    chip.type = 'button';
    chip.textContent = filtro.label;
    chip.setAttribute('data-testid', `chip-filtro-producto-${(filtro.key || 'todos').toLowerCase()}`);
    chip.setAttribute('aria-pressed', String(filtroEstado === filtro.key));
    chip.addEventListener('click', () => {
      filtroEstado = filtro.key;
      chipRow.querySelectorAll('.chip').forEach((otro) => otro.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      renderLista();
    });
    chipRow.appendChild(chip);
  });
  filtrosSlot.appendChild(chipRow);

  const contentEl = document.getElementById('productos-content');

  function renderLista() {
    contentEl.innerHTML = '';
    const filtrados = productos
      .filter((producto) => filtroEstado === null || producto.estado === filtroEstado)
      .filter((producto) => producto.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
      .sort((a, b) => {
        const aDescontinuado = a.estado === 'DESCONTINUADO' ? 1 : 0;
        const bDescontinuado = b.estado === 'DESCONTINUADO' ? 1 : 0;
        return aDescontinuado - bDescontinuado;
      });

    if (filtrados.length === 0) {
      const empty = crear('p', 'field__hint');
      empty.style.padding = '24px 0';
      empty.style.textAlign = 'center';
      empty.textContent = productos.length === 0
        ? 'Todavía no cargaste ningún producto. Usá el botón + para crear el primero.'
        : 'No encontramos productos con ese filtro.';
      contentEl.appendChild(empty);
      return;
    }

    const section = crear('div', 'product-section');
    section.style.padding = '0';
    filtrados.forEach((producto) => {
      section.appendChild(renderProductoRow(producto, abrirMenuAccion));
    });
    contentEl.appendChild(section);
  }

  function actualizarProducto(actualizado) {
    const indice = productos.findIndex((producto) => producto.id === actualizado.id);
    if (indice >= 0) {
      productos[indice] = actualizado;
    }
    renderLista();
  }

  function abrirMenuAccion(producto) {
    mostrarModalAccionProducto(producto, {
      onEditar: () => {
        window.location.href = `comercio-producto-form.html?id=${producto.id}`;
      },
      onCambiarEstado: async (nuevoEstado) => {
        try {
          const actualizado = await apiFetch(`/productos/${producto.id}/estado`, {
            method: 'PATCH',
            body: { estado: nuevoEstado },
          });
          normalizarCampos(actualizado, ['nombre']);
          actualizarProducto(actualizado);
          showToast('Estado del producto actualizado');
        } catch (error) {
          showToast(error instanceof ApiError ? error.message : 'No pudimos actualizar el estado', 'error');
        }
      },
      onDescontinuar: () => {
        mostrarModalConfirmarDescontinuar(producto, async () => {
          try {
            const actualizado = await apiFetch(`/productos/${producto.id}/estado`, {
              method: 'PATCH',
              body: { estado: 'DESCONTINUADO' },
            });
            normalizarCampos(actualizado, ['nombre']);
            actualizarProducto(actualizado);
            showToast('Producto descontinuado');
          } catch (error) {
            showToast(error instanceof ApiError ? error.message : 'No pudimos descontinuar el producto', 'error');
          }
        });
      },
    });
  }

  document.getElementById('buscar-producto-input').addEventListener('input', (event) => {
    busqueda = event.target.value;
    renderLista();
  });

  document.getElementById('crear-producto-fab').addEventListener('click', () => {
    window.location.href = 'comercio-producto-form.html';
  });

  renderLista();
}

export async function initComercioProductoForm() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const productoId = params.get('id') ? Number(params.get('id')) : null;
  const esEdicion = productoId !== null;

  renderTopBar(document.getElementById('top-bar-slot'), {
    mostrarVolver: true,
    titulo: esEdicion ? 'Editar producto' : 'Nuevo producto',
  });
  document.getElementById('guardar-producto-btn').textContent = esEdicion ? 'Guardar cambios' : 'Crear producto';
  if (!(await prepararPaginaDueno())) {
    return;
  }

  const bannerSlot = document.getElementById('form-banner-slot');
  const selectCategoria = document.getElementById('producto-categoria');
  const chipRowTags = document.getElementById('tags-chip-row');
  const galeriaEl = document.getElementById('galeria-fotos');
  const inputFoto = document.getElementById('input-foto');
  const descontinuarLink = document.getElementById('descontinuar-producto-link');

  if (esEdicion && params.get('fotosParcial') === '1') {
    renderBanner(bannerSlot, 'warning', 'Creamos el producto, pero no pudimos subir todas las fotos. Podés agregar o reintentar las que falten acá abajo.');
  }

  const inputNombre = document.getElementById('producto-nombre');
  inputNombre.addEventListener('blur', () => {
    if (inputNombre.value.trim()) {
      inputNombre.value = aTitleCase(inputNombre.value.trim());
    }
  });

  const inputPrecio = document.getElementById('producto-precio');
  inputPrecio.addEventListener('input', () => {
    const soloDigitos = inputPrecio.value.replace(/\D/g, '').slice(0, 8);
    inputPrecio.value = formatearMilesInput(soloDigitos);
  });

  const [categorias, tags] = await Promise.all([
    apiFetch('/categorias'),
    apiFetch('/tags'),
  ]);

  selectCategoria.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = 'Seleccioná una categoría';
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  selectCategoria.appendChild(placeholderOption);
  categorias.filter((categoria) => categoria.activo).forEach((categoria) => {
    const option = document.createElement('option');
    option.value = String(categoria.id);
    option.textContent = categoria.nombre;
    selectCategoria.appendChild(option);
  });

  const tagsSeleccionados = new Set();
  tags.filter((tag) => tag.activo).forEach((tag) => {
    const chip = crear('button', 'chip');
    chip.type = 'button';
    chip.textContent = tag.nombre;
    chip.dataset.tagId = String(tag.id);
    chip.setAttribute('data-testid', `chip-tag-producto-${tag.id}`);
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      const activo = chip.getAttribute('aria-pressed') === 'true';
      if (!activo && tagsSeleccionados.size >= MAX_TAGS_POR_PRODUCTO) {
        mostrarErrorCampo('error-producto-tags', `Podés seleccionar hasta ${MAX_TAGS_POR_PRODUCTO} tags.`);
        return;
      }
      limpiarErrorCampo('error-producto-tags');
      chip.setAttribute('aria-pressed', String(!activo));
      if (activo) {
        tagsSeleccionados.delete(tag.id);
      } else {
        tagsSeleccionados.add(tag.id);
      }
    });
    chipRowTags.appendChild(chip);
  });

  let imagenes = [];
  let fotosStaged = [];
  let productoActual = null;

  function moverEnArray(array, origen, destino) {
    const copia = array.slice();
    const [elemento] = copia.splice(origen, 1);
    copia.splice(destino, 0, elemento);
    return copia;
  }

  function habilitarDragAndDrop(item, index, onSoltar) {
    item.draggable = true;
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      item.classList.add('photo-gallery__item--dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('photo-gallery__item--dragging');
    });
    item.addEventListener('dragover', (event) => {
      event.preventDefault();
      item.classList.add('photo-gallery__item--dragover');
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('photo-gallery__item--dragover');
    });
    item.addEventListener('drop', (event) => {
      event.preventDefault();
      item.classList.remove('photo-gallery__item--dragover');
      const origen = Number(event.dataTransfer.getData('text/plain'));
      if (!Number.isNaN(origen) && origen !== index) {
        onSoltar(origen, index);
      }
    });
  }

  async function moverFotoStaged(origen, destino) {
    fotosStaged = moverEnArray(fotosStaged, origen, destino);
    renderGaleria();
  }

  async function moverImagenSubida(origen, destino) {
    const anterior = imagenes;
    imagenes = moverEnArray(imagenes, origen, destino);
    renderGaleria();
    const desdeIndex = Math.min(origen, destino);
    const hastaIndex = Math.max(origen, destino);
    try {
      const afectadas = imagenes.slice(desdeIndex, hastaIndex + 1);
      for (let offset = 0; offset < afectadas.length; offset += 1) {
        const actualizada = await reordenarImagenProducto(productoId, afectadas[offset].id, desdeIndex + offset);
        imagenes[desdeIndex + offset] = actualizada;
      }
    } catch (error) {
      imagenes = anterior;
      renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos reordenar las fotos.');
    }
    renderGaleria();
  }

  function renderGaleria() {
    galeriaEl.innerHTML = '';
    const items = esEdicion ? imagenes : fotosStaged;

    items.forEach((item, index) => {
      const tile = crear('div', 'photo-gallery__item');
      const img = document.createElement('img');
      img.src = esEdicion ? item.url : item.previewUrl;
      img.alt = '';
      tile.appendChild(img);
      if (esEdicion ? item.esPrincipal : index === 0) {
        const badge = crear('span', 'photo-gallery__item-badge');
        badge.textContent = 'Principal';
        tile.appendChild(badge);
      }
      const removeBtn = crear('button', 'photo-gallery__item-remove');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', esEdicion ? 'Eliminar imagen' : 'Quitar foto');
      removeBtn.setAttribute('data-testid', `btn-eliminar-foto-producto-${index}`);
      removeBtn.innerHTML = ICONS.close;
      removeBtn.addEventListener('click', async () => {
        if (esEdicion) {
          try {
            await eliminarImagenProducto(productoId, item.id);
            imagenes = imagenes.filter((otra) => otra.id !== item.id);
            imagenes.forEach((otra, i) => { otra.esPrincipal = i === 0; });
            renderGaleria();
          } catch (error) {
            renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos eliminar la imagen.');
          }
        } else {
          URL.revokeObjectURL(item.previewUrl);
          fotosStaged = fotosStaged.filter((otra) => otra !== item);
          renderGaleria();
        }
      });
      tile.appendChild(removeBtn);
      if (esEdicion) {
        const recortarBtn = crear('button', 'photo-gallery__item-crop');
        recortarBtn.type = 'button';
        recortarBtn.setAttribute('aria-label', 'Recortar imagen');
        recortarBtn.innerHTML = ICONS.crop;
        recortarBtn.addEventListener('click', () => {
          abrirEditorRecorte({
            origen: { url: item.url },
            aspectRatio: 4 / 3,
            onConfirmar: async (blob) => {
              const archivoRecortado = new File([blob], 'recorte.jpg', { type: 'image/jpeg' });
              renderBanner(bannerSlot, 'info', 'Subiendo imagen...');
              try {
                const actualizada = await recortarImagenProducto(productoId, item.id, archivoRecortado);
                const posicion = imagenes.findIndex((otra) => otra.id === item.id);
                imagenes[posicion] = actualizada;
                renderGaleria();
                renderBanner(bannerSlot, '', '');
              } catch (error) {
                renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos actualizar la imagen.');
              }
            },
          });
        });
        tile.appendChild(recortarBtn);
      }
      habilitarDragAndDrop(tile, index, esEdicion ? moverImagenSubida : moverFotoStaged);
      galeriaEl.appendChild(tile);
    });

    for (let i = items.length; i < MAX_IMAGENES_POR_PRODUCTO; i += 1) {
      const addTile = crear('button', 'photo-gallery__add');
      addTile.type = 'button';
      addTile.setAttribute('data-testid', 'btn-agregar-foto-producto');
      addTile.innerHTML = `${ICONS.camera}<span>Agregar</span>`;
      addTile.addEventListener('click', () => inputFoto.click());
      galeriaEl.appendChild(addTile);
    }

    document.getElementById('guardar-producto-btn').disabled = items.length === 0;
  }

  if (esEdicion) {
    const productos = await apiFetch('/productos');
    productos.forEach((producto) => normalizarCampos(producto, ['nombre']));
    productoActual = productos.find((producto) => producto.id === productoId);
    if (!productoActual) {
      renderBanner(bannerSlot, 'error', 'No encontramos este producto.');
      document.getElementById('form-producto').classList.add('is-hidden');
      return;
    }
    if (productoActual.estado === 'DESCONTINUADO') {
      renderBanner(bannerSlot, 'warning', 'Este producto está descontinuado y no se puede editar.');
      document.getElementById('form-producto').classList.add('is-hidden');
      return;
    }
    document.getElementById('producto-nombre').value = productoActual.nombre;
    document.getElementById('producto-descripcion').value = productoActual.descripcion || '';
    document.getElementById('producto-precio').value = formatearMilesInput(String(Math.trunc(Number(productoActual.precio))));
    selectCategoria.value = String(productoActual.categoriaId);
    imagenes = [...productoActual.imagenes].sort((a, b) => a.orden - b.orden);
    chipRowTags.querySelectorAll('.chip').forEach((chip) => {
      if (productoActual.tags.includes(chip.textContent)) {
        chip.setAttribute('aria-pressed', 'true');
        tagsSeleccionados.add(Number(chip.dataset.tagId));
      }
    });
    descontinuarLink.style.display = 'flex';
    descontinuarLink.addEventListener('click', () => {
      mostrarModalConfirmarDescontinuar(productoActual, async () => {
        try {
          await apiFetch(`/productos/${productoId}/estado`, { method: 'PATCH', body: { estado: 'DESCONTINUADO' } });
          window.location.href = 'comercio-productos.html';
        } catch (error) {
          renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos descontinuar el producto.');
        }
      });
    });
  }

  renderGaleria();

  inputFoto.addEventListener('change', async () => {
    const file = inputFoto.files[0];
    inputFoto.value = '';
    if (!file) {
      return;
    }
    const errorValidacion = validarArchivoImagen(file);
    if (errorValidacion) {
      showToast(errorValidacion, 'error');
      return;
    }
    if (!esEdicion && fotosStaged.length >= MAX_IMAGENES_POR_PRODUCTO) {
      renderBanner(bannerSlot, 'error', `Ya alcanzaste el máximo de ${MAX_IMAGENES_POR_PRODUCTO} fotos por producto.`);
      return;
    }

    abrirEditorRecorte({
      origen: { file },
      aspectRatio: 4 / 3,
      onConfirmar: async (blob) => {
        const archivoRecortado = new File([blob], file.name, { type: 'image/jpeg' });
        if (!esEdicion) {
          fotosStaged.push({ file: archivoRecortado, previewUrl: URL.createObjectURL(archivoRecortado) });
          limpiarErrorCampo('error-producto-fotos');
          renderGaleria();
          return;
        }
        renderBanner(bannerSlot, 'info', 'Subiendo imagen...');
        try {
          const nuevaImagen = await subirImagenProducto(productoId, archivoRecortado, { orden: imagenes.length, esPrincipal: imagenes.length === 0 });
          if (nuevaImagen.esPrincipal) {
            imagenes = imagenes.map((imagen) => ({ ...imagen, esPrincipal: false }));
          }
          imagenes.push(nuevaImagen);
          limpiarErrorCampo('error-producto-fotos');
          renderGaleria();
          renderBanner(bannerSlot, '', '');
        } catch (error) {
          const esErrorConocido = error instanceof CloudinaryUploadError || error instanceof ApiError;
          renderBanner(bannerSlot, 'error', esErrorConocido ? error.message : 'No pudimos subir la imagen.');
        }
      },
    });
  });

  const form = document.getElementById('form-producto');
  const submitBtn = document.getElementById('guardar-producto-btn');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    renderBanner(bannerSlot, '', '');
    const camposValidos = validarCamposRequeridosSilencioso([
      { inputId: 'producto-nombre', errorId: 'error-producto-nombre', validador: esNombreProductoValido, mensajeVacio: 'El nombre del producto es obligatorio.', mensajeInvalido: 'Ingresá un nombre válido (letras, números y espacios, sin símbolos).' },
    ]) && validarCamposSilencioso([
      { inputId: 'producto-categoria', errorId: 'error-producto-categoria', mensaje: 'Seleccioná una categoría.' },
    ]);
    if (!camposValidos) {
      scrollAlPrimerError();
      return;
    }
    if ((esEdicion ? imagenes.length : fotosStaged.length) === 0) {
      mostrarErrorCampo('error-producto-fotos', 'Agregá al menos una foto del producto.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-producto-fotos');
    if (!inputPrecio.value.trim()) {
      mostrarErrorCampo('error-producto-precio', 'El precio es obligatorio.');
      scrollAlPrimerError();
      return;
    }
    if (!esPrecioValido(inputPrecio.value)) {
      mostrarErrorCampo('error-producto-precio', 'El precio no puede tener más de 8 dígitos.');
      scrollAlPrimerError();
      return;
    }
    const precio = precioDesdeInput(inputPrecio.value);
    if (precio <= 0) {
      mostrarErrorCampo('error-producto-precio', 'El precio debe ser mayor a $0.');
      scrollAlPrimerError();
      return;
    }
    limpiarErrorCampo('error-producto-precio');
    setLoading(submitBtn, 'Guardando...', true);
    const body = {
      nombre: document.getElementById('producto-nombre').value.trim(),
      descripcion: document.getElementById('producto-descripcion').value.trim() || null,
      precio,
      categoriaId: Number(selectCategoria.value),
      tagIds: Array.from(tagsSeleccionados),
    };
    try {
      if (esEdicion) {
        await apiFetch(`/productos/${productoId}`, { method: 'PUT', body });
        window.location.href = 'comercio-productos.html?productoActualizado=1';
        return;
      }

      const creado = await apiFetch('/productos', { method: 'POST', body });

      try {
        for (let i = 0; i < fotosStaged.length; i += 1) {
          await subirImagenProducto(creado.id, fotosStaged[i].file, { orden: i, esPrincipal: i === 0 });
        }
      } catch {
        window.location.href = `comercio-producto-form.html?id=${creado.id}&fotosParcial=1`;
        return;
      }

      window.location.href = 'comercio-productos.html?productoCreado=1';
    } catch (error) {
      const mapaErrores = {
        nombre: 'error-producto-nombre',
        precio: 'error-producto-precio',
        categoriaId: 'error-producto-categoria',
      };
      if (!(error instanceof ApiError && error.data && mapearErroresBackend(error.data, mapaErrores))) {
        renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos guardar el producto.');
      }
      scrollAlPrimerError();
    } finally {
      setLoading(submitBtn, '', false, esEdicion ? 'Guardar cambios' : 'Crear producto');
    }
  });
}
