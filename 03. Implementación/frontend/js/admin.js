import { apiFetch, ApiError, getUsuario } from './api.js';
import { showToast, renderTopBar, pintarAvatarComercio, pintarAvatarUsuario, crearBloqueMotivoRechazo } from './catalogo.js';
import { logout, LABELS_TIPO_COMERCIO, LABELS_TIPO_RED_SOCIAL, LABELS_TIPO_SOCIEDAD } from './auth.js';
import { normalizarCampos, enlazarControlConError } from './validators.js';
import { recordarNombreDelComercio } from './admin-comercio-nombre.js';
import { cruzaMedianoche, recortarHora, textoRango } from './horarios.js';
import { diasDesde } from './documentos-comun.js';
import { crearControlesSuspension } from './admin-comercio-suspension.js';
import { abrirHoja, campoTextarea, crearAviso } from './hoja.js';
import { crearEncabezadoTabla } from './tabla-admin.js';

function normalizarComercioAdmin(comercio) {
  normalizarCampos(comercio, ['nombre', 'razonSocial']);
  normalizarCampos(comercio.direccion, ['calle']);
  normalizarCampos(comercio.representante, ['nombre', 'apellido']);
  (comercio.otrosComercios || []).forEach((otro) => normalizarCampos(otro, ['nombre']));
  return comercio;
}

const ICONS = {
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  xCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
  logoutIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  refund: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>',
  percent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
};

const LABELS_TIPO_CARGO = {
  FIJO: 'Monto fijo ($)',
  PORCENTAJE: 'Porcentaje (%)',
};

const LABELS_CONDICION_IVA = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  EXENTO: 'Exento',
  NO_INSCRIPTO: 'No Inscripto',
  MONOTRIBUTO: 'Monotributista',
  RESPONSABLE_NACIONAL: 'Responsable Nacional',
};

const BADGE_ESTADO_COMERCIO = {
  APROBADO: { label: 'Aprobado', className: 'status-badge--exito' },
  APTO_VENTA: { label: 'Listo para vender', className: 'status-badge--exito' },
  PENDIENTE: { label: 'Pendiente', className: 'status-badge--pendiente' },
  RECHAZADO: { label: 'Rechazado', className: 'status-badge--error' },
  RECHAZO_DEFINITIVO: { label: 'Rechazo definitivo', className: 'status-badge--error' },
  SUSPENDIDO: { label: 'Suspendido', className: 'status-badge--pendiente' },
  CERRADO_TEMPORALMENTE: { label: 'Cerrado temporalmente', className: 'status-badge--neutro' },
  INACTIVO: { label: 'Inactivo', className: 'status-badge--neutro' },
};

const LABELS_DIA_SEMANA = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miércoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sábado',
  DOMINGO: 'Domingo',
};

const ORDEN_DIA_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

