import { apiFetch, ApiError, getUsuario } from './api.js';
import { showToast, renderTopBar, pintarAvatarComercio, pintarAvatarUsuario } from './catalogo.js';
import { logout, LABELS_TIPO_COMERCIO, LABELS_TIPO_RED_SOCIAL } from './auth.js';
import { validarArchivoImagen, subirFotoPerfilUsuario, CloudinaryUploadError } from './cloudinary.js';
import { abrirEditorRecorte } from './crop.js';
import { normalizarCampos } from './validators.js';

function normalizarComercioAdmin(comercio) {
  normalizarCampos(comercio, ['nombre', 'razonSocial']);
  normalizarCampos(comercio.direccion, ['calle']);
  normalizarCampos(comercio.representante, ['nombre', 'apellido']);
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
};

const LABELS_CONDICION_IVA = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  EXENTO: 'Exento',
  NO_INSCRIPTO: 'No Inscripto',
  MONOTRIBUTO: 'Monotributista',
  RESPONSABLE_NACIONAL: 'Responsable Nacional',
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
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${partes} a las ${hora} hs`;
}

function formatearSoloFecha(fechaIso) {
  return new Date(fechaIso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const LABELS_ESTADO_USUARIO = {
  PENDIENTE: 'Pendiente',
  ACTIVO: 'Activo',
  BLOQUEADO: 'Bloqueado',
  SUSPENDIDO: 'Suspendido',
  INACTIVO: 'Inactivo',
};

const DOT_ESTADO_USUARIO = {
  PENDIENTE: 'cliente-estado__dot--pendiente',
  ACTIVO: 'cliente-estado__dot--activo',
  BLOQUEADO: 'cliente-estado__dot--bloqueado',
  SUSPENDIDO: 'cliente-estado__dot--suspendido',
  INACTIVO: 'cliente-estado__dot--inactivo',
};

function labelTipoComercio(tipo) {
  return LABELS_TIPO_COMERCIO[tipo] || tipo;
}

function requireAdmin() {
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

export async function initAdminDashboard() {
  if (!requireAdmin()) {
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarPerfil: false, mostrarCampana: false, centrarLogo: true });

  const [metricas, perfil] = await Promise.all([
    apiFetch('/administrador/metricas'),
    apiFetch('/administrador/perfil'),
  ]);
  normalizarCampos(perfil, ['nombre', 'apellido']);

  document.getElementById('admin-nombre').textContent = `${perfil.nombre} ${perfil.apellido}`;

  const avatarAdmin = document.getElementById('admin-avatar');
  pintarAvatarUsuario(avatarAdmin, perfil.fotoPerfilUrl, 'AD');

  const inputFotoAdmin = document.getElementById('input-foto-admin');
  document.getElementById('cambiar-foto-admin-btn').addEventListener('click', () => inputFotoAdmin.click());
  inputFotoAdmin.addEventListener('change', () => {
    const file = inputFotoAdmin.files[0];
    inputFotoAdmin.value = '';
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
          const actualizado = await subirFotoPerfilUsuario(perfil.id, archivoRecortado);
          perfil.fotoPerfilUrl = actualizado.fotoPerfilUrl;
          pintarAvatarUsuario(avatarAdmin, perfil.fotoPerfilUrl, 'AD');
          showToast('Foto de perfil actualizada', 'success');
        } catch (error) {
          const esErrorConocido = error instanceof CloudinaryUploadError || error instanceof ApiError;
          showToast(esErrorConocido ? error.message : 'No pudimos subir la foto.', 'error');
        }
      },
    });
  });

  const alertLink = document.getElementById('alert-comercios-pendientes');
  alertLink.querySelector('[data-count]').style.display = metricas.comerciosPendientes > 0 ? 'block' : 'none';
  alertLink.querySelector('[data-subtitulo]').textContent =
    metricas.comerciosPendientes === 1 ? '1 solicitud de aprobación' : `${metricas.comerciosPendientes} solicitudes de aprobación`;

  const tiles = [
    { icon: ICONS.store, titulo: 'Comercios', subtitulo: `${metricas.comerciosTotal} registrados`, href: 'admin-comercios.html' },
    { icon: ICONS.users, titulo: 'Clientes', subtitulo: `${metricas.clientesTotal} registrados`, href: 'admin-clientes.html' },
    { icon: ICONS.tag, titulo: 'Categorías', subtitulo: `${metricas.categoriasActivas} activas`, href: 'admin-categorias.html' },
    { icon: ICONS.hash, titulo: 'Tags', subtitulo: `${metricas.tagsActivos} activos`, href: 'admin-tags.html' },
  ];

  const grid = document.getElementById('gestion-grid');
  tiles.forEach((tile) => {
    const card = crear(tile.href ? 'a' : 'div', 'stat-tile');
    if (tile.href) {
      card.href = tile.href;
      card.setAttribute('data-testid', `tile-gestion-${tile.href.replace('admin-', '').replace('.html', '')}`);
    }
    const icon = crear('div', 'stat-tile__icon');
    icon.innerHTML = tile.icon;
    card.appendChild(icon);
    const h3 = document.createElement('h3');
    h3.textContent = tile.titulo;
    card.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = tile.subtitulo;
    card.appendChild(p);
    grid.appendChild(card);
  });

  document.getElementById('cerrar-sesion-btn').addEventListener('click', mostrarModalConfirmarLogoutAdmin);
}

function renderRequestCard(comercio) {
  const card = crear('div', 'request-card');
  card.setAttribute('data-testid', `comercio-pendiente-item-${comercio.id}`);

  const top = crear('div', 'request-card__top');
  const h3 = document.createElement('h3');
  h3.textContent = comercio.nombre;
  top.appendChild(h3);
  const badge = crear('span', 'status-badge status-badge--nueva');
  badge.textContent = 'Nueva';
  top.appendChild(badge);
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

  document.getElementById('header-badge').textContent = String(comercios.length);

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

function mostrarModalConfirmarAprobacion(comercio, onConfirmar) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-confirmar-aprobacion');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet__icon modal-sheet__icon--success">${ICONS.check}</div>
      <h2 class="modal-sheet__title">¿Aprobar este comercio?</h2>
      <p class="modal-sheet__text" style="margin-bottom:20px;">Al aprobar, el comercio recibirá una notificación para comenzar a operar.</p>
      <button class="btn btn-primary" type="button" id="confirmar-aprobar-btn" style="background:var(--color-success);margin-bottom:12px;" data-testid="btn-confirmar-aprobacion">Confirmar Aprobación</button>
      <button class="btn btn-tertiary" type="button" id="cancelar-aprobar-btn" data-testid="btn-cancelar-aprobacion">Cancelar</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('cancelar-aprobar-btn').addEventListener('click', () => backdrop.remove());
  document.getElementById('confirmar-aprobar-btn').addEventListener('click', () => {
    backdrop.remove();
    onConfirmar();
  });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

function mostrarModalRechazarComercio(comercio, onConfirmar) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-rechazar-comercio');
  backdrop.innerHTML = `
    <div class="product-modal-sheet">
      <div class="product-modal-sheet__handle"><span></span></div>
      <div class="product-modal-sheet__body">
        <h2 style="font-size:19px;margin-bottom:6px;">Rechazar Solicitud</h2>
        <p class="product-modal-sheet__description" style="margin-bottom:16px;">El comercio recibirá una notificación con el motivo del rechazo.</p>
        <form class="form" id="form-rechazar-comercio" novalidate>
          <div class="field">
            <label class="field__label" for="rechazo-motivo">Motivo del rechazo</label>
            <div class="textarea-shell" id="rechazo-motivo-shell"><textarea id="rechazo-motivo" maxlength="500" placeholder="Describí el motivo del rechazo..." data-testid="input-motivo-rechazo-comercio"></textarea></div>
            <div class="textarea-counter"><span id="rechazo-contador">0/500</span></div>
            <div id="rechazo-error" class="field__error" style="display:none;" data-testid="mensaje-error-motivo-rechazo-comercio">${ICONS.xCircle}<span>El motivo es obligatorio para rechazar una solicitud.</span></div>
          </div>
          <button class="btn btn-primary" type="submit" id="confirmar-rechazo-btn" style="background:var(--color-error);margin-bottom:10px;" disabled data-testid="btn-confirmar-rechazo-comercio">Confirmar Rechazo</button>
          <button class="btn btn-tertiary" type="button" id="cancelar-rechazo-btn" data-testid="btn-cancelar-rechazo-comercio">Cancelar</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const textarea = backdrop.querySelector('#rechazo-motivo');
  const shell = backdrop.querySelector('#rechazo-motivo-shell');
  const contador = backdrop.querySelector('#rechazo-contador');
  const errorEl = backdrop.querySelector('#rechazo-error');
  const submitBtn = backdrop.querySelector('#confirmar-rechazo-btn');

  textarea.addEventListener('input', () => {
    contador.textContent = `${textarea.value.length}/500`;
    const valido = textarea.value.trim().length > 0;
    submitBtn.disabled = !valido;
    if (valido) {
      shell.classList.remove('textarea-shell--error');
      errorEl.style.display = 'none';
    }
  });

  backdrop.querySelector('#cancelar-rechazo-btn').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });

  backdrop.querySelector('#form-rechazar-comercio').addEventListener('submit', (event) => {
    event.preventDefault();
    const motivo = textarea.value.trim();
    if (!motivo) {
      shell.classList.add('textarea-shell--error');
      errorEl.style.display = 'flex';
      return;
    }
    backdrop.remove();
    onConfirmar(motivo);
  });
}

