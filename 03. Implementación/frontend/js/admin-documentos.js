import { apiFetch, ApiError } from './api.js';
import { showToast } from './catalogo.js';
import { h, mostrarAvisoFijo } from './form-utils.js';
import { requireAdmin } from './admin.js';
import {
  abrirVisorDocumento,
  atraparFoco,
  crearChipEstado,
  devolverFoco,
  elementoQueAbrio,
  formatearFechaCorta,
  icono,
  lineaDeArchivo,
  mensajeDeError,
  nombreDelDocumento,
  tiempoRelativo,
} from './documentos-comun.js';

const MAX_MOTIVO = 255;

function crearEstadoVacio(titulo, texto, { enlace = null } = {}) {
  const tituloEl = h('h1', { class: 'state-page__title', 'data-testid': 'estado-vacio-titulo' });
  tituloEl.textContent = titulo;
  const textoEl = h('p', { class: 'state-page__text' });
  textoEl.textContent = texto;
  const hijos = [h('div', { class: 'state-page__icon' }, [icono('tilde')]), tituloEl, textoEl];
  if (enlace) {
    const accion = h('a', { class: 'btn btn-primary', href: enlace.href, 'data-testid': enlace.testid });
    accion.textContent = enlace.texto;
    hijos.push(h('div', { class: 'state-page__actions' }, [accion]));
  }
  return h('div', { class: 'state-page', 'data-testid': 'estado-vacio' }, hijos);
}

function crearFilaInfo(figura, texto, testid) {
  const fila = h('div', { class: 'comercio-info__row', 'data-testid': testid }, [icono(figura)]);
  const span = h('span');
  span.textContent = texto;
  fila.append(span);
  return fila;
}

function rutaDeRevision(documento) {
  return `admin-documento-revision.html?id=${documento.id}&comercioId=${documento.comercioId}`;
}

export async function initAdminDocumentos() {
  if (!requireAdmin()) {
    return;
  }
  const parametros = new URLSearchParams(window.location.search);
  const resuelto = parametros.get('resuelto');
  if (resuelto === 'aprobado') {
    showToast('Documento aprobado');
  } else if (resuelto === 'rechazado') {
    showToast('Documento rechazado');
  }
  const contenedor = document.getElementById('documentos-contenido');
  const resumen = document.getElementById('documentos-resumen');
  contenedor.setAttribute('aria-busy', 'true');
  contenedor.replaceChildren(h('div', { class: 'skeleton doc-esqueleto', 'data-testid': 'documentos-cargando' }), h('div', { class: 'skeleton doc-esqueleto' }));

  async function cargar() {
    let documentos;
    try {
      documentos = await apiFetch('/administrador/documentos/pendientes', { handle5xxGlobally: false, handleRedGlobally: false });
    } catch {
      contenedor.setAttribute('aria-busy', 'false');
      const texto = h('p');
      texto.textContent = 'No pudimos cargar los documentos.';
      const reintentar = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'btn-reintentar-documentos' });
      reintentar.textContent = 'Reintentar';
      reintentar.addEventListener('click', cargar);
      contenedor.replaceChildren(h('div', { class: 'doc-error-carga', role: 'alert', 'data-testid': 'error-documentos' }, [texto, reintentar]));
      return;
    }
    contenedor.setAttribute('aria-busy', 'false');
    resumen.textContent = documentos.length === 1 ? '1 documento esperando revisión' : `${documentos.length} documentos esperando revisión`;
    if (documentos.length === 0) {
      contenedor.replaceChildren(crearEstadoVacio('No hay documentos por revisar.', 'Cuando un comercio suba un documento, va a aparecer acá.'));
      return;
    }
    const tarjetas = documentos.map((documento) => {
      const nombreComercio = h('h3', { 'data-testid': `bandeja-comercio-${documento.id}` });
      nombreComercio.textContent = documento.nombreComercio;
      const revisar = h('a', { class: 'request-card__footer doc-revisar', href: rutaDeRevision(documento), 'data-testid': `btn-revisar-documento-${documento.id}`, 'aria-label': `Revisar ${nombreDelDocumento(documento)} de ${documento.nombreComercio}` });
      const textoRevisar = h('span');
      textoRevisar.textContent = 'Revisar';
      revisar.append(textoRevisar, icono('chevron'));
      return h('article', { class: 'request-card', 'data-testid': `bandeja-documento-${documento.id}` }, [
        h('div', { class: 'request-card__top' }, [nombreComercio]),
        h('div', { class: 'request-card__rows' }, [
          crearFilaInfo('archivo', nombreDelDocumento(documento), `bandeja-tipo-${documento.id}`),
          crearFilaInfo('archivo', lineaDeArchivo(documento), `bandeja-archivo-${documento.id}`),
          crearFilaInfo('reloj', tiempoRelativo(documento.fechaSubida), `bandeja-antiguedad-${documento.id}`),
        ]),
        revisar,
      ]);
    });
    contenedor.replaceChildren(...tarjetas);
  }

  await cargar();
}

