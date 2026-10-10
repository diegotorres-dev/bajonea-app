import { apiFetch, ApiError, getComercioActivoId } from './api.js';
import { showToast, renderEmptyState } from './catalogo.js';
import { getComercioActivoEnMemoria, INTERVALO_POLLING_COMERCIOS_MS } from './comercio-activo.js';
import { iniciales } from './selector-comercio.js';
import { h, crearSvg, renderBanner } from './form-utils.js';
import { mostrarErrorCampo, limpiarErrorCampo, mapearErroresBackend } from './validators.js';

const RUTA_EQUIPO = '/comercios/equipo';
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const OPCIONES_RED = { handle5xxGlobally: false, handleRedGlobally: false, conMensaje: true };
const MENSAJE_SIN_CONEXION = 'No pudimos conectar. Probá de nuevo.';
const MENSAJE_ERROR_CARGA = 'No pudimos cargar el equipo.';

const MENSAJE_SERVIDOR_NO_SE_PUEDE_INVITAR = 'No se puede invitar a este email';
const TITULO_NO_SE_PUEDE_INVITAR = 'No pudimos invitar a este email.';
const CUERPO_NO_SE_PUEDE_INVITAR = 'Por privacidad no podemos contarte el motivo. Podés pedirle a esta persona que revise su correo y volver a intentar más tarde.';

const PESTANAS = [
  { id: 'equipo', texto: 'Mi equipo' },
  { id: 'solicitudes', texto: 'Solicitudes' },
];

const ESTADO_MIEMBRO = {
  ACTIVO: { texto: 'Activo', punto: 'positivo' },
  INACTIVO: { texto: 'Inactivo', punto: 'inactivo' },
};

const ESTADO_INVITACION = {
  PENDIENTE: { texto: 'Pendiente', punto: 'pendiente' },
  VENCIDA: { texto: 'Vencida', punto: 'vencido' },
  INVALIDADA: { texto: 'Código bloqueado', punto: 'rechazado' },
};

const FIGURAS_SOBRE = [
  ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }],
  ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }],
];
const FIGURAS_PUNTITOS = [
  ['circle', { cx: '12', cy: '12', r: '1' }],
  ['circle', { cx: '12', cy: '5', r: '1' }],
  ['circle', { cx: '12', cy: '19', r: '1' }],
];
const FIGURAS_REENVIAR = [
  ['path', { d: 'M3 12a9 9 0 0 1 15.5-6.2L21 8' }],
  ['path', { d: 'M21 3v5h-5' }],
  ['path', { d: 'M21 12a9 9 0 0 1-15.5 6.2L3 16' }],
  ['path', { d: 'M3 21v-5h5' }],
];
const FIGURAS_CANCELAR = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['line', { x1: '15', y1: '9', x2: '9', y2: '15' }],
  ['line', { x1: '9', y1: '9', x2: '15', y2: '15' }],
];

let secuencia = 0;
let comercioPintado = null;
let firmaPintada = null;
let intervalo = null;
let pestanaActiva = PESTANAS[0].id;
let equipoActual = null;

function elemento(id) {
  return document.getElementById(id);
}

function vistaAbierta() {
  const vista = elemento('view-equipo');
  return Boolean(vista) && !vista.classList.contains('is-hidden');
}

function nombreDelComercioActivo() {
  const activo = getComercioActivoEnMemoria();
  return activo ? activo.nombre : '';
}

function textoVencimiento(fechaVencimiento) {
  const marca = Date.parse(String(fechaVencimiento).replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(marca)) {
    return '';
  }
  const dias = Math.max(1, Math.ceil((marca - Date.now()) / MS_POR_DIA));
  return dias === 1 ? 'vence en 1 día' : `vence en ${dias} días`;
}

function textoVencida(fechaVencimiento) {
  const marca = Date.parse(String(fechaVencimiento).replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(marca)) {
    return 'Vencida';
  }
  const dias = Math.floor((Date.now() - marca) / MS_POR_DIA);
  if (dias < 1) {
    return 'Vencida hoy';
  }
  return dias === 1 ? 'Vencida hace 1 día' : `Vencida hace ${dias} días`;
}

