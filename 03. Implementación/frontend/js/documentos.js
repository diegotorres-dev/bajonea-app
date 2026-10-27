import { apiFetch, ApiError } from './api.js';
import { exigirDueno } from './contexto.js';
import { showToast } from './catalogo.js';
import { prepararPaginaComercio } from './selector-comercio.js';
import { h, renderBannerTexto, mostrarAvisoFijo } from './form-utils.js';
import {
  abrirVisorDocumento,
  atraparFoco,
  crearChipEstado,
  devolverFoco,
  elementoQueAbrio,
  formatearFechaCorta,
  formatearTamano,
  icono,
  lineaDeArchivo,
  mensajeDeError,
  nombreDelDocumento,
} from './documentos-comun.js';

const RUTA_API = '/comercios/documentos';
const EXTENSIONES_PERMITIDAS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const TIMEOUT_SUBIDA_MS = 180000;
const SUGERENCIA_POR_CODIGO = {
  DOCUMENTO_TAMANO_EXCEDIDO: 'Probá sacando la foto con menos calidad o subí un PDF más liviano.',
  DOCUMENTO_FORMATO_NO_PERMITIDO: 'Si es una foto, guardala como JPG o PNG.',
  COMERCIO_ESTADO_NO_PERMITE_DOCUMENTOS: 'Volvé a intentarlo cuando tu comercio esté operativo.',
};

function enMinuscula(texto) {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

function textoFormatos(requisitos) {
  const formatos = requisitos.formatosPermitidos;
  return `${formatos.slice(0, -1).join(', ')} o ${formatos[formatos.length - 1]}`;
}

function mensajeConSugerencia(error) {
  if (!(error instanceof ApiError)) {
    return 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.';
  }
  if (error.status === 0) {
    return 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.';
  }
  const base = mensajeDeError(error);
  const sugerencia = error.data && SUGERENCIA_POR_CODIGO[error.data.codigo];
  if (!sugerencia) {
    return base;
  }
  const limpio = base.replace(/[.\s]+$/, '');
  if (error.data.codigo === 'DOCUMENTO_TAMANO_EXCEDIDO' && /Probá/.test(limpio)) {
    return base;
  }
  return `${limpio}. ${sugerencia}`;
}

function extensionDe(archivo) {
  const partes = archivo.name.toLowerCase().split('.');
  return partes.length > 1 ? partes[partes.length - 1] : '';
}

export function errorDeArchivo(archivo, requisitos) {
  if (!EXTENSIONES_PERMITIDAS.includes(extensionDe(archivo))) {
    return `Ese formato no está permitido. Subí un archivo ${textoFormatos(requisitos)}.`;
  }
  if (archivo.size > requisitos.maxBytes) {
    return `El archivo pesa ${formatearTamano(archivo.size)} y el máximo es ${formatearTamano(requisitos.maxBytes)}. Probá sacando la foto con menos calidad o subí un PDF más liviano.`;
  }
  if (archivo.size === 0) {
    return 'El archivo está vacío. Elegí otro.';
  }
  return null;
}

function abrirConfirmacionDescarte({ alDescartar, alSeguir }) {
  if (document.querySelector('[data-testid="modal-descartar-documento"]')) {
    return;
  }
  const titulo = h('h2', { class: 'modal-sheet__title', id: 'descartar-documento-titulo', 'data-testid': 'titulo-descartar-documento' });
  titulo.textContent = '¿Descartar los cambios?';
  const texto = h('p', { class: 'modal-sheet__text', id: 'descartar-documento-texto' });
  texto.textContent = 'Si salís ahora, se pierde lo que cargaste.';
  const seguir = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'btn-seguir-editando-documento' });
  seguir.textContent = 'Seguir editando';
  const descartar = h('button', { type: 'button', class: 'btn btn-tertiary', 'data-testid': 'btn-descartar-documento' });
  descartar.textContent = 'Descartar';
  const hoja = h('div', { class: 'modal-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'descartar-documento-titulo', 'aria-describedby': 'descartar-documento-texto' }, [titulo, texto, seguir, descartar]);
  const fondo = h('div', { class: 'modal-backdrop doc-modal-capa', 'data-testid': 'modal-descartar-documento' }, [hoja]);
  document.body.append(fondo);
  seguir.focus();
  const quitarAtrapaFoco = atraparFoco(hoja, seguirEditando);
  function quitar() {
    quitarAtrapaFoco();
    fondo.remove();
  }
  function seguirEditando() {
    quitar();
    alSeguir();
  }
  seguir.addEventListener('click', seguirEditando);
  descartar.addEventListener('click', () => {
    quitar();
    alDescartar();
  });
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) {
      seguirEditando();
    }
  });
}

