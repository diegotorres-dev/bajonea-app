import { apiFetch, ApiError, getComercioActivoId } from './api.js';
import { showToast, renderEmptyState } from './catalogo.js';
import { getComercioActivoEnMemoria, INTERVALO_POLLING_COMERCIOS_MS } from './comercio-activo.js';
import { h, crearSvg, renderBanner } from './form-utils.js';
import { fechaCortaDe } from './fechas.js';
import { mostrarErrorCampo, limpiarErrorCampo, mapearErroresBackend } from './validators.js';
import {
  ESTADO_INVITACION,
  ESTADO_MIEMBRO,
  FIGURAS_CANCELAR,
  FIGURAS_DESACTIVAR,
  FIGURAS_REACTIVAR,
  FILTROS_MIEMBROS,
  OPCIONES_RED,
  crearActividad,
  crearAvatarSobre,
  crearEsqueleto,
  crearEstado,
  crearFilaMiembro,
  crearLinea,
  mensajeDeError,
  miembrosActivos,
  miembrosInactivos,
  nombreCompleto,
  textoVencida,
} from './equipo-vistas.js';

const RUTA_EQUIPO = '/comercios/equipo';
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MENSAJE_ERROR_CARGA = 'No pudimos cargar el equipo.';

const MENSAJE_SERVIDOR_NO_SE_PUEDE_INVITAR = 'No se puede invitar a este email';
const TITULO_NO_SE_PUEDE_INVITAR = 'No pudimos invitar a este email.';
const CUERPO_NO_SE_PUEDE_INVITAR = 'Por privacidad no podemos contarte el motivo. Podés pedirle a esta persona que revise su correo y volver a intentar más tarde.';

const PESTANAS = [
  { id: 'equipo', texto: 'Mi equipo' },
  { id: 'solicitudes', texto: 'Solicitudes' },
  { id: 'actividad', texto: 'Actividad' },
];

const PESTANA_ACTIVIDAD = 'actividad';

const TEXTO_VACIO_MIEMBROS = {
  activos: 'Todavía no tenés equipo',
  inactivos: 'No hay miembros inactivos',
};

const MOTIVO_BAJA_DUENO = 'BAJA_DUENO';
const MOTIVO_RENUNCIA = 'RENUNCIA';
const NOTA_RENUNCIA = 'Dejó el equipo por su cuenta. Para que vuelva, tiene que aceptar una invitación nueva.';
const LEYENDA_REACTIVAR = 'Vuelve al equipo ahora, sin invitación';
const LEYENDA_INVITAR_DE_NUEVO = 'Le llega un código por email y tiene que aceptar';
const MENSAJE_ERROR_DESACTIVAR = 'No pudimos desactivar a esta persona. Probá de nuevo.';
const MENSAJE_ERROR_REACTIVAR = 'No pudimos reactivar a esta persona. Probá de nuevo.';

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
let secuencia = 0;
let comercioPintado = null;
let firmaPintada = null;
let intervalo = null;
let pestanaActiva = PESTANAS[0].id;
let filtroMiembros = FILTROS_MIEMBROS[0].id;
let equipoActual = null;
const actividad = crearActividad({ contenedor: () => elemento('equipo-lista'), ruta: `${RUTA_EQUIPO}/actividad`, estaVisible: () => pestanaActiva === PESTANA_ACTIVIDAD });

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

function textoDeBaja(miembro) {
  const fecha = miembro.fechaBaja ? ` el ${fechaCortaDe(miembro.fechaBaja)}` : '';
  if (miembro.motivoBaja === MOTIVO_BAJA_DUENO) {
    return `Dado de baja${fecha}`;
  }
  if (miembro.motivoBaja === MOTIVO_RENUNCIA) {
    return `Renunció${fecha}`;
  }
  return 'Inactivo';
}

function crearBotonMenuMiembro(miembro, alAbrirMenu) {
  const menu = h('button', {
    class: 'product-row__kebab',
    type: 'button',
    'aria-label': `Más acciones de ${nombreCompleto(miembro)}`,
    'data-testid': `btn-menu-miembro-${miembro.empleadoId}`,
  });
  menu.append(crearSvg(FIGURAS_PUNTITOS));
  menu.addEventListener('click', () => alAbrirMenu(miembro));
  return menu;
}

