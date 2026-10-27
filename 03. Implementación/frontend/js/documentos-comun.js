import { apiFetch, ApiError } from './api.js';
import { h, crearSvg } from './form-utils.js';

export const ESTADO_DOCUMENTO = {
  PENDIENTE: { etiqueta: 'En revisión', clase: 'doc-chip--revision' },
  APROBADO: { etiqueta: 'Aprobado', clase: 'doc-chip--aprobado' },
  RECHAZADO: { etiqueta: 'Rechazado', clase: 'doc-chip--rechazado' },
};

export const FIGURAS = {
  archivo: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z' }], ['polyline', { points: '14 2 14 8 20 8' }], ['line', { x1: '8', y1: '13', x2: '16', y2: '13' }], ['line', { x1: '8', y1: '17', x2: '16', y2: '17' }]],
  ojo: [['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z' }], ['circle', { cx: '12', cy: '12', r: '3' }]],
  tacho: [['polyline', { points: '3 6 5 6 21 6' }], ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]],
  cerrar: [['line', { x1: '18', y1: '6', x2: '6', y2: '18' }], ['line', { x1: '6', y1: '6', x2: '18', y2: '18' }]],
  volver: [['polyline', { points: '15 18 9 12 15 6' }]],
  tilde: [['polyline', { points: '20 6 9 17 4 12' }]],
  reloj: [['circle', { cx: '12', cy: '12', r: '10' }], ['polyline', { points: '12 6 12 12 16 14' }]],
  alerta: [['circle', { cx: '12', cy: '12', r: '10' }], ['line', { x1: '12', y1: '8', x2: '12', y2: '12' }], ['line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }]],
  externo: [['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }], ['polyline', { points: '15 3 21 3 21 9' }], ['line', { x1: '10', y1: '14', x2: '21', y2: '3' }]],
  chevron: [['polyline', { points: '9 18 15 12 9 6' }]],
  mas: [['line', { x1: '12', y1: '5', x2: '12', y2: '19' }], ['line', { x1: '5', y1: '12', x2: '19', y2: '12' }]],
};

export function icono(nombre) {
  return crearSvg(FIGURAS[nombre], { 'aria-hidden': 'true', focusable: 'false' });
}

export function formatearTamano(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '').replace('.', ',')} MB`;
}

export function formatearFechaCorta(fechaIso) {
  return new Date(fechaIso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function tiempoRelativo(fechaIso) {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(fechaIso).getTime()) / 60000));
  if (minutos < 1) {
    return 'Hace instantes';
  }
  if (minutos < 60) {
    return `Hace ${minutos} min`;
  }
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    return horas === 1 ? 'Hace 1 hora' : `Hace ${horas} horas`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'Hace 1 día' : `Hace ${dias} días`;
}

export function diasDesde(fechaIso) {
  return Math.floor((Date.now() - new Date(fechaIso).getTime()) / 86400000);
}

export function nombreDelDocumento(documento) {
  if (documento.tipo === 'OTRO' && documento.descripcion) {
    return documento.descripcion;
  }
  return documento.tipoEtiqueta;
}

export function lineaDeArchivo(documento) {
  return `${documento.nombreOriginal} · ${formatearTamano(documento.tamanoBytes)}`;
}

export function crearChipEstado(estado, testid) {
  const info = ESTADO_DOCUMENTO[estado] || { etiqueta: 'Estado no disponible', clase: 'doc-chip--revision' };
  const chip = h('span', { class: `doc-chip ${info.clase}`, 'data-testid': testid });
  chip.textContent = info.etiqueta;
  return chip;
}

export function mensajeDeError(error, porDefecto = 'No pudimos completar la acción. Probá de nuevo.') {
  return error instanceof ApiError && error.message ? error.message : porDefecto;
}

let ultimoBotonTocado = null;
document.addEventListener('click', (evento) => {
  ultimoBotonTocado = evento.target instanceof Element ? evento.target.closest('button, a') : null;
}, true);

export function elementoQueAbrio() {
  const activo = document.activeElement;
  if (activo && activo !== document.body) {
    return activo;
  }
  return ultimoBotonTocado;
}

export function devolverFoco(elemento, respaldo = null) {
  if (elemento && elemento !== document.body && elemento.isConnected && typeof elemento.focus === 'function') {
    elemento.focus();
    return;
  }
  if (respaldo && respaldo.isConnected) {
    respaldo.focus();
  }
}

export function atraparFoco(contenedor, alEscape, estaInactivo = () => false) {
  function alTeclear(evento) {
    if (estaInactivo()) {
      return;
    }
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      alEscape();
      return;
    }
    if (evento.key !== 'Tab') {
      return;
    }
    const enfocables = Array.from(contenedor.querySelectorAll('button, a[href], input, select, textarea'))
      .filter((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
    if (enfocables.length === 0) {
      return;
    }
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }
  document.addEventListener('keydown', alTeclear);
  return () => document.removeEventListener('keydown', alTeclear);
}

export function abrirVisorDocumento({ documento, rutaArchivo, alSubirNuevo = null, subtituloExtra = null }) {
  if (document.querySelector('[data-testid="visor-documento"]')) {
    return;
  }
  const opener = elementoQueAbrio();
  const overflowPrevio = document.body.style.overflow;
  let urlObjeto = null;
  let cerrado = false;

  const cerrarBtn = h('button', { type: 'button', class: 'visor-documento__cerrar', 'aria-label': 'Cerrar visor', 'data-testid': 'btn-cerrar-visor' }, [icono('cerrar')]);
  const titulo = h('h2', { class: 'visor-documento__titulo', id: 'visor-documento-titulo', 'data-testid': 'visor-titulo' });
  titulo.textContent = nombreDelDocumento(documento);
  const subtitulo = h('p', { class: 'visor-documento__subtitulo', 'data-testid': 'visor-archivo' });
  subtitulo.textContent = lineaDeArchivo(documento);
  const textos = h('div', { class: 'visor-documento__textos' }, [titulo, subtitulo]);
  if (subtituloExtra) {
    const extra = h('p', { class: 'visor-documento__subtitulo', 'data-testid': 'visor-extra' });
    extra.textContent = subtituloExtra;
    textos.append(extra);
  }
  const encabezado = h('header', { class: 'visor-documento__encabezado' }, [cerrarBtn, textos, crearChipEstado(documento.estado, 'visor-estado')]);

  const escenario = h('div', { class: 'visor-documento__escenario', 'data-testid': 'visor-escenario', 'aria-busy': 'true' });
  const cargando = h('p', { class: 'visor-documento__cargando', 'data-testid': 'visor-cargando' });
  cargando.textContent = 'Cargando documento…';
  escenario.append(cargando);

  const pie = h('div', { class: 'visor-documento__pie' });
  if (documento.estado === 'RECHAZADO' && documento.motivoRechazo) {
    const motivo = h('div', { class: 'doc-motivo doc-motivo--visor', role: 'note', 'data-testid': 'visor-motivo' });
    motivo.textContent = `Motivo: ${documento.motivoRechazo}`;
    pie.append(motivo);
  }
  const ayudaPdf = h('p', { class: 'visor-documento__ayuda is-hidden', 'data-testid': 'visor-ayuda-pdf' });
  ayudaPdf.textContent = 'Si el PDF no se ve bien en tu celular, abrilo en una pestaña nueva.';
  const abrirNuevaPestana = h('button', { type: 'button', class: 'btn btn-secondary visor-documento__boton', disabled: true, 'data-testid': 'btn-abrir-pestana-nueva' }, [icono('externo')]);
  abrirNuevaPestana.append(document.createTextNode('Abrir en pestaña nueva'));
  pie.append(ayudaPdf, abrirNuevaPestana);
  if (alSubirNuevo && documento.estado === 'RECHAZADO') {
    const subirNuevo = h('button', { type: 'button', class: 'btn btn-primary visor-documento__boton', 'data-testid': 'btn-visor-subir-nuevo' });
    subirNuevo.textContent = 'Subir uno nuevo';
    subirNuevo.addEventListener('click', () => {
      cerrar(false);
      alSubirNuevo(documento);
    });
    pie.append(subirNuevo);
  }

  const pantalla = h('div', { class: 'visor-documento', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'visor-documento-titulo', 'data-testid': 'visor-documento' }, [encabezado, escenario, pie]);
  document.body.append(pantalla);
  document.body.style.overflow = 'hidden';
  cerrarBtn.focus();

  const quitarAtrapaFoco = atraparFoco(pantalla, () => cerrar(true));

  function cerrar(devolver) {
    if (cerrado) {
      return;
    }
    cerrado = true;
    quitarAtrapaFoco();
    if (urlObjeto) {
      URL.revokeObjectURL(urlObjeto);
      urlObjeto = null;
    }
    pantalla.remove();
    document.body.style.overflow = overflowPrevio;
    if (devolver) {
      devolverFoco(opener);
    }
  }
  cerrarBtn.addEventListener('click', () => cerrar(true));

  function mostrarError(mensaje) {
    escenario.setAttribute('aria-busy', 'false');
    const error = h('div', { class: 'visor-documento__error', role: 'alert', 'data-testid': 'visor-error' });
    const texto = h('p');
    texto.textContent = mensaje;
    const reintentar = h('button', { type: 'button', class: 'btn btn-secondary visor-documento__boton', 'data-testid': 'btn-visor-reintentar' });
    reintentar.textContent = 'Reintentar';
    reintentar.addEventListener('click', cargar);
    error.append(texto, reintentar);
    escenario.replaceChildren(error);
  }

  async function cargar() {
    escenario.setAttribute('aria-busy', 'true');
    escenario.replaceChildren(cargando);
    let blob;
    try {
      blob = await apiFetch(rutaArchivo, { comoBlob: true, handle5xxGlobally: false, handleRedGlobally: false });
    } catch (error) {
      if (!cerrado) {
        mostrarError(mensajeDe(error));
      }
      return;
    }
    if (cerrado) {
      return;
    }
    urlObjeto = URL.createObjectURL(blob);
    escenario.setAttribute('aria-busy', 'false');
    const esPdf = (documento.tipoMime || blob.type) === 'application/pdf';
    if (esPdf) {
      const marco = h('iframe', { class: 'visor-documento__pdf', title: `Vista del documento ${nombreDelDocumento(documento)}`, 'data-testid': 'visor-pdf' });
      marco.src = urlObjeto;
      escenario.replaceChildren(marco);
      ayudaPdf.classList.remove('is-hidden');
    } else {
      const imagen = h('img', { class: 'visor-documento__imagen', alt: `Vista del documento ${nombreDelDocumento(documento)}`, 'data-testid': 'visor-imagen' });
      imagen.src = urlObjeto;
      escenario.replaceChildren(imagen);
    }
    abrirNuevaPestana.disabled = false;
  }

  function mensajeDe(error) {
    return error instanceof ApiError && error.status === 404
      ? 'Este documento ya no está disponible.'
      : 'No pudimos cargar el documento. Probá de nuevo.';
  }

  abrirNuevaPestana.addEventListener('click', () => {
    if (urlObjeto) {
      window.open(urlObjeto, '_blank', 'noopener');
    }
  });

  cargar();
}