function crearEstado(info, detalle, textoEtiqueta = info.texto) {
  const estado = h('span', { class: 'equipo-fila__estado' });
  const etiqueta = h('span', { class: 'pedido-estado', 'data-testid': 'equipo-estado' });
  etiqueta.append(h('span', { class: `pedido-estado__dot pedido-estado__dot--${info.punto}` }), textoEtiqueta);
  estado.append(etiqueta);
  if (detalle) {
    const complemento = h('span', { class: 'equipo-fila__detalle', 'data-testid': 'equipo-detalle' });
    complemento.textContent = detalle;
    estado.append(complemento);
  }
  return estado;
}

function crearAvatarIniciales(miembro) {
  const avatar = h('span', { class: 'selector-avatar selector-avatar--panel equipo-avatar' });
  const texto = h('span', { class: 'selector-avatar__iniciales' });
  texto.textContent = iniciales(`${miembro.nombre} ${miembro.apellido}`);
  avatar.append(texto);
  return avatar;
}

function crearAvatarSobre() {
  const avatar = h('span', { class: 'selector-avatar selector-avatar--panel equipo-avatar' });
  avatar.append(crearSvg(FIGURAS_SOBRE));
  return avatar;
}

function crearLinea(clase, texto) {
  const linea = h('span', { class: clase });
  linea.textContent = texto;
  return linea;
}

function crearFilaMiembro(miembro) {
  const info = ESTADO_MIEMBRO[miembro.estado] || { texto: miembro.estado, punto: 'inactivo' };
  const fila = h('div', { class: 'equipo-fila', 'data-testid': `equipo-miembro-${miembro.empleadoId}`, 'data-estado': miembro.estado });
  const datos = h('div', { class: 'equipo-fila__datos' });
  const nombre = crearLinea('equipo-fila__nombre', `${miembro.nombre} ${miembro.apellido}`);
  nombre.setAttribute('data-testid', 'equipo-nombre');
  const email = crearLinea('equipo-fila__email', miembro.email);
  email.setAttribute('data-testid', 'equipo-email');
  datos.append(nombre, email, crearEstado(info, ''));
  fila.append(crearAvatarIniciales(miembro), datos);
  return fila;
}

function crearAccionMenuFila(invitacion, alAbrirMenu) {
  const menu = h('button', {
    class: 'product-row__kebab',
    type: 'button',
    'aria-label': `Acciones de la invitación a ${invitacion.email}`,
    'data-testid': `btn-menu-invitacion-${invitacion.id}`,
  });
  menu.append(crearSvg(FIGURAS_PUNTITOS));
  menu.addEventListener('click', () => alAbrirMenu(invitacion));
  return menu;
}

function crearFilaInvitacion(invitacion, alAbrirMenu) {
  const info = ESTADO_INVITACION[invitacion.estado] || { texto: invitacion.estado, punto: 'pendiente' };
  const detalle = invitacion.estado === 'PENDIENTE' ? textoVencimiento(invitacion.fechaVencimiento) : '';
  const etiqueta = invitacion.estado === 'VENCIDA' ? textoVencida(invitacion.fechaVencimiento) : info.texto;
  const fila = h('div', { class: 'equipo-fila', 'data-testid': `equipo-invitacion-${invitacion.id}`, 'data-estado': invitacion.estado });
  const datos = h('div', { class: 'equipo-fila__datos' });
  const email = crearLinea('equipo-fila__nombre', invitacion.email);
  email.setAttribute('data-testid', 'equipo-email');
  datos.append(email, crearEstado(info, detalle, etiqueta));
  fila.append(crearAvatarSobre(), datos, crearAccionMenuFila(invitacion, alAbrirMenu));
  return fila;
}

function pintarEsqueleto() {
  equipoActual = null;
  pintarPestanas();
  const lista = elemento('equipo-lista');
  lista.replaceChildren();
  lista.setAttribute('aria-busy', 'true');
  const contenedor = h('div', { class: 'equipo-esqueleto', 'data-testid': 'equipo-cargando' });
  for (let i = 0; i < 3; i += 1) {
    const fila = h('div', { class: 'equipo-esqueleto__fila' });
    const lineas = h('div', { class: 'equipo-esqueleto__lineas' });
    lineas.append(h('div', { class: 'skeleton equipo-esqueleto__linea' }), h('div', { class: 'skeleton equipo-esqueleto__linea equipo-esqueleto__linea--corta' }));
    fila.append(h('div', { class: 'skeleton equipo-esqueleto__avatar' }), lineas);
    contenedor.append(fila);
  }
  lista.append(contenedor);
  firmaPintada = null;
}

