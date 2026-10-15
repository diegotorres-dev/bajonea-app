import { apiFetch, ApiError } from './api.js';
import { renderEmptyState } from './catalogo.js';
import { requireAdmin } from './admin.js';
import { nombreRecordadoDelComercio } from './admin-comercio-nombre.js';
import { h, renderBanner } from './form-utils.js';
import { fechaCompletaDe, fechaCortaDe } from './fechas.js';
import {
  ESTADO_INVITACION,
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
} from './equipo-vistas.js';

const RUTA_COMERCIOS = '/administrador/comercios';
const PAGINA_EQUIPO = 'admin-comercio-equipo.html';
const PAGINA_ACTIVIDAD = 'admin-comercio-actividad.html';
const MENSAJE_NO_ENCONTRADO = 'Comercio no encontrado';
const MENSAJE_ERROR_CARGA = 'No pudimos cargar el equipo.';
const TEXTO_SOLO_LECTURA = 'Solo lectura';
const TEXTO_SOLICITUDES = 'Invitaciones enviadas por el dueño que todavía no se respondieron';

const PESTANAS = [
  { id: 'miembros', texto: 'Miembros' },
  { id: 'solicitudes', texto: 'Solicitudes' },
];

const TEXTO_VACIO_MIEMBROS = {
  activos: 'Este comercio no tiene miembros activos',
  inactivos: 'Este comercio no tiene miembros inactivos',
};

const MOTIVO_BAJA_DUENO = 'BAJA_DUENO';
const MOTIVO_RENUNCIA = 'RENUNCIA';

function elemento(id) {
  return document.getElementById(id);
}