export function abrirHojaSubida({ requisitos, tipoInicial = null, alSubido, focoAlCerrar = null }) {
  if (document.querySelector('[data-testid="hoja-subir-documento"]')) {
    return;
  }
  const opener = elementoQueAbrio();
  const overflowPrevio = document.body.style.overflow;
  let archivoElegido = null;
  let errorArchivo = null;
  let subiendo = false;
  let confirmandoDescarte = false;

  const titulo = h('h2', { class: 'doc-hoja__titulo', id: 'hoja-subir-titulo', 'data-testid': 'titulo-hoja-subir' });
  titulo.textContent = 'Subir documento';
  const cerrarBtn = h('button', { type: 'button', class: 'doc-hoja__cerrar', 'aria-label': 'Cerrar', 'data-testid': 'btn-cerrar-hoja-subir' }, [icono('cerrar')]);
  const encabezado = h('div', { class: 'doc-hoja__encabezado' }, [titulo, cerrarBtn]);

  const bannerSlot = h('div', { 'data-testid': 'banner-hoja-subir' });

  const selectTipo = h('select', { id: 'documento-tipo', 'data-testid': 'select-documento-tipo', 'aria-describedby': 'error-documento-tipo' });
  const opcionVacia = h('option', { value: '' });
  opcionVacia.textContent = 'Elegí un tipo';
  selectTipo.append(opcionVacia);
  requisitos.tipos.forEach((tipo) => {
    const opcion = h('option', { value: tipo.codigo });
    opcion.textContent = tipo.etiqueta;
    selectTipo.append(opcion);
  });
  if (tipoInicial) {
    selectTipo.value = tipoInicial;
  }
  const errorTipo = h('div', { class: 'field__error', id: 'error-documento-tipo', style: 'display:none;', role: 'alert', 'data-testid': 'error-documento-tipo' });
  const campoTipo = h('div', { class: 'field' }, [
    h('label', { class: 'field__label', for: 'documento-tipo' }, ['Tipo de documento']),
    h('div', { class: 'select-shell' }, [selectTipo, h('span', { class: 'doc-select-chevron', 'aria-hidden': 'true' })]),
    errorTipo,
  ]);

  const inputDescripcion = h('input', { type: 'text', id: 'documento-descripcion', maxlength: '100', placeholder: 'Ej.: Certificado de bromatología', 'aria-describedby': 'ayuda-documento-descripcion error-documento-descripcion', 'data-testid': 'input-documento-descripcion' });
  const ayudaDescripcion = h('p', { class: 'field__hint', id: 'ayuda-documento-descripcion' });
  ayudaDescripcion.textContent = 'Contanos qué documento es, así lo revisamos más rápido.';
  const errorDescripcion = h('div', { class: 'field__error', id: 'error-documento-descripcion', style: 'display:none;', role: 'alert', 'data-testid': 'error-documento-descripcion' });
  const campoDescripcion = h('div', { class: 'field is-hidden', 'data-testid': 'campo-documento-descripcion' }, [
    h('label', { class: 'field__label', for: 'documento-descripcion' }, ['Descripción']),
    h('div', { class: 'input-shell' }, [inputDescripcion]),
    ayudaDescripcion,
    errorDescripcion,
  ]);

  const inputArchivo = h('input', { type: 'file', id: 'documento-archivo', class: 'is-hidden', accept: '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp', tabindex: '-1', 'data-testid': 'input-documento-archivo' });
  const elegirBtn = h('button', { type: 'button', class: 'btn btn-secondary doc-elegir-archivo', 'data-testid': 'btn-elegir-archivo' }, [icono('archivo')]);
  elegirBtn.append(document.createTextNode('Elegir archivo'));
  const nombreArchivo = h('p', { class: 'doc-archivo-elegido__nombre', 'data-testid': 'archivo-elegido-nombre' });
  const tamanoArchivo = h('p', { class: 'doc-archivo-elegido__tamano', 'data-testid': 'archivo-elegido-tamano' });
  const quitarBtn = h('button', { type: 'button', class: 'doc-archivo-elegido__quitar', 'data-testid': 'btn-quitar-archivo' });
  quitarBtn.textContent = 'Quitar';
  const filaArchivo = h('div', { class: 'doc-archivo-elegido is-hidden', 'data-testid': 'fila-archivo-elegido' }, [
    h('span', { class: 'doc-fila__icono' }, [icono('archivo')]),
    h('div', { class: 'doc-archivo-elegido__cuerpo' }, [nombreArchivo, tamanoArchivo]),
    quitarBtn,
  ]);
  const errorArchivoEl = h('div', { class: 'field__error', id: 'error-documento-archivo', style: 'display:none;', role: 'alert', 'data-testid': 'error-documento-archivo' });
  const ayudaArchivo = h('p', { class: 'field__hint', id: 'ayuda-documento-archivo', 'data-testid': 'ayuda-documento-archivo' });
  ayudaArchivo.textContent = `${textoFormatos(requisitos)} de hasta ${formatearTamano(requisitos.maxBytes)}.`;
  const campoArchivo = h('div', { class: 'field' }, [
    h('span', { class: 'field__label' }, ['Archivo']),
    inputArchivo,
    elegirBtn,
    filaArchivo,
    ayudaArchivo,
    errorArchivoEl,
  ]);

  const subirBtn = h('button', { type: 'submit', class: 'btn btn-primary', 'data-testid': 'btn-subir-documento-confirmar' });
  subirBtn.textContent = 'Subir documento';
  const cancelarBtn = h('button', { type: 'button', class: 'btn btn-tertiary', 'data-testid': 'btn-cancelar-subida' });
  cancelarBtn.textContent = 'Cancelar';
  const formulario = h('form', { class: 'form doc-hoja__formulario', novalidate: true, 'data-testid': 'form-subir-documento' }, [campoTipo, campoDescripcion, campoArchivo, subirBtn, cancelarBtn]);

  const hoja = h('div', { class: 'product-modal-sheet doc-hoja', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'hoja-subir-titulo', 'data-testid': 'hoja-subir-documento' }, [
    h('div', { class: 'product-modal-sheet__handle' }, [h('span')]),
    h('div', { class: 'product-modal-sheet__body' }, [encabezado, bannerSlot, formulario]),
  ]);
  const fondo = h('div', { class: 'modal-backdrop', 'data-testid': 'fondo-hoja-subir' }, [hoja]);
  document.body.append(fondo);
  document.body.style.overflow = 'hidden';
  selectTipo.focus();

  function mostrarErrorCampo(elemento, texto) {
    elemento.style.display = texto ? '' : 'none';
    elemento.textContent = texto || '';
  }

  function actualizarDescripcion() {
    const esOtro = selectTipo.value === 'OTRO';
    campoDescripcion.classList.toggle('is-hidden', !esOtro);
    if (!esOtro) {
      inputDescripcion.value = '';
      mostrarErrorCampo(errorDescripcion, null);
    }
  }
  actualizarDescripcion();

  function actualizarBoton() {
    subirBtn.disabled = subiendo || Boolean(errorArchivo);
    subirBtn.textContent = subiendo ? 'Subiendo…' : 'Subir documento';
    subirBtn.setAttribute('aria-busy', String(subiendo));
    cancelarBtn.disabled = subiendo;
    cerrarBtn.disabled = subiendo;
    elegirBtn.disabled = subiendo;
    quitarBtn.disabled = subiendo;
  }
  actualizarBoton();

  function hayCambiosSinGuardar() {
    return Boolean(archivoElegido) || inputDescripcion.value.trim().length > 0;
  }

  const quitarAtrapaFoco = atraparFoco(hoja, intentarCerrar, () => confirmandoDescarte);

  function cerrar() {
    quitarAtrapaFoco();
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    devolverFoco(opener, focoAlCerrar);
  }

  function intentarCerrar() {
    if (subiendo || confirmandoDescarte) {
      return;
    }
    if (!hayCambiosSinGuardar()) {
      cerrar();
      return;
    }
    confirmandoDescarte = true;
    abrirConfirmacionDescarte({
      alSeguir: () => {
        confirmandoDescarte = false;
        cerrarBtn.focus();
      },
      alDescartar: () => {
        confirmandoDescarte = false;
        cerrar();
      },
    });
  }

  cerrarBtn.addEventListener('click', intentarCerrar);
  cancelarBtn.addEventListener('click', intentarCerrar);
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) {
      intentarCerrar();
    }
  });

  selectTipo.addEventListener('change', () => {
    actualizarDescripcion();
    mostrarErrorCampo(errorTipo, null);
  });
  inputDescripcion.addEventListener('input', () => mostrarErrorCampo(errorDescripcion, null));

  function fijarArchivo(archivo) {
    archivoElegido = archivo;
    errorArchivo = archivo ? errorDeArchivo(archivo, requisitos) : null;
    filaArchivo.classList.toggle('is-hidden', !archivo);
    elegirBtn.classList.toggle('is-hidden', Boolean(archivo));
    if (archivo) {
      nombreArchivo.textContent = archivo.name;
      tamanoArchivo.textContent = formatearTamano(archivo.size);
    }
    mostrarErrorCampo(errorArchivoEl, errorArchivo);
    inputArchivo.setAttribute('aria-invalid', String(Boolean(errorArchivo)));
    actualizarBoton();
  }

  elegirBtn.addEventListener('click', () => inputArchivo.click());
  inputArchivo.addEventListener('change', () => {
    const archivo = inputArchivo.files && inputArchivo.files[0];
    if (archivo) {
      fijarArchivo(archivo);
    }
  });
  quitarBtn.addEventListener('click', () => {
    inputArchivo.value = '';
    fijarArchivo(null);
    elegirBtn.focus();
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (subiendo) {
      return;
    }
    renderBannerTexto(bannerSlot, 'error', '');
    const tipo = selectTipo.value;
    const descripcion = inputDescripcion.value.trim();
    let primerError = null;
    mostrarErrorCampo(errorTipo, null);
    mostrarErrorCampo(errorDescripcion, null);
    if (!tipo) {
      mostrarErrorCampo(errorTipo, 'Elegí el tipo de documento');
      primerError = primerError || selectTipo;
    }
    if (tipo === 'OTRO' && !descripcion) {
      mostrarErrorCampo(errorDescripcion, 'Contanos qué documento es');
      primerError = primerError || inputDescripcion;
    }
    if (!archivoElegido) {
      errorArchivo = null;
      mostrarErrorCampo(errorArchivoEl, 'Elegí el archivo que vas a subir');
      primerError = primerError || elegirBtn;
    }
    if (primerError) {
      primerError.focus();
      return;
    }
    if (errorArchivo) {
      return;
    }
    const datos = new FormData();
    datos.append('tipo', tipo);
    if (tipo === 'OTRO') {
      datos.append('descripcion', descripcion);
    }
    datos.append('archivo', archivoElegido);
    subiendo = true;
    actualizarBoton();
    try {
      await apiFetch(RUTA_API, { method: 'POST', body: datos, handle5xxGlobally: false, handleRedGlobally: false, timeoutMs: TIMEOUT_SUBIDA_MS });
    } catch (error) {
      subiendo = false;
      actualizarBoton();
      renderBannerTexto(bannerSlot, 'error', mensajeConSugerencia(error));
      bannerSlot.firstElementChild?.setAttribute('role', 'alert');
      bannerSlot.firstElementChild?.setAttribute('data-testid', 'error-subida-documento');
      subirBtn.focus();
      return;
    }
    subiendo = false;
    cerrar();
    showToast('Documento enviado. Lo estamos revisando.');
    alSubido();
  });
}

