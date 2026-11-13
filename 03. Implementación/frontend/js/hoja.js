import { ICONS } from './form-utils.js';
import { establecerErrorCampo } from './validators.js';

let contador = 0;

const CHEVRON = '<svg class="select-shell__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

const SELECTOR_FOCO = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function crear(tag, className, atributos = {}) {
  const nodo = document.createElement(tag);
  if (className) {
    nodo.className = className;
  }
  Object.entries(atributos).forEach(([nombre, valor]) => {
    if (valor !== null && valor !== undefined && valor !== false) {
      nodo.setAttribute(nombre, valor === true ? '' : valor);
    }
  });
  return nodo;
}

function icono(svg) {
  return new DOMParser().parseFromString(svg, 'text/html').body.firstElementChild;
}

function claseDeVariante(variante) {
  if (variante === 'peligro') {
    return 'btn btn-peligro hoja__accion';
  }
  if (variante === 'primaria') {
    return 'btn btn-primary hoja__accion';
  }
  return 'btn btn-secondary hoja__accion hoja__accion--segura';
}

function aNodos(contenido) {
  if (!contenido) {
    return [];
  }
  return Array.isArray(contenido) ? contenido : [contenido];
}

const hojasActivas = [];

export function apilarHoja() {
  const identidad = {};
  hojasActivas.push(identidad);
  return {
    esTope: () => hojasActivas[hojasActivas.length - 1] === identidad,
    liberar: () => {
      const posicion = hojasActivas.indexOf(identidad);
      if (posicion >= 0) {
        hojasActivas.splice(posicion, 1);
      }
    },
  };
}

function esVisible(elemento) {
  return elemento.getClientRects().length > 0 && getComputedStyle(elemento).visibility !== 'hidden';
}

let ultimoControlTocado = null;

document.addEventListener(
  'click',
  (evento) => {
    ultimoControlTocado = evento.target instanceof Element ? evento.target.closest('button, a[href], [role="button"]') : null;
  },
  true,
);

function elementoActivo() {
  const activo = document.activeElement;
  if (activo && activo !== document.body) {
    return activo;
  }
  return ultimoControlTocado && document.contains(ultimoControlTocado) ? ultimoControlTocado : activo;
}

export function activarHoja({ fondo, hoja, disparador: disparadorExplicito = null, inicial = null, ocupada = () => false, alCerrar = null }) {
  const disparador = disparadorExplicito || elementoActivo();
  const overflowPrevio = document.body.style.overflow;
  const lugar = apilarHoja();
  let cerrada = false;

  if (!hoja.getAttribute('role')) {
    hoja.setAttribute('role', 'dialog');
  }
  hoja.setAttribute('aria-modal', 'true');

  function cerrar() {
    if (cerrada) {
      return;
    }
    cerrada = true;
    lugar.liberar();
    document.removeEventListener('keydown', alTeclear, true);
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    if (alCerrar) {
      alCerrar();
    }
    if (disparador && typeof disparador.focus === 'function' && document.contains(disparador)) {
      disparador.focus();
    }
  }

  function alTeclear(evento) {
    if (!lugar.esTope()) {
      return;
    }
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      if (!ocupada()) {
        cerrar();
      }
      return;
    }
    if (evento.key !== 'Tab') {
      return;
    }
    const enfocables = [...hoja.querySelectorAll(SELECTOR_FOCO)].filter((el) => esVisible(el) || el === document.activeElement);
    if (enfocables.length === 0) {
      evento.preventDefault();
      return;
    }
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (!hoja.contains(document.activeElement)) {
      evento.preventDefault();
      primero.focus();
    } else if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo && !ocupada()) {
      cerrar();
    }
  });
  document.addEventListener('keydown', alTeclear, true);
  if (!fondo.isConnected) {
    document.body.appendChild(fondo);
  }
  document.body.style.overflow = 'hidden';
  const primerEnfocable = [inicial, ...hoja.querySelectorAll(SELECTOR_FOCO)].find((el) => el && esVisible(el));
  if (primerEnfocable && primerEnfocable !== hoja) {
    primerEnfocable.focus();
  } else {
    hoja.setAttribute('tabindex', '-1');
    hoja.focus();
  }
  return { cerrar, estaCerrada: () => cerrada };
}