function abrirModalMotivo({ titulo, mensaje, textoConfirmar, alConfirmar }) {
  const opener = elementoQueAbrio();
  const tituloEl = h('h2', { class: 'doc-hoja__titulo', id: 'motivo-documento-titulo', 'data-testid': 'titulo-motivo-documento' });
  tituloEl.textContent = titulo;
  const mensajeEl = h('p', { class: 'product-modal-sheet__description', id: 'motivo-documento-mensaje', 'data-testid': 'mensaje-motivo-documento' });
  mensajeEl.textContent = mensaje;
  const textarea = h('textarea', { id: 'motivo-documento', maxlength: String(MAX_MOTIVO), placeholder: 'Contale al Dueño qué tiene que corregir', 'aria-describedby': 'motivo-documento-contador motivo-documento-error', 'data-testid': 'input-motivo-documento' });
  const contador = h('span', { id: 'motivo-documento-contador', 'data-testid': 'contador-motivo-documento' });
  contador.textContent = `0 / ${MAX_MOTIVO}`;
  const error = h('div', { class: 'field__error', id: 'motivo-documento-error', style: 'display:none;', role: 'alert', 'data-testid': 'error-motivo-documento' });
  error.textContent = 'El motivo es obligatorio.';
  const bannerSlot = h('div', { 'data-testid': 'banner-motivo-documento' });
  const confirmar = h('button', { type: 'submit', class: 'btn btn-primary doc-peligro', 'data-testid': 'btn-confirmar-motivo-documento' });
  confirmar.textContent = textoConfirmar;
  const cancelar = h('button', { type: 'button', class: 'btn btn-tertiary', 'data-testid': 'btn-cancelar-motivo-documento' });
  cancelar.textContent = 'Cancelar';
  const formulario = h('form', { class: 'form', novalidate: true }, [
    h('div', { class: 'field' }, [
      h('label', { class: 'field__label', for: 'motivo-documento' }, ['Motivo del rechazo']),
      h('div', { class: 'textarea-shell', id: 'motivo-documento-shell' }, [textarea]),
      h('div', { class: 'textarea-counter' }, [contador]),
      error,
    ]),
    confirmar,
    cancelar,
  ]);
  const hoja = h('div', { class: 'product-modal-sheet doc-hoja', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'motivo-documento-titulo', 'aria-describedby': 'motivo-documento-mensaje', 'data-testid': 'modal-motivo-documento' }, [
    h('div', { class: 'product-modal-sheet__handle' }, [h('span')]),
    h('div', { class: 'product-modal-sheet__body' }, [tituloEl, mensajeEl, bannerSlot, formulario]),
  ]);
  const fondo = h('div', { class: 'modal-backdrop', 'data-testid': 'fondo-modal-motivo-documento' }, [hoja]);
  document.body.append(fondo);
  const overflowPrevio = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  textarea.focus();
  let ocupado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, cerrar);

  function cerrar() {
    if (ocupado) {
      return;
    }
    quitarAtrapaFoco();
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    devolverFoco(opener);
  }

  textarea.addEventListener('input', () => {
    contador.textContent = `${textarea.value.length} / ${MAX_MOTIVO}`;
    if (textarea.value.trim()) {
      error.style.display = 'none';
    }
  });
  cancelar.addEventListener('click', cerrar);
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) {
      cerrar();
    }
  });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado) {
      return;
    }
    const motivo = textarea.value.trim();
    if (!motivo) {
      error.style.display = '';
      textarea.focus();
      return;
    }
    ocupado = true;
    confirmar.disabled = true;
    cancelar.disabled = true;
    try {
      await alConfirmar(motivo);
      ocupado = false;
      quitarAtrapaFoco();
      fondo.remove();
      document.body.style.overflow = overflowPrevio;
    } catch (fallo) {
      ocupado = false;
      confirmar.disabled = false;
      cancelar.disabled = false;
      mostrarAvisoFijo(bannerSlot, mensajeDeError(fallo));
      confirmar.focus();
    }
  });
}