function renderComercioDetailSections(body, comercio) {
  const datosComercio = crear('div', 'detail-section');
  const datosComercioTitulo = crear('p', 'detail-section__title');
  datosComercioTitulo.textContent = 'Datos del Comercio';
  datosComercio.appendChild(datosComercioTitulo);
  datosComercio.appendChild(detailRow('Nombre comercial', comercio.nombre));
  datosComercio.appendChild(detailRow('Tipo', labelTipoComercio(comercio.tipoComercio)));
  datosComercio.appendChild(detailRow('Teléfono de contacto', comercio.telefono));
  datosComercio.appendChild(detailRow('Email de contacto', comercio.emailContacto));
  datosComercio.appendChild(detailRow('Email de cuenta', comercio.emailCuenta));
  body.appendChild(datosComercio);

  const datosLegales = crear('div', 'detail-section');
  const datosLegalesTitulo = crear('p', 'detail-section__title');
  datosLegalesTitulo.textContent = 'Datos Legales / Fiscales';
  datosLegales.appendChild(datosLegalesTitulo);
  datosLegales.appendChild(detailRow('CUIT', comercio.cuit));
  datosLegales.appendChild(detailRow('Razón Social', comercio.razonSocial));
  datosLegales.appendChild(detailRow('Condición IVA', LABELS_CONDICION_IVA[comercio.condicionIva] || comercio.condicionIva));
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
  deliveryLabel.innerHTML = `${ICONS.truck}<span style="margin-left:6px;">Delivery</span>`;
  deliveryLabel.style.display = 'flex';
  deliveryLabel.style.alignItems = 'center';
  deliveryRow.appendChild(deliveryLabel);
  const deliveryValor = crear('span', comercio.aceptaDelivery ? '' : '');
  deliveryValor.style.color = comercio.aceptaDelivery ? 'var(--color-success)' : 'var(--color-text-placeholder)';
  deliveryValor.innerHTML = comercio.aceptaDelivery ? ICONS.check : ICONS.xCircle;
  deliveryRow.appendChild(deliveryValor);
  modalidades.appendChild(deliveryRow);

  const retiroRow = crear('div', 'detail-row');
  const retiroLabel = document.createElement('span');
  retiroLabel.innerHTML = `${ICONS.bag}<span style="margin-left:6px;">Retiro en local</span>`;
  retiroLabel.style.display = 'flex';
  retiroLabel.style.alignItems = 'center';
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
          detailRow(LABELS_DIA_SEMANA[horario.diaSemana] || horario.diaSemana, `${horario.horaApertura.slice(0, 5)} - ${horario.horaCierre.slice(0, 5)}`),
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
  avatar.style.marginBottom = '12px';
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
  const rechazarBtn = crear('button', 'btn btn-secondary');
  rechazarBtn.type = 'button';
  rechazarBtn.style.borderColor = 'var(--color-error)';
  rechazarBtn.style.color = 'var(--color-error)';
  rechazarBtn.setAttribute('data-testid', 'btn-rechazar-comercio');
  rechazarBtn.textContent = 'Rechazar';
  rechazarBtn.addEventListener('click', () => {
    mostrarModalRechazarComercio(comercio, async (motivo) => {
      try {
        await apiFetch(`/administrador/comercios/${comercio.id}/resolver`, {
          method: 'PUT',
          body: { aprobar: false, motivo },
        });
        onResuelto();
      } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'No pudimos rechazar el comercio', 'error');
      }
    });
  });
  footer.appendChild(rechazarBtn);

  const aprobarBtn = crear('button', 'btn btn-primary');
  aprobarBtn.type = 'button';
  aprobarBtn.setAttribute('data-testid', 'btn-aprobar-comercio');
  aprobarBtn.textContent = 'Aprobar';
  aprobarBtn.addEventListener('click', () => {
    mostrarModalConfirmarAprobacion(comercio, async () => {
      try {
        await apiFetch(`/administrador/comercios/${comercio.id}/resolver`, {
          method: 'PUT',
          body: { aprobar: true, motivo: null },
        });
        onResuelto();
      } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'No pudimos aprobar el comercio', 'error');
      }
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

function mostrarModalDetalleComercio(comercio) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-detalle-comercio');
  const sheet = crear('div', 'product-modal-sheet');
  const handle = crear('div', 'product-modal-sheet__handle');
  handle.innerHTML = '<span></span>';
  sheet.appendChild(handle);

  const body = crear('div', 'product-modal-sheet__body');
  const h2 = document.createElement('h2');
  h2.style.marginBottom = '16px';
  h2.style.textAlign = 'center';
  h2.textContent = comercio.nombre;
  body.appendChild(h2);

  renderComercioDetailSections(body, comercio);

  const cerrarBtn = crear('button', 'btn btn-tertiary');
  cerrarBtn.type = 'button';
  cerrarBtn.style.marginTop = '4px';
  cerrarBtn.setAttribute('data-testid', 'btn-cerrar-modal-detalle-comercio');
  cerrarBtn.textContent = 'Cerrar';
  cerrarBtn.addEventListener('click', () => backdrop.remove());
  body.appendChild(cerrarBtn);

  sheet.appendChild(body);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
}

function renderComercioAdminRow(comercio) {
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
  row.appendChild(bodyEl);

  const detalleBtn = crear('button', 'comercio-admin-row__detalle');
  detalleBtn.type = 'button';
  detalleBtn.setAttribute('data-testid', `btn-ver-detalle-comercio-${comercio.id}`);
  detalleBtn.innerHTML = `<span>Ver detalle</span>${ICONS.chevronRight}`;
  detalleBtn.addEventListener('click', () => mostrarModalDetalleComercio(comercio));
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
    h1.textContent = 'No hay comercios aprobados';
    wrapper.appendChild(h1);
    container.appendChild(wrapper);
    return;
  }

  comercios
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach((comercio) => container.appendChild(renderComercioAdminRow(comercio)));
}