function pintarError(mensaje, alReintentar) {
  ocultarPestanas();
  const lista = elemento('equipo-lista');
  lista.replaceChildren();
  lista.removeAttribute('aria-busy');
  const slot = h('div', { 'data-testid': 'equipo-error' });
  renderBanner(slot, 'error', mensaje);
  const banner = slot.firstElementChild;
  const reintentar = h('button', { class: 'btn btn-secondary banner__accion', type: 'button', 'data-testid': 'btn-reintentar-equipo' });
  reintentar.textContent = 'Reintentar';
  reintentar.addEventListener('click', alReintentar);
  banner.lastElementChild.append(h('br'), reintentar);
  lista.append(slot);
  firmaPintada = null;
}

function miembrosActivos(equipo) {
  return (equipo.miembros || []).filter((miembro) => miembro.estado === 'ACTIVO');
}

function contadorDe(equipo, pestana) {
  if (!equipo) {
    return null;
  }
  return pestana === 'equipo' ? miembrosActivos(equipo).length : (equipo.invitaciones || []).length;
}

function pintarPestanas() {
  const barra = elemento('equipo-tabs');
  barra.classList.remove('is-hidden');
  barra.replaceChildren();
  PESTANAS.forEach((pestana) => {
    const cantidad = contadorDe(equipoActual, pestana.id);
    const boton = h('button', {
      type: 'button',
      class: 'segmented-control__btn',
      role: 'tab',
      'aria-selected': String(pestana.id === pestanaActiva),
      'data-testid': `tab-equipo-${pestana.id}`,
    });
    boton.textContent = cantidad === null ? pestana.texto : `${pestana.texto} · ${cantidad}`;
    boton.addEventListener('click', () => seleccionarPestana(pestana.id));
    barra.append(boton);
  });
}

function ocultarPestanas() {
  elemento('equipo-tabs').classList.add('is-hidden');
}

function seleccionarPestana(id) {
  if (id === pestanaActiva) {
    return;
  }
  pestanaActiva = id;
  pintarPestanas();
  if (equipoActual !== null) {
    pintarLista(equipoActual);
  }
}

function pintarMiembros(equipo, filas, lista) {
  const miembros = miembrosActivos(equipo);
  if (miembros.length === 0) {
    renderEmptyState(lista, 'Todavía no tenés equipo', null, { inline: true });
    return false;
  }
  miembros.forEach((miembro) => filas.append(crearFilaMiembro(miembro)));
  return true;
}

function pintarSolicitudes(equipo, filas, lista) {
  const invitaciones = equipo.invitaciones || [];
  if (invitaciones.length === 0) {
    renderEmptyState(lista, 'No hay solicitudes', null, { inline: true });
    return false;
  }
  invitaciones.forEach((invitacion) => filas.append(crearFilaInvitacion(invitacion, abrirMenuInvitacion)));
  return true;
}

const PINTORES_DE_PESTANA = {
  equipo: pintarMiembros,
  solicitudes: pintarSolicitudes,
};

function pintarLista(equipo) {
  const lista = elemento('equipo-lista');
  lista.removeAttribute('aria-busy');
  const filas = h('div', { class: 'equipo-filas', 'data-testid': 'equipo-filas' });
  if (PINTORES_DE_PESTANA[pestanaActiva](equipo, filas, lista)) {
    lista.replaceChildren(filas);
  }
}

function pintarEquipo(equipo) {
  equipoActual = equipo;
  pintarPestanas();
  pintarLista(equipo);
}

function detalleDeFirma(invitacion) {
  if (invitacion.estado === 'PENDIENTE') {
    return textoVencimiento(invitacion.fechaVencimiento);
  }
  return invitacion.estado === 'VENCIDA' ? textoVencida(invitacion.fechaVencimiento) : '';
}

function firmaDe(equipo) {
  const invitaciones = (equipo.invitaciones || []).map((invitacion) => ({
    ...invitacion,
    detalle: detalleDeFirma(invitacion),
  }));
  return JSON.stringify({ miembros: equipo.miembros || [], invitaciones });
}