export function crearAviso(texto, testid) {
  const aviso = crear('div', 'hoja__aviso', testid ? { 'data-testid': testid } : {});
  const figura = icono(ICONS.warning);
  figura.classList.add('hoja__aviso-icono');
  const cuerpo = crear('p', 'hoja__aviso-texto');
  cuerpo.textContent = texto;
  aviso.append(figura, cuerpo);
  return aviso;
}

export function crearDetalle(resumen, nodos, testid) {
  const detalle = crear('details', 'hoja__detalle', testid ? { 'data-testid': testid } : {});
  const titulo = crear('summary', 'hoja__detalle-resumen');
  titulo.textContent = resumen;
  const cuerpo = crear('div', 'hoja__detalle-cuerpo');
  aNodos(nodos).forEach((nodo) => cuerpo.append(nodo));
  detalle.append(titulo, cuerpo);
  return detalle;
}

function crearCampoBase({ id, etiqueta, testidError }) {
  const label = crear('label', 'field__label', { for: id, id: id + '-label' });
  label.textContent = etiqueta;
  const error = crear('div', 'field__error is-hidden', { id: `${id}-error`, role: 'alert', 'data-testid': testidError });
  const campo = crear('div', 'field');
  return { campo, label, error };
}

function enlazarError(control, error, contenedorError) {
  function mostrarError(mensaje) {
    establecerErrorCampo(error, mensaje);
    contenedorError.classList.add('hoja__control--error', 'textarea-shell--error');
    control.focus();
  }
  function limpiarError() {
    establecerErrorCampo(error, null);
    contenedorError.classList.remove('hoja__control--error', 'textarea-shell--error');
  }
  control.addEventListener('input', limpiarError);
  control.addEventListener('change', limpiarError);
  return { mostrarError, limpiarError };
}

export function campoSelect({ id, etiqueta, placeholder, opciones, testid, testidError }) {
  const { campo, label, error } = crearCampoBase({ id, etiqueta, testidError });
  const caja = crear('div', 'select-shell');
  const select = crear('select', '', { id, required: true, 'data-testid': testid });
  const vacia = crear('option', '', { value: '', disabled: true, selected: true });
  vacia.textContent = placeholder;
  select.appendChild(vacia);
  opciones.forEach(({ value, label: texto }) => {
    const opcion = crear('option', '', { value });
    opcion.textContent = texto;
    select.appendChild(opcion);
  });
  caja.append(select, icono(CHEVRON));
  campo.append(label, caja, error);
  return { campo, control: select, etiqueta: label, ...enlazarError(select, error, caja) };
}

export function campoTextarea({ id, etiqueta, placeholder, max = 500, testid, testidError, idContador = null }) {
  const { campo, label, error } = crearCampoBase({ id, etiqueta, testidError });
  const caja = crear('div', 'textarea-shell');
  const area = crear('textarea', '', { id, maxlength: String(max), placeholder, 'data-testid': testid });
  caja.appendChild(area);
  campo.append(label, caja);
  if (idContador) {
    const contadorEl = crear('div', 'textarea-counter');
    const cuenta = crear('span', '', { id: idContador });
    cuenta.textContent = `0/${max}`;
    contadorEl.appendChild(cuenta);
    area.addEventListener('input', () => {
      cuenta.textContent = `${area.value.length}/${max}`;
    });
    campo.appendChild(contadorEl);
  }
  campo.appendChild(error);
  return { campo, control: area, etiqueta: label, ...enlazarError(area, error, caja) };
}

export function campoCasilla({ id, etiqueta, testid }) {
  const casilla = crear('input', '', { type: 'checkbox', id, 'data-testid': testid });
  const label = crear('label', 'hoja__casilla', { for: id });
  const texto = crear('span');
  texto.textContent = etiqueta;
  label.append(casilla, texto);
  return { campo: label, control: casilla };
}