function leerComercioId() {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function pintarNombre(nombre) {
  const subtitulo = elemento('equipo-comercio-nombre');
  subtitulo.textContent = nombre;
  subtitulo.classList.toggle('is-hidden', !nombre);
}

function pintarErrorEn(contenedor, mensaje, alReintentar) {
  contenedor.removeAttribute('aria-busy');
  const slot = h('div', { 'data-testid': 'equipo-error' });
  renderBanner(slot, 'error', mensaje);
  if (alReintentar) {
    const reintentar = h('button', { class: 'btn btn-secondary banner__accion', type: 'button', 'data-testid': 'btn-reintentar-equipo' });
    reintentar.textContent = 'Reintentar';
    reintentar.addEventListener('click', alReintentar);
    slot.firstElementChild.lastElementChild.append(h('br'), reintentar);
  }
  contenedor.replaceChildren(slot);
}

function etiquetaDeBaja(miembro) {
  const fecha = miembro.fechaBaja ? ` · ${fechaCortaDe(miembro.fechaBaja)}` : '';
  if (miembro.motivoBaja === MOTIVO_BAJA_DUENO) {
    return { clase: 'equipo-motivo--baja', texto: `Dado de baja por el dueño${fecha}` };
  }
  if (miembro.motivoBaja === MOTIVO_RENUNCIA) {
    return { clase: 'equipo-motivo--renuncia', texto: `Dejó de trabajar en el comercio${fecha}` };
  }
  return { clase: 'equipo-motivo--renuncia', texto: 'Inactivo' };
}

function crearEtiquetaDeBaja(miembro) {
  const { clase, texto } = etiquetaDeBaja(miembro);
  const etiqueta = h('span', { class: `equipo-motivo ${clase}`, 'data-testid': 'equipo-motivo-baja' });
  etiqueta.textContent = texto;
  return etiqueta;
}

function crearFilaDeMiembro(miembro) {
  const inactivo = miembro.estado === 'INACTIVO';
  return crearFilaMiembro(miembro, {
    lineaDesde: miembro.fechaAlta ? `En el equipo desde ${fechaCompletaDe(miembro.fechaAlta)}` : '',
    apagado: inactivo,
    etiqueta: inactivo ? crearEtiquetaDeBaja(miembro) : null,
  });
}

function textoDeVencimiento(invitacion) {
  if (invitacion.estado !== 'PENDIENTE') {
    return invitacion.estado === 'VENCIDA' ? 'Vencida' : ESTADO_INVITACION.INVALIDADA.texto;
  }
  const dias = invitacion.diasRestantes;
  if (dias === null || dias === undefined) {
    return ESTADO_INVITACION.PENDIENTE.texto;
  }
  if (dias <= 0) {
    return 'Vence hoy';
  }
  return dias === 1 ? 'Vence en 1 día' : `Vence en ${dias} días`;
}

function crearFilaDeSolicitud(invitacion) {
  const info = ESTADO_INVITACION[invitacion.estado] || ESTADO_INVITACION.PENDIENTE;
  const fila = h('div', { class: 'equipo-fila', 'data-testid': `equipo-invitacion-${invitacion.id}`, 'data-estado': invitacion.estado });
  const datos = h('div', { class: 'equipo-fila__datos' });
  const email = crearLinea('equipo-fila__nombre', invitacion.email);
  email.setAttribute('data-testid', 'equipo-email');
  datos.append(email);
  if (invitacion.fechaCreacion) {
    const enviada = crearLinea('equipo-fila__email', `Invitada el ${fechaCompletaDe(invitacion.fechaCreacion)}`);
    enviada.setAttribute('data-testid', 'equipo-invitada');
    datos.append(enviada);
  }
  datos.append(crearEstado(info, '', textoDeVencimiento(invitacion)));
  fila.append(crearAvatarSobre(), datos);
  return fila;
}

function crearEncabezadoCantidad(texto, cantidad) {
  const cuenta = h('span', { class: 'equipo-tab__cuenta' });
  cuenta.textContent = String(cantidad);
  const contenedor = document.createDocumentFragment();
  contenedor.append(texto, ' ', cuenta);
  return contenedor;
}

export async function initAdminComercioEquipo() {
  if (!requireAdmin()) {
    return;
  }
  const comercioId = leerComercioId();
  const lista = elemento('equipo-lista');
  const barra = elemento('equipo-tabs');
  const botonActividad = elemento('btn-actividad-equipo');
  let pestana = PESTANAS[0].id;
  let filtro = FILTROS_MIEMBROS[0].id;
  let equipo = null;
  let secuencia = 0;

  if (comercioId === null) {
    barra.classList.add('is-hidden');
    botonActividad.classList.add('is-hidden');
    pintarErrorEn(lista, MENSAJE_NO_ENCONTRADO, null);
    return;
  }
  botonActividad.setAttribute('href', `${PAGINA_ACTIVIDAD}?id=${comercioId}`);
  pintarNombre(nombreRecordadoDelComercio(comercioId));

  function cantidadDe(id) {
    return id === 'miembros' ? null : (equipo.invitaciones || []).length;
  }

  function pintarPestanas() {
    barra.classList.remove('is-hidden');
    barra.replaceChildren();
    PESTANAS.forEach((definicion) => {
      const boton = h('button', {
        type: 'button',
        class: 'equipo-tab',
        role: 'tab',
        'aria-selected': String(definicion.id === pestana),
        'data-testid': `tab-equipo-${definicion.id}`,
      });
      const cantidad = equipo ? cantidadDe(definicion.id) : null;
      if (cantidad === null) {
        boton.textContent = definicion.texto;
      } else {
        boton.append(crearEncabezadoCantidad(definicion.texto, cantidad));
      }
      boton.addEventListener('click', () => {
        if (definicion.id !== pestana) {
          pestana = definicion.id;
          pintarPestanas();
          pintarLista();
        }
      });
      barra.append(boton);
    });
  }

  function crearChips() {
    const chips = h('div', { class: 'chip-row equipo-filtros equipo-chips', role: 'group', 'aria-label': 'Filtrar miembros', 'data-testid': 'equipo-chips' });
    FILTROS_MIEMBROS.forEach((definicion) => {
      const cantidad = definicion.id === 'activos' ? miembrosActivos(equipo).length : miembrosInactivos(equipo).length;
      const chip = h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(definicion.id === filtro),
        'data-testid': `chip-miembros-${definicion.id}`,
      });
      chip.append(`${definicion.texto} `, h('span', { class: 'equipo-chip__cuenta' }, [String(cantidad)]));
      chip.addEventListener('click', () => {
        if (definicion.id !== filtro) {
          filtro = definicion.id;
          pintarLista();
        }
      });
      chips.append(chip);
    });
    return chips;
  }

  function pintarMiembros() {
    const miembros = filtro === 'activos' ? miembrosActivos(equipo) : miembrosInactivos(equipo);
    const soloLectura = h('p', { class: 'equipo-solo-lectura', 'data-testid': 'equipo-solo-lectura' });
    soloLectura.textContent = TEXTO_SOLO_LECTURA;
    const contenido = h('div', { 'data-testid': 'equipo-miembros-contenido' });
    if (miembros.length === 0) {
      renderEmptyState(contenido, TEXTO_VACIO_MIEMBROS[filtro], null, { inline: true });
    } else {
      const filas = h('div', { class: 'equipo-filas', 'data-testid': 'equipo-filas' });
      miembros.forEach((miembro) => filas.append(crearFilaDeMiembro(miembro)));
      contenido.append(filas);
    }
    lista.replaceChildren(crearChips(), soloLectura, contenido);
  }

  function pintarSolicitudes() {
    const invitaciones = equipo.invitaciones || [];
    const introduccion = h('p', { class: 'equipo-solo-lectura', 'data-testid': 'equipo-solicitudes-texto' });
    introduccion.textContent = TEXTO_SOLICITUDES;
    const contenido = h('div', { 'data-testid': 'equipo-solicitudes-contenido' });
    if (invitaciones.length === 0) {
      renderEmptyState(contenido, 'No hay solicitudes pendientes', null, { inline: true });
    } else {
      const filas = h('div', { class: 'equipo-filas', 'data-testid': 'equipo-filas' });
      invitaciones.forEach((invitacion) => filas.append(crearFilaDeSolicitud(invitacion)));
      contenido.append(filas);
    }
    lista.replaceChildren(introduccion, contenido);
  }

  function pintarLista() {
    lista.removeAttribute('aria-busy');
    if (pestana === 'miembros') {
      pintarMiembros();
    } else {
      pintarSolicitudes();
    }
  }

  async function cargar() {
    const pedido = ++secuencia;
    equipo = null;
    pintarPestanas();
    lista.replaceChildren(crearEsqueleto('equipo-cargando'));
    lista.setAttribute('aria-busy', 'true');
    try {
      const { data } = await apiFetch(`${RUTA_COMERCIOS}/${comercioId}/equipo`, OPCIONES_RED);
      if (pedido !== secuencia) {
        return;
      }
      equipo = data;
      pintarPestanas();
      pintarLista();
    } catch (error) {
      if (pedido !== secuencia) {
        return;
      }
      barra.classList.add('is-hidden');
      const noEncontrado = error instanceof ApiError && error.status === 404;
      const mensaje = noEncontrado ? MENSAJE_NO_ENCONTRADO : mensajeDeError(error, MENSAJE_ERROR_CARGA);
      pintarErrorEn(lista, mensaje || MENSAJE_ERROR_CARGA, noEncontrado ? null : cargar);
    }
  }

  await cargar();
}

export async function initAdminComercioActividad() {
  if (!requireAdmin()) {
    return;
  }
  const comercioId = leerComercioId();
  const lista = elemento('equipo-lista');
  if (comercioId === null) {
    pintarErrorEn(lista, MENSAJE_NO_ENCONTRADO, null);
    return;
  }
  elemento('btn-volver-actividad').setAttribute('href', `${PAGINA_EQUIPO}?id=${comercioId}`);
  const actividad = crearActividad({
    contenedor: () => lista,
    ruta: `${RUTA_COMERCIOS}/${comercioId}/actividad`,
    estaVisible: () => true,
  });
  pintarNombre(nombreRecordadoDelComercio(comercioId));
  actividad.iniciar();
}