function abrirConfirmacionEliminar({ documento, alEliminado, alFallar, focoAlCerrar }) {
  const opener = elementoQueAbrio();
  const nombre = nombreDelDocumento(documento);
  const titulo = h('h2', { class: 'modal-sheet__title', id: 'eliminar-documento-titulo', 'data-testid': 'titulo-eliminar-documento' });
  titulo.textContent = '¿Eliminar este documento?';
  const texto = h('p', { class: 'modal-sheet__text', id: 'eliminar-documento-texto', 'data-testid': 'texto-eliminar-documento' });
  texto.textContent = `Vas a eliminar «${nombre}». Si lo necesitás de nuevo, tendrás que subirlo otra vez.`;
  const confirmar = h('button', { type: 'button', class: 'btn btn-primary doc-peligro', 'data-testid': 'btn-confirmar-eliminar-documento' });
  confirmar.textContent = 'Eliminar';
  const cancelar = h('button', { type: 'button', class: 'btn btn-tertiary', 'data-testid': 'btn-cancelar-eliminar-documento' });
  cancelar.textContent = 'Cancelar';
  const hoja = h('div', { class: 'modal-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'eliminar-documento-titulo', 'aria-describedby': 'eliminar-documento-texto' }, [titulo, texto, confirmar, cancelar]);
  const fondo = h('div', { class: 'modal-backdrop', 'data-testid': 'modal-eliminar-documento' }, [hoja]);
  document.body.append(fondo);
  cancelar.focus();
  let ocupado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, cerrarSinAccion);
  function quitar() {
    quitarAtrapaFoco();
    fondo.remove();
  }
  function cerrarSinAccion() {
    if (ocupado) {
      return;
    }
    quitar();
    devolverFoco(opener, focoAlCerrar);
  }
  cancelar.addEventListener('click', cerrarSinAccion);
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) {
      cerrarSinAccion();
    }
  });
  confirmar.addEventListener('click', async () => {
    if (ocupado) {
      return;
    }
    ocupado = true;
    confirmar.disabled = true;
    cancelar.disabled = true;
    confirmar.textContent = 'Eliminando…';
    try {
      await apiFetch(`${RUTA_API}/${documento.id}`, { method: 'DELETE', handle5xxGlobally: false, handleRedGlobally: false });
    } catch (error) {
      quitar();
      alFallar(mensajeConSugerencia(error));
      return;
    }
    quitar();
    showToast('Documento eliminado');
    alEliminado();
  });
}

