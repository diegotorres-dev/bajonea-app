import { apiFetch, ApiError } from './api.js';
import { showToast } from './catalogo.js';
import { h, crearSvg, setLoading, renderBannerTexto } from './form-utils.js';
import { initGeografiaSelects } from './geografia.js';
import {
  esCalleValida,
  esNumeroDireccionValido,
  esTextoConContenidoValido,
  esCodigoPostalValido,
  normalizarCodigoPostal,
  normalizarCampos,
  mostrarErrorCampo,
  limpiarErrorCampo,
  mapearErroresBackend,
  scrollAlPrimerError,
} from './validators.js';

export const MAXIMO_DIRECCIONES = 5;
export const MENSAJE_CUPO_LLENO = 'Llegaste al máximo de 5 direcciones. Podés eliminar alguna para agregar otra.';
export const RUTA_MIS_DIRECCIONES = 'perfil.html?vista=direcciones';

const RUTA_API = '/clientes/direcciones';
const MENSAJE_ERROR_GENERICO = 'No pudimos completar la acción. Probá de nuevo.';
const MENSAJE_NO_EXISTE = 'Esa dirección ya no existe. Actualizamos tu lista.';
const DURACION_AVISO_MS = 6000;

const FIGURAS_PUNTITOS = [['circle', { cx: '12', cy: '12', r: '1' }], ['circle', { cx: '12', cy: '5', r: '1' }], ['circle', { cx: '12', cy: '19', r: '1' }]];
const FIGURAS_VOLVER = [['polyline', { points: '15 18 9 12 15 6' }]];
const FIGURAS_EDITAR = [['path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }], ['path', { d: 'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z' }]];
const FIGURAS_ELIMINAR = [['polyline', { points: '3 6 5 6 21 6' }], ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]];
const FIGURAS_UBICACION = [['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }], ['circle', { cx: '12', cy: '10', r: '3' }]];
const FIGURAS_MAS = [['line', { x1: '12', y1: '5', x2: '12', y2: '19' }], ['line', { x1: '5', y1: '12', x2: '19', y2: '12' }]];
const FIGURAS_CHEVRON = [['polyline', { points: '6 9 12 15 18 9' }]];

const MAPA_ERRORES = {
  calle: 'error-direccion-calle',
  numero: 'error-direccion-numero',
  pisoDepto: 'error-direccion-piso-depto',
  codigoPostal: 'error-direccion-codigo-postal',
  localidadId: 'error-direccion-localidad',
  nombre: 'error-direccion-nombre',
  referencia: 'error-direccion-referencia',
};

export async function cargarDirecciones() {
  return normalizarLista(await apiFetch(RUTA_API));
}

function normalizarLista(lista) {
  const direcciones = Array.isArray(lista) ? lista : [];
  direcciones.forEach((direccion) => normalizarCampos(direccion, ['calle']));
  return direcciones;
}

export function tituloDireccion(direccion) {
  return direccion.nombre || `${direccion.calle} ${direccion.numero}`;
}

export function lineaCalle(direccion) {
  const base = `${direccion.calle} ${direccion.numero}`;
  return direccion.pisoDepto ? `${base}, ${direccion.pisoDepto}` : base;
}

export function lineaDebajoDelTitulo(direccion) {
  if (direccion.nombre) {
    return lineaCalle(direccion);
  }
  return direccion.pisoDepto ? `Piso/Depto: ${direccion.pisoDepto}` : null;
}

export function lineaLocalidad(direccion) {
  return `${direccion.nombreLocalidad} · CP ${direccion.codigoPostal}`;
}

export function direccionMasReciente(direcciones, excluirId) {
  return direcciones
    .filter((direccion) => direccion.id !== excluirId)
    .reduce((mayor, direccion) => (mayor === null || direccion.id > mayor.id ? direccion : mayor), null);
}

function mensajeDe(error, porDefecto = MENSAJE_ERROR_GENERICO) {
  return error instanceof ApiError && error.message ? error.message : porDefecto;
}

let ultimoBotonTocado = null;
document.addEventListener('click', (evento) => {
  ultimoBotonTocado = evento.target instanceof Element ? evento.target.closest('button') : null;
}, true);

function elementoQueAbrio() {
  const activo = document.activeElement;
  if (activo && activo !== document.body) {
    return activo;
  }
  return ultimoBotonTocado;
}

function atraparFoco(contenedor, alEscape, estaInactivo = () => false) {
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

export function habilitarFlechasRadiogroup(grupo, { seleccionarAlMover }) {
  grupo.addEventListener('keydown', (evento) => {
    const teclas = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(evento.key in teclas)) {
      return;
    }
    const radios = Array.from(grupo.querySelectorAll('[role="radio"]')).filter((radio) => !radio.disabled);
    const actual = radios.indexOf(document.activeElement);
    if (actual === -1) {
      return;
    }
    evento.preventDefault();
    const siguiente = radios[(actual + teclas[evento.key] + radios.length) % radios.length];
    siguiente.focus();
    if (seleccionarAlMover) {
      siguiente.click();
    }
  });
}

export function ajustarTabindexRadios(grupo) {
  const radios = Array.from(grupo.querySelectorAll('[role="radio"]'));
  const marcado = radios.find((radio) => radio.getAttribute('aria-checked') === 'true') || radios[0];
  radios.forEach((radio) => radio.setAttribute('tabindex', radio === marcado ? '0' : '-1'));
}

export function mostrarAvisoConAccion(texto, { textoAccion, alAccion, testid, testidAccion, duracionMs = DURACION_AVISO_MS }) {
  document.querySelectorAll('.toast').forEach((el) => el.remove());
  const aviso = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite', 'data-testid': testid });
  const mensaje = h('span', { class: 'aviso-accion__texto' });
  mensaje.textContent = texto;
  const boton = h('button', { type: 'button', class: 'aviso-accion__boton', 'data-testid': testidAccion });
  boton.textContent = textoAccion;
  aviso.append(h('div', { class: 'banner banner-success aviso-accion' }, [mensaje, boton]));
  document.body.append(aviso);
  const temporizador = setTimeout(() => aviso.remove(), duracionMs);
  boton.addEventListener('click', () => {
    clearTimeout(temporizador);
    aviso.remove();
    alAccion();
  });
  return () => {
    clearTimeout(temporizador);
    aviso.remove();
  };
}

function crearCampo({ etiqueta, id, testid, opcional = false, ayuda = null, icono = null, atributos = {} }) {
  const entrada = h('input', { type: 'text', id, 'data-testid': testid, 'aria-describedby': ayuda ? `ayuda-${id} error-${id}` : `error-${id}`, ...atributos });
  const caparazon = h('div', { class: 'input-shell' }, icono ? [h('span', { class: 'input-shell__icon' }, [crearSvg(icono)]), entrada] : [entrada]);
  const rotulo = h('label', { class: 'field__label', for: id }, [etiqueta]);
  const cabecera = opcional
    ? h('div', { class: 'field__label-row' }, [rotulo, h('span', { class: 'field__label-badge field__label-badge--opcional' }, ['Opcional'])])
    : rotulo;
  const hijos = [cabecera, caparazon];
  if (ayuda) {
    const textoAyuda = h('p', { class: 'field__hint', id: `ayuda-${id}`, 'data-testid': `ayuda-${id}` });
    textoAyuda.textContent = ayuda;
    hijos.push(textoAyuda);
  }
  hijos.push(h('div', { class: 'field__error', id: `error-${id}`, style: 'display:none;', role: 'alert', 'data-testid': `mensaje-error-${id}` }));
  return h('div', { class: 'field' }, hijos);
}

function construirFormulario(direccion) {
  const esEdicion = direccion !== null;
  const campos = [
    crearCampo({ etiqueta: 'Calle', id: 'direccion-calle', testid: 'input-direccion-calle', icono: FIGURAS_UBICACION, atributos: { placeholder: 'Nombre de la calle', maxlength: '150', autocomplete: 'off' } }),
    h('div', { style: 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;' }, [
      crearCampo({ etiqueta: 'Número', id: 'direccion-numero', testid: 'input-direccion-numero', atributos: { placeholder: '1234', inputmode: 'numeric', maxlength: '10' } }),
      crearCampo({ etiqueta: 'Piso / Dpto', id: 'direccion-piso-depto', testid: 'input-direccion-piso-depto', opcional: true, atributos: { maxlength: '30' } }),
    ]),
    crearCampo({ etiqueta: 'Código postal', id: 'direccion-codigo-postal', testid: 'input-direccion-codigo-postal', atributos: { placeholder: '9420', maxlength: '10' } }),
    h('div', { class: 'field' }, [
      h('label', { class: 'field__label', for: 'direccion-provincia' }, ['Provincia']),
      h('div', { class: 'select-shell' }, [h('select', { id: 'direccion-provincia', 'data-testid': 'select-direccion-provincia' }), crearSvg(FIGURAS_CHEVRON, { class: 'select-shell__chevron' })]),
    ]),
    h('div', { class: 'field' }, [
      h('label', { class: 'field__label', for: 'direccion-localidad' }, ['Localidad']),
      h('div', { class: 'select-shell' }, [
        h('select', { id: 'direccion-localidad', 'data-testid': 'select-direccion-localidad', 'aria-describedby': 'error-direccion-localidad' }),
        crearSvg(FIGURAS_CHEVRON, { class: 'select-shell__chevron' }),
      ]),
      h('div', { class: 'field__error', id: 'error-direccion-localidad', style: 'display:none;', role: 'alert', 'data-testid': 'mensaje-error-direccion-localidad' }),
    ]),
    crearCampo({ etiqueta: 'Nombre', id: 'direccion-nombre', testid: 'input-direccion-nombre', opcional: true, ayuda: 'Solo lo ves vos, por ejemplo Casa o Trabajo', atributos: { maxlength: '40', autocomplete: 'off' } }),
    crearCampo({ etiqueta: 'Referencia', id: 'direccion-referencia', testid: 'input-direccion-referencia', opcional: true, ayuda: 'Ayuda al repartidor: portón negro, timbre de arriba', atributos: { maxlength: '150', autocomplete: 'off' } }),
  ];

  const interruptor = h('button', {
    type: 'button',
    class: 'switch',
    id: 'direccion-predeterminada',
    'aria-pressed': 'false',
    'aria-label': 'Usar como predeterminada',
    'aria-describedby': 'ayuda-direccion-predeterminada',
    'data-testid': 'switch-direccion-predeterminada',
  }, [h('span', { class: 'switch__knob' })]);
  const ayudaInterruptor = h('span', { class: 'switch-row__ayuda', id: 'ayuda-direccion-predeterminada', 'data-testid': 'ayuda-direccion-predeterminada' });
  const fila = h('div', { class: 'switch-row', 'aria-pressed': 'false', 'data-testid': 'fila-direccion-predeterminada' }, [
    h('span', { class: 'switch-row__texto' }, [h('span', { class: 'switch-row__label' }, ['Usar como predeterminada']), ayudaInterruptor]),
    interruptor,
  ]);

  const guardar = h('button', { type: 'submit', class: 'btn btn-primary', id: 'direccion-guardar', disabled: true, 'data-testid': 'btn-guardar-direccion' });
  guardar.textContent = esEdicion ? 'Guardar cambios' : 'Guardar dirección';
  const formulario = h('form', { class: 'form', novalidate: true, id: 'formulario-direccion', 'data-testid': 'formulario-direccion' }, [...campos, fila, guardar]);
  return { formulario, interruptor, fila, ayudaInterruptor, guardar };
}

function abrirConfirmacionDescarte({ alDescartar, alSeguir }) {
  if (document.querySelector('[data-testid="modal-descartar-direccion"]')) {
    return;
  }
  const titulo = h('h2', { class: 'modal-sheet__title', id: 'descartar-direccion-titulo', 'data-testid': 'titulo-descartar-direccion' }, ['¿Descartar los cambios?']);
  const texto = h('p', { class: 'modal-sheet__text', id: 'descartar-direccion-texto', 'data-testid': 'texto-descartar-direccion' }, ['Si salís ahora, se pierde lo que cargaste.']);
  const seguir = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'btn-seguir-editando-direccion' }, ['Seguir editando']);
  const descartar = h('button', { type: 'button', class: 'btn btn-tertiary', 'data-testid': 'btn-descartar-direccion' }, ['Descartar']);
  const hoja = h('div', { class: 'modal-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'descartar-direccion-titulo', 'aria-describedby': 'descartar-direccion-texto' }, [titulo, texto, seguir, descartar]);
  const fondo = h('div', { class: 'modal-backdrop', 'data-testid': 'modal-descartar-direccion' }, [hoja]);
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

export function abrirFormularioDireccion({ direccion = null, alGuardar, focoAlCerrar = null }) {
  if (document.querySelector('[data-testid="pantalla-direccion-form"]')) {
    return;
  }
  const esEdicion = direccion !== null;
  const opener = elementoQueAbrio();
  const overflowPrevio = document.body.style.overflow;
  const titulo = h('span', { class: 'app-header__title', id: 'direccion-form-titulo', 'data-testid': 'titulo-direccion-form' }, [esEdicion ? 'Editar dirección' : 'Agregar dirección']);
  const volver = h('button', { type: 'button', class: 'app-header__back app-header__back--tactil', 'aria-label': 'Volver', 'data-testid': 'btn-volver-direccion' }, [crearSvg(FIGURAS_VOLVER)]);
  const bannerSlot = h('div', { 'data-testid': 'banner-direccion-form' });
  const { formulario, interruptor, fila, ayudaInterruptor, guardar } = construirFormulario(direccion);
  const pantalla = h('div', { class: 'pantalla-completa', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'direccion-form-titulo', 'data-testid': 'pantalla-direccion-form' }, [
    h('header', { class: 'app-header' }, [volver, titulo]),
    h('div', { class: 'screen-body' }, [bannerSlot, formulario]),
  ]);
  document.body.append(pantalla);
  document.body.style.overflow = 'hidden';

  const entrada = (id) => document.getElementById(id);
  const localidadSelect = entrada('direccion-localidad');
  const esPredeterminada = esEdicion && direccion.principal;
  let ocupado = false;

  function fijarInterruptor(activo) {
    interruptor.setAttribute('aria-pressed', String(activo));
    fila.setAttribute('aria-pressed', String(activo));
  }
  fijarInterruptor(esPredeterminada);
  if (esPredeterminada) {
    interruptor.disabled = true;
    fila.classList.add('switch-row--bloqueado');
    ayudaInterruptor.textContent = 'Es tu dirección predeterminada. Para cambiarla, elegí otra dirección como predeterminada';
  } else {
    ayudaInterruptor.textContent = 'Se usa por defecto en tus pedidos a domicilio';
    interruptor.addEventListener('click', () => fijarInterruptor(interruptor.getAttribute('aria-pressed') !== 'true'));
  }

  if (esEdicion) {
    entrada('direccion-calle').value = direccion.calle;
    entrada('direccion-numero').value = direccion.numero;
    entrada('direccion-piso-depto').value = direccion.pisoDepto || '';
    entrada('direccion-codigo-postal').value = direccion.codigoPostal;
    entrada('direccion-nombre').value = direccion.nombre || '';
    entrada('direccion-referencia').value = direccion.referencia || '';
  }

  const IDS_TEXTO = ['direccion-calle', 'direccion-numero', 'direccion-piso-depto', 'direccion-codigo-postal', 'direccion-nombre', 'direccion-referencia'];
  const instantaneaTextos = () => IDS_TEXTO.map((id) => entrada(id).value.trim()).join('\u0000');
  const estadoInterruptor = () => interruptor.getAttribute('aria-pressed');
  const textosIniciales = instantaneaTextos();
  const interruptorInicial = estadoInterruptor();
  let localidadInicial = null;

  function hayCambiosSinGuardar() {
    if (instantaneaTextos() !== textosIniciales || estadoInterruptor() !== interruptorInicial) {
      return true;
    }
    return localidadInicial !== null && localidadSelect.value !== localidadInicial;
  }

  let confirmandoDescarte = false;
  const quitarAtrapaFoco = atraparFoco(pantalla, intentarCerrar, () => confirmandoDescarte);

  function cerrar() {
    quitarAtrapaFoco();
    pantalla.remove();
    document.body.style.overflow = overflowPrevio;
    if (opener && opener !== document.body && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus();
    } else if (focoAlCerrar) {
      focoAlCerrar();
    }
  }

  function intentarCerrar() {
    if (ocupado || confirmandoDescarte) {
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
        volver.focus();
      },
      alDescartar: () => {
        confirmandoDescarte = false;
        cerrar();
      },
    });
  }
  volver.addEventListener('click', intentarCerrar);

  const validaciones = [
    { id: 'direccion-calle', error: 'error-direccion-calle', obligatorio: 'La calle es obligatoria', valido: esCalleValida, invalido: 'La calle no puede contener solo caracteres especiales.' },
    { id: 'direccion-numero', error: 'error-direccion-numero', obligatorio: 'El número es obligatorio', valido: esNumeroDireccionValido, invalido: 'El número solo puede tener dígitos.' },
    { id: 'direccion-piso-depto', error: 'error-direccion-piso-depto', opcional: true, valido: esTextoConContenidoValido, invalido: 'El piso o departamento no puede contener solo caracteres especiales.' },
    { id: 'direccion-codigo-postal', error: 'error-direccion-codigo-postal', obligatorio: 'El código postal es obligatorio', valido: esCodigoPostalValido, invalido: 'Ingresá un código postal válido (4 dígitos o formato CPA).' },
    { id: 'direccion-nombre', error: 'error-direccion-nombre', opcional: true, valido: esTextoConContenidoValido, invalido: 'El nombre no puede contener solo caracteres especiales.' },
    { id: 'direccion-referencia', error: 'error-direccion-referencia', opcional: true, valido: esTextoConContenidoValido, invalido: 'La referencia no puede contener solo caracteres especiales.' },
  ];

  function validarCampo({ id, error, obligatorio, opcional, valido, invalido }) {
    const valor = entrada(id).value.trim();
    if (!valor) {
      if (opcional) {
        limpiarErrorCampo(error);
        return true;
      }
      mostrarErrorCampo(error, obligatorio);
      return false;
    }
    if (!valido(valor)) {
      mostrarErrorCampo(error, invalido);
      return false;
    }
    limpiarErrorCampo(error);
    return true;
  }

  validaciones.forEach((regla) => {
    entrada(regla.id).addEventListener('blur', () => validarCampo(regla));
    entrada(regla.id).addEventListener('input', () => limpiarErrorCampo(regla.error));
  });
  localidadSelect.addEventListener('change', () => limpiarErrorCampo('error-direccion-localidad'));

  function validarTodo() {
    const resultados = validaciones.map(validarCampo);
    if (!localidadSelect.value) {
      mostrarErrorCampo('error-direccion-localidad', 'Seleccioná una localidad');
      resultados.push(false);
    }
    return resultados.every(Boolean);
  }

  function bloquear(bloqueado) {
    ocupado = bloqueado;
    volver.disabled = bloqueado;
    if (!esPredeterminada) {
      interruptor.disabled = bloqueado;
    }
  }

  function datosDelFormulario() {
    const texto = (id) => entrada(id).value.trim();
    return {
      calle: texto('direccion-calle'),
      numero: texto('direccion-numero'),
      pisoDepto: texto('direccion-piso-depto') || null,
      codigoPostal: normalizarCodigoPostal(texto('direccion-codigo-postal')),
      localidadId: localidadSelect.value,
      nombre: texto('direccion-nombre') || null,
      referencia: texto('direccion-referencia') || null,
    };
  }

  async function guardarDireccion() {
    const quiereSerPredeterminada = interruptor.getAttribute('aria-pressed') === 'true';
    const datos = datosDelFormulario();
    if (!esEdicion) {
      return apiFetch(RUTA_API, { method: 'POST', body: { ...datos, principal: quiereSerPredeterminada } });
    }
    const guardada = await apiFetch(`${RUTA_API}/${direccion.id}`, { method: 'PUT', body: datos });
    if (quiereSerPredeterminada && !direccion.principal) {
      try {
        await apiFetch(`${RUTA_API}/${direccion.id}/principal`, { method: 'PUT' });
        guardada.principal = true;
      } catch (error) {
        guardada.noPudoSerPredeterminada = true;
      }
    }
    return guardada;
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado) {
      return;
    }
    renderBannerTexto(bannerSlot, 'error', '');
    if (!validarTodo()) {
      scrollAlPrimerError(pantalla);
      return;
    }
    bloquear(true);
    setLoading(guardar, 'Guardando...', true);
    try {
      const guardada = await guardarDireccion();
      const fallo = guardada.noPudoSerPredeterminada === true;
      cerrar();
      showToast(fallo ? 'Guardamos los cambios, pero no pudimos dejarla como predeterminada' : (esEdicion ? 'Dirección actualizada' : 'Dirección agregada'), fallo ? 'error' : 'success');
      alGuardar(guardada);
    } catch (error) {
      bloquear(false);
      setLoading(guardar, '', false);
      if (error instanceof ApiError && error.status === 404 && esEdicion) {
        cerrar();
        showToast(MENSAJE_NO_EXISTE, 'error');
        alGuardar(null);
        return;
      }
      if (error instanceof ApiError && error.status === 400 && mapearErroresBackend(error.data, MAPA_ERRORES)) {
        scrollAlPrimerError(pantalla);
        return;
      }
      renderBannerTexto(bannerSlot, 'error', mensajeDe(error));
      bannerSlot.firstElementChild.setAttribute('role', 'alert');
      bannerSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  initGeografiaSelects(entrada('direccion-provincia'), localidadSelect)
    .then(() => {
      if (esEdicion) {
        localidadSelect.value = direccion.localidadId;
      }
      localidadInicial = localidadSelect.value;
      guardar.disabled = false;
      if (!esEdicion) {
        entrada('direccion-calle').focus();
      }
    })
    .catch(() => {
      renderBannerTexto(bannerSlot, 'error', 'No pudimos cargar las localidades. Cerrá esta pantalla e intentá de nuevo.');
    });

  if (esEdicion) {
    entrada('direccion-calle').focus();
  } else {
    volver.focus();
  }
}

export function abrirConfirmacionBaja({ direccion, direcciones, alEliminada, alActualizar }) {
  if (document.querySelector('[data-testid="modal-eliminar-direccion"]')) {
    return;
  }
  const opener = elementoQueAbrio();
  const overflowPrevio = document.body.style.overflow;
  const sucesora = direccion.principal ? direccionMasReciente(direcciones, direccion.id) : null;
  const titulo = h('h2', { class: 'modal-sheet__title', id: 'eliminar-direccion-titulo', 'data-testid': 'titulo-eliminar-direccion' }, [
    direccion.principal ? '¿Eliminar tu dirección predeterminada?' : '¿Eliminar esta dirección?',
  ]);
  const texto = h('p', { class: 'modal-sheet__text', id: 'eliminar-direccion-texto', 'data-testid': 'texto-eliminar-direccion' });
  const base = 'Los pedidos que ya hiciste con esta dirección no cambian.';
  texto.textContent = sucesora ? `${base} Tu dirección más reciente, ${tituloDireccion(sucesora)}, pasa a ser la predeterminada.` : base;
  const confirmar = h('button', { type: 'button', class: 'btn btn-primary equipo-hoja__peligro', 'data-testid': 'btn-confirmar-eliminar-direccion' }, ['Eliminar']);
  const cancelar = h('button', { type: 'button', class: 'btn btn-tertiary', 'data-testid': 'btn-cancelar-eliminar-direccion' }, ['Cancelar']);
  const hoja = h('div', { class: 'modal-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'eliminar-direccion-titulo', 'aria-describedby': 'eliminar-direccion-texto' }, [titulo, texto, confirmar, cancelar]);
  const fondo = h('div', { class: 'modal-backdrop', 'data-testid': 'modal-eliminar-direccion' }, [hoja]);
  document.body.append(fondo);
  document.body.style.overflow = 'hidden';
  cancelar.focus();
  let ocupado = false;

  const quitarAtrapaFoco = atraparFoco(hoja, cerrar);
  function cerrar() {
    if (ocupado) {
      return;
    }
    quitarAtrapaFoco();
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus();
    }
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
    confirmar.textContent = 'Eliminando...';
    try {
      const { mensaje, data } = await apiFetch(`${RUTA_API}/${direccion.id}`, { method: 'DELETE', conMensaje: true });
      ocupado = false;
      cerrar();
      showToast(mensaje || 'Dirección eliminada');
      alEliminada(normalizarLista(data));
    } catch (error) {
      ocupado = false;
      cerrar();
      showToast(error instanceof ApiError && error.status === 404 ? MENSAJE_NO_EXISTE : mensajeDe(error), 'error');
      alActualizar();
    }
  });
}

function abrirMenuDireccion({ direccion, esUnica, alEditar, alEliminar }) {
  if (document.querySelector('[data-testid="menu-direccion"]')) {
    return;
  }
  const opener = elementoQueAbrio();
  const asa = h('div', { class: 'product-modal-sheet__handle' }, [h('span')]);
  const titulo = h('h2', { class: 'equipo-menu__titulo', id: 'menu-direccion-titulo', 'data-testid': 'menu-direccion-titulo' });
  titulo.textContent = tituloDireccion(direccion);

  const editar = h('button', { class: 'profile-link', type: 'button', 'data-testid': 'btn-editar-direccion' }, [crearSvg(FIGURAS_EDITAR), h('span', {}, ['Editar'])]);
  const etiquetaEliminar = h('span');
  etiquetaEliminar.append('Eliminar');
  if (esUnica) {
    const leyenda = h('small', { class: 'equipo-accion__leyenda', id: 'leyenda-unica-direccion', 'data-testid': 'texto-unica-direccion' });
    leyenda.textContent = 'Es tu única dirección';
    etiquetaEliminar.append(leyenda);
  }
  const eliminar = h('button', { class: 'profile-link profile-link--danger', type: 'button', disabled: esUnica, 'aria-describedby': esUnica ? 'leyenda-unica-direccion' : null, 'data-testid': 'btn-eliminar-direccion' }, [crearSvg(FIGURAS_ELIMINAR), etiquetaEliminar]);
  const cerrarBoton = h('button', { class: 'btn btn-tertiary equipo-menu__cerrar', type: 'button', 'data-testid': 'btn-cerrar-menu-direccion' }, ['Cerrar']);
  const cuerpo = h('div', { class: 'product-modal-sheet__body' }, [titulo, h('div', { class: 'profile-link-list' }, [editar, eliminar]), cerrarBoton]);
  const hoja = h('div', { class: 'product-modal-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'menu-direccion-titulo' }, [asa, cuerpo]);
  const fondo = h('div', { class: 'modal-backdrop', 'data-testid': 'menu-direccion' }, [hoja]);
  document.body.append(fondo);
  editar.focus();

  const quitarAtrapaFoco = atraparFoco(hoja, cerrar);
  function cerrar(devolverFoco = true) {
    quitarAtrapaFoco();
    fondo.remove();
    if (devolverFoco && opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus();
    }
  }
  cerrarBoton.addEventListener('click', () => cerrar());
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) {
      cerrar();
    }
  });
  editar.addEventListener('click', () => {
    cerrar(false);
    alEditar();
  });
  eliminar.addEventListener('click', () => {
    cerrar(false);
    alEliminar();
  });
}

function crearFilaDireccion(direccion, { ocupado, alElegir, alAbrirMenu }) {
  const principal = direccion.principal;
  const radio = h('button', {
    type: 'button',
    class: 'direccion-item__radio',
    role: 'radio',
    'aria-checked': String(principal),
    'aria-label': `Usar ${tituloDireccion(direccion)} como predeterminada`,
    disabled: ocupado,
    'data-testid': `radio-direccion-${direccion.id}`,
  }, [h('span', { class: 'direccion-item__punto' })]);
  const nombre = h('h3', { class: 'direccion-item__titulo', 'data-testid': `titulo-direccion-${direccion.id}` });
  nombre.textContent = tituloDireccion(direccion);
  const cabecera = h('div', { class: 'direccion-item__cabecera' }, [nombre]);
  if (principal) {
    cabecera.append(h('span', { class: 'chip-predeterminada', 'data-testid': `chip-predeterminada-${direccion.id}` }, ['Predeterminada']));
  }
  const textoCalle = lineaDebajoDelTitulo(direccion);
  const calle = textoCalle ? h('p', { class: 'direccion-item__linea', 'data-testid': `calle-direccion-${direccion.id}` }) : null;
  if (calle) {
    calle.textContent = textoCalle;
  }
  const localidad = h('p', { class: 'direccion-item__linea', 'data-testid': `localidad-direccion-${direccion.id}` });
  localidad.textContent = lineaLocalidad(direccion);
  const menu = h('button', {
    type: 'button',
    class: 'product-row__kebab direccion-item__menu',
    'aria-label': `Más opciones de ${tituloDireccion(direccion)}`,
    'aria-haspopup': 'dialog',
    disabled: ocupado,
    'data-testid': `btn-menu-direccion-${direccion.id}`,
  }, [crearSvg(FIGURAS_PUNTITOS)]);
  radio.addEventListener('click', () => {
    if (!principal) {
      alElegir(direccion);
    }
  });
  menu.addEventListener('click', () => alAbrirMenu(direccion));
  return h('div', { class: principal ? 'direccion-item direccion-item--principal' : 'direccion-item', 'data-testid': `direccion-${direccion.id}` }, [
    radio,
    h('div', { class: 'direccion-item__cuerpo' }, calle ? [cabecera, calle, localidad] : [cabecera, localidad]),
    menu,
  ]);
}

export function initMisDirecciones({ contenedor, enlaceFila, mostrarVista, idVista }) {
  let direcciones = [];
  let ocupado = false;
  let cerrarAviso = null;
  let cargado = false;

  function enfocar(testid) {
    const objetivo = document.querySelector(`[data-testid="${testid}"]`);
    if (objetivo && !objetivo.disabled) {
      objetivo.focus();
      return;
    }
    const primero = contenedor.querySelector('[role="radio"]:not(:disabled)');
    if (primero) {
      primero.focus();
    }
  }

  function etiquetaFila() {
    const etiqueta = enlaceFila.querySelector('span');
    etiqueta.textContent = cargado ? `Mis direcciones (${direcciones.length})` : 'Mis direcciones';
  }

  function dibujar() {
    etiquetaFila();
    const elementos = [];
    const grupo = h('div', { class: 'direcciones-lista', role: 'radiogroup', 'aria-label': 'Dirección predeterminada', 'aria-busy': String(ocupado), 'data-testid': 'lista-direcciones' });
    direcciones.forEach((direccion) => {
      grupo.append(crearFilaDireccion(direccion, { ocupado, alElegir: elegirPredeterminada, alAbrirMenu: abrirMenu }));
    });
    ajustarTabindexRadios(grupo);
    habilitarFlechasRadiogroup(grupo, { seleccionarAlMover: false });
    elementos.push(grupo);

    const cupoLleno = direcciones.length >= MAXIMO_DIRECCIONES;
    const agregar = h('button', {
      type: 'button',
      class: 'btn btn-secondary direcciones-agregar',
      disabled: cupoLleno || ocupado,
      'aria-describedby': cupoLleno ? 'aviso-cupo-direcciones' : null,
      'data-testid': 'btn-agregar-direccion',
    }, [crearSvg(FIGURAS_MAS), 'Agregar dirección']);
    agregar.addEventListener('click', () => abrirFormularioDireccion({ alGuardar: () => recargar().then(() => enfocar('btn-agregar-direccion')), focoAlCerrar: () => enfocar('btn-agregar-direccion') }));
    elementos.push(agregar);
    if (cupoLleno) {
      const aviso = h('div', { class: 'banner banner-info', id: 'aviso-cupo-direcciones', role: 'status', 'data-testid': 'aviso-cupo-direcciones' });
      const cuerpo = h('span');
      cuerpo.textContent = MENSAJE_CUPO_LLENO;
      aviso.append(cuerpo);
      elementos.push(aviso);
    }
    contenedor.replaceChildren(...elementos);
  }

  function dibujarEsqueleto() {
    const filas = [0, 1].map(() => h('div', { class: 'skeleton direccion-esqueleto' }));
    contenedor.replaceChildren(h('div', { class: 'direcciones-lista', 'aria-busy': 'true', 'data-testid': 'esqueleto-direcciones' }, filas));
  }

  function dibujarError(alReintentar) {
    const reintentar = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'btn-reintentar-direcciones' }, ['Reintentar']);
    reintentar.addEventListener('click', alReintentar);
    const aviso = h('div', { class: 'banner banner-error', role: 'alert', 'data-testid': 'error-direcciones' });
    const texto = h('span');
    texto.textContent = 'No pudimos cargar tus direcciones.';
    aviso.append(texto);
    contenedor.replaceChildren(aviso, reintentar);
  }

  async function recargar({ conEsqueleto = false } = {}) {
    if (conEsqueleto) {
      dibujarEsqueleto();
    }
    try {
      direcciones = await cargarDirecciones();
      cargado = true;
      enlaceFila.disabled = false;
      dibujar();
    } catch (error) {
      enlaceFila.disabled = false;
      dibujarError(() => recargar({ conEsqueleto: true }));
    }
  }

  function fijarOcupado(valor) {
    ocupado = valor;
    dibujar();
  }

  async function elegirPredeterminada(direccion) {
    if (ocupado) {
      return;
    }
    const anterior = direcciones.find((d) => d.principal) || null;
    if (cerrarAviso) {
      cerrarAviso();
      cerrarAviso = null;
    }
    fijarOcupado(true);
    try {
      direcciones = normalizarLista(await apiFetch(`${RUTA_API}/${direccion.id}/principal`, { method: 'PUT' }));
      ocupado = false;
      dibujar();
      document.querySelector(`[data-testid="radio-direccion-${direccion.id}"]`)?.focus();
      cerrarAviso = mostrarAvisoConAccion(`${tituloDireccion(direccion)} ahora es tu dirección predeterminada.`, {
        textoAccion: 'Deshacer',
        testid: 'aviso-predeterminada',
        testidAccion: 'btn-deshacer-predeterminada',
        alAccion: () => deshacer(anterior),
      });
    } catch (error) {
      ocupado = false;
      showToast(error instanceof ApiError && error.status === 404 ? MENSAJE_NO_EXISTE : mensajeDe(error), 'error');
      recargar();
    }
  }

  async function deshacer(anterior) {
    cerrarAviso = null;
    if (!anterior || ocupado) {
      return;
    }
    fijarOcupado(true);
    try {
      direcciones = normalizarLista(await apiFetch(`${RUTA_API}/${anterior.id}/principal`, { method: 'PUT' }));
      ocupado = false;
      dibujar();
      document.querySelector(`[data-testid="radio-direccion-${anterior.id}"]`)?.focus();
    } catch (error) {
      ocupado = false;
      showToast(error instanceof ApiError && error.status === 404 ? MENSAJE_NO_EXISTE : mensajeDe(error), 'error');
      recargar();
    }
  }

  function abrirMenu(direccion) {
    abrirMenuDireccion({
      direccion,
      esUnica: direcciones.length <= 1,
      alEditar: () => abrirFormularioDireccion({ direccion, alGuardar: () => recargar().then(() => enfocar(`btn-menu-direccion-${direccion.id}`)), focoAlCerrar: () => enfocar(`btn-menu-direccion-${direccion.id}`) }),
      alEliminar: () => abrirConfirmacionBaja({
        direccion,
        direcciones,
        alEliminada: (lista) => {
          direcciones = lista;
          dibujar();
          enfocar('btn-agregar-direccion');
        },
        alActualizar: () => recargar(),
      }),
    });
  }

  function abrir() {
    mostrarVista(idVista);
    recargar({ conEsqueleto: !cargado });
  }

  enlaceFila.addEventListener('click', abrir);
  enlaceFila.disabled = true;
  recargar();
  return { abrir };
}