function abrirModalAprobar({ nombre, alConfirmar }) {
  const opener = elementoQueAbrio();
  const titulo = h('h2', { class: 'modal-sheet__title', id: 'aprobar-documento-titulo', 'data-testid': 'titulo-aprobar-documento' });
  titulo.textContent = '¿Aprobar este documento?';
  const texto = h('p', { class: 'modal-sheet__text', id: 'aprobar-documento-texto' });
  texto.textContent = `Vas a aprobar «${nombre}». Se le avisa al Dueño.`;
  const bannerSlot = h('div', { class: 'doc-modal-aviso', 'data-testid': 'banner-aprobar-documento' });
  const confirmar = h('button', { type: 'button', class: 'btn btn-primary doc-exito', 'data-testid': 'btn-confirmar-aprobar-documento' });
  confirmar.textContent = 'Aprobar';
  const cancelar = h('button', { type: 'button', class: 'btn btn-tertiary', 'data-testid': 'btn-cancelar-aprobar-documento' });
  cancelar.textContent = 'Cancelar';
  const hoja = h('div', { class: 'modal-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'aprobar-documento-titulo', 'aria-describedby': 'aprobar-documento-texto' }, [titulo, texto, bannerSlot, confirmar, cancelar]);
  const fondo = h('div', { class: 'modal-backdrop', 'data-testid': 'modal-aprobar-documento' }, [hoja]);
  document.body.append(fondo);
  cancelar.focus();
  let ocupado = false;
  const quitarAtrapaFoco = atraparFoco(hoja, cerrar);

  function cerrar() {
    if (ocupado) {
      return;
    }
    quitarAtrapaFoco();
    fondo.remove();
    devolverFoco(opener);
  }

  cancelar.addEventListener('click', cerrar);
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) {
      cerrar();
    }
  });
  confirmar.addEventListener('click', async () => {
    if (ocupado) {
      return;
    }
    ocupado = true;
    confirmar.disabled = true;
    cancelar.disabled = true;
    try {
      await alConfirmar();
      ocupado = false;
      quitarAtrapaFoco();
      fondo.remove();
    } catch (fallo) {
      ocupado = false;
      confirmar.disabled = false;
      cancelar.disabled = false;
      mostrarAvisoFijo(bannerSlot, mensajeDeError(fallo));
    }
  });
}

async function resolver(documentoId, cuerpo) {
  return apiFetch(`/administrador/documentos/${documentoId}/resolver`, { method: 'PUT', body: cuerpo, handle5xxGlobally: false, handleRedGlobally: false });
}

function textoConteo(documentos) {
  const cuenta = (estado) => documentos.filter((d) => d.estado === estado).length;
  return `${cuenta('APROBADO')} aprobados · ${cuenta('PENDIENTE')} en revisión · ${cuenta('RECHAZADO')} rechazados`;
}