function crearBotonIcono({ figura, etiqueta, testid, peligro = false }) {
  const boton = h('button', { type: 'button', class: `doc-icono-btn${peligro ? ' doc-icono-btn--peligro' : ''}`, 'aria-label': etiqueta, 'data-testid': testid }, [icono(figura)]);
  return boton;
}

function metaDelDocumento(documento) {
  return `${lineaDeArchivo(documento)} · ${formatearFechaCorta(documento.fechaSubida)}`;
}

function crearFila(documento, { alVer, alEliminar }) {
  const nombre = nombreDelDocumento(documento);
  const nombreEl = h('p', { class: 'doc-fila__nombre', 'data-testid': `doc-nombre-${documento.id}` });
  nombreEl.textContent = nombre;
  const metaEl = h('p', { class: 'doc-fila__meta', 'data-testid': `doc-meta-${documento.id}` });
  metaEl.textContent = metaDelDocumento(documento);
  const acciones = h('div', { class: 'doc-fila__acciones' }, [
    crearBotonIcono({ figura: 'ojo', etiqueta: `Ver ${enMinuscula(nombre)}`, testid: `btn-ver-documento-${documento.id}` }),
  ]);
  acciones.firstElementChild.addEventListener('click', () => alVer(documento));
  if (documento.estado === 'PENDIENTE') {
    const eliminar = crearBotonIcono({ figura: 'tacho', etiqueta: `Eliminar ${enMinuscula(nombre)}`, testid: `btn-eliminar-documento-${documento.id}`, peligro: true });
    eliminar.addEventListener('click', () => alEliminar(documento));
    acciones.append(eliminar);
  }
  return h('li', { class: 'doc-fila', 'data-testid': `doc-fila-${documento.id}`, 'data-estado': documento.estado }, [
    h('span', { class: 'doc-fila__icono' }, [icono('archivo')]),
    h('div', { class: 'doc-fila__cuerpo' }, [nombreEl, metaEl]),
    acciones,
  ]);
}

