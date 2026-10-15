import { apiFetch, ApiError } from './api.js';
import { showToast, renderEmptyState } from './catalogo.js';
import { iniciales } from './selector-comercio.js';
import { h, crearSvg, renderBanner } from './form-utils.js';
import { diaDe, etiquetaDeDia, horaMinutoDe } from './fechas.js';

export const OPCIONES_RED = { handle5xxGlobally: false, handleRedGlobally: false, conMensaje: true };
export const MENSAJE_SIN_CONEXION = 'No pudimos conectar. Probá de nuevo.';
const MENSAJE_ERROR_ACTIVIDAD = 'No pudimos cargar la actividad.';
const MENSAJE_ERROR_VER_MAS = 'No pudimos cargar más actividad. Probá de nuevo.';
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export const FILTROS_ACTIVIDAD = [
  { id: 'todo', texto: 'Todo', fuente: null },
  { id: 'pedidos', texto: 'Pedidos', fuente: 'PEDIDO' },
  { id: 'ediciones', texto: 'Ediciones', fuente: 'EDICION' },
  { id: 'cierres', texto: 'Cierres', fuente: 'CIERRE' },
  { id: 'equipo', texto: 'Equipo', fuente: 'EQUIPO' },
];

const TEXTO_VACIO_ACTIVIDAD = {
  todo: 'Todavía no hay actividad',
  pedidos: 'No hay actividad de pedidos',
  ediciones: 'No hay ediciones',
  cierres: 'No hay cierres ni reaperturas',
  equipo: 'No hay actividad del equipo',
};

export const FILTROS_MIEMBROS = [
  { id: 'activos', texto: 'Activos' },
  { id: 'inactivos', texto: 'Inactivos' },
];

export const ESTADO_MIEMBRO = {
  ACTIVO: { texto: 'Activo', punto: 'positivo' },
  INACTIVO: { texto: 'Inactivo', punto: 'inactivo' },
};

export const ESTADO_INVITACION = {
  PENDIENTE: { texto: 'Pendiente', punto: 'pendiente' },
  VENCIDA: { texto: 'Vencida', punto: 'vencido' },
  INVALIDADA: { texto: 'Código bloqueado', punto: 'rechazado' },
};

const FIGURAS_SOBRE = [
  ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }],
  ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }],
];
const FIGURAS_ENGRANAJE = [
  ['circle', { cx: '12', cy: '12', r: '3' }],
  ['path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' }],
];
export const FIGURAS_DESACTIVAR = [
  ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
  ['circle', { cx: '9', cy: '7', r: '4' }],
  ['line', { x1: '17', y1: '11', x2: '22', y2: '11' }],
];
export const FIGURAS_REACTIVAR = [
  ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
  ['circle', { cx: '9', cy: '7', r: '4' }],
  ['line', { x1: '19', y1: '8', x2: '19', y2: '14' }],
  ['line', { x1: '16', y1: '11', x2: '22', y2: '11' }],
];
const FIGURAS_SALIDA = [
  ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
  ['polyline', { points: '16 17 21 12 16 7' }],
  ['line', { x1: '21', y1: '12', x2: '9', y2: '12' }],
];
const FIGURAS_CHECK = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['path', { d: 'm9 12 2 2 4-4' }],
];
export const FIGURAS_CANCELAR = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['line', { x1: '15', y1: '9', x2: '9', y2: '15' }],
  ['line', { x1: '9', y1: '9', x2: '15', y2: '15' }],
];

const ICONO_DE_EQUIPO = {
  INVITACION: FIGURAS_SOBRE,
  INVITACION_CANCELADA: FIGURAS_CANCELAR,
  ACEPTACION: FIGURAS_CHECK,
  BAJA_DUENO: FIGURAS_DESACTIVAR,
  RENUNCIA: FIGURAS_SALIDA,
  REACTIVACION: FIGURAS_REACTIVAR,
};

export function mensajeDeError(error, porDefecto) {
  if (!(error instanceof ApiError)) {
    return porDefecto;
  }
  if (error.status === 0) {
    return MENSAJE_SIN_CONEXION;
  }
  return error.status >= 500 || !error.message ? porDefecto : error.message;
}