export function crearTarjetaDireccionEntrega(direccion, seleccionada) {
  const titulo = h('h3', { 'data-testid': `titulo-tarjeta-direccion-${direccion.id}` });
  titulo.textContent = tituloDireccion(direccion);
  const localidad = h('p');
  localidad.textContent = lineaLocalidad(direccion);
  const cuerpo = h('div', { class: 'direccion-tarjeta__cuerpo' }, [titulo]);
  const textoCalle = lineaDebajoDelTitulo(direccion);
  if (textoCalle) {
    const calle = h('p');
    calle.textContent = textoCalle;
    cuerpo.append(calle);
  }
  cuerpo.append(localidad);
  if (direccion.referencia) {
    const referencia = h('p', { class: 'direccion-tarjeta__referencia', 'data-testid': `referencia-tarjeta-direccion-${direccion.id}` });
    referencia.textContent = `Referencia: ${direccion.referencia}`;
    cuerpo.append(referencia);
  }
  return h('button', {
    type: 'button',
    class: 'direccion-tarjeta',
    role: 'radio',
    'aria-checked': String(seleccionada),
    'data-testid': `tarjeta-direccion-${direccion.id}`,
  }, [cuerpo, h('div', { class: 'direccion-tarjeta__radio' })]);
}

export { FIGURAS_MAS, FIGURAS_UBICACION };