function crearTarjetaRechazado(documento, { alVer, alSubirNuevo }) {
  const nombre = nombreDelDocumento(documento);
  const nombreEl = h('p', { class: 'doc-fila__nombre', 'data-testid': `doc-nombre-${documento.id}` });
  nombreEl.textContent = nombre;
  const metaEl = h('p', { class: 'doc-fila__meta', 'data-testid': `doc-meta-${documento.id}` });
  metaEl.textContent = metaDelDocumento(documento);
  const ver = crearBotonIcono({ figura: 'ojo', etiqueta: `Ver ${enMinuscula(nombre)}`, testid: `btn-ver-documento-${documento.id}` });
  ver.addEventListener('click', () => alVer(documento));
  const motivo = h('div', { class: 'doc-motivo', 'data-testid': `doc-motivo-${documento.id}` });
  motivo.textContent = `Motivo: ${documento.motivoRechazo}`;
  const subirNuevo = h('button', { type: 'button', class: 'btn btn-secondary doc-subir-nuevo', 'data-testid': `btn-subir-nuevo-${documento.id}` });
  subirNuevo.textContent = 'Subir uno nuevo';
  subirNuevo.addEventListener('click', () => alSubirNuevo(documento));
  return h('li', { class: 'doc-tarjeta', 'data-testid': `doc-fila-${documento.id}`, 'data-estado': documento.estado }, [
    h('div', { class: 'doc-tarjeta__cabecera' }, [
      h('span', { class: 'doc-fila__icono' }, [icono('archivo')]),
      h('div', { class: 'doc-fila__cuerpo' }, [nombreEl, metaEl]),
      ver,
    ]),
    motivo,
    subirNuevo,
  ]);
}