function actualizarTitulo() {
  elemento('equipo-comercio-nombre').textContent = nombreDelComercioActivo();
}

async function cargar({ conEsqueleto }) {
  const pedido = ++secuencia;
  const comercioId = getComercioActivoId();
  const cambioElComercio = comercioId !== comercioPintado;
  actualizarTitulo();
  if (conEsqueleto || cambioElComercio) {
    pintarEsqueleto();
  }
  try {
    const { data: equipo } = await apiFetch(RUTA_EQUIPO, OPCIONES_RED);
    if (pedido !== secuencia) {
      return;
    }
    comercioPintado = comercioId;
    const firma = firmaDe(equipo);
    if (firma === firmaPintada) {
      return;
    }
    firmaPintada = firma;
    pintarEquipo(equipo);
  } catch (error) {
    if (pedido !== secuencia) {
      return;
    }
    if (firmaPintada !== null) {
      return;
    }
    const mensaje = error instanceof ApiError && error.status !== 0 && error.status < 500 ? error.message : MENSAJE_ERROR_CARGA;
    pintarError(mensaje || MENSAJE_ERROR_CARGA, () => cargar({ conEsqueleto: true }));
  }
}

function detenerActualizacion() {
  if (intervalo !== null) {
    window.clearInterval(intervalo);
    intervalo = null;
  }
}

function iniciarActualizacion() {
  detenerActualizacion();
  intervalo = window.setInterval(() => {
    if (!vistaAbierta()) {
      detenerActualizacion();
      return;
    }
    if (document.hidden) {
      return;
    }
    cargar({ conEsqueleto: false });
  }, INTERVALO_POLLING_COMERCIOS_MS);
}

function crearHoja(testid, clase = 'modal-sheet') {
  const backdrop = h('div', { class: 'modal-backdrop', 'data-testid': testid });
  const hoja = h('div', { class: clase });
  backdrop.append(hoja);
  document.body.append(backdrop);
  backdrop.addEventListener('click', (evento) => {
    if (evento.target === backdrop && backdrop.dataset.ocupado !== '1') {
      backdrop.remove();
    }
  });
  return { backdrop, hoja };
}

function ocupar(backdrop, boton, textoOcupado, ocupado, textoNormal) {
  backdrop.dataset.ocupado = ocupado ? '1' : '0';
  boton.disabled = ocupado;
  boton.textContent = ocupado ? textoOcupado : textoNormal;
}

function mensajeDeError(error, porDefecto) {
  if (!(error instanceof ApiError)) {
    return porDefecto;
  }
  if (error.status === 0) {
    return MENSAJE_SIN_CONEXION;
  }
  return error.status >= 500 || !error.message ? porDefecto : error.message;
}

function esRechazoGenerico(error) {
  return error instanceof ApiError && error.status === 409 && error.message === MENSAJE_SERVIDOR_NO_SE_PUEDE_INVITAR;
}

function abrirAvisoNoSePudoInvitar() {
  if (document.querySelector('[data-testid="aviso-no-se-pudo-invitar"]')) {
    return;
  }
  const { backdrop, hoja } = crearHoja('aviso-no-se-pudo-invitar');
  const titulo = h('h2', { class: 'modal-sheet__title equipo-confirmar__titulo', 'data-testid': 'aviso-no-se-pudo-invitar-titulo' });
  titulo.textContent = TITULO_NO_SE_PUEDE_INVITAR;
  const cuerpo = h('p', { class: 'equipo-aviso__cuerpo', 'data-testid': 'aviso-no-se-pudo-invitar-cuerpo' });
  cuerpo.textContent = CUERPO_NO_SE_PUEDE_INVITAR;
  const cerrar = h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'btn-cerrar-aviso-no-se-pudo-invitar' });
  cerrar.textContent = 'Entendido';
  cerrar.addEventListener('click', () => backdrop.remove());
  hoja.append(titulo, cuerpo, cerrar);
}