function crear(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatearTiempoRelativo(fechaIso) {
  const diffMs = Date.now() - new Date(fechaIso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Recién';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `Hace ${diffHoras} h`;
  const diffDias = Math.floor(diffHoras / 24);
  return `Hace ${diffDias} d`;
}

function formatearFecha(fechaIso) {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}/${mes}/${anio}`;
}

function formatearFechaHora(fechaIso) {
  const fecha = new Date(fechaIso);
  const partes = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${partes} a las ${hora} hs`;
}

function formatearSoloFecha(fechaIso) {
  return new Date(fechaIso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatearPrecio(valor) {
  const entero = Math.round(Number(valor));
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatearCargo(valor, tipo) {
  if (tipo === 'PORCENTAJE') {
    const numero = Number(valor);
    const texto = numero % 1 === 0 ? numero.toFixed(0) : numero.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${texto}%`;
  }
  return formatearPrecio(valor);
}

function labelResumenCargo(tipo) {
  return tipo === 'PORCENTAJE' ? 'Sobre el subtotal' : 'Monto fijo por pedido';
}

function labelTipoComercio(tipo) {
  return LABELS_TIPO_COMERCIO[tipo] || tipo;
}

export function requireAdmin() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'ADMINISTRADOR') {
    window.location.href = 'login.html';
    return null;
  }
  return usuario;
}

function detailRow(label, valor) {
  const row = crear('div', 'detail-row');
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  row.appendChild(labelEl);
  const valorEl = document.createElement('span');
  valorEl.textContent = valor;
  row.appendChild(valorEl);
  return row;
}

function mostrarModalConfirmarLogoutAdmin() {
  abrirHoja({
    titulo: '¿Cerrar sesión?',
    texto: 'Podés volver a ingresar en cualquier momento.',
    testid: 'modal-confirmar-logout',
    acciones: [
      { etiqueta: 'Sí, cerrar sesión', etiquetaEnviando: 'Cerrando…', variante: 'primaria', testid: 'btn-confirmar-logout', alPulsar: () => logout() },
      { etiqueta: 'Cancelar', variante: 'segura', inicial: true, testid: 'btn-cancelar-logout' },
    ],
  });
}

async function pintarTarjetaDocumentos(tarjeta, cantidad) {
  const contador = tarjeta.querySelector('[data-count]');
  const subtitulo = tarjeta.querySelector('[data-subtitulo]');
  contador.textContent = String(cantidad);
  contador.style.display = cantidad > 0 ? 'flex' : 'none';
  tarjeta.classList.toggle('alert-card--acento', cantidad > 0);
  if (cantidad === 0) {
    subtitulo.textContent = 'Todo al día';
    return;
  }
  subtitulo.textContent = cantidad === 1 ? '1 documento esperando revisión' : `${cantidad} documentos esperando revisión`;
  try {
    const pendientes = await apiFetch('/administrador/documentos/pendientes');
    if (pendientes.length > 0) {
      const dias = diasDesde(pendientes[0].fechaSubida);
      subtitulo.textContent = dias < 1 ? 'El más antiguo es de hoy' : `El más antiguo lleva ${dias === 1 ? '1 día' : `${dias} días`}`;
    }
  } catch {
    return;
  }
}

const INTERVALO_PANEL_ADMIN_MS = 30000;

async function cantidadDeReembolsosParaRevisar(opciones = {}) {
  try {
    const notas = await apiFetch('/administrador/reembolsos', { handleRedGlobally: false, handle5xxGlobally: false, ...opciones });
    return notas.length;
  } catch (error) {
    if (opciones.segundoPlano) {
      throw error;
    }
    return null;
  }
}

function pintarContadorRedondo(contador, cantidad) {
  contador.textContent = String(cantidad);
  contador.style.display = cantidad > 0 ? 'flex' : 'none';
}

function armarTarjetasDeAtencion() {
  const comercios = document.getElementById('alert-comercios-pendientes');
  const resolicitudes = document.getElementById('alert-resolicitudes');
  const documentos = document.getElementById('alert-documentos');
  return [
    {
      nodo: comercios,
      pendientes: (metricas) => metricas.comerciosPendientes,
      pintar: (metricas) => {
        pintarContadorRedondo(comercios.querySelector('[data-count]'), metricas.comerciosPendientes);
        comercios.querySelector('[data-subtitulo]').textContent = metricas.comerciosPendientes === 1
          ? '1 solicitud de aprobación'
          : `${metricas.comerciosPendientes} solicitudes de aprobación`;
      },
    },
    {
      nodo: resolicitudes,
      pendientes: (metricas) => metricas.resolicitudesPendientes,
      pintar: (metricas) => pintarContadorRedondo(resolicitudes.querySelector('[data-count]'), metricas.resolicitudesPendientes),
    },
    {
      nodo: documentos,
      pendientes: (metricas) => metricas.documentosPendientes,
      pintar: (metricas) => pintarTarjetaDocumentos(documentos, metricas.documentosPendientes),
    },
  ];
}

function subtituloReembolsos(reembolsos) {
  if (reembolsos === null) {
    return 'Revisión manual';
  }
  return reembolsos === 0 ? 'Sin reembolsos para revisar' : `${reembolsos} para revisar`;
}

function armarTilesDeGestion() {
  const definiciones = [
    { clave: 'comercios', icon: ICONS.store, titulo: 'Comercios', subtitulo: (m) => `${m.comerciosTotal} registrados`, href: 'admin-comercios.html' },
    { clave: 'clientes', icon: ICONS.users, titulo: 'Clientes', subtitulo: (m) => `${m.clientesTotal} registrados`, href: 'admin-clientes.html' },
    { clave: 'duenos', icon: ICONS.users, titulo: 'Dueños', subtitulo: () => 'Cuentas y suspensiones', href: 'admin-duenos.html' },
    { clave: 'categorias', icon: ICONS.tag, titulo: 'Categorías', subtitulo: (m) => `${m.categoriasActivas} activas`, href: 'admin-categorias.html' },
    { clave: 'tags', icon: ICONS.hash, titulo: 'Tags', subtitulo: (m) => `${m.tagsActivos} activos`, href: 'admin-tags.html' },
    { clave: 'tarifas', icon: ICONS.percent, titulo: 'Tarifas', subtitulo: () => 'Cargos y comisiones', href: 'admin-tarifas.html' },
    {
      clave: 'reembolsos',
      icon: ICONS.refund,
      titulo: 'Reembolsos',
      subtitulo: (m, r) => subtituloReembolsos(r),
      pendientes: (m, r) => r || 0,
      href: 'admin-reembolsos.html',
    },
    {
      clave: 'soporte',
      icon: ICONS.chat,
      titulo: 'Soporte',
      subtitulo: (m) => (m.consultasSoporteEsperando === 0 ? 'Sin consultas esperando' : `${m.consultasSoporteEsperando} ${m.consultasSoporteEsperando === 1 ? 'espera' : 'esperan'} tu respuesta`),
      subtituloTestid: 'contador-soporte-esperando',
      pendientes: (m) => m.consultasSoporteEsperando,
      href: 'admin-soporte.html',
    },
    {
      clave: 'reclamos',
      icon: ICONS.alert,
      titulo: 'Reclamos',
      subtitulo: (m) => (m.reclamosPendientes === 0 ? 'Sin reclamos pendientes' : `${m.reclamosPendientes} ${m.reclamosPendientes === 1 ? 'pendiente' : 'pendientes'} de revisar`),
      subtituloTestid: 'contador-reclamos-pendientes',
      pendientes: (m) => m.reclamosPendientes,
      href: 'admin-reclamos.html',
    },
  ];
  return definiciones.map((definicion) => {
    const nodo = crear('a', 'stat-tile');
    nodo.href = definicion.href;
    nodo.setAttribute('data-testid', `tile-gestion-${definicion.href.replace('admin-', '').replace('.html', '')}`);
    const icon = crear('div', 'stat-tile__icon');
    icon.innerHTML = definicion.icon;
    nodo.appendChild(icon);
    const h3 = document.createElement('h3');
    h3.textContent = definicion.titulo;
    nodo.appendChild(h3);
    const p = document.createElement('p');
    if (definicion.subtituloTestid) {
      p.setAttribute('data-testid', definicion.subtituloTestid);
    }
    nodo.appendChild(p);
    let contador = null;
    if (definicion.pendientes) {
      contador = crear('span', 'alert-card__count alert-card__count--numero stat-tile__contador');
      contador.setAttribute('data-testid', `contador-tile-${definicion.clave}`);
      nodo.appendChild(contador);
    }
    return {
      nodo,
      pendientes: definicion.pendientes || (() => 0),
      pintar: (metricas, reembolsos) => {
        p.textContent = definicion.subtitulo(metricas, reembolsos);
        if (contador) {
          pintarContadorRedondo(contador, definicion.pendientes(metricas, reembolsos));
        }
      },
    };
  });
}

function ordenarPorUrgencia(tarjetas, tiles, metricas, reembolsos) {
  const conUrgenciaPrimero = (lista) => lista
    .map((elemento, indice) => ({ elemento, indice, urgente: elemento.pendientes(metricas, reembolsos) > 0 }))
    .sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.indice - b.indice)
    .map((entrada) => entrada.elemento);
  const contenedor = document.getElementById('admin-alertas');
  conUrgenciaPrimero(tarjetas).forEach((tarjeta) => contenedor.appendChild(tarjeta.nodo));
  tiles.splice(0, tiles.length, ...conUrgenciaPrimero(tiles));
}

export async function initAdminDashboard() {
  if (!requireAdmin()) {
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarPerfil: false, mostrarCampana: false, centrarLogo: true });

  const [metricas, perfil, reembolsos] = await Promise.all([
    apiFetch('/administrador/metricas'),
    apiFetch('/administrador/perfil'),
    cantidadDeReembolsosParaRevisar(),
  ]);
  normalizarCampos(perfil, ['nombre', 'apellido']);

  document.getElementById('admin-nombre').textContent = `${perfil.nombre} ${perfil.apellido}`;

  const avatarAdmin = document.getElementById('admin-avatar');
  pintarAvatarUsuario(avatarAdmin, perfil.fotoPerfilUrl, 'AD');

  const tarjetas = armarTarjetasDeAtencion();
  const tiles = armarTilesDeGestion();
  ordenarPorUrgencia(tarjetas, tiles, metricas, reembolsos);

  const grid = document.getElementById('gestion-grid');
  tiles.forEach((tile) => grid.appendChild(tile.nodo));

  let ultimaFirma = null;
  function pintar(metricasActuales, reembolsosActuales) {
    const firma = JSON.stringify([metricasActuales, reembolsosActuales]);
    if (firma === ultimaFirma) {
      return;
    }
    ultimaFirma = firma;
    tarjetas.forEach((tarjeta) => tarjeta.pintar(metricasActuales, reembolsosActuales));
    tiles.forEach((tile) => tile.pintar(metricasActuales, reembolsosActuales));
  }
  pintar(metricas, reembolsos);

  let actualizando = false;
  async function actualizar() {
    if (actualizando || document.visibilityState === 'hidden') {
      return;
    }
    actualizando = true;
    try {
      const [metricasNuevas, reembolsosNuevos] = await Promise.all([
        apiFetch('/administrador/metricas', { segundoPlano: true }),
        cantidadDeReembolsosParaRevisar({ segundoPlano: true }),
      ]);
      pintar(metricasNuevas, reembolsosNuevos);
    } catch {
      return;
    } finally {
      actualizando = false;
    }
  }
  const intervalo = window.setInterval(actualizar, INTERVALO_PANEL_ADMIN_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      actualizar();
    }
  });
  window.addEventListener('beforeunload', () => window.clearInterval(intervalo));

  document.getElementById('cerrar-sesion-btn').addEventListener('click', mostrarModalConfirmarLogoutAdmin);
}

function renderRequestCard(comercio) {
  const card = crear('div', 'request-card');
  card.setAttribute('data-testid', `comercio-pendiente-item-${comercio.id}`);

  const top = crear('div', 'request-card__top');
  const h3 = document.createElement('h3');
  h3.textContent = comercio.nombre;
  top.appendChild(h3);
  const badges = crear('div', 'request-card__badges');
  const badge = crear('span', 'status-badge status-badge--nueva');
  badge.textContent = 'Nueva';
  badges.appendChild(badge);
  if (comercio.esAdicional) {
    const badgeAdicional = crear('span', 'status-badge status-badge--adicional');
    badgeAdicional.setAttribute('data-testid', `badge-comercio-adicional-${comercio.id}`);
    badgeAdicional.textContent = 'Comercio adicional';
    badges.appendChild(badgeAdicional);
  }
  top.appendChild(badges);
  card.appendChild(top);

  const rows = crear('div', 'request-card__rows');

  const tipoRow = crear('div', 'comercio-info__row');
  tipoRow.innerHTML = ICONS.store;
  const tipoTexto = document.createElement('span');
  tipoTexto.textContent = labelTipoComercio(comercio.tipoComercio);
  tipoRow.appendChild(tipoTexto);
  rows.appendChild(tipoRow);

  const fechaRow = crear('div', 'comercio-info__row');
  fechaRow.innerHTML = ICONS.calendar;
  const fechaTexto = document.createElement('span');
  fechaTexto.textContent = `Registrado ${formatearTiempoRelativo(comercio.fechaRegistro).toLowerCase()}`;
  fechaRow.appendChild(fechaTexto);
  rows.appendChild(fechaRow);

  const cuentaRow = crear('div', 'comercio-info__row');
  cuentaRow.innerHTML = ICONS.mail;
  const cuentaTexto = document.createElement('span');
  cuentaTexto.textContent = comercio.emailCuenta;
  cuentaRow.appendChild(cuentaTexto);
  rows.appendChild(cuentaRow);

  card.appendChild(rows);

  const footer = document.createElement('a');
  footer.className = 'request-card__footer';
  footer.href = `admin-comercio-detalle.html?id=${comercio.id}`;
  footer.setAttribute('data-testid', `btn-ver-solicitud-${comercio.id}`);
  const label = document.createElement('span');
  label.textContent = 'Ver solicitud';
  footer.appendChild(label);
  const chevron = document.createElement('span');
  chevron.innerHTML = ICONS.chevronRight;
  footer.appendChild(chevron);
  card.appendChild(footer);

  return card;
}

export async function initAdminComerciosPendientes() {
  if (!requireAdmin()) {
    return;
  }

  if (new URLSearchParams(window.location.search).get('comercioResuelto') === '1') {
    showToast('El comercio fue notificado de tu decisión');
  }

  const comercios = await apiFetch('/administrador/comercios/pendientes');
  comercios.forEach(normalizarComercioAdmin);

  const headerBadge = document.getElementById('header-badge');
  headerBadge.textContent = String(comercios.length);
  headerBadge.style.display = comercios.length > 0 ? 'flex' : 'none';

  const container = document.getElementById('pendientes-content');
  container.innerHTML = '';

  if (comercios.length === 0) {
    const wrapper = crear('div', 'state-page');
    const icon = crear('div', 'state-page__icon');
    icon.innerHTML = ICONS.check;
    wrapper.appendChild(icon);
    const h1 = document.createElement('h1');
    h1.className = 'state-page__title';
    h1.textContent = 'No hay solicitudes pendientes';
    wrapper.appendChild(h1);
    const p = document.createElement('p');
    p.className = 'state-page__text';
    p.textContent = 'Todos los comercios registrados ya fueron aprobados o rechazados.';
    wrapper.appendChild(p);
    container.appendChild(wrapper);
    return;
  }

  comercios
    .sort((a, b) => new Date(a.fechaRegistro) - new Date(b.fechaRegistro))
    .forEach((comercio) => container.appendChild(renderRequestCard(comercio)));
}

function renderNoEncontrado(container) {
  container.innerHTML = '';
  const wrapper = crear('div', 'state-page');
  const icon = crear('div', 'state-page__icon');
  icon.innerHTML = ICONS.alert;
  wrapper.appendChild(icon);
  const h1 = document.createElement('h1');
  h1.className = 'state-page__title';
  h1.textContent = 'No encontramos esta solicitud';
  wrapper.appendChild(h1);
  const p = document.createElement('p');
  p.className = 'state-page__text';
  p.textContent = 'El comercio ya fue resuelto o el enlace no es válido.';
  wrapper.appendChild(p);
  const actions = crear('div', 'state-page__actions');
  const cta = document.createElement('a');
  cta.className = 'btn btn-primary';
  cta.href = 'admin-comercios-pendientes.html';
  cta.setAttribute('data-testid', 'btn-ver-pendientes');
  cta.textContent = 'Ver pendientes';
  actions.appendChild(cta);
  wrapper.appendChild(actions);
  container.appendChild(wrapper);
}

function mostrarModalConfirmarAprobacion(comercio, alConfirmar) {
  abrirHoja({
    titulo: '¿Aprobar este comercio?',
    texto: 'Al aprobar, el comercio recibirá una notificación para comenzar a operar.',
    testid: 'modal-confirmar-aprobacion',
    acciones: [
      { etiqueta: 'Confirmar Aprobación', etiquetaEnviando: 'Aprobando…', variante: 'primaria', testid: 'btn-confirmar-aprobacion', alPulsar: alConfirmar },
      { etiqueta: 'Cancelar', variante: 'segura', inicial: true, testid: 'btn-cancelar-aprobacion' },
    ],
  });
}

function mostrarModalRechazarComercio(comercio, alConfirmar, { esUltimoIntento = false } = {}) {
  const motivo = campoTextarea({
    id: 'rechazo-motivo',
    etiqueta: 'Motivo del rechazo',
    placeholder: 'Describí el motivo del rechazo...',
    testid: 'input-motivo-rechazo-comercio',
    testidError: 'mensaje-error-motivo-rechazo-comercio',
    idContador: 'rechazo-contador',
  });

  const interruptor = crear('button', 'switch');
  interruptor.type = 'button';
  interruptor.id = 'rechazo-definitivo-switch';
  interruptor.setAttribute('aria-pressed', 'false');
  interruptor.setAttribute('aria-label', 'Rechazo definitivo');
  interruptor.setAttribute('data-testid', 'switch-rechazo-definitivo');
  interruptor.appendChild(crear('span', 'switch__knob'));
  const etiquetaSwitch = crear('span', 'switch-row__label');
  etiquetaSwitch.textContent = 'Rechazo definitivo';
  const ayuda = crear('span', 'switch-row__ayuda');
  ayuda.id = 'rechazo-definitivo-ayuda';
  ayuda.setAttribute('data-testid', 'ayuda-rechazo-definitivo');
  ayuda.textContent = 'El Dueño no podrá volver a solicitar este comercio.';
  const textos = crear('span', 'switch-row__texto');
  textos.append(etiquetaSwitch, ayuda);
  const fila = crear('div', 'switch-row switch-row--peligro');
  fila.id = 'rechazo-definitivo-fila';
  fila.setAttribute('aria-pressed', 'false');
  fila.setAttribute('data-testid', 'fila-rechazo-definitivo');
  fila.append(textos, interruptor);

  const avisoUltimo = crearAviso('Esta es la última re-solicitud: el rechazo será definitivo.', 'aviso-ultimo-intento');
  avisoUltimo.id = 'aviso-ultimo-intento';
  avisoUltimo.classList.toggle('is-hidden', !esUltimoIntento);
  const avisoDefinitivo = crearAviso('El rechazo definitivo no se puede deshacer.', 'aviso-rechazo-definitivo');
  avisoDefinitivo.classList.add('is-hidden');

  let botonConfirmar = null;
  function definitivoActivo() {
    return interruptor.getAttribute('aria-pressed') === 'true';
  }
  function fijarDefinitivo(activo) {
    interruptor.setAttribute('aria-pressed', String(activo));
    fila.setAttribute('aria-pressed', String(activo));
    avisoDefinitivo.classList.toggle('is-hidden', !activo || esUltimoIntento);
    if (botonConfirmar) {
      botonConfirmar.textContent = activo ? 'Rechazar definitivamente' : 'Confirmar Rechazo';
    }
  }

  const hoja = abrirHoja({
    titulo: 'Rechazar solicitud',
    parrafos: [comercio.nombre, 'El comercio recibirá una notificación con el motivo del rechazo.'],
    testids: { textos: ['nombre-comercio-rechazo'] },
    contenido: [motivo.campo, avisoUltimo, fila, avisoDefinitivo],
    clase: 'hoja--formulario',
    testid: 'modal-rechazar-comercio',
    acciones: [
      {
        etiqueta: 'Confirmar Rechazo',
        etiquetaEnviando: 'Rechazando…',
        variante: 'peligro',
        testid: 'btn-confirmar-rechazo-comercio',
        deshabilitadaSi: () => motivo.control.value.trim().length === 0,
        validar: () => {
          if (!motivo.control.value.trim()) {
            motivo.mostrarError('El motivo es obligatorio para rechazar una solicitud.');
            return false;
          }
          return true;
        },
        alPulsar: () => alConfirmar(motivo.control.value.trim(), definitivoActivo()),
      },
      { etiqueta: 'Cancelar', variante: 'segura', inicial: true, testid: 'btn-cancelar-rechazo-comercio' },
    ],
  });
  botonConfirmar = hoja.hoja.querySelector('[data-testid="btn-confirmar-rechazo-comercio"]');
  const nombreEl = hoja.hoja.querySelector('[data-testid="nombre-comercio-rechazo"]');
  nombreEl.classList.add('hoja__destacado');

  if (esUltimoIntento) {
    fijarDefinitivo(true);
    interruptor.disabled = true;
    fila.classList.add('switch-row--bloqueado');
    ayuda.textContent = 'Bloqueado: este intento ya es el último.';
  } else {
    fijarDefinitivo(false);
    interruptor.addEventListener('click', () => fijarDefinitivo(!definitivoActivo()));
  }
  motivo.control.addEventListener('input', () => hoja.refrescarAcciones());
}

function iniciales(nombre, apellido) {
  return `${(nombre || '').trim().charAt(0)}${(apellido || '').trim().charAt(0)}`.toUpperCase();
}

function renderDuenoYOtrosComercios(body, comercio) {
  const otros = comercio.otrosComercios || [];
  if (otros.length === 0) {
    return;
  }

  const representante = comercio.representante;
  const resumen = crear('div', 'dueno-resumen');
  resumen.setAttribute('data-testid', 'resumen-dueno');
  const circulo = crear('div', 'dueno-resumen__iniciales');
  circulo.textContent = representante ? iniciales(representante.nombre, representante.apellido) : iniciales(comercio.nombre, '');
  resumen.appendChild(circulo);
  const textos = crear('div');
  const nombreEl = crear('div', 'dueno-resumen__nombre');
  nombreEl.setAttribute('data-testid', 'nombre-dueno');
  nombreEl.textContent = representante ? `${representante.nombre} ${representante.apellido}` : comercio.emailCuenta;
  textos.appendChild(nombreEl);
  if (comercio.esAdicional) {
    const nota = crear('div', 'dueno-resumen__nota');
    nota.setAttribute('data-testid', 'nota-datos-fiscales-revisados');
    nota.innerHTML = ICONS.check;
    const notaTexto = document.createElement('span');
    notaTexto.textContent = 'Datos fiscales ya revisados y aprobados';
    nota.appendChild(notaTexto);
    textos.appendChild(nota);
  }
  resumen.appendChild(textos);
  body.appendChild(resumen);

  const seccion = crear('div', 'detail-section');
  seccion.setAttribute('data-testid', 'seccion-otros-comercios');
  const titulo = crear('p', 'detail-section__title');
  titulo.textContent = 'Otros comercios de este Dueño';
  seccion.appendChild(titulo);
  otros.forEach((otro) => {
    const fila = crear('div', 'otro-comercio-row');
    fila.setAttribute('data-testid', `otro-comercio-${otro.id}`);
    const nombre = crear('span', 'otro-comercio-row__nombre');
    nombre.textContent = otro.nombre;
    fila.appendChild(nombre);
    const info = BADGE_ESTADO_COMERCIO[otro.estado] || { label: otro.estado, className: 'status-badge--neutro' };
    const badge = crear('span', `status-badge ${info.className}`);
    badge.setAttribute('data-testid', `estado-otro-comercio-${otro.id}`);
    badge.textContent = info.label;
    fila.appendChild(badge);
    seccion.appendChild(fila);
  });
  body.appendChild(seccion);
}

function renderComercioDetailSections(body, comercio) {
  renderDuenoYOtrosComercios(body, comercio);

  const datosComercio = crear('div', 'detail-section');
  const datosComercioTitulo = crear('p', 'detail-section__title');
  datosComercioTitulo.textContent = 'Datos del Comercio';
  datosComercio.appendChild(datosComercioTitulo);
  if (comercio.estado === 'SUSPENDIDO') {
    datosComercio.appendChild(detailRow('Estado', 'Suspendido'));
  }
  datosComercio.appendChild(detailRow('Nombre comercial', comercio.nombre));
  datosComercio.appendChild(detailRow('Tipo', labelTipoComercio(comercio.tipoComercio)));
  datosComercio.appendChild(detailRow('Teléfono de contacto', comercio.telefono));
  if (comercio.emailContacto) {
    datosComercio.appendChild(detailRow('Email de contacto', comercio.emailContacto));
  }
  datosComercio.appendChild(detailRow('Email de cuenta', comercio.emailCuenta));
  body.appendChild(datosComercio);

  const datosLegales = crear('div', 'detail-section');
  const datosLegalesTitulo = crear('p', 'detail-section__title');
  datosLegalesTitulo.textContent = 'Datos Legales / Fiscales';
  datosLegales.appendChild(datosLegalesTitulo);
  datosLegales.appendChild(detailRow('CUIT', comercio.cuit));
  datosLegales.appendChild(detailRow('Razón Social', comercio.razonSocial || '—'));
  datosLegales.appendChild(detailRow('Condición IVA', comercio.condicionIva ? (LABELS_CONDICION_IVA[comercio.condicionIva] || comercio.condicionIva) : '—'));
  body.appendChild(datosLegales);

  if (comercio.direccion) {
    const direccionSection = crear('div', 'detail-section');
    const direccionTitulo = crear('p', 'detail-section__title');
    direccionTitulo.textContent = 'Dirección';
    direccionSection.appendChild(direccionTitulo);
    direccionSection.appendChild(detailRow('Calle', `${comercio.direccion.calle} ${comercio.direccion.numero}`));
    direccionSection.appendChild(detailRow('Ciudad', comercio.direccion.nombreLocalidad));
    direccionSection.appendChild(detailRow('Provincia', comercio.direccion.nombreProvincia));
    body.appendChild(direccionSection);
  }

  const modalidades = crear('div', 'detail-section');
  const modalidadesTitulo = crear('p', 'detail-section__title');
  modalidadesTitulo.textContent = 'Modalidades de Entrega';
  modalidades.appendChild(modalidadesTitulo);

  const deliveryRow = crear('div', 'detail-row');
  const deliveryLabel = document.createElement('span');
  deliveryLabel.className = 'detail-row__etiqueta-icono';
  deliveryLabel.innerHTML = `${ICONS.truck}<span>Delivery</span>`;
  deliveryRow.appendChild(deliveryLabel);
  const deliveryValor = crear('span', comercio.aceptaDelivery ? '' : '');
  deliveryValor.style.color = comercio.aceptaDelivery ? 'var(--color-success)' : 'var(--color-text-placeholder)';
  deliveryValor.innerHTML = comercio.aceptaDelivery ? ICONS.check : ICONS.xCircle;
  deliveryRow.appendChild(deliveryValor);
  modalidades.appendChild(deliveryRow);

  const retiroRow = crear('div', 'detail-row');
  const retiroLabel = document.createElement('span');
  retiroLabel.className = 'detail-row__etiqueta-icono';
  retiroLabel.innerHTML = `${ICONS.bag}<span>Retiro en local</span>`;
  retiroRow.appendChild(retiroLabel);
  const retiroValor = document.createElement('span');
  retiroValor.style.color = comercio.aceptaRetiro ? 'var(--color-success)' : 'var(--color-text-placeholder)';
  retiroValor.innerHTML = comercio.aceptaRetiro ? ICONS.check : ICONS.xCircle;
  retiroRow.appendChild(retiroValor);
  modalidades.appendChild(retiroRow);

  body.appendChild(modalidades);

  if (comercio.representante) {
    const representanteSection = crear('div', 'detail-section');
    const representanteTitulo = crear('p', 'detail-section__title');
    representanteTitulo.textContent = 'Representante Legal';
    representanteSection.appendChild(representanteTitulo);
    representanteSection.appendChild(detailRow('Nombre', `${comercio.representante.nombre} ${comercio.representante.apellido}`));
    representanteSection.appendChild(detailRow('DNI', comercio.representante.dni));
    representanteSection.appendChild(detailRow('Teléfono', comercio.representante.telefono));
    representanteSection.appendChild(detailRow('Fecha de nacimiento', formatearFecha(comercio.representante.fechaNacimiento)));
    body.appendChild(representanteSection);
  }

  if (comercio.horarios && comercio.horarios.length > 0) {
    const horariosSection = crear('div', 'detail-section');
    const horariosTitulo = crear('p', 'detail-section__title');
    horariosTitulo.textContent = 'Horarios Registrados';
    horariosSection.appendChild(horariosTitulo);
    [...comercio.horarios]
      .sort((a, b) => ORDEN_DIA_SEMANA.indexOf(a.diaSemana) - ORDEN_DIA_SEMANA.indexOf(b.diaSemana))
      .forEach((horario) => {
        horariosSection.appendChild(
          detailRow(LABELS_DIA_SEMANA[horario.diaSemana] || horario.diaSemana, textoRango(horario)),
        );
      });
    body.appendChild(horariosSection);
  }

  const redesSociales = comercio.redesSociales || [];
  const redesSocialesSection = crear('div', 'detail-section');
  const redesSocialesTitulo = crear('p', 'detail-section__title');
  redesSocialesTitulo.textContent = 'Redes Sociales';
  redesSocialesSection.appendChild(redesSocialesTitulo);
  if (redesSociales.length > 0) {
    redesSociales.forEach((redSocial) => {
      redesSocialesSection.appendChild(
        detailRow(LABELS_TIPO_RED_SOCIAL[redSocial.tipo] || redSocial.tipo, redSocial.url),
      );
    });
  } else {
    redesSocialesSection.appendChild(detailRow('Redes sociales', 'Sin redes sociales cargadas'));
  }
  body.appendChild(redesSocialesSection);
}

function renderDetalle(container, comercio, onResuelto) {
  container.innerHTML = '';

  const hero = crear('div', 'request-hero');
  const avatar = crear('div', 'comercio-detail-header__avatar');
  avatar.classList.add('admin-mb-12');
  pintarAvatarComercio(avatar, comercio);
  hero.appendChild(avatar);
  const h1 = document.createElement('h1');
  h1.textContent = comercio.nombre;
  hero.appendChild(h1);

  const fecha = crear('p', 'request-hero__fecha');
  fecha.textContent = `Solicitud enviada: ${formatearFechaHora(comercio.fechaRegistro)}`;
  hero.appendChild(fecha);
  container.appendChild(hero);

  const body = crear('div', 'screen-body screen-body--tight');
  renderComercioDetailSections(body, comercio);
  container.appendChild(body);

  const footer = crear('div', 'request-footer');
  const rechazarBtn = crear('button', 'btn btn-peligro-contorno');
  rechazarBtn.type = 'button';
  rechazarBtn.setAttribute('data-testid', 'btn-rechazar-comercio');
  rechazarBtn.textContent = 'Rechazar';
  rechazarBtn.addEventListener('click', () => {
    mostrarModalRechazarComercio(comercio, async (motivo, definitivo) => {
      await apiFetch(`/administrador/comercios/${comercio.id}/resolver`, {
        method: 'PUT',
        body: { aprobar: false, motivo, definitivo },
      });
      onResuelto();
    });
  });
  footer.appendChild(rechazarBtn);

  const aprobarBtn = crear('button', 'btn btn-primary');
  aprobarBtn.type = 'button';
  aprobarBtn.setAttribute('data-testid', 'btn-aprobar-comercio');
  aprobarBtn.textContent = 'Aprobar';
  aprobarBtn.addEventListener('click', () => {
    mostrarModalConfirmarAprobacion(comercio, async () => {
      await apiFetch(`/administrador/comercios/${comercio.id}/resolver`, {
        method: 'PUT',
        body: { aprobar: true, motivo: null },
      });
      onResuelto();
    });
  });
  footer.appendChild(aprobarBtn);

  container.appendChild(footer);
}

export async function initAdminComercioDetalle() {
  if (!requireAdmin()) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const comercioId = Number(params.get('id'));
  const container = document.getElementById('detalle-content');

  if (!comercioId) {
    renderNoEncontrado(container);
    return;
  }

  const comercios = await apiFetch('/administrador/comercios/pendientes');
  comercios.forEach(normalizarComercioAdmin);
  const comercio = comercios.find((c) => c.id === comercioId);

  if (!comercio) {
    renderNoEncontrado(container);
    return;
  }

  renderDetalle(container, comercio, () => {
    window.location.href = 'admin-comercios-pendientes.html?comercioResuelto=1';
  });
}

function textoResumenEquipo(activos, inactivos) {
  const textoActivos = `${activos} ${activos === 1 ? 'activo' : 'activos'}`;
  const textoInactivos = `${inactivos} ${inactivos === 1 ? 'inactivo' : 'inactivos'}`;
  return `${textoActivos} · ${textoInactivos}`;
}

async function cargarResumenEquipo(seccion, comercioId) {
  try {
    const equipo = await apiFetch(`/administrador/comercios/${comercioId}/equipo`, { handle5xxGlobally: false, handleRedGlobally: false });
    const miembros = equipo.miembros || [];
    const activos = miembros.filter((miembro) => miembro.estado === 'ACTIVO').length;
    const fila = detailRow('Miembros', textoResumenEquipo(activos, miembros.length - activos));
    fila.setAttribute('data-testid', 'resumen-equipo-comercio');
    seccion.lastElementChild.replaceWith(fila);
  } catch {
    seccion.remove();
  }
}

function mostrarModalDetalleComercio(comercio, onSuspendido) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-detalle-comercio');
  const sheet = crear('div', 'product-modal-sheet');
  const handle = crear('div', 'product-modal-sheet__handle');
  handle.innerHTML = '<span></span>';
  sheet.appendChild(handle);

  const body = crear('div', 'product-modal-sheet__body');
  const h2 = document.createElement('h2');
  h2.className = 'admin-h2-centrado';
  h2.textContent = comercio.nombre;
  body.appendChild(h2);

  renderComercioDetailSections(body, comercio);

  const equipoSection = crear('div', 'detail-section');
  equipoSection.setAttribute('data-testid', 'seccion-equipo-comercio');
  const equipoTitulo = crear('p', 'detail-section__title');
  equipoTitulo.textContent = 'Equipo';
  equipoSection.appendChild(equipoTitulo);
  equipoSection.appendChild(crear('div', 'skeleton equipo-resumen__esqueleto'));
  body.appendChild(equipoSection);
  cargarResumenEquipo(equipoSection, comercio.id);

  const verDocumentosBtn = crear('a', 'btn btn-secondary comercio-modal-equipo');
  verDocumentosBtn.href = `admin-documento-revision.html?comercioId=${comercio.id}`;
  verDocumentosBtn.setAttribute('data-testid', 'btn-ver-documentos-comercio');
  verDocumentosBtn.textContent = 'Ver documentos';

  const verEquipoBtn = crear('a', 'btn btn-primary comercio-modal-equipo');
  verEquipoBtn.href = `admin-comercio-equipo.html?id=${comercio.id}`;
  verEquipoBtn.setAttribute('data-testid', 'btn-ver-equipo-comercio');
  verEquipoBtn.innerHTML = `${ICONS.users}<span>Ver equipo</span>`;
  verEquipoBtn.addEventListener('click', () => recordarNombreDelComercio(comercio.id, comercio.nombre));
  body.appendChild(verEquipoBtn);
  body.appendChild(verDocumentosBtn);

  const accionesModal = crear('div', 'comercio-modal-acciones');

  const controles = crearControlesSuspension(comercio, {
    alExito: async () => {
      backdrop.remove();
      await onSuspendido();
      const volver = document.querySelector(`[data-testid="btn-ver-detalle-comercio-${comercio.id}"]`);
      if (volver) volver.focus();
    },
    alConflicto: () => {
      onSuspendido().catch(() => {});
    },
    recargarComercio: async () => {
      const lista = await apiFetch('/administrador/comercios', { handle5xxGlobally: false, handleRedGlobally: false });
      lista.forEach(normalizarComercioAdmin);
      return lista.find((otro) => otro.id === comercio.id);
    },
  });
  if (controles.bloque) {
    h2.after(controles.bloque);
  }
  if (controles.aparte) {
    controles.bloque.after(controles.aparte);
  }
  controles.botones.forEach((boton) => accionesModal.appendChild(boton));

  const cerrarBtn = crear('button', 'btn btn-tertiary');
  cerrarBtn.type = 'button';
  cerrarBtn.setAttribute('data-testid', 'btn-cerrar-modal-detalle-comercio');
  cerrarBtn.textContent = 'Cerrar';
  cerrarBtn.addEventListener('click', () => backdrop.remove());
  accionesModal.appendChild(cerrarBtn);
  body.appendChild(accionesModal);

  sheet.appendChild(body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

function renderComercioAdminRow(comercio, onSuspendido) {
  const row = crear('div', 'comercio-admin-row');
  row.setAttribute('data-testid', `comercio-admin-item-${comercio.id}`);

  const avatar = crear('div', 'comercio-admin-row__avatar');
  pintarAvatarComercio(avatar, comercio);
  row.appendChild(avatar);

  const bodyEl = crear('div', 'comercio-admin-row__body');
  const h3 = document.createElement('h3');
  h3.textContent = comercio.nombre;
  bodyEl.appendChild(h3);
  const p = document.createElement('p');
  p.textContent = labelTipoComercio(comercio.tipoComercio);
  bodyEl.appendChild(p);
  const info = BADGE_ESTADO_COMERCIO[comercio.estado] || { label: comercio.estado, className: 'status-badge--neutro' };
  const badge = crear('span', `status-badge ${info.className}`);
  badge.setAttribute('data-testid', `estado-comercio-${comercio.id}`);
  badge.setAttribute('data-estado', comercio.estado);
  badge.textContent = info.label;
  bodyEl.appendChild(badge);
  row.appendChild(bodyEl);

  const detalleBtn = crear('button', 'comercio-admin-row__detalle');
  detalleBtn.type = 'button';
  detalleBtn.setAttribute('data-testid', `btn-ver-detalle-comercio-${comercio.id}`);
  detalleBtn.innerHTML = `<span>Ver detalle</span>${ICONS.chevronRight}`;
  detalleBtn.addEventListener('click', () => mostrarModalDetalleComercio(comercio, onSuspendido));
  row.appendChild(detalleBtn);

  return row;
}

export async function initAdminComercios() {
  if (!requireAdmin()) {
    return;
  }

  const comercios = await apiFetch('/administrador/comercios');
  comercios.forEach(normalizarComercioAdmin);
  const container = document.getElementById('comercios-content');
  container.innerHTML = '';

  if (comercios.length === 0) {
    const wrapper = crear('div', 'state-page');
    const icon = crear('div', 'state-page__icon');
    icon.innerHTML = ICONS.store;
    wrapper.appendChild(icon);
    const h1 = document.createElement('h1');
    h1.className = 'state-page__title';
    h1.textContent = 'No hay comercios';
    wrapper.appendChild(h1);
    container.appendChild(wrapper);
    return;
  }

  container.appendChild(crearEncabezadoTabla('comercios', [{ etiqueta: '' }, { etiqueta: 'Comercio' }, { etiqueta: 'Tipo' }, { etiqueta: 'Estado' }, { etiqueta: '' }], 'encabezado-comercios'));
  comercios
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach((comercio) => container.appendChild(renderComercioAdminRow(comercio, initAdminComercios)));
}

function labelCantidadProductos(cantidad) {
  return cantidad === 1 ? '1 producto asociado' : `${cantidad} productos asociados`;
}

function mostrarModalCategoria(categoriaExistente, onGuardado) {
  const esEdicion = Boolean(categoriaExistente);
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-categoria');
  const sheet = crear('div', 'product-modal-sheet');
  const handle = crear('div', 'product-modal-sheet__handle');
  handle.innerHTML = '<span></span>';
  sheet.appendChild(handle);

  const body = crear('div', 'product-modal-sheet__body');
  const h2 = document.createElement('h2');
  h2.className = 'admin-h2-mb-16';
  h2.textContent = esEdicion ? 'Editar Categoría' : 'Nueva Categoría';
  body.appendChild(h2);

  const form = crear('form', 'form');
  form.setAttribute('novalidate', '');

  const nombreField = crear('div', 'field');
  const nombreLabel = document.createElement('label');
  nombreLabel.className = 'field__label';
  nombreLabel.setAttribute('for', 'categoria-nombre-input');
  nombreLabel.textContent = 'Nombre de la categoría';
  nombreField.appendChild(nombreLabel);
  const nombreShell = crear('div', 'input-shell');
  const nombreInput = document.createElement('input');
  nombreInput.type = 'text';
  nombreInput.id = 'categoria-nombre-input';
  nombreInput.maxLength = 100;
  nombreInput.setAttribute('data-testid', 'input-nombre-categoria');
  nombreInput.value = esEdicion ? categoriaExistente.nombre : '';
  nombreShell.appendChild(nombreInput);
  nombreField.appendChild(nombreShell);
  const nombreError = crear('div', 'field__error');
  nombreError.style.display = 'none';
  nombreError.setAttribute('data-testid', 'mensaje-error-nombre-categoria');
  const nombreErrorTexto = document.createElement('span');
  nombreError.innerHTML = ICONS.xCircle;
  nombreError.appendChild(nombreErrorTexto);
  nombreField.appendChild(nombreError);
  form.appendChild(nombreField);

  let activo = esEdicion ? categoriaExistente.activo : true;
  if (esEdicion) {
    const activoRow = crear('div', 'switch-row');
    activoRow.setAttribute('aria-pressed', String(activo));
    const activoLabel = crear('span', 'switch-row__label');
    activoLabel.textContent = 'Categoría activa';
    activoRow.appendChild(activoLabel);
    const activoSwitch = crear('button', 'switch');
    activoSwitch.type = 'button';
    activoSwitch.setAttribute('aria-pressed', String(activo));
    activoSwitch.setAttribute('data-testid', 'btn-switch-categoria-activa');
    activoSwitch.innerHTML = '<span class="switch__knob"></span>';
    activoSwitch.addEventListener('click', () => {
      activo = !activo;
      activoRow.setAttribute('aria-pressed', String(activo));
      activoSwitch.setAttribute('aria-pressed', String(activo));
    });
    activoRow.appendChild(activoSwitch);
    form.appendChild(activoRow);

    const hint = crear('p', 'field__hint');
    hint.textContent = 'Solo las categorías activas pueden asignarse a productos.';
    form.appendChild(hint);
  }

  const submitBtn = crear('button', 'btn btn-primary');
  submitBtn.type = 'submit';
  submitBtn.classList.add('admin-mt-8');
  submitBtn.setAttribute('data-testid', 'btn-guardar-categoria');
  submitBtn.textContent = esEdicion ? 'Guardar Cambios' : 'Crear Categoría';
  form.appendChild(submitBtn);

  const cancelBtn = crear('button', 'btn btn-tertiary');
  cancelBtn.type = 'button';
  cancelBtn.setAttribute('data-testid', 'btn-cancelar-categoria');
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => backdrop.remove());
  form.appendChild(cancelBtn);

  function mostrarErrorNombre(mensaje) {
    nombreShell.classList.add('input-shell--error');
    nombreError.style.display = 'flex';
    nombreErrorTexto.textContent = mensaje;
    enlazarControlConError(nombreError, true);
  }

  nombreInput.addEventListener('input', () => {
    nombreShell.classList.remove('input-shell--error');
    nombreError.style.display = 'none';
    enlazarControlConError(nombreError, false);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nombre = nombreInput.value.trim();
    if (!nombre) {
      mostrarErrorNombre('El nombre de la categoría es obligatorio.');
      return;
    }

    submitBtn.disabled = true;
    try {
      if (esEdicion) {
        await apiFetch(`/categorias/${categoriaExistente.id}`, { method: 'PUT', body: { nombre } });
        if (activo !== categoriaExistente.activo) {
          if (activo) {
            await apiFetch(`/categorias/${categoriaExistente.id}/reactivar`, { method: 'PUT' });
          } else {
            await apiFetch(`/categorias/${categoriaExistente.id}`, { method: 'DELETE' });
          }
        }
        showToast('Categoría actualizada correctamente');
      } else {
        const creada = await apiFetch('/categorias', { method: 'POST', body: { nombre } });
        if (!activo) {
          await apiFetch(`/categorias/${creada.id}`, { method: 'DELETE' });
        }
        showToast('Categoría creada correctamente');
      }
      backdrop.remove();
      onGuardado();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        mostrarErrorNombre(error.message || 'Ya existe una categoría con ese nombre.');
      } else {
        showToast(error instanceof ApiError ? error.message : 'No pudimos guardar la categoría', 'error');
      }
    } finally {
      submitBtn.disabled = false;
    }
  });

  body.appendChild(form);
  sheet.appendChild(body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

function crearEstadoDeFila(activo, textoActivo, textoInactivo) {
  const estado = crear('span', `categoria-row__estado${activo ? '' : ' categoria-row__estado--inactivo'}`);
  estado.hidden = true;
  estado.setAttribute('data-testid', 'estado-fila');
  estado.textContent = activo ? textoActivo : textoInactivo;
  return estado;
}

function renderCategoriaRow(categoria, { onEditar }) {
  const row = crear('div', `categoria-row${categoria.activo ? '' : ' categoria-row--inactivo'}`);
  row.setAttribute('data-testid', `categoria-item-${categoria.id}`);

  const icon = crear('div', 'categoria-row__icon');
  icon.innerHTML = ICONS.tag;
  row.appendChild(icon);

  const info = crear('div', 'categoria-row__info');
  const h3 = document.createElement('h3');
  h3.textContent = categoria.nombre;
  info.appendChild(h3);
  const p = document.createElement('p');
  p.textContent = labelCantidadProductos(categoria.cantidadProductos);
  info.appendChild(p);
  row.appendChild(info);

  row.appendChild(crearEstadoDeFila(categoria.activo, 'Activa', 'Inactiva'));

  const editarBtn = crear('button', 'categoria-row__edit-btn');
  editarBtn.type = 'button';
  editarBtn.setAttribute('aria-label', 'Editar categoría');
  editarBtn.setAttribute('data-testid', `btn-editar-categoria-${categoria.id}`);
  editarBtn.innerHTML = ICONS.edit;
  editarBtn.addEventListener('click', onEditar);
  row.appendChild(editarBtn);

  return row;
}

export async function initAdminCategorias() {
  if (!requireAdmin()) {
    return;
  }

  const chipRow = document.getElementById('categorias-chip-row');
  const content = document.getElementById('categorias-content');
  const fab = document.getElementById('crear-categoria-fab');

  let categorias = await apiFetch('/categorias');
  let filtro = 'todas';

  function renderChips() {
    chipRow.innerHTML = '';
    const activas = categorias.filter((c) => c.activo).length;
    const inactivas = categorias.length - activas;
    const filtros = [
      { key: 'todas', label: `Todas (${categorias.length})` },
      { key: 'activas', label: `Activas (${activas})` },
      { key: 'inactivas', label: `Inactivas (${inactivas})` },
    ];
    filtros.forEach((filtroItem) => {
      const chip = crear('button', 'chip');
      chip.type = 'button';
      chip.textContent = filtroItem.label;
      chip.setAttribute('data-testid', `chip-filtro-categoria-${filtroItem.key}`);
      chip.setAttribute('aria-pressed', String(filtro === filtroItem.key));
      chip.addEventListener('click', () => {
        filtro = filtroItem.key;
        render();
      });
      chipRow.appendChild(chip);
    });
  }

  function renderLista() {
    content.innerHTML = '';

    const filtradas = categorias.filter((categoria) => {
      if (filtro === 'activas') return categoria.activo;
      if (filtro === 'inactivas') return !categoria.activo;
      return true;
    });

    if (filtradas.length === 0) {
      const wrapper = crear('div', 'state-page');
      const icon = crear('div', 'state-page__icon');
      icon.innerHTML = ICONS.tag;
      wrapper.appendChild(icon);
      const h1 = document.createElement('h1');
      h1.className = 'state-page__title';
      h1.textContent = 'No hay categorías para mostrar';
      wrapper.appendChild(h1);
      content.appendChild(wrapper);
      return;
    }

    content.appendChild(crearEncabezadoTabla('categorias', [{ etiqueta: '' }, { etiqueta: 'Nombre' }, { etiqueta: 'Productos' }, { etiqueta: 'Estado' }, { etiqueta: '' }], 'encabezado-categorias'));
    const lista = crear('div', 'categoria-list tabla-admin tabla--categorias');
    filtradas.forEach((categoria) => {
      lista.appendChild(
        renderCategoriaRow(categoria, {
          onEditar: () => abrirModalCategoria(categoria),
        }),
      );
    });
    content.appendChild(lista);
  }

  function render() {
    renderChips();
    renderLista();
  }

  async function recargar() {
    categorias = await apiFetch('/categorias');
    render();
  }

  function abrirModalCategoria(categoriaExistente) {
    mostrarModalCategoria(categoriaExistente, () => {
      recargar();
    });
  }

  fab.addEventListener('click', () => abrirModalCategoria(null));
  const nuevaEscritorio = document.getElementById('nueva-categoria-escritorio');
  nuevaEscritorio.addEventListener('click', () => abrirModalCategoria(null));
  nuevaEscritorio.disabled = false;
  fab.disabled = false;

  render();
}

function mostrarModalTag(tagExistente, onGuardado) {
  const esEdicion = Boolean(tagExistente);
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-tag');
  const sheet = crear('div', 'product-modal-sheet');
  const handle = crear('div', 'product-modal-sheet__handle');
  handle.innerHTML = '<span></span>';
  sheet.appendChild(handle);

  const body = crear('div', 'product-modal-sheet__body');
  const h2 = document.createElement('h2');
  h2.className = 'admin-h2-mb-16';
  h2.textContent = esEdicion ? 'Editar Tag' : 'Nuevo Tag';
  body.appendChild(h2);

  const form = crear('form', 'form');
  form.setAttribute('novalidate', '');

  const nombreField = crear('div', 'field');
  const nombreLabel = document.createElement('label');
  nombreLabel.className = 'field__label';
  nombreLabel.setAttribute('for', 'tag-nombre-input');
  nombreLabel.textContent = 'Nombre del tag';
  nombreField.appendChild(nombreLabel);
  const nombreShell = crear('div', 'input-shell');
  const nombreInput = document.createElement('input');
  nombreInput.type = 'text';
  nombreInput.id = 'tag-nombre-input';
  nombreInput.maxLength = 100;
  nombreInput.setAttribute('data-testid', 'input-nombre-tag');
  nombreInput.placeholder = 'Ej: Vegano, Sin TACC...';
  nombreInput.value = esEdicion ? tagExistente.nombre : '';
  nombreShell.appendChild(nombreInput);
  nombreField.appendChild(nombreShell);
  const nombreError = crear('div', 'field__error');
  nombreError.style.display = 'none';
  nombreError.setAttribute('data-testid', 'mensaje-error-nombre-tag');
  const nombreErrorTexto = document.createElement('span');
  nombreError.innerHTML = ICONS.xCircle;
  nombreError.appendChild(nombreErrorTexto);
  nombreField.appendChild(nombreError);
  form.appendChild(nombreField);

  let activo = esEdicion ? tagExistente.activo : true;
  if (esEdicion) {
    const activoRow = crear('div', 'switch-row');
    activoRow.setAttribute('aria-pressed', String(activo));
    const activoLabel = crear('span', 'switch-row__label');
    activoLabel.textContent = 'Tag activo';
    activoRow.appendChild(activoLabel);
    const activoSwitch = crear('button', 'switch');
    activoSwitch.type = 'button';
    activoSwitch.setAttribute('aria-pressed', String(activo));
    activoSwitch.setAttribute('data-testid', 'btn-switch-tag-activo');
    activoSwitch.innerHTML = '<span class="switch__knob"></span>';
    activoSwitch.addEventListener('click', () => {
      activo = !activo;
      activoRow.setAttribute('aria-pressed', String(activo));
      activoSwitch.setAttribute('aria-pressed', String(activo));
    });
    activoRow.appendChild(activoSwitch);
    form.appendChild(activoRow);

    const hint = crear('p', 'field__hint');
    hint.textContent = 'Solo los tags activos pueden asignarse a productos.';
    form.appendChild(hint);
  }

  const submitBtn = crear('button', 'btn btn-primary');
  submitBtn.type = 'submit';
  submitBtn.classList.add('admin-mt-8');
  submitBtn.setAttribute('data-testid', 'btn-guardar-tag');
  submitBtn.textContent = esEdicion ? 'Guardar Cambios' : 'Crear Tag';
  form.appendChild(submitBtn);

  const cancelBtn = crear('button', 'btn btn-tertiary');
  cancelBtn.type = 'button';
  cancelBtn.setAttribute('data-testid', 'btn-cancelar-tag');
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => backdrop.remove());
  form.appendChild(cancelBtn);

  function mostrarErrorNombre(mensaje) {
    nombreShell.classList.add('input-shell--error');
    nombreError.style.display = 'flex';
    nombreErrorTexto.textContent = mensaje;
    enlazarControlConError(nombreError, true);
  }

  nombreInput.addEventListener('input', () => {
    nombreShell.classList.remove('input-shell--error');
    nombreError.style.display = 'none';
    enlazarControlConError(nombreError, false);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nombre = nombreInput.value.trim();
    if (!nombre) {
      mostrarErrorNombre('El nombre del tag es obligatorio.');
      return;
    }

    submitBtn.disabled = true;
    try {
      if (esEdicion) {
        await apiFetch(`/tags/${tagExistente.id}`, { method: 'PUT', body: { nombre } });
        if (activo !== tagExistente.activo) {
          if (activo) {
            await apiFetch(`/tags/${tagExistente.id}/reactivar`, { method: 'PUT' });
          } else {
            await apiFetch(`/tags/${tagExistente.id}`, { method: 'DELETE' });
          }
        }
        showToast('Tag actualizado correctamente');
      } else {
        const creado = await apiFetch('/tags', { method: 'POST', body: { nombre } });
        if (!activo) {
          await apiFetch(`/tags/${creado.id}`, { method: 'DELETE' });
        }
        showToast('Tag creado correctamente');
      }
      backdrop.remove();
      onGuardado();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        mostrarErrorNombre(error.message || 'Ya existe un tag con ese nombre.');
      } else {
        showToast(error instanceof ApiError ? error.message : 'No pudimos guardar el tag', 'error');
      }
    } finally {
      submitBtn.disabled = false;
    }
  });

  body.appendChild(form);
  sheet.appendChild(body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

function renderTagRow(tag, { onEditar }) {
  const row = crear('div', `categoria-row${tag.activo ? '' : ' categoria-row--inactivo'}`);
  row.setAttribute('data-testid', `tag-item-${tag.id}`);

  const icon = crear('div', 'categoria-row__icon');
  icon.innerHTML = ICONS.hash;
  row.appendChild(icon);

  const info = crear('div', 'categoria-row__info');
  const h3 = document.createElement('h3');
  h3.textContent = tag.nombre;
  info.appendChild(h3);
  const p = document.createElement('p');
  p.textContent = labelCantidadProductos(tag.cantidadProductos);
  info.appendChild(p);
  row.appendChild(info);

  row.appendChild(crearEstadoDeFila(tag.activo, 'Activo', 'Inactivo'));

  const editarBtn = crear('button', 'categoria-row__edit-btn');
  editarBtn.type = 'button';
  editarBtn.setAttribute('aria-label', 'Editar tag');
  editarBtn.setAttribute('data-testid', `btn-editar-tag-${tag.id}`);
  editarBtn.innerHTML = ICONS.edit;
  editarBtn.addEventListener('click', onEditar);
  row.appendChild(editarBtn);

  return row;
}

export async function initAdminTags() {
  if (!requireAdmin()) {
    return;
  }

  const chipRow = document.getElementById('tags-chip-row');
  const content = document.getElementById('tags-content');
  const fab = document.getElementById('crear-tag-fab');

  let tags = await apiFetch('/tags');
  let filtro = 'todos';

  function renderChips() {
    chipRow.innerHTML = '';
    const activos = tags.filter((tag) => tag.activo).length;
    const inactivos = tags.length - activos;
    const filtros = [
      { key: 'todos', label: `Todos (${tags.length})` },
      { key: 'activos', label: `Activos (${activos})` },
      { key: 'inactivos', label: `Inactivos (${inactivos})` },
    ];
    filtros.forEach((filtroItem) => {
      const chip = crear('button', 'chip');
      chip.type = 'button';
      chip.textContent = filtroItem.label;
      chip.setAttribute('data-testid', `chip-filtro-tag-${filtroItem.key}`);
      chip.setAttribute('aria-pressed', String(filtro === filtroItem.key));
      chip.addEventListener('click', () => {
        filtro = filtroItem.key;
        render();
      });
      chipRow.appendChild(chip);
    });
  }

  function renderLista() {
    content.innerHTML = '';

    const filtrados = tags.filter((tag) => {
      if (filtro === 'activos') return tag.activo;
      if (filtro === 'inactivos') return !tag.activo;
      return true;
    });

    if (filtrados.length === 0) {
      const wrapper = crear('div', 'state-page');
      const icon = crear('div', 'state-page__icon');
      icon.innerHTML = ICONS.hash;
      wrapper.appendChild(icon);
      const h1 = document.createElement('h1');
      h1.className = 'state-page__title';
      h1.textContent = 'No hay tags para mostrar';
      wrapper.appendChild(h1);
      content.appendChild(wrapper);
      return;
    }

    content.appendChild(crearEncabezadoTabla('categorias', [{ etiqueta: '' }, { etiqueta: 'Nombre' }, { etiqueta: 'Productos' }, { etiqueta: 'Estado' }, { etiqueta: '' }], 'encabezado-tags'));
    const lista = crear('div', 'categoria-list tabla-admin tabla--categorias');
    filtrados.forEach((tag) => {
      lista.appendChild(
        renderTagRow(tag, {
          onEditar: () => abrirModalTag(tag),
        }),
      );
    });
    content.appendChild(lista);
  }

  function render() {
    renderChips();
    renderLista();
  }

  async function recargar() {
    tags = await apiFetch('/tags');
    render();
  }

  function abrirModalTag(tagExistente) {
    mostrarModalTag(tagExistente, () => {
      recargar();
    });
  }

  fab.addEventListener('click', () => abrirModalTag(null));
  const nuevoEscritorio = document.getElementById('nuevo-tag-escritorio');
  nuevoEscritorio.addEventListener('click', () => abrirModalTag(null));
  nuevoEscritorio.disabled = false;
  fab.disabled = false;

  render();
}

function crearCampoCargo(idPrefix, tituloLabel, tipoDefault) {
  const field = crear('div', 'field');
  const label = document.createElement('label');
  label.className = 'field__label';
  label.setAttribute('for', `${idPrefix}-valor`);
  label.textContent = tituloLabel;
  field.appendChild(label);

  const row = crear('div', 'schedule-row');

  const selectShell = crear('div', 'select-shell');
  selectShell.classList.add('admin-flex-1');
  const select = document.createElement('select');
  select.id = `${idPrefix}-tipo`;
  select.setAttribute('data-testid', `select-tipo-${idPrefix}`);
  Object.entries(LABELS_TIPO_CARGO).forEach(([valor, texto]) => {
    const option = document.createElement('option');
    option.value = valor;
    option.textContent = texto;
    select.appendChild(option);
  });
  select.value = tipoDefault;
  selectShell.appendChild(select);
  const chevron = document.createElement('span');
  chevron.innerHTML = '<svg class="select-shell__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  selectShell.appendChild(chevron.firstChild);
  row.appendChild(selectShell);

  const inputShell = crear('div', 'input-shell');
  inputShell.classList.add('admin-flex-1');
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '0.01';
  input.id = `${idPrefix}-valor`;
  input.placeholder = '0';
  input.setAttribute('data-testid', `input-valor-${idPrefix}`);
  inputShell.appendChild(input);
  row.appendChild(inputShell);

  field.appendChild(row);

  const error = crear('div', 'field__error');
  error.style.display = 'none';
  error.setAttribute('data-testid', `mensaje-error-${idPrefix}`);
  const errorTexto = document.createElement('span');
  error.innerHTML = ICONS.xCircle;
  error.appendChild(errorTexto);
  field.appendChild(error);

  return { field, select, input, inputShell, error, errorTexto };
}

function crearFilaComparacionTarifa(etiqueta, antes, ahora) {
  const fila = crear('div', 'tarifa-comparacion__fila');
  const nombre = crear('span', 'tarifa-comparacion__etiqueta');
  nombre.textContent = etiqueta;
  const valores = crear('span', 'tarifa-comparacion__valores');
  const valorAntes = crear('span', 'tarifa-comparacion__antes');
  valorAntes.textContent = antes;
  const flecha = crear('span', 'tarifa-comparacion__flecha');
  flecha.setAttribute('aria-hidden', 'true');
  flecha.textContent = '→';
  const valorAhora = crear('strong', 'tarifa-comparacion__ahora');
  valorAhora.textContent = ahora;
  valores.append(valorAntes, flecha, valorAhora);
  fila.append(nombre, valores);
  return fila;
}

function confirmarNuevaTarifa(datos, vigente, { alGuardado }) {
  const comparacion = crear('div', 'tarifa-comparacion');
  comparacion.setAttribute('data-testid', 'comparacion-tarifa');
  const antesCliente = vigente ? formatearCargo(vigente.cargoCliente, vigente.tipoCargoCliente) : 'Sin tarifa';
  const antesComercio = vigente ? formatearCargo(vigente.cargoComercio, vigente.tipoCargoComercio) : 'Sin tarifa';
  comparacion.append(
    crearFilaComparacionTarifa('Cargo al cliente', antesCliente, formatearCargo(datos.cargoCliente, datos.tipoCargoCliente)),
    crearFilaComparacionTarifa('Cargo al comercio', antesComercio, formatearCargo(datos.cargoComercio, datos.tipoCargoComercio)),
  );
  abrirHoja({
    titulo: '¿Aplicar la nueva tarifa?',
    texto: 'Se aplica a los pedidos que se confirmen desde ahora. Los pedidos ya creados conservan la tarifa con la que se confirmaron.',
    parrafos: ['Si un cliente está por confirmar su pedido, va a ver el total actualizado antes de pagar.'],
    contenido: comparacion,
    testid: 'modal-confirmar-tarifa',
    acciones: [
      {
        etiqueta: 'Aplicar tarifa',
        etiquetaEnviando: 'Aplicando…',
        variante: 'primaria',
        testid: 'btn-confirmar-nueva-tarifa',
        alPulsar: async () => {
          await apiFetch('/administrador/tarifas', { method: 'POST', body: datos });
          showToast('Tarifa creada correctamente');
          await alGuardado();
        },
      },
      { etiqueta: 'Cancelar', variante: 'segura', inicial: true, testid: 'btn-cancelar-confirmar-tarifa' },
    ],
  });
}

function crearFormularioTarifa({ vigente, alGuardado, alCancelar = null }) {
  const form = crear('form', 'form');
  form.setAttribute('novalidate', '');

  const campoCliente = crearCampoCargo('cargo-cliente', 'Cargo al cliente', 'FIJO');
  form.appendChild(campoCliente.field);
  const campoComercio = crearCampoCargo('cargo-comercio', 'Cargo al comercio', 'PORCENTAJE');
  form.appendChild(campoComercio.field);

  const submitBtn = crear('button', 'btn btn-primary');
  submitBtn.type = 'submit';
  submitBtn.classList.add('admin-mt-8');
  submitBtn.setAttribute('data-testid', 'btn-guardar-nueva-tarifa');
  submitBtn.textContent = 'Guardar nueva tarifa';
  form.appendChild(submitBtn);

  if (alCancelar) {
    const cancelBtn = crear('button', 'btn btn-tertiary');
    cancelBtn.type = 'button';
    cancelBtn.setAttribute('data-testid', 'btn-cancelar-nueva-tarifa');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', alCancelar);
    form.appendChild(cancelBtn);
  }

  function limpiarError(campo) {
    campo.inputShell.classList.remove('input-shell--error');
    campo.error.style.display = 'none';
    enlazarControlConError(campo.error, false);
  }
  function mostrarError(campo, mensaje) {
    campo.inputShell.classList.add('input-shell--error');
    campo.error.style.display = 'flex';
    campo.errorTexto.textContent = mensaje;
    enlazarControlConError(campo.error, true);
  }
  [campoCliente, campoComercio].forEach((campo) => {
    campo.input.addEventListener('input', () => limpiarError(campo));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let valido = true;
    [campoCliente, campoComercio].forEach((campo) => {
      const valor = campo.input.value.trim();
      if (valor === '' || Number.isNaN(Number(valor)) || Number(valor) < 0) {
        mostrarError(campo, 'Ingresá un valor numérico igual o mayor a 0.');
        valido = false;
      }
    });
    if (!valido) {
      return;
    }

    const datos = {
      cargoCliente: Number(campoCliente.input.value),
      tipoCargoCliente: campoCliente.select.value,
      cargoComercio: Number(campoComercio.input.value),
      tipoCargoComercio: campoComercio.select.value,
    };

    confirmarNuevaTarifa(datos, vigente, { alGuardado });
  });

  return form;
}

function mostrarModalNuevaTarifa(onGuardado, vigente) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-nueva-tarifa');
  const sheet = crear('div', 'product-modal-sheet');
  const handle = crear('div', 'product-modal-sheet__handle');
  handle.innerHTML = '<span></span>';
  sheet.appendChild(handle);

  const body = crear('div', 'product-modal-sheet__body');
  const h2 = document.createElement('h2');
  h2.className = 'admin-h2-mb-6';
  h2.textContent = 'Nueva configuración de tarifa';
  body.appendChild(h2);
  const descripcion = crear('p', 'product-modal-sheet__description');
  descripcion.classList.add('admin-mb-16');
  descripcion.textContent = 'Se aplica a todos los pedidos nuevos a partir de este momento.';
  body.appendChild(descripcion);

  body.appendChild(crearFormularioTarifa({
    vigente,
    alGuardado: async () => {
      backdrop.remove();
      await onGuardado();
    },
    alCancelar: () => backdrop.remove(),
  }));
  sheet.appendChild(body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

export async function initAdminTarifas() {
  if (!requireAdmin()) {
    return;
  }

  const content = document.getElementById('tarifas-content');

  let vigente = await apiFetch('/administrador/tarifas/vigente');
  let historial = await apiFetch('/administrador/tarifas/historial');

  async function recargar() {
    [vigente, historial] = await Promise.all([
      apiFetch('/administrador/tarifas/vigente'),
      apiFetch('/administrador/tarifas/historial'),
    ]);
    render();
  }

  function renderVigente() {
    const section = crear('div', 'detail-section');

    const badge = crear('span', 'status-badge status-badge--nueva');
    badge.classList.add('admin-mb-12');
    badge.textContent = `Activa desde ${formatearSoloFecha(vigente.fechaVigencia)}`;
    section.appendChild(badge);

    const bar = crear('div', 'stats-bar');
    bar.classList.add('admin-stats-vigente');
    [
      { titulo: formatearCargo(vigente.cargoCliente, vigente.tipoCargoCliente), label: `Cargo al cliente · ${labelResumenCargo(vigente.tipoCargoCliente)}` },
      { titulo: formatearCargo(vigente.cargoComercio, vigente.tipoCargoComercio), label: `Cargo al comercio · ${labelResumenCargo(vigente.tipoCargoComercio)}` },
    ].forEach((col) => {
      const wrap = crear('div', 'stats-bar__col');
      const valor = crear('p', 'stats-bar__value');
      valor.textContent = col.titulo;
      wrap.appendChild(valor);
      const label = crear('p', 'stats-bar__label');
      label.textContent = col.label;
      wrap.appendChild(label);
      bar.appendChild(wrap);
    });
    section.appendChild(bar);

    const nuevaBtn = crear('button', 'btn btn-primary');
    nuevaBtn.type = 'button';
    nuevaBtn.setAttribute('data-testid', 'btn-nueva-tarifa');
    nuevaBtn.textContent = '+ Nueva configuración';
    nuevaBtn.addEventListener('click', () => mostrarModalNuevaTarifa(recargar, vigente));
    section.appendChild(nuevaBtn);

    return section;
  }

  function renderHistorial() {
    const section = crear('div', 'detail-section');
    const anteriores = historial.filter((item) => item.id !== vigente.id);

    if (anteriores.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'field__hint';
      vacio.textContent = 'Todavía no hay configuraciones anteriores.';
      section.appendChild(vacio);
      return section;
    }

    anteriores.forEach((item) => {
      section.appendChild(detailRow(
        formatearFechaHora(item.fechaVigencia),
        `${formatearCargo(item.cargoCliente, item.tipoCargoCliente)} cliente · ${formatearCargo(item.cargoComercio, item.tipoCargoComercio)} comercio`,
      ));
    });
    return section;
  }

  function renderFormularioEscritorio() {
    const tarjeta = crear('section', 'tarifa-formulario');
    tarjeta.setAttribute('data-testid', 'tarifa-formulario');
    tarjeta.setAttribute('aria-labelledby', 'tarifa-formulario-titulo');
    const titulo = crear('h2', 'tarifa-formulario__titulo');
    titulo.id = 'tarifa-formulario-titulo';
    titulo.textContent = 'Nueva configuración de tarifa';
    const descripcion = crear('p', 'tarifa-formulario__texto');
    descripcion.textContent = 'Se aplica a todos los pedidos nuevos a partir de este momento.';
    tarjeta.append(titulo, descripcion, crearFormularioTarifa({ vigente, alGuardado: recargar }));
    return tarjeta;
  }

  function render() {
    content.innerHTML = '';

    const headingVigente = crear('p', 'section-heading');
    headingVigente.classList.add('section-heading--sin-margen');
    headingVigente.textContent = 'Tarifa vigente';
    content.appendChild(headingVigente);
    content.appendChild(renderVigente());

    const headingHistorial = crear('p', 'section-heading');
    headingHistorial.classList.add('section-heading--separado');
    headingHistorial.textContent = 'Historial';
    content.appendChild(headingHistorial);
    content.appendChild(renderHistorial());
    if (window.matchMedia('(min-width: 1024px)').matches) {
      content.appendChild(renderFormularioEscritorio());
    }
  }

  render();
}

const LABELS_ESTADO_REEMBOLSO = {
  PENDIENTE_REVISION_MANUAL: 'Revisión manual',
  FALLIDO: 'Fallido',
};

const DOT_ESTADO_REEMBOLSO = {
  PENDIENTE_REVISION_MANUAL: 'cliente-estado__dot--pendiente',
  FALLIDO: 'cliente-estado__dot--bloqueado',
};

const LABELS_MOTIVO_REEMBOLSO = {
  RECHAZO_COMERCIO: 'Rechazo del comercio',
  CANCELACION_CLIENTE: 'Cancelación del cliente',
  ANULACION_COMERCIO: 'Anulación del comercio',
  SUSPENSION_COMERCIO: 'Suspensión del comercio',
  EXPIRACION_SIN_RESPUESTA: 'Sin respuesta del comercio',
  SUSPENSION_CLIENTE: 'Suspensión de cuenta',
  PAGO_TARDIO: 'Pago tardío',
  RECLAMO: 'Reclamo',
};

const FILTROS_REEMBOLSOS = [
  { key: null, label: 'Todos' },
  { key: 'PENDIENTE_REVISION_MANUAL', label: 'Revisión manual' },
  { key: 'FALLIDO', label: 'Fallidos' },
];

function renderReembolsoRow(nota, onReintentar) {
  const row = crear('div', 'cliente-admin-row reembolso-row');
  row.setAttribute('data-testid', `reembolso-item-${nota.id}`);

  const top = crear('div', 'cliente-admin-row__top');
  const h3 = document.createElement('h3');
  h3.textContent = nota.codigo;
  h3.setAttribute('data-testid', 'codigo-reembolso');
  top.appendChild(h3);
  const badge = crear('span', 'cliente-estado');
  badge.setAttribute('data-testid', 'estado-reembolso');
  badge.appendChild(crear('span', `cliente-estado__dot ${DOT_ESTADO_REEMBOLSO[nota.estado] || ''}`));
  const label = document.createElement('span');
  label.textContent = LABELS_ESTADO_REEMBOLSO[nota.estado] || 'Estado no disponible';
  badge.appendChild(label);
  top.appendChild(badge);
  row.appendChild(top);

  row.appendChild(detailRow('Pedido', `#${nota.pedidoId}`));
  row.appendChild(detailRow('Cliente', nota.nombreCliente));
  row.appendChild(detailRow('Comercio', nota.nombreComercio));
  row.appendChild(detailRow('Monto', formatearPrecio(nota.monto)));
  row.appendChild(detailRow('Fecha', formatearSoloFecha(nota.fechaEmision)));
  row.appendChild(detailRow('Motivo', LABELS_MOTIVO_REEMBOLSO[nota.motivo] || '—'));

  if (nota.ultimoError) {
    const error = crear('p', 'reembolso-row__error');
    error.setAttribute('data-testid', 'error-reembolso');
    error.textContent = nota.ultimoError;
    row.appendChild(error);
  }

  const aviso = crear('p', 'reembolso-row__aviso');
  aviso.setAttribute('data-testid', 'aviso-reembolso');
  aviso.style.display = 'none';
  row.appendChild(aviso);

  const boton = crear('button', 'btn btn-secondary');
  boton.type = 'button';
  boton.setAttribute('data-testid', 'btn-reintentar-reembolso');
  boton.textContent = 'Reintentar reembolso';
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    boton.textContent = 'Reintentando...';
    aviso.style.display = 'none';
    try {
      const actualizada = await apiFetch(`/administrador/reembolsos/${nota.id}/reintentar`, { method: 'POST' });
      if (actualizada.estado === 'PROCESADO') {
        showToast('Reembolso procesado correctamente');
      } else {
        showToast('Mercado Pago rechazó el reintento del reembolso', 'error');
      }
      onReintentar();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
      aviso.textContent = error.message;
      aviso.style.display = 'block';
      boton.disabled = false;
      boton.textContent = 'Reintentar reembolso';
      if (error.status === 409) {
        showToast('No se pudo reintentar el reembolso', 'error');
      }
    }
  });
  row.appendChild(boton);

  return row;
}

export async function initAdminReembolsos() {
  if (!requireAdmin()) {
    return;
  }

  let filtroEstado = null;
  let notas = await apiFetch('/administrador/reembolsos');
  const contenido = document.getElementById('reembolsos-content');

  const chipRow = crear('div', 'chip-row');
  FILTROS_REEMBOLSOS.forEach((filtro) => {
    const chip = crear('button', 'chip');
    chip.type = 'button';
    chip.textContent = filtro.label;
    chip.setAttribute('data-testid', `chip-filtro-${(filtro.key || 'todos').toLowerCase()}`);
    chip.setAttribute('aria-pressed', String(filtroEstado === filtro.key));
    chip.addEventListener('click', () => {
      filtroEstado = filtro.key;
      chipRow.querySelectorAll('.chip').forEach((otro) => otro.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      render();
    });
    chipRow.appendChild(chip);
  });
  document.getElementById('filtros-slot').appendChild(chipRow);

  async function recargar() {
    notas = await apiFetch('/administrador/reembolsos');
    render();
  }

  function render() {
    contenido.innerHTML = '';
    const visibles = filtroEstado ? notas.filter((nota) => nota.estado === filtroEstado) : notas;

    if (visibles.length === 0) {
      const wrapper = crear('div', 'state-page');
      wrapper.setAttribute('data-testid', 'estado-vacio');
      const icon = crear('div', 'state-page__icon');
      icon.innerHTML = ICONS.check;
      wrapper.appendChild(icon);
      const h1 = document.createElement('h1');
      h1.className = 'state-page__title';
      h1.textContent = 'No hay reembolsos pendientes de revisión';
      wrapper.appendChild(h1);
      contenido.appendChild(wrapper);
      return;
    }

    contenido.appendChild(crearEncabezadoTabla('reembolsos', [{ etiqueta: 'Reembolso' }, { etiqueta: 'Pedido' }, { etiqueta: 'Cliente' }, { etiqueta: 'Comercio' }, { etiqueta: 'Monto' }, { etiqueta: 'Fecha' }, { etiqueta: 'Motivo' }, { etiqueta: '' }], 'encabezado-reembolsos'));
    const lista = crear('div', 'cliente-admin-list tabla-admin tabla--reembolsos');
    visibles.forEach((nota) => lista.appendChild(renderReembolsoRow(nota, recargar)));
    contenido.appendChild(lista);
  }

  render();
}

const ETIQUETAS_CAMPO_CAMBIO = {
  NOMBRE: 'Nombre del comercio',
  DESCRIPCION: 'Descripción',
  TELEFONO: 'Teléfono de contacto',
  EMAIL_CONTACTO: 'Email de contacto',
  TIPO_COMERCIO: 'Tipo de comercio',
  MODALIDADES: 'Modalidades de entrega',
  FOTO_PERFIL: 'Foto del comercio',
  DIRECCION: 'Dirección del local',
  HORARIOS: 'Horarios de atención',
  REDES_SOCIALES: 'Redes sociales',
  RAZON_SOCIAL: 'Razón social',
  CUIT: 'CUIT',
  CONDICION_IVA: 'Condición ante el IVA',
  TIPO_SOCIEDAD: 'Tipo de sociedad',
  DOMICILIO_FISCAL: 'Domicilio fiscal',
  FECHA_INICIO_ACTIVIDADES: 'Fecha de inicio de actividades',
  REPRESENTANTE_NOMBRE: 'Nombre del representante',
  REPRESENTANTE_APELLIDO: 'Apellido del representante',
  REPRESENTANTE_DNI: 'DNI del representante',
  REPRESENTANTE_TELEFONO: 'Teléfono del representante',
  REPRESENTANTE_FECHA_NACIMIENTO: 'Fecha de nacimiento del representante',
};

const ORDEN_CAMPOS_CAMBIO = Object.keys(ETIQUETAS_CAMPO_CAMBIO);

const CAMPOS_LEGALES_CAMBIO = ORDEN_CAMPOS_CAMBIO.slice(ORDEN_CAMPOS_CAMBIO.indexOf('RAZON_SOCIAL'));

const TEXTO_SIN_DATO = 'Sin dato';

function textoModalidades(delivery, retiro) {
  if (delivery && retiro) return 'Delivery y retiro';
  if (delivery) return 'Solo delivery';
  return retiro ? 'Solo retiro' : 'Ninguna';
}

function textoDireccion(direccion) {
  const calle = direccion.pisoDepto ? `${direccion.calle} ${direccion.numero}, ${direccion.pisoDepto}` : `${direccion.calle} ${direccion.numero}`;
  return `${calle}, ${direccion.nombreLocalidad}, ${direccion.nombreProvincia} (${direccion.codigoPostal})`;
}

function textoHorarios(horarios) {
  return [...horarios]
    .sort((a, b) => ORDEN_DIA_SEMANA.indexOf(a.diaSemana) - ORDEN_DIA_SEMANA.indexOf(b.diaSemana) || a.horaApertura.localeCompare(b.horaApertura))
    .map((h) => `${LABELS_DIA_SEMANA[h.diaSemana] || h.diaSemana} ${recortarHora(h.horaApertura)}-${recortarHora(h.horaCierre)}${cruzaMedianoche(h.horaApertura, h.horaCierre) ? ' (día siguiente)' : ''}`)
    .join('\n');
}

function textoRedes(redes) {
  return [...redes]
    .sort((a, b) => a.tipo.localeCompare(b.tipo))
    .map((r) => `${LABELS_TIPO_RED_SOCIAL[r.tipo] || r.tipo}: ${r.url}`)
    .join('\n');
}

function formatearValorCambio(campo, valor) {
  if (valor === null || valor === undefined || valor === '') {
    return TEXTO_SIN_DATO;
  }
  switch (campo) {
    case 'TIPO_COMERCIO':
      return LABELS_TIPO_COMERCIO[valor] || valor;
    case 'CONDICION_IVA':
      return LABELS_CONDICION_IVA[valor] || valor;
    case 'TIPO_SOCIEDAD':
      return LABELS_TIPO_SOCIEDAD[valor] || valor;
    case 'FECHA_INICIO_ACTIVIDADES':
    case 'REPRESENTANTE_FECHA_NACIMIENTO':
      return formatearFecha(valor);
    case 'HORARIOS':
      return valor.split('; ').join('\n');
    case 'REDES_SOCIALES':
      return valor.split('; ').map((par) => {
        const corte = par.indexOf(': ');
        if (corte < 0) return par;
        const tipo = par.slice(0, corte);
        return `${LABELS_TIPO_RED_SOCIAL[tipo] || tipo}: ${par.slice(corte + 2)}`;
      }).join('\n');
    default:
      return valor;
  }
}

function valoresActualesDeComercio(comercio) {
  const representante = comercio.representante;
  return {
    NOMBRE: comercio.nombre,
    DESCRIPCION: comercio.descripcion,
    TELEFONO: comercio.telefono,
    EMAIL_CONTACTO: comercio.emailContacto,
    TIPO_COMERCIO: labelTipoComercio(comercio.tipoComercio),
    MODALIDADES: textoModalidades(comercio.aceptaDelivery, comercio.aceptaRetiro),
    FOTO_PERFIL: comercio.fotoPerfilUrl,
    DIRECCION: comercio.direccion ? textoDireccion(comercio.direccion) : null,
    HORARIOS: textoHorarios(comercio.horarios || []),
    REDES_SOCIALES: textoRedes(comercio.redesSociales || []),
    RAZON_SOCIAL: comercio.razonSocial,
    CUIT: comercio.cuit,
    CONDICION_IVA: LABELS_CONDICION_IVA[comercio.condicionIva] || comercio.condicionIva,
    TIPO_SOCIEDAD: LABELS_TIPO_SOCIEDAD[comercio.tipoSociedad] || comercio.tipoSociedad,
    DOMICILIO_FISCAL: comercio.domicilioFiscal,
    FECHA_INICIO_ACTIVIDADES: comercio.fechaInicioActividades || null,
    REPRESENTANTE_NOMBRE: representante ? representante.nombre : null,
    REPRESENTANTE_APELLIDO: representante ? representante.apellido : null,
    REPRESENTANTE_DNI: representante ? representante.dni : null,
    REPRESENTANTE_TELEFONO: representante ? representante.telefono : null,
    REPRESENTANTE_FECHA_NACIMIENTO: representante ? representante.fechaNacimiento : null,
  };
}

function circuloFoto(url, nombre) {
  const circulo = crear('div', 'cambio-foto__circulo');
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    circulo.appendChild(img);
  } else {
    const inicial = crear('span', 'avatar-inicial');
    inicial.textContent = (nombre || '?').trim().charAt(0).toUpperCase();
    circulo.appendChild(inicial);
  }
  return circulo;
}

function renderCambioFoto(tarjeta, cambio, comercio) {
  const fotos = crear('div', 'cambio-fotos');
  [['Antes', cambio.valorAnterior], ['Ahora', cambio.valorNuevo]].forEach(([etiqueta, url]) => {
    const foto = crear('div', 'cambio-foto');
    foto.setAttribute('data-testid', `cambio-foto-${etiqueta.toLowerCase()}`);
    foto.appendChild(circuloFoto(url, comercio.nombre));
    const texto = document.createElement('span');
    texto.textContent = etiqueta;
    foto.appendChild(texto);
    fotos.appendChild(foto);
  });
  tarjeta.appendChild(fotos);
}

function renderCambioTexto(tarjeta, cambio) {
  const antes = crear('div', 'cambio-fila');
  const antesEtiqueta = crear('span', 'cambio-fila__etiqueta');
  antesEtiqueta.textContent = 'Antes';
  const antesValor = crear('span', 'cambio-fila__valor cambio-fila__valor--antes');
  antesValor.setAttribute('data-testid', `cambio-antes-${cambio.campo}`);
  antesValor.textContent = formatearValorCambio(cambio.campo, cambio.valorAnterior);
  antes.appendChild(antesEtiqueta);
  antes.appendChild(antesValor);
  tarjeta.appendChild(antes);

  const ahora = crear('div', 'cambio-fila');
  const ahoraEtiqueta = crear('span', 'cambio-fila__etiqueta');
  ahoraEtiqueta.textContent = 'Ahora';
  const ahoraValor = crear('span', 'cambio-fila__valor cambio-fila__valor--ahora');
  ahoraValor.setAttribute('data-testid', `cambio-ahora-${cambio.campo}`);
  ahoraValor.textContent = formatearValorCambio(cambio.campo, cambio.valorNuevo);
  ahora.appendChild(ahoraEtiqueta);
  ahora.appendChild(ahoraValor);
  tarjeta.appendChild(ahora);
}

function renderTarjetaCambio(cambio, comercio) {
  const tarjeta = crear('div', 'cambio-card');
  tarjeta.setAttribute('data-testid', `cambio-${cambio.campo}`);
  const titulo = crear('p', 'detail-section__title');
  titulo.textContent = ETIQUETAS_CAMPO_CAMBIO[cambio.campo] || cambio.campo;
  tarjeta.appendChild(titulo);
  const marca = crear('span', 'cambio-card__marca');
  marca.hidden = true;
  marca.textContent = 'Cambió';
  tarjeta.appendChild(marca);
  if (cambio.campo === 'FOTO_PERFIL') {
    renderCambioFoto(tarjeta, cambio, comercio);
  } else {
    renderCambioTexto(tarjeta, cambio);
  }
  return tarjeta;
}

function renderSinCambios(comercio, camposSinCambio) {
  const valores = valoresActualesDeComercio(comercio);
  const detalle = document.createElement('details');
  detalle.className = 'sin-cambios';
  detalle.setAttribute('data-testid', 'bloque-sin-cambios');
  const resumen = document.createElement('summary');
  resumen.className = 'sin-cambios__resumen';
  resumen.setAttribute('data-testid', 'resumen-sin-cambios');
  resumen.textContent = `Sin cambios (${camposSinCambio.length} ${camposSinCambio.length === 1 ? 'campo' : 'campos'})`;
  detalle.appendChild(resumen);
  const cuerpo = crear('div', 'sin-cambios__cuerpo');
  camposSinCambio.forEach((campo) => {
    if (campo === 'FOTO_PERFIL') {
      const fila = crear('div', 'detail-row');
      fila.setAttribute('data-testid', `sin-cambio-${campo}`);
      const etiqueta = document.createElement('span');
      etiqueta.textContent = ETIQUETAS_CAMPO_CAMBIO[campo];
      fila.appendChild(etiqueta);
      const foto = crear('span', 'sin-cambios__foto');
      foto.appendChild(circuloFoto(valores.FOTO_PERFIL, comercio.nombre));
      fila.appendChild(foto);
      cuerpo.appendChild(fila);
      return;
    }
    const fila = detailRow(ETIQUETAS_CAMPO_CAMBIO[campo], formatearValorCambio(campo, valores[campo]));
    fila.setAttribute('data-testid', `sin-cambio-${campo}`);
    fila.classList.add('detail-row--multilinea');
    cuerpo.appendChild(fila);
  });
  detalle.appendChild(cuerpo);
  return detalle;
}

function renderResolicitudCard(resolicitud) {
  const comercio = resolicitud.comercio;
  const card = crear('div', 'request-card');
  card.setAttribute('data-testid', `resolicitud-item-${comercio.id}`);

  const top = crear('div', 'request-card__top request-card__top--avatar');
  const avatar = crear('div', 'request-card__avatar');
  pintarAvatarComercio(avatar, comercio);
  top.appendChild(avatar);
  const titulos = crear('div', 'request-card__titulos');
  const h3 = document.createElement('h3');
  h3.textContent = comercio.nombre;
  titulos.appendChild(h3);
  if (comercio.direccion) {
    const localidad = crear('span', 'request-card__sub');
    localidad.textContent = comercio.direccion.nombreLocalidad;
    titulos.appendChild(localidad);
  }
  top.appendChild(titulos);
  card.appendChild(top);

  const badges = crear('div', 'request-card__badges request-card__badges--inicio');
  const badgeIntento = crear('span', 'status-badge status-badge--adicional');
  badgeIntento.setAttribute('data-testid', `badge-intento-${comercio.id}`);
  badgeIntento.textContent = `Intento ${resolicitud.intento} de ${resolicitud.maximoResolicitudes}`;
  badges.appendChild(badgeIntento);
  if (resolicitud.esUltimoIntento) {
    const badgeUltimo = crear('span', 'status-badge status-badge--error');
    badgeUltimo.setAttribute('data-testid', `badge-ultimo-intento-${comercio.id}`);
    badgeUltimo.textContent = 'Último intento';
    badges.appendChild(badgeUltimo);
  }
  card.appendChild(badges);

  const rows = crear('div', 'request-card__rows');
  const fechaRow = crear('div', 'comercio-info__row');
  fechaRow.innerHTML = ICONS.calendar;
  const fechaTexto = document.createElement('span');
  fechaTexto.textContent = `Re-solicitado ${formatearTiempoRelativo(resolicitud.fechaResolicitud).toLowerCase()}`;
  fechaRow.appendChild(fechaTexto);
  rows.appendChild(fechaRow);
  card.appendChild(rows);

  const footer = document.createElement('a');
  footer.className = 'request-card__footer';
  footer.href = `admin-resolicitud-detalle.html?id=${comercio.id}`;
  footer.setAttribute('data-testid', `btn-ver-resolicitud-${comercio.id}`);
  const label = document.createElement('span');
  label.textContent = 'Ver re-solicitud';
  footer.appendChild(label);
  const chevron = document.createElement('span');
  chevron.innerHTML = ICONS.chevronRight;
  footer.appendChild(chevron);
  card.appendChild(footer);

  return card;
}

export async function initAdminResolicitudes() {
  if (!requireAdmin()) {
    return;
  }

  if (new URLSearchParams(window.location.search).get('comercioResuelto') === '1') {
    showToast('El comercio fue notificado de tu decisión');
  }

  const resolicitudes = await apiFetch('/administrador/comercios/resolicitudes');
  resolicitudes.forEach((resolicitud) => normalizarComercioAdmin(resolicitud.comercio));

  const headerBadge = document.getElementById('header-badge');
  headerBadge.textContent = String(resolicitudes.length);
  headerBadge.style.display = resolicitudes.length > 0 ? 'flex' : 'none';

  const container = document.getElementById('resolicitudes-content');
  container.removeAttribute('aria-busy');
  container.innerHTML = '';

  if (resolicitudes.length === 0) {
    const wrapper = crear('div', 'state-page');
    const icon = crear('div', 'state-page__icon');
    icon.innerHTML = ICONS.check;
    wrapper.appendChild(icon);
    const h1 = document.createElement('h1');
    h1.className = 'state-page__title';
    h1.textContent = 'No hay re-solicitudes pendientes';
    wrapper.appendChild(h1);
    const p = document.createElement('p');
    p.className = 'state-page__text';
    p.textContent = 'Acá aparecen los comercios rechazados que su Dueño corrigió y volvió a solicitar.';
    wrapper.appendChild(p);
    container.appendChild(wrapper);
    return;
  }

  resolicitudes
    .sort((a, b) => new Date(a.fechaResolicitud) - new Date(b.fechaResolicitud))
    .forEach((resolicitud) => container.appendChild(renderResolicitudCard(resolicitud)));
}

function renderResolicitudNoEncontrada(container) {
  container.removeAttribute('aria-busy');
  container.innerHTML = '';
  const wrapper = crear('div', 'state-page');
  const icon = crear('div', 'state-page__icon');
  icon.innerHTML = ICONS.alert;
  wrapper.appendChild(icon);
  const h1 = document.createElement('h1');
  h1.className = 'state-page__title';
  h1.textContent = 'No encontramos esta re-solicitud';
  wrapper.appendChild(h1);
  const p = document.createElement('p');
  p.className = 'state-page__text';
  p.textContent = 'La re-solicitud ya fue resuelta o el enlace no es válido.';
  wrapper.appendChild(p);
  const actions = crear('div', 'state-page__actions');
  const cta = document.createElement('a');
  cta.className = 'btn btn-primary';
  cta.href = 'admin-resolicitudes.html';
  cta.setAttribute('data-testid', 'btn-ver-resolicitudes');
  cta.textContent = 'Ver re-solicitudes';
  actions.appendChild(cta);
  wrapper.appendChild(actions);
  container.appendChild(wrapper);
}

function renderResolicitudDetalle(container, resolicitud, onResuelto) {
  const comercio = resolicitud.comercio;
  container.removeAttribute('aria-busy');
  container.innerHTML = '';

  const hero = crear('div', 'request-hero');
  const avatar = crear('div', 'comercio-detail-header__avatar');
  avatar.classList.add('admin-mb-12');
  pintarAvatarComercio(avatar, comercio);
  hero.appendChild(avatar);
  const h1 = document.createElement('h1');
  h1.textContent = comercio.nombre;
  hero.appendChild(h1);
  const fecha = crear('p', 'request-hero__fecha');
  fecha.textContent = `Re-solicitud enviada: ${formatearFechaHora(resolicitud.fechaResolicitud)}`;
  hero.appendChild(fecha);
  container.appendChild(hero);

  const body = crear('div', 'screen-body screen-body--tight');

  if (resolicitud.motivoRechazoAnterior) {
    body.appendChild(crearBloqueMotivoRechazo({
      titulo: 'Motivo del rechazo anterior',
      motivo: resolicitud.motivoRechazoAnterior,
      testid: 'motivo-rechazo-anterior',
    }));
  }

  const cambios = [...resolicitud.cambios]
    .sort((a, b) => ORDEN_CAMPOS_CAMBIO.indexOf(a.campo) - ORDEN_CAMPOS_CAMBIO.indexOf(b.campo));
  const resumen = crear('p', 'cambios-resumen');
  resumen.setAttribute('data-testid', 'resumen-cambios');
  resumen.textContent = cambios.length === 1 ? '1 campo cambió' : `${cambios.length} campos cambiaron`;
  body.appendChild(resumen);

  if (cambios.length > 0) {
    body.appendChild(crearEncabezadoTabla('cambios', [{ etiqueta: 'Campo' }, { etiqueta: 'Antes' }, { etiqueta: 'Ahora' }, { etiqueta: '' }], 'encabezado-cambios'));
  }
  cambios.forEach((cambio) => body.appendChild(renderTarjetaCambio(cambio, comercio)));

  const camposCambiados = new Set(cambios.map((cambio) => cambio.campo));
  const camposSinCambio = ORDEN_CAMPOS_CAMBIO.filter((campo) => !camposCambiados.has(campo)
    && (!CAMPOS_LEGALES_CAMBIO.includes(campo) || !comercio.esAdicional));
  if (camposSinCambio.length > 0) {
    body.appendChild(renderSinCambios(comercio, camposSinCambio));
  }
  container.appendChild(body);

  const footer = crear('div', 'request-footer');
  const rechazarBtn = crear('button', 'btn btn-peligro-contorno');
  rechazarBtn.type = 'button';
  rechazarBtn.setAttribute('data-testid', 'btn-rechazar-comercio');
  rechazarBtn.textContent = 'Rechazar';
  rechazarBtn.addEventListener('click', () => {
    mostrarModalRechazarComercio(comercio, async (motivo, definitivo) => {
      await apiFetch(`/administrador/comercios/${comercio.id}/resolver`, {
        method: 'PUT',
        body: { aprobar: false, motivo, definitivo },
      });
      onResuelto();
    }, { esUltimoIntento: resolicitud.esUltimoIntento });
  });
  footer.appendChild(rechazarBtn);

  const aprobarBtn = crear('button', 'btn btn-primary');
  aprobarBtn.type = 'button';
  aprobarBtn.setAttribute('data-testid', 'btn-aprobar-comercio');
  aprobarBtn.textContent = 'Aprobar comercio';
  aprobarBtn.addEventListener('click', () => {
    mostrarModalConfirmarAprobacion(comercio, async () => {
      await apiFetch(`/administrador/comercios/${comercio.id}/resolver`, {
        method: 'PUT',
        body: { aprobar: true, motivo: null },
      });
      onResuelto();
    });
  });
  footer.appendChild(aprobarBtn);
  container.appendChild(footer);
}

export async function initAdminResolicitudDetalle() {
  if (!requireAdmin()) {
    return;
  }

  const comercioId = Number(new URLSearchParams(window.location.search).get('id'));
  const container = document.getElementById('detalle-content');

  if (!comercioId) {
    renderResolicitudNoEncontrada(container);
    return;
  }

  const resolicitudes = await apiFetch('/administrador/comercios/resolicitudes');
  resolicitudes.forEach((resolicitud) => normalizarComercioAdmin(resolicitud.comercio));
  const resolicitud = resolicitudes.find((r) => r.comercio.id === comercioId);

  if (!resolicitud) {
    renderResolicitudNoEncontrada(container);
    return;
  }

  const intentoBadge = document.getElementById('intento-badge');
  intentoBadge.textContent = `Intento ${resolicitud.intento} de ${resolicitud.maximoResolicitudes}`;
  intentoBadge.classList.remove('is-hidden');

  renderResolicitudDetalle(container, resolicitud, () => {
    window.location.href = 'admin-resolicitudes.html?comercioResuelto=1';
  });
}