function crearSeccion({ clave, titulo, cantidad, error = false }) {
  const tituloEl = h('h2', { class: `doc-seccion__titulo${error ? ' doc-seccion__titulo--error' : ''}`, id: `doc-seccion-titulo-${clave}`, 'data-testid': `titulo-seccion-${clave}` });
  tituloEl.textContent = `${titulo} · ${cantidad}`;
  const lista = h('ul', { class: 'doc-lista', 'aria-labelledby': `doc-seccion-titulo-${clave}`, 'data-testid': `lista-documentos-${clave}` });
  const seccion = h('section', { class: 'doc-seccion', 'data-testid': `seccion-${clave}` }, [tituloEl, lista]);
  return { seccion, lista };
}

function motivoDeBloqueo(requisitos, datos) {
  if (!requisitos.puedeSubir) {
    return 'Tu comercio no puede recibir documentos en este momento.';
  }
  if (datos.enRevision >= datos.maxEnRevision) {
    return `Ya tenés ${datos.maxEnRevision} documentos en revisión. Esperá a que los revisemos para subir otro.`;
  }
  if (datos.total >= datos.maxTotal) {
    return `Llegaste al máximo de ${datos.maxTotal} documentos por comercio.`;
  }
  return null;
}

export async function initComercioDocumentacion() {
  if (!(await exigirDueno())) {
    return;
  }
  const volver = document.getElementById('btn-volver-documentacion');
  const parametros = new URLSearchParams(window.location.search);
  volver.addEventListener('click', () => {
    window.location.href = parametros.get('desde') === 'panel' ? 'comercio-dashboard.html' : 'comercio-perfil.html';
  });
  if (!(await prepararPaginaComercio())) {
    return;
  }

  const contenido = document.getElementById('documentacion-contenido');
  const avisoSlot = document.getElementById('documentacion-aviso');
  let abrirSubidaAlCargar = parametros.get('subir') === '1';
  let cargando = false;

  function mostrarEsqueleto() {
    contenido.setAttribute('aria-busy', 'true');
    contenido.replaceChildren(
      h('div', { class: 'skeleton doc-esqueleto', 'data-testid': 'documentacion-cargando' }),
      h('div', { class: 'skeleton doc-esqueleto' }),
    );
  }

  function mostrarErrorDeCarga() {
    contenido.setAttribute('aria-busy', 'false');
    const texto = h('p');
    texto.textContent = 'No pudimos cargar tu documentación.';
    const reintentar = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'btn-reintentar-documentacion' });
    reintentar.textContent = 'Reintentar';
    reintentar.addEventListener('click', cargar);
    contenido.replaceChildren(h('div', { class: 'doc-error-carga', role: 'alert', 'data-testid': 'error-documentacion' }, [texto, reintentar]));
  }

  function avisarError(mensaje) {
    mostrarAvisoFijo(avisoSlot, mensaje);
  }

  function ver(documento) {
    abrirVisorDocumento({
      documento,
      rutaArchivo: `${RUTA_API}/${documento.id}/archivo`,
      alSubirNuevo: (rechazado) => abrirSubida(rechazado.tipo),
    });
  }

  let requisitosActuales = null;
  let botonSubirPrincipal = null;

  function abrirSubida(tipoInicial = null) {
    if (!requisitosActuales) {
      return;
    }
    abrirHojaSubida({ requisitos: requisitosActuales, tipoInicial, alSubido: cargar, focoAlCerrar: botonSubirPrincipal });
  }

  function eliminar(documento) {
    abrirConfirmacionEliminar({
      documento,
      alEliminado: cargar,
      alFallar: (mensaje) => {
        avisarError(mensaje);
        cargar();
      },
      focoAlCerrar: botonSubirPrincipal,
    });
  }

  function pintar(datos, requisitos) {
    requisitosActuales = requisitos;
    contenido.setAttribute('aria-busy', 'false');
    const documentos = datos.documentos;
    const bloqueo = motivoDeBloqueo(requisitos, datos);

    const boton = h('button', { type: 'button', class: 'btn btn-primary doc-boton-subir', 'data-testid': 'btn-subir-documento' }, [icono('mas')]);
    boton.append(document.createTextNode('Subir documento'));
    botonSubirPrincipal = boton;
    const explicacion = h('p', { class: 'doc-explicacion', id: 'doc-explicacion-subida', 'data-testid': 'explicacion-subida-deshabilitada' });
    if (bloqueo) {
      boton.disabled = true;
      boton.setAttribute('aria-describedby', 'doc-explicacion-subida');
      explicacion.textContent = bloqueo;
    }
    boton.addEventListener('click', () => abrirSubida(null));
    const bloqueSubida = h('div', { class: 'doc-bloque-subida' }, bloqueo ? [boton, explicacion] : [boton]);

    const formatos = `${textoFormatos(requisitos)} de hasta ${formatearTamano(requisitos.maxBytes)}`;
    const nodos = [];

    if (documentos.length === 0) {
      const aviso = h('div', { class: 'banner banner-info', 'data-testid': 'aviso-sin-documentos' });
      aviso.textContent = 'Para vender necesitás al menos un documento aprobado. Lo revisamos y te avisamos por acá.';
      const items = requisitos.tipos.map((tipo) => {
        const item = h('li', { class: 'doc-tipos__item', 'data-testid': `tipo-documento-${tipo.codigo}` });
        item.textContent = tipo.requiereDescripcion ? `${tipo.etiqueta === 'Otro' ? 'Otro documento' : tipo.etiqueta} (con una descripción)` : tipo.etiqueta;
        return item;
      });
      const titulo = h('h2', { class: 'doc-tipos__titulo' });
      titulo.textContent = 'Qué podés subir';
      const tarjeta = h('div', { class: 'doc-tipos', 'data-testid': 'tarjeta-que-podes-subir' }, [titulo, h('ul', { class: 'doc-tipos__lista' }, items)]);
      const leyenda = h('p', { class: 'doc-ayuda', 'data-testid': 'leyenda-formatos' });
      leyenda.textContent = `Aceptamos ${formatos}.`;
      nodos.push(aviso, tarjeta, bloqueSubida, leyenda);
    } else {
      nodos.push(bloqueSubida);
      const rechazados = documentos.filter((d) => d.estado === 'RECHAZADO');
      const enRevision = documentos.filter((d) => d.estado === 'PENDIENTE');
      const aprobados = documentos.filter((d) => d.estado === 'APROBADO');
      if (rechazados.length > 0) {
        const { seccion, lista } = crearSeccion({ clave: 'rechazados', titulo: 'Rechazados', cantidad: rechazados.length, error: true });
        rechazados.forEach((d) => lista.append(crearTarjetaRechazado(d, { alVer: ver, alSubirNuevo: (doc) => abrirSubida(doc.tipo) })));
        nodos.push(seccion);
      }
      if (enRevision.length > 0) {
        const { seccion, lista } = crearSeccion({ clave: 'en-revision', titulo: 'En revisión', cantidad: enRevision.length });
        enRevision.forEach((d) => lista.append(crearFila(d, { alVer: ver, alEliminar: eliminar })));
        nodos.push(seccion);
      }
      if (aprobados.length > 0) {
        const { seccion, lista } = crearSeccion({ clave: 'aprobados', titulo: 'Aprobados', cantidad: aprobados.length });
        aprobados.forEach((d) => lista.append(crearFila(d, { alVer: ver, alEliminar: eliminar })));
        nodos.push(seccion);
      }
      const ayuda = h('p', { class: 'doc-ayuda', 'data-testid': 'ayuda-documentos' });
      ayuda.textContent = `Aceptamos ${formatos}. Podés tener hasta ${datos.maxEnRevision} documentos en revisión. Usaste ${datos.total} de ${datos.maxTotal}.`;
      nodos.push(ayuda);
    }
    contenido.replaceChildren(...nodos);
  }

  async function cargar() {
    if (cargando) {
      return;
    }
    cargando = true;
    if (!requisitosActuales) {
      mostrarEsqueleto();
    }
    try {
      const [datos, requisitos] = await Promise.all([
        apiFetch(RUTA_API, { handle5xxGlobally: false, handleRedGlobally: false }),
        apiFetch(`${RUTA_API}/requisitos`, { handle5xxGlobally: false, handleRedGlobally: false }),
      ]);
      const hayCapaAbierta = Boolean(document.querySelector('[data-testid="hoja-subir-documento"], [data-testid="visor-documento"], [data-testid^="modal-"]'));
      const foco = document.activeElement;
      const recuperarFoco = requisitosActuales !== null && !hayCapaAbierta && (foco === document.body || contenido.contains(foco));
      pintar(datos, requisitos);
      if (recuperarFoco && botonSubirPrincipal && !botonSubirPrincipal.disabled) {
        botonSubirPrincipal.focus();
      }
    } catch (error) {
      if (!requisitosActuales) {
        mostrarErrorDeCarga();
      } else {
        avisarError('No pudimos actualizar tu documentación. Probá de nuevo.');
      }
      cargando = false;
      return;
    }
    cargando = false;
    if (abrirSubidaAlCargar) {
      abrirSubidaAlCargar = false;
      if (botonSubirPrincipal && !botonSubirPrincipal.disabled) {
        abrirSubida(null);
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !document.querySelector('[data-testid="hoja-subir-documento"], [data-testid="visor-documento"]')) {
      cargar();
    }
  });

  await cargar();
}