function abrirHojaInvitar() {
  if (document.querySelector('[data-testid="hoja-invitar-equipo"]')) {
    return;
  }
  const { backdrop, hoja } = crearHoja('hoja-invitar-equipo', 'modal-sheet equipo-hoja');
  const titulo = h('h2', { class: 'modal-sheet__title', 'data-testid': 'titulo-invitar-equipo' });
  titulo.textContent = 'Invitar al equipo';
  const formulario = h('form', { class: 'form equipo-hoja__form', novalidate: true });
  const campo = h('div', { class: 'field' });
  const etiqueta = h('label', { class: 'field__label', for: 'invitar-email' });
  etiqueta.textContent = 'Email';
  const caja = h('div', { class: 'input-shell' });
  const entrada = h('input', {
    type: 'email',
    id: 'invitar-email',
    inputmode: 'email',
    autocomplete: 'off',
    autocapitalize: 'off',
    maxlength: '254',
    'data-testid': 'input-email-invitar',
  });
  caja.append(entrada);
  const error = h('div', { class: 'field__error', id: 'error-invitar-email', style: 'display:none;', 'data-testid': 'error-email-invitar' });
  const rechazo = h('div', { class: 'equipo-rechazo is-hidden', role: 'alert', 'data-testid': 'rechazo-invitar-equipo' });
  const rechazoTitulo = h('p', { class: 'equipo-rechazo__titulo', 'data-testid': 'rechazo-invitar-titulo' });
  rechazoTitulo.textContent = TITULO_NO_SE_PUEDE_INVITAR;
  const rechazoCuerpo = h('p', { class: 'equipo-rechazo__cuerpo', 'data-testid': 'rechazo-invitar-cuerpo' });
  rechazoCuerpo.textContent = CUERPO_NO_SE_PUEDE_INVITAR;
  rechazo.append(rechazoTitulo, rechazoCuerpo);
  const ayuda = h('p', { class: 'field__hint', 'data-testid': 'ayuda-invitar-equipo' });
  ayuda.textContent = 'Le llega un código que vale 7 días.';
  campo.append(etiqueta, caja, error, rechazo, ayuda);
  const enviar = h('button', { class: 'btn btn-primary', type: 'submit', 'data-testid': 'btn-enviar-invitacion' });
  enviar.textContent = 'Enviar invitación';
  formulario.append(campo, enviar);
  hoja.append(titulo, formulario);
  entrada.focus();

  let emailRechazado = null;
  const emailActual = () => entrada.value.trim().toLowerCase();
  entrada.addEventListener('input', () => {
    limpiarErrorCampo('error-invitar-email');
    if (emailRechazado !== null && emailActual() !== emailRechazado) {
      emailRechazado = null;
      rechazo.classList.add('is-hidden');
      ayuda.classList.remove('is-hidden');
      enviar.disabled = false;
    }
  });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviar.disabled) {
      return;
    }
    limpiarErrorCampo('error-invitar-email');
    ocupar(backdrop, enviar, 'Enviando...', true, 'Enviar invitación');
    try {
      const { mensaje } = await apiFetch(`${RUTA_EQUIPO}/invitaciones`, { ...OPCIONES_RED, method: 'POST', body: { email: entrada.value } });
      backdrop.remove();
      showToast(mensaje);
      seleccionarPestana('solicitudes');
      cargar({ conEsqueleto: false });
    } catch (fallo) {
      ocupar(backdrop, enviar, '', false, 'Enviar invitación');
      if (esRechazoGenerico(fallo)) {
        emailRechazado = emailActual();
        rechazo.classList.remove('is-hidden');
        ayuda.classList.add('is-hidden');
        enviar.disabled = true;
        return;
      }
      const mostrado = fallo instanceof ApiError && fallo.status === 400 && fallo.data && mapearErroresBackend(fallo.data, { email: 'error-invitar-email' });
      if (!mostrado) {
        mostrarErrorCampo('error-invitar-email', mensajeDeError(fallo, 'No pudimos enviar la invitación. Probá de nuevo.'));
      }
    }
  });
}

async function reenviar(invitacion) {
  try {
    const { mensaje } = await apiFetch(`${RUTA_EQUIPO}/invitaciones/${invitacion.id}/reenviar`, { ...OPCIONES_RED, method: 'POST' });
    showToast(mensaje);
  } catch (error) {
    if (esRechazoGenerico(error)) {
      abrirAvisoNoSePudoInvitar();
    } else {
      showToast(mensajeDeError(error, 'No pudimos reenviar la invitación. Probá de nuevo.'), 'error');
    }
  }
  cargar({ conEsqueleto: false });
}