function crearFilaDeEquipo(miembro, alAbrirMenu) {
  const info = ESTADO_MIEMBRO[miembro.estado] || { texto: miembro.estado, punto: 'inactivo' };
  const inactivo = miembro.estado === 'INACTIVO';
  return crearFilaMiembro(miembro, {
    estado: { info, texto: inactivo ? textoDeBaja(miembro) : info.texto },
    accion: crearBotonMenuMiembro(miembro, alAbrirMenu),
  });
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
  lista.append(crearEsqueleto('equipo-cargando'));
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

function contadorDe(equipo, pestana) {
  if (!equipo || pestana === PESTANA_ACTIVIDAD) {
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

function actualizarPie() {
  elemento('equipo-footer').classList.toggle('is-hidden', pestanaActiva === PESTANA_ACTIVIDAD);
}

function seleccionarPestana(id) {
  if (id === pestanaActiva) {
    return;
  }
  const veniaDeActividad = pestanaActiva === PESTANA_ACTIVIDAD;
  pestanaActiva = id;
  if (veniaDeActividad) {
    actividad.invalidar();
  }
  actualizarPie();
  pintarPestanas();
  if (id === PESTANA_ACTIVIDAD) {
    actividad.iniciar();
    return;
  }
  if (equipoActual !== null) {
    pintarLista(equipoActual);
  } else if (veniaDeActividad) {
    cargar({ conEsqueleto: true });
  }
}

function seleccionarFiltroMiembros(id) {
  if (id === filtroMiembros) {
    return;
  }
  filtroMiembros = id;
  if (equipoActual !== null && pestanaActiva === 'equipo') {
    pintarLista(equipoActual);
  }
}

function crearChipsMiembros(equipo) {
  const chips = h('div', { class: 'chip-row equipo-filtros equipo-chips', role: 'group', 'aria-label': 'Filtrar miembros', 'data-testid': 'equipo-chips' });
  FILTROS_MIEMBROS.forEach((filtro) => {
    const cantidad = filtro.id === 'activos' ? miembrosActivos(equipo).length : miembrosInactivos(equipo).length;
    const chip = h('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(filtro.id === filtroMiembros),
      'data-testid': `chip-miembros-${filtro.id}`,
    });
    chip.textContent = `${filtro.texto} · ${cantidad}`;
    chip.addEventListener('click', () => seleccionarFiltroMiembros(filtro.id));
    chips.append(chip);
  });
  return chips;
}

function pintarMiembros(equipo, lista) {
  const chips = crearChipsMiembros(equipo);
  const miembros = filtroMiembros === 'activos' ? miembrosActivos(equipo) : miembrosInactivos(equipo);
  const contenido = h('div', { 'data-testid': 'equipo-miembros-contenido' });
  if (miembros.length === 0) {
    renderEmptyState(contenido, TEXTO_VACIO_MIEMBROS[filtroMiembros], null, { inline: true });
  } else {
    const filas = h('div', { class: 'equipo-filas', 'data-testid': 'equipo-filas' });
    miembros.forEach((miembro) => filas.append(crearFilaDeEquipo(miembro, abrirMenuMiembro)));
    contenido.append(filas);
  }
  lista.replaceChildren(chips, contenido);
}

function pintarSolicitudes(equipo, lista) {
  const invitaciones = equipo.invitaciones || [];
  if (invitaciones.length === 0) {
    renderEmptyState(lista, 'No hay solicitudes', null, { inline: true });
    return;
  }
  const filas = h('div', { class: 'equipo-filas', 'data-testid': 'equipo-filas' });
  invitaciones.forEach((invitacion) => filas.append(crearFilaInvitacion(invitacion, abrirMenuInvitacion)));
  lista.replaceChildren(filas);
}

const PINTORES_DE_PESTANA = {
  equipo: pintarMiembros,
  solicitudes: pintarSolicitudes,
};

function pintarLista(equipo) {
  if (pestanaActiva === PESTANA_ACTIVIDAD) {
    return;
  }
  const lista = elemento('equipo-lista');
  lista.removeAttribute('aria-busy');
  PINTORES_DE_PESTANA[pestanaActiva](equipo, lista);
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
  if ((conEsqueleto || cambioElComercio) && pestanaActiva !== PESTANA_ACTIVIDAD) {
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
    if (firmaPintada !== null || pestanaActiva === PESTANA_ACTIVIDAD) {
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

function abrirHojaInvitar(emailInicial = '') {
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
  entrada.value = emailInicial;
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

function crearAccionDeHoja(testid, figuras, texto, leyenda, clase) {
  const boton = h('button', { class: `profile-link ${clase}`.trim(), type: 'button', 'data-testid': testid });
  const etiqueta = h('span');
  etiqueta.append(texto);
  if (leyenda) {
    const complemento = h('small', { class: 'equipo-accion__leyenda' });
    complemento.textContent = leyenda;
    etiqueta.append(complemento);
  }
  boton.append(crearSvg(figuras), etiqueta);
  return boton;
}

function reemplazarMiembro(actualizado) {
  if (equipoActual === null) {
    return;
  }
  const miembros = (equipoActual.miembros || []).map((miembro) => (miembro.empleadoId === actualizado.empleadoId ? actualizado : miembro));
  equipoActual = { ...equipoActual, miembros };
  firmaPintada = firmaDe(equipoActual);
  pintarEquipo(equipoActual);
}

function crearEncabezadoDeMenu(miembro, conSubtitulo) {
  const asa = h('div', { class: 'product-modal-sheet__handle' });
  asa.append(h('span'));
  const cuerpo = h('div', { class: 'product-modal-sheet__body' });
  const titulo = h('h2', { class: 'equipo-menu__titulo', 'data-testid': 'menu-miembro-titulo' });
  titulo.textContent = nombreCompleto(miembro);
  cuerpo.append(titulo);
  if (conSubtitulo) {
    const subtitulo = h('p', { class: 'equipo-menu__subtitulo', 'data-testid': 'menu-miembro-subtitulo' });
    subtitulo.textContent = textoDeBaja(miembro);
    cuerpo.append(subtitulo);
  }
  return { asa, cuerpo };
}

function crearBotonCerrarMenu(backdrop) {
  const cerrar = h('button', { class: 'btn btn-tertiary equipo-menu__cerrar', type: 'button', 'data-testid': 'btn-cerrar-menu-miembro' });
  cerrar.textContent = 'Cerrar';
  cerrar.addEventListener('click', () => backdrop.remove());
  return cerrar;
}

function abrirConfirmacionDesactivar(miembro) {
  const { backdrop, hoja } = crearHoja('hoja-desactivar-miembro');
  const titulo = h('h2', { class: 'modal-sheet__title equipo-confirmar__titulo', 'data-testid': 'titulo-desactivar-miembro' });
  titulo.textContent = `¿Desactivar a ${nombreCompleto(miembro)}?`;
  const texto = h('p', { class: 'equipo-aviso__cuerpo', 'data-testid': 'texto-desactivar-miembro' });
  texto.textContent = `${nombreCompleto(miembro)} va a dejar de tener acceso a ${nombreDelComercioActivo() || 'este comercio'} y se le avisa. Si cambiás de idea, la podés reactivar desde Inactivos.`;
  const confirmar = h('button', { class: 'btn btn-primary equipo-hoja__peligro', type: 'button', 'data-testid': 'btn-confirmar-desactivar-miembro' });
  confirmar.textContent = 'Desactivar';
  const volver = h('button', { class: 'btn btn-tertiary', type: 'button', 'data-testid': 'btn-volver-desactivar-miembro' });
  volver.textContent = 'Volver';
  hoja.append(titulo, texto, confirmar, volver);
  volver.addEventListener('click', () => backdrop.remove());
  confirmar.addEventListener('click', async () => {
    if (confirmar.disabled) {
      return;
    }
    ocupar(backdrop, confirmar, 'Desactivando...', true, 'Desactivar');
    volver.disabled = true;
    try {
      const { data } = await apiFetch(`${RUTA_EQUIPO}/miembros/${miembro.empleadoId}/desactivar`, { ...OPCIONES_RED, method: 'PUT' });
      backdrop.remove();
      reemplazarMiembro(data);
      showToast(`Desactivaste a ${nombreCompleto(miembro)}`);
    } catch (error) {
      backdrop.remove();
      showToast(mensajeDeError(error, MENSAJE_ERROR_DESACTIVAR), 'error');
      cargar({ conEsqueleto: false });
    }
  });
}

function abrirMenuMiembroActivo(miembro) {
  const { backdrop, hoja } = crearHoja('menu-miembro-equipo', 'product-modal-sheet');
  const { asa, cuerpo } = crearEncabezadoDeMenu(miembro, false);
  const acciones = h('div', { class: 'profile-link-list' });
  const desactivar = crearAccionDeHoja('btn-desactivar-miembro', FIGURAS_DESACTIVAR, 'Desactivar', '', 'profile-link--peligro-solido');
  desactivar.addEventListener('click', () => {
    backdrop.remove();
    abrirConfirmacionDesactivar(miembro);
  });
  acciones.append(desactivar);
  cuerpo.append(acciones, crearBotonCerrarMenu(backdrop));
  hoja.append(asa, cuerpo);
}

function mensajeDeReactivar(error) {
  if (error instanceof ApiError && error.status === 409 && error.message) {
    return error.message;
  }
  return mensajeDeError(error, MENSAJE_ERROR_REACTIVAR);
}

function crearAccionReactivar(miembro, backdrop, aviso) {
  const reactivar = crearAccionDeHoja('btn-reactivar-miembro', FIGURAS_REACTIVAR, 'Reactivar', LEYENDA_REACTIVAR, '');
  reactivar.addEventListener('click', async () => {
    if (reactivar.disabled) {
      return;
    }
    reactivar.disabled = true;
    backdrop.dataset.ocupado = '1';
    aviso.replaceChildren();
    try {
      const { data } = await apiFetch(`${RUTA_EQUIPO}/miembros/${miembro.empleadoId}/reactivar`, { ...OPCIONES_RED, method: 'PUT' });
      backdrop.remove();
      reemplazarMiembro(data);
      showToast(`Reactivaste a ${nombreCompleto(miembro)}`);
    } catch (error) {
      reactivar.disabled = false;
      backdrop.dataset.ocupado = '0';
      renderBanner(aviso, 'error', mensajeDeReactivar(error));
      aviso.firstElementChild.setAttribute('role', 'alert');
      aviso.firstElementChild.setAttribute('data-testid', 'aviso-reactivar');
      cargar({ conEsqueleto: false });
    }
  });
  return reactivar;
}

function abrirMenuMiembroInactivo(miembro) {
  const { backdrop, hoja } = crearHoja('menu-miembro-equipo', 'product-modal-sheet');
  const { asa, cuerpo } = crearEncabezadoDeMenu(miembro, true);
  if (miembro.motivoBaja === MOTIVO_RENUNCIA) {
    const nota = h('p', { class: 'equipo-menu__nota', 'data-testid': 'menu-miembro-nota' });
    nota.textContent = NOTA_RENUNCIA;
    cuerpo.append(nota);
  }
  const aviso = h('div', { class: 'equipo-menu__aviso', 'data-testid': 'aviso-reactivar-slot' });
  const acciones = h('div', { class: 'profile-link-list' });
  if (miembro.puedeReactivar) {
    acciones.append(crearAccionReactivar(miembro, backdrop, aviso));
  } else {
    const invitar = crearAccionDeHoja('btn-invitar-de-nuevo', FIGURAS_REENVIAR, 'Invitar de nuevo', LEYENDA_INVITAR_DE_NUEVO, '');
    invitar.addEventListener('click', () => {
      backdrop.remove();
      abrirHojaInvitar(miembro.email);
    });
    acciones.append(invitar);
  }
  cuerpo.append(aviso, acciones, crearBotonCerrarMenu(backdrop));
  hoja.append(asa, cuerpo);
}

function abrirMenuMiembro(miembro) {
  if (document.querySelector('[data-testid="menu-miembro-equipo"]')) {
    return;
  }
  if (miembro.estado === 'ACTIVO') {
    abrirMenuMiembroActivo(miembro);
  } else {
    abrirMenuMiembroInactivo(miembro);
  }
}

export function enlazarEquipoComercio() {
  elemento('btn-invitar-equipo').addEventListener('click', () => abrirHojaInvitar());
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
  filtroMiembros = FILTROS_MIEMBROS[0].id;
  actividad.reiniciar();
  actualizarPie();
  cargar({ conEsqueleto: true });
  iniciarActualizacion();
}