async function montarVistaPrevia(contenedor, documento) {
  contenedor.setAttribute('aria-busy', 'true');
  let blob;
  try {
    blob = await apiFetch(`/administrador/documentos/${documento.id}/archivo`, { comoBlob: true, handle5xxGlobally: false, handleRedGlobally: false });
  } catch {
    contenedor.setAttribute('aria-busy', 'false');
    const aviso = h('p', { class: 'doc-vista-previa__error', 'data-testid': 'vista-previa-error' });
    aviso.textContent = 'No pudimos cargar la vista previa.';
    contenedor.replaceChildren(aviso);
    return;
  }
  const url = URL.createObjectURL(blob);
  window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
  contenedor.setAttribute('aria-busy', 'false');
  if (documento.tipoMime === 'application/pdf') {
    const marco = h('iframe', { class: 'doc-vista-previa__pdf', title: `Vista previa de ${nombreDelDocumento(documento)}`, 'data-testid': 'vista-previa-pdf' });
    marco.src = url;
    contenedor.replaceChildren(marco);
  } else {
    const imagen = h('img', { class: 'doc-vista-previa__imagen', alt: `Vista previa de ${nombreDelDocumento(documento)}`, 'data-testid': 'vista-previa-imagen' });
    imagen.src = url;
    contenedor.replaceChildren(imagen);
  }
}