function abrirConfirmacionCancelar(invitacion) {
  const { backdrop, hoja } = crearHoja('hoja-cancelar-invitacion');
  const titulo = h('h2', { class: 'modal-sheet__title equipo-confirmar__titulo', 'data-testid': 'titulo-cancelar-invitacion' });
  titulo.textContent = `¿Cancelar la invitación a ${invitacion.email}?`;
  const confirmar = h('button', { class: 'btn btn-primary equipo-hoja__peligro', type: 'button', 'data-testid': 'btn-confirmar-cancelar-invitacion' });
  confirmar.textContent = 'Cancelar invitación';
  const volver = h('button', { class: 'btn btn-tertiary', type: 'button', 'data-testid': 'btn-volver-cancelar-invitacion' });
  volver.textContent = 'Volver';
  hoja.append(titulo, confirmar, volver);
  volver.addEventListener('click', () => backdrop.remove());
  confirmar.addEventListener('click', async () => {
    if (confirmar.disabled) {
      return;
    }
    ocupar(backdrop, confirmar, 'Cancelando...', true, 'Cancelar invitación');
    volver.disabled = true;
    try {
      const { mensaje } = await apiFetch(`${RUTA_EQUIPO}/invitaciones/${invitacion.id}/cancelar`, { ...OPCIONES_RED, method: 'PUT' });
      showToast(mensaje);
    } catch (error) {
      showToast(mensajeDeError(error, 'No pudimos cancelar la invitación. Probá de nuevo.'), 'error');
    }
    backdrop.remove();
    cargar({ conEsqueleto: false });
  });
}

function crearAccionMenu(testid, figuras, texto, peligro) {
  const boton = h('button', { class: peligro ? 'profile-link profile-link--danger' : 'profile-link', type: 'button', 'data-testid': testid });
  const etiqueta = h('span');
  etiqueta.textContent = texto;
  boton.append(crearSvg(figuras), etiqueta);
  return boton;
}

function abrirMenuInvitacion(invitacion) {
  if (document.querySelector('[data-testid="menu-invitacion-equipo"]')) {
    return;
  }
  const { backdrop, hoja } = crearHoja('menu-invitacion-equipo', 'product-modal-sheet');
  const asa = h('div', { class: 'product-modal-sheet__handle' });
  asa.append(h('span'));
  const cuerpo = h('div', { class: 'product-modal-sheet__body' });
  const titulo = h('h2', { class: 'equipo-menu__titulo' });
  titulo.textContent = invitacion.email;
  const acciones = h('div', { class: 'profile-link-list' });
  const reenviarBoton = crearAccionMenu('btn-reenviar-invitacion', FIGURAS_REENVIAR, 'Reenviar código', false);
  reenviarBoton.addEventListener('click', () => {
    backdrop.remove();
    reenviar(invitacion);
  });
  const cancelarBoton = crearAccionMenu('btn-cancelar-invitacion', FIGURAS_CANCELAR, 'Cancelar invitación', true);
  cancelarBoton.addEventListener('click', () => {
    backdrop.remove();
    abrirConfirmacionCancelar(invitacion);
  });
  acciones.append(reenviarBoton, cancelarBoton);
  const cerrar = h('button', { class: 'btn btn-tertiary equipo-menu__cerrar', type: 'button', 'data-testid': 'btn-cerrar-menu-invitacion' });
  cerrar.textContent = 'Cerrar';
  cerrar.addEventListener('click', () => backdrop.remove());
  cuerpo.append(titulo, acciones, cerrar);
  hoja.append(asa, cuerpo);
}

export function enlazarEquipoComercio() {
  elemento('btn-invitar-equipo').addEventListener('click', abrirHojaInvitar);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && vistaAbierta()) {
      cargar({ conEsqueleto: false });
    }
  });
}

export function abrirEquipoComercio() {
  firmaPintada = null;
  comercioPintado = null;
  pestanaActiva = PESTANAS[0].id;
  cargar({ conEsqueleto: true });
  iniciarActualizacion();
}