function renderClienteAdminRow(cliente) {
  const row = crear('div', 'cliente-admin-row');
  row.setAttribute('data-testid', `cliente-item-${cliente.id}`);

  const top = crear('div', 'cliente-admin-row__top');
  const h3 = document.createElement('h3');
  h3.textContent = `${cliente.nombre} ${cliente.apellido}`;
  top.appendChild(h3);
  const badge = crear('span', 'cliente-estado');
  badge.setAttribute('data-testid', 'estado-cliente');
  const dot = crear('span', `cliente-estado__dot ${DOT_ESTADO_USUARIO[cliente.estado] || ''}`);
  badge.appendChild(dot);
  const label = document.createElement('span');
  label.textContent = LABELS_ESTADO_USUARIO[cliente.estado] || cliente.estado;
  badge.appendChild(label);
  top.appendChild(badge);
  row.appendChild(top);

  row.appendChild(detailRow('DNI', cliente.dni));
  row.appendChild(detailRow('Email', cliente.email));
  row.appendChild(detailRow('Fecha de registro', formatearSoloFecha(cliente.fechaRegistro)));

  return row;
}

export async function initAdminClientes() {
  if (!requireAdmin()) {
    return;
  }

  const clientes = await apiFetch('/administrador/clientes');
  clientes.forEach((cliente) => normalizarCampos(cliente, ['nombre', 'apellido']));
  const container = document.getElementById('clientes-content');
  container.innerHTML = '';

  if (clientes.length === 0) {
    const wrapper = crear('div', 'state-page');
    const icon = crear('div', 'state-page__icon');
    icon.innerHTML = ICONS.users;
    wrapper.appendChild(icon);
    const h1 = document.createElement('h1');
    h1.className = 'state-page__title';
    h1.textContent = 'No hay clientes registrados';
    wrapper.appendChild(h1);
    container.appendChild(wrapper);
    return;
  }

  const lista = crear('div', 'cliente-admin-list');
  clientes
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach((cliente) => lista.appendChild(renderClienteAdminRow(cliente)));
  container.appendChild(lista);
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
  h2.style.marginBottom = '16px';
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
  submitBtn.style.marginTop = '8px';
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
  }

  nombreInput.addEventListener('input', () => {
    nombreShell.classList.remove('input-shell--error');
    nombreError.style.display = 'none';
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

    const lista = crear('div', 'categoria-list');
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
  h2.style.marginBottom = '16px';
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
  submitBtn.style.marginTop = '8px';
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
  }

  nombreInput.addEventListener('input', () => {
    nombreShell.classList.remove('input-shell--error');
    nombreError.style.display = 'none';
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

    const lista = crear('div', 'categoria-list');
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

  render();
}