export function crearLinea(clase, texto) {
  const linea = h('span', { class: clase });
  linea.textContent = texto;
  return linea;
}

export function nombreCompleto(miembro) {
  return `${miembro.nombre} ${miembro.apellido}`;
}

export function miembrosActivos(equipo) {
  return (equipo.miembros || []).filter((miembro) => miembro.estado === 'ACTIVO');
}

export function miembrosInactivos(equipo) {
  return (equipo.miembros || []).filter((miembro) => miembro.estado === 'INACTIVO');
}

export function textoVencida(fechaVencimiento) {
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

export function crearEstado(info, detalle, textoEtiqueta = info.texto) {
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

export function crearAvatarIniciales(miembro, apagado = false) {
  const avatar = h('span', { class: `selector-avatar selector-avatar--panel equipo-avatar${apagado ? ' equipo-avatar--apagado' : ''}` });
  const texto = h('span', { class: 'selector-avatar__iniciales' });
  texto.textContent = iniciales(`${miembro.nombre} ${miembro.apellido}`);
  avatar.append(texto);
  return avatar;
}

export function crearAvatarSobre() {
  const avatar = h('span', { class: 'selector-avatar selector-avatar--panel equipo-avatar' });
  avatar.append(crearSvg(FIGURAS_SOBRE));
  return avatar;
}

export function crearFilaMiembro(miembro, { accion = null, estado = null, etiqueta = null, lineaDesde = '', apagado = false } = {}) {
  const fila = h('div', { class: 'equipo-fila', 'data-testid': `equipo-miembro-${miembro.empleadoId}`, 'data-estado': miembro.estado });
  const datos = h('div', { class: 'equipo-fila__datos' });
  const nombre = crearLinea('equipo-fila__nombre', nombreCompleto(miembro));
  nombre.setAttribute('data-testid', 'equipo-nombre');
  const email = crearLinea('equipo-fila__email', miembro.email);
  email.setAttribute('data-testid', 'equipo-email');
  datos.append(nombre, email);
  if (lineaDesde) {
    const desde = crearLinea('equipo-fila__detalle', lineaDesde);
    desde.setAttribute('data-testid', 'equipo-desde');
    datos.append(desde);
  }
  if (estado) {
    datos.append(crearEstado(estado.info, '', estado.texto));
  }
  if (etiqueta) {
    datos.append(etiqueta);
  }
  fila.append(crearAvatarIniciales(miembro, apagado), datos);
  if (accion) {
    fila.append(accion);
  }
  return fila;
}

export function crearEsqueleto(testid) {
  const contenedor = h('div', { class: 'equipo-esqueleto', 'data-testid': testid });
  for (let i = 0; i < 3; i += 1) {
    const fila = h('div', { class: 'equipo-esqueleto__fila' });
    const lineas = h('div', { class: 'equipo-esqueleto__lineas' });
    lineas.append(h('div', { class: 'skeleton equipo-esqueleto__linea' }), h('div', { class: 'skeleton equipo-esqueleto__linea equipo-esqueleto__linea--corta' }));
    fila.append(h('div', { class: 'skeleton equipo-esqueleto__avatar' }), lineas);
    contenedor.append(fila);
  }
  return contenedor;
}

function crearAvatarActividad(item) {
  if (!item.actorNombre) {
    const avatar = h('span', { class: 'selector-avatar selector-avatar--panel equipo-avatar', 'data-testid': 'actividad-avatar-sistema' });
    avatar.append(crearSvg(FIGURAS_ENGRANAJE));
    return avatar;
  }
  const avatar = h('span', { class: 'selector-avatar selector-avatar--panel equipo-avatar', 'data-testid': 'actividad-avatar' });
  const texto = h('span', { class: 'selector-avatar__iniciales' });
  texto.textContent = iniciales(item.actorNombre);
  avatar.append(texto);
  return avatar;
}

function crearIconoDeEquipo(accion) {
  const icono = crearSvg(ICONO_DE_EQUIPO[accion] || FIGURAS_CHECK);
  icono.setAttribute('class', 'actividad-fila__icono');
  icono.setAttribute('aria-hidden', 'true');
  icono.setAttribute('data-testid', `actividad-icono-${accion}`);
  return icono;
}

function crearFilaActividad(item) {
  const fila = h('div', { class: 'equipo-fila actividad-fila', 'data-testid': 'actividad-fila', 'data-fuente': item.fuente, 'data-rol': item.actorRol });
  const datos = h('div', { class: 'equipo-fila__datos' });
  const encabezado = h('div', { class: 'actividad-fila__encabezado' });
  if (item.actorNombre) {
    const nombre = crearLinea('equipo-fila__nombre', item.actorNombre);
    nombre.setAttribute('data-testid', 'actividad-nombre');
    encabezado.append(nombre);
  }
  const rol = crearLinea('actividad-rol', item.actorRolTexto || item.actorRol);
  rol.setAttribute('data-testid', 'actividad-rol');
  encabezado.append(rol);
  const accion = crearLinea('actividad-fila__accion', item.accionTexto);
  accion.setAttribute('data-testid', 'actividad-accion');
  if (item.fuente === 'EQUIPO') {
    accion.classList.add('actividad-fila__accion--con-icono');
    accion.prepend(crearIconoDeEquipo(item.accion));
  }
  datos.append(encabezado, accion);
  const referencia = item.fuente === 'EQUIPO' ? '' : [item.entidadNombre, item.detalle].filter(Boolean).join(' · ');
  if (referencia) {
    const complemento = crearLinea('equipo-fila__detalle actividad-fila__referencia', referencia);
    complemento.setAttribute('data-testid', 'actividad-referencia');
    datos.append(complemento);
  }
  const hora = crearLinea('actividad-fila__hora', horaMinutoDe(item.fechaHora));
  hora.setAttribute('data-testid', 'actividad-hora');
  fila.append(crearAvatarActividad(item), datos, hora);
  return fila;
}

function crearSeparadorDeDia(fechaHora) {
  const separador = h('div', { class: 'actividad-dia', role: 'heading', 'aria-level': '3', 'data-testid': 'actividad-dia' });
  separador.textContent = etiquetaDeDia(fechaHora);
  return separador;
}

export function crearActividad({ contenedor, ruta, estaVisible }) {
  const estado = { filtro: FILTROS_ACTIVIDAD[0], items: [], siguienteCursor: null, hayMas: false, pedido: 0 };

  function armarArmazon() {
    const lista = contenedor();
    lista.removeAttribute('aria-busy');
    const filtros = h('div', { class: 'chip-row equipo-filtros', role: 'group', 'aria-label': 'Filtrar actividad', 'data-testid': 'actividad-filtros' });
    FILTROS_ACTIVIDAD.forEach((filtro) => {
      const chip = h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(filtro.id === estado.filtro.id),
        'data-testid': `chip-actividad-${filtro.id}`,
      });
      chip.textContent = filtro.texto;
      chip.addEventListener('click', () => seleccionarFiltro(filtro));
      filtros.append(chip);
    });
    const cuerpo = h('div', { id: 'actividad-contenido', 'data-testid': 'actividad-contenido' });
    lista.replaceChildren(filtros, cuerpo);
  }

  function marcarFiltroActivo() {
    FILTROS_ACTIVIDAD.forEach((filtro) => {
      const chip = document.querySelector(`[data-testid="chip-actividad-${filtro.id}"]`);
      if (chip) {
        chip.setAttribute('aria-pressed', String(filtro.id === estado.filtro.id));
      }
    });
  }

  function pintarCargando() {
    const cuerpo = document.getElementById('actividad-contenido');
    cuerpo.setAttribute('aria-busy', 'true');
    cuerpo.replaceChildren(crearEsqueleto('actividad-cargando'));
  }

  function pintarError(mensaje) {
    const cuerpo = document.getElementById('actividad-contenido');
    cuerpo.removeAttribute('aria-busy');
    const slot = h('div', { 'data-testid': 'actividad-error' });
    renderBanner(slot, 'error', mensaje);
    const reintentar = h('button', { class: 'btn btn-secondary banner__accion', type: 'button', 'data-testid': 'btn-reintentar-actividad' });
    reintentar.textContent = 'Reintentar';
    reintentar.addEventListener('click', () => cargar({ reiniciar: true }));
    slot.firstElementChild.lastElementChild.append(h('br'), reintentar);
    cuerpo.replaceChildren(slot);
  }

  function pintar() {
    const cuerpo = document.getElementById('actividad-contenido');
    cuerpo.removeAttribute('aria-busy');
    if (estado.items.length === 0) {
      renderEmptyState(cuerpo, TEXTO_VACIO_ACTIVIDAD[estado.filtro.id], null, { inline: true });
      return;
    }
    const filas = h('div', { class: 'equipo-filas', 'data-testid': 'actividad-filas' });
    let diaAnterior = null;
    estado.items.forEach((item) => {
      const dia = diaDe(item.fechaHora);
      if (dia !== diaAnterior) {
        filas.append(crearSeparadorDeDia(item.fechaHora));
        diaAnterior = dia;
      }
      filas.append(crearFilaActividad(item));
    });
    cuerpo.replaceChildren(filas);
    if (estado.hayMas) {
      const verMas = h('button', { class: 'btn btn-secondary actividad-ver-mas', type: 'button', 'data-testid': 'btn-actividad-ver-mas' });
      verMas.textContent = 'Ver más';
      verMas.addEventListener('click', () => {
        verMas.disabled = true;
        cargar({ reiniciar: false, alFallar: () => { verMas.disabled = false; } });
      });
      cuerpo.append(verMas);
    }
  }

  async function cargar({ reiniciar, alFallar }) {
    const pedido = ++estado.pedido;
    if (reiniciar) {
      estado.items = [];
      estado.siguienteCursor = null;
      estado.hayMas = false;
      pintarCargando();
    }
    const parametros = new URLSearchParams();
    if (estado.filtro.fuente) {
      parametros.set('fuente', estado.filtro.fuente);
    }
    if (!reiniciar && estado.siguienteCursor) {
      parametros.set('cursor', estado.siguienteCursor);
    }
    const consulta = parametros.toString();
    try {
      const { data } = await apiFetch(`${ruta}${consulta ? `?${consulta}` : ''}`, OPCIONES_RED);
      if (pedido !== estado.pedido || !estaVisible()) {
        return;
      }
      estado.items = estado.items.concat(data.items || []);
      estado.siguienteCursor = data.siguienteCursor || null;
      estado.hayMas = Boolean(data.hayMas);
      pintar();
    } catch (error) {
      if (pedido !== estado.pedido || !estaVisible()) {
        return;
      }
      if (reiniciar) {
        const mensaje = error instanceof ApiError && error.status !== 0 && error.status < 500 ? error.message : MENSAJE_ERROR_ACTIVIDAD;
        pintarError(mensaje || MENSAJE_ERROR_ACTIVIDAD);
        return;
      }
      if (alFallar) {
        alFallar();
      }
      showToast(mensajeDeError(error, MENSAJE_ERROR_VER_MAS), 'error');
    }
  }

  function seleccionarFiltro(filtro) {
    if (filtro.id === estado.filtro.id) {
      return;
    }
    estado.filtro = filtro;
    marcarFiltroActivo();
    cargar({ reiniciar: true });
  }

  return {
    iniciar() {
      estado.filtro = FILTROS_ACTIVIDAD[0];
      armarArmazon();
      cargar({ reiniciar: true });
    },
    reiniciar() {
      estado.pedido += 1;
      estado.filtro = FILTROS_ACTIVIDAD[0];
      estado.items = [];
      estado.siguienteCursor = null;
      estado.hayMas = false;
    },
    invalidar() {
      estado.pedido += 1;
    },
  };
}