export async function initAdminDocumentoRevision() {
  if (!requireAdmin()) {
    return;
  }
  const parametros = new URLSearchParams(window.location.search);
  const comercioId = Number(parametros.get('comercioId'));
  const documentoPedido = Number(parametros.get('id')) || null;
  const contenedor = document.getElementById('revision-contenido');
  const avisoSlot = document.getElementById('revision-aviso');

  if (!Number.isInteger(comercioId) || comercioId <= 0) {
    contenedor.replaceChildren(crearEstadoVacio('No encontramos este documento', 'El enlace no es válido.', { enlace: { href: 'admin-documentos.html', testid: 'btn-ir-bandeja', texto: 'Ver documentos por revisar' } }));
    return;
  }

  async function cargar() {
    contenedor.setAttribute('aria-busy', 'true');
    let documentos;
    let pendientes;
    try {
      [documentos, pendientes] = await Promise.all([
        apiFetch(`/administrador/comercios/${comercioId}/documentos`, { handle5xxGlobally: false, handleRedGlobally: false }),
        apiFetch('/administrador/documentos/pendientes', { handle5xxGlobally: false, handleRedGlobally: false }),
      ]);
    } catch (fallo) {
      contenedor.setAttribute('aria-busy', 'false');
      if (fallo instanceof ApiError && fallo.status === 404) {
        contenedor.replaceChildren(crearEstadoVacio('No encontramos este comercio', 'El enlace no es válido.', { enlace: { href: 'admin-documentos.html', testid: 'btn-ir-bandeja', texto: 'Ver documentos por revisar' } }));
        return;
      }
      const texto = h('p');
      texto.textContent = 'No pudimos cargar el documento.';
      const reintentar = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'btn-reintentar-revision' });
      reintentar.textContent = 'Reintentar';
      reintentar.addEventListener('click', cargar);
      contenedor.replaceChildren(h('div', { class: 'doc-error-carga', role: 'alert', 'data-testid': 'error-revision' }, [texto, reintentar]));
      return;
    }
    contenedor.setAttribute('aria-busy', 'false');
    const infoPendiente = pendientes.find((p) => p.comercioId === comercioId) || null;
    let nombreComercio = infoPendiente ? infoPendiente.nombreComercio : null;
    if (!nombreComercio) {
      try {
        const comercios = await apiFetch('/administrador/comercios', { handle5xxGlobally: false, handleRedGlobally: false });
        const comercio = comercios.find((c) => c.id === comercioId);
        nombreComercio = comercio ? comercio.nombre : `Comercio #${comercioId}`;
      } catch {
        nombreComercio = `Comercio #${comercioId}`;
      }
    }

    if (documentos.length === 0) {
      contenedor.replaceChildren(crearEstadoVacio('Todavía no subió documentos', `${nombreComercio} no tiene documentos cargados.`, { enlace: { href: 'admin-documentos.html', testid: 'btn-ir-bandeja', texto: 'Ver documentos por revisar' } }));
      return;
    }

    const seleccionado = documentos.find((d) => d.id === documentoPedido)
      || documentos.find((d) => d.estado === 'PENDIENTE')
      || documentos[0];

    const nombreEl = h('h2', { class: 'revision-comercio__nombre', 'data-testid': 'revision-comercio-nombre' });
    nombreEl.textContent = nombreComercio;
    const filasComercio = [];
    if (infoPendiente) {
      filasComercio.push(crearFilaInfo('archivo', `Dueño: ${infoPendiente.nombreDueno}`, 'revision-dueno'));
      filasComercio.push(crearFilaInfo('tilde', infoPendiente.cuentaMercadoPagoVinculada ? 'Mercado Pago: vinculado' : 'Mercado Pago: sin vincular', 'revision-mercadopago'));
    }
    filasComercio.push(crearFilaInfo('archivo', `Documentos: ${textoConteo(documentos)}`, 'revision-conteo'));
    const tarjetaComercio = h('section', { class: 'request-card revision-comercio', 'aria-label': 'Datos del comercio', 'data-testid': 'revision-comercio' }, [nombreEl, h('div', { class: 'request-card__rows' }, filasComercio)]);

    const nombreDoc = h('h3', { class: 'revision-doc__nombre', 'data-testid': 'revision-doc-nombre' });
    nombreDoc.textContent = nombreDelDocumento(seleccionado);
    const meta = h('p', { class: 'doc-fila__meta', 'data-testid': 'revision-doc-meta' });
    meta.textContent = `${lineaDeArchivo(seleccionado)} · ${tiempoRelativo(seleccionado.fechaSubida)}`;
    const vistaPrevia = h('div', { class: 'doc-vista-previa', 'aria-busy': 'true', 'data-testid': 'vista-previa' });
    const pantallaCompleta = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'btn-ver-pantalla-completa' }, [icono('externo')]);
    pantallaCompleta.append(document.createTextNode('Ver en pantalla completa'));
    pantallaCompleta.addEventListener('click', () => abrirVisorDocumento({ documento: seleccionado, rutaArchivo: `/administrador/documentos/${seleccionado.id}/archivo` }));
    const bloqueDoc = h('section', { class: 'request-card', 'aria-label': 'Documento', 'data-testid': 'revision-documento' }, [
      h('div', { class: 'request-card__top' }, [nombreDoc, crearChipEstado(seleccionado.estado, 'revision-doc-estado')]),
      meta,
      vistaPrevia,
      pantallaCompleta,
    ]);
    if (seleccionado.estado === 'RECHAZADO' && seleccionado.motivoRechazo) {
      const motivo = h('div', { class: 'doc-motivo', 'data-testid': 'revision-doc-motivo' });
      motivo.textContent = `Motivo: ${seleccionado.motivoRechazo}`;
      bloqueDoc.append(motivo);
    }

    const nodos = [tarjetaComercio, bloqueDoc];

    function tratarFallo(fallo) {
      mostrarAvisoFijo(avisoSlot, mensajeDeError(fallo));
      cargar();
    }

    async function resolverOTratar(documentoId, cuerpo) {
      try {
        await resolver(documentoId, cuerpo);
        return true;
      } catch (fallo) {
        if (fallo instanceof ApiError && (fallo.status === 409 || fallo.status === 404)) {
          tratarFallo(fallo);
          return false;
        }
        throw fallo;
      }
    }

    if (seleccionado.estado === 'PENDIENTE') {
      const rechazar = h('button', { type: 'button', class: 'btn btn-secondary doc-peligro-borde', 'data-testid': 'btn-rechazar-documento' });
      rechazar.textContent = 'Rechazar';
      const aprobar = h('button', { type: 'button', class: 'btn btn-primary doc-exito', 'data-testid': 'btn-aprobar-documento' });
      aprobar.textContent = 'Aprobar';
      rechazar.addEventListener('click', () => abrirModalMotivo({
        titulo: 'Rechazar documento',
        mensaje: 'El Dueño va a ver este motivo y podrá subir un documento nuevo.',
        textoConfirmar: 'Rechazar',
        alConfirmar: async (motivo) => {
          if (!(await resolverOTratar(seleccionado.id, { aprobar: false, motivo }))) {
            return;
          }
          window.location.href = 'admin-documentos.html?resuelto=rechazado';
        },
      }));
      aprobar.addEventListener('click', () => abrirModalAprobar({
        nombre: nombreDelDocumento(seleccionado),
        alConfirmar: async () => {
          if (!(await resolverOTratar(seleccionado.id, { aprobar: true }))) {
            return;
          }
          window.location.href = 'admin-documentos.html?resuelto=aprobado';
        },
      }));
      nodos.push(h('div', { class: 'revision-acciones' }, [rechazar, aprobar]));
    } else if (seleccionado.estado === 'APROBADO') {
      const revocar = h('button', { type: 'button', class: 'btn btn-secondary doc-peligro-borde', 'data-testid': 'btn-revocar-documento' });
      revocar.textContent = 'Revocar aprobación';
      revocar.addEventListener('click', () => abrirModalMotivo({
        titulo: 'Revocar aprobación',
        mensaje: 'El Dueño va a ver este motivo y podrá subir un documento nuevo. Si era el único aprobado, el comercio deja de recibir pedidos.',
        textoConfirmar: 'Revocar',
        alConfirmar: async (motivo) => {
          if (!(await resolverOTratar(seleccionado.id, { aprobar: false, motivo }))) {
            return;
          }
          showToast('Aprobación revocada');
          cargar();
        },
      }));
      nodos.push(h('div', { class: 'revision-acciones revision-acciones--sola' }, [revocar]));
    }

    const otros = documentos.filter((d) => d.id !== seleccionado.id);
    if (otros.length > 0) {
      const titulo = h('h2', { class: 'doc-seccion__titulo', id: 'revision-otros-titulo', 'data-testid': 'revision-otros-titulo' });
      titulo.textContent = 'Otros documentos de este comercio';
      const lista = h('ul', { class: 'doc-lista', 'aria-labelledby': 'revision-otros-titulo', 'data-testid': 'revision-otros-lista' });
      otros.forEach((documento) => {
        const nombre = h('p', { class: 'doc-fila__nombre' });
        nombre.textContent = nombreDelDocumento(documento);
        const detalle = h('p', { class: 'doc-fila__meta' });
        detalle.textContent = `${lineaDeArchivo(documento)} · ${formatearFechaCorta(documento.fechaSubida)}`;
        const enlace = h('a', { class: 'doc-fila doc-fila--enlace', href: rutaDeRevision(documento), 'data-testid': `revision-otro-${documento.id}`, 'aria-label': `Abrir ${nombreDelDocumento(documento)}, ${documento.estado === 'PENDIENTE' ? 'en revisión' : documento.estado === 'APROBADO' ? 'aprobado' : 'rechazado'}` }, [
          h('span', { class: 'doc-fila__icono' }, [icono('archivo')]),
          h('div', { class: 'doc-fila__cuerpo' }, [nombre, detalle]),
          crearChipEstado(documento.estado, `revision-otro-estado-${documento.id}`),
        ]);
        lista.append(h('li', {}, [enlace]));
      });
      nodos.push(h('section', { class: 'doc-seccion' }, [titulo, lista]));
    }

    contenedor.replaceChildren(...nodos);
    montarVistaPrevia(vistaPrevia, seleccionado);
  }

  await cargar();
}