export function abrirHoja({
  titulo,
  texto,
  parrafos = [],
  contenido = null,
  aviso = null,
  detalle = null,
  acciones,
  testid = 'hoja',
  disparador = null,
  clase = '',
  alCerrar = null,
  testids = {},
}) {
  contador += 1;
  const idTitulo = `hoja-titulo-${contador}`;
  const idTexto = `hoja-texto-${contador}`;

  const fondo = crear('div', 'modal-backdrop', { 'data-testid': testid });
  const hoja = crear('div', `modal-sheet hoja${clase ? ` ${clase}` : ''}`, {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': idTitulo,
    'aria-describedby': idTexto,
  });

  const tituloEl = crear('h2', 'modal-sheet__title hoja__titulo', { id: idTitulo, 'data-testid': testids.titulo || `${testid}-titulo` });
  tituloEl.textContent = titulo;

  const cuerpo = crear('div', 'hoja__texto hoja__cuerpo', { id: idTexto });
  const lineas = texto ? [texto, ...parrafos] : parrafos;
  lineas.forEach((linea, indice) => {
    const p = crear('p', 'modal-sheet__text hoja__parrafo', { 'data-testid': (testids.textos && testids.textos[indice]) || `${testid}-texto-${indice + 1}` });
    p.textContent = linea;
    cuerpo.appendChild(p);
  });
  if (aviso) {
    cuerpo.appendChild(crearAviso(aviso, `${testid}-aviso`));
  }
  aNodos(contenido).forEach((nodo) => cuerpo.appendChild(nodo));
  if (detalle) {
    cuerpo.appendChild(crearDetalle(detalle.resumen, detalle.nodos, `${testid}-detalle`));
  }

  const error = crear('p', 'hoja__error is-hidden', { role: 'alert', 'data-testid': testids.error || `${testid}-error` });
  const contenedorAcciones = crear('div', 'hoja__acciones');
  const pie = crear('div', 'hoja__pie');
  let ocupada = false;
  let botonInicial = null;
  const botones = [];
  let controlHoja = null;

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.classList.remove('is-hidden');
  }

  function limpiarError() {
    error.textContent = '';
    error.classList.add('is-hidden');
  }

  function refrescarAcciones() {
    botones.forEach(({ boton, accion }) => {
      boton.disabled = ocupada || (accion.deshabilitadaSi ? accion.deshabilitadaSi() : false);
    });
  }

  function fijarOcupada(valor) {
    ocupada = valor;
    refrescarAcciones();
    hoja.querySelectorAll('input, select, textarea').forEach((campo) => {
      campo.disabled = valor;
    });
    hoja.setAttribute('aria-busy', String(valor));
  }

  acciones.forEach((accion) => {
    const boton = crear('button', claseDeVariante(accion.variante), { type: 'button' });
    boton.textContent = accion.etiqueta;
    if (accion.testid) {
      boton.setAttribute('data-testid', accion.testid);
    }
    botones.push({ boton, accion });
    if (accion.inicial) {
      botonInicial = boton;
    }
    boton.addEventListener('click', async () => {
      if (ocupada) {
        return;
      }
      if (!accion.alPulsar) {
        controlHoja.cerrar();
        return;
      }
      limpiarError();
      if (accion.validar && !accion.validar()) {
        return;
      }
      fijarOcupada(true);
      boton.textContent = accion.etiquetaEnviando || 'Enviando…';
      try {
        await accion.alPulsar({ mostrarError, cerrar: () => controlHoja.cerrar() });
        controlHoja.cerrar();
      } catch (fallo) {
        fijarOcupada(false);
        boton.textContent = accion.etiqueta;
        mostrarError(fallo && fallo.message ? fallo.message : 'No pudimos completar la acción. Probá de nuevo.');
        boton.focus();
      }
    });
    contenedorAcciones.appendChild(boton);
  });

  refrescarAcciones();
  pie.append(error, contenedorAcciones);
  hoja.append(tituloEl, cuerpo, pie);
  fondo.appendChild(hoja);

  controlHoja = activarHoja({
    fondo,
    hoja,
    disparador,
    inicial: botonInicial || botones[botones.length - 1].boton,
    ocupada: () => ocupada,
    alCerrar,
  });

  return { cerrar: controlHoja.cerrar, mostrarError, limpiarError, refrescarAcciones, hoja, fondo };
}
