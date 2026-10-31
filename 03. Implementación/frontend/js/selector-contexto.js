import {
  getContexto,
  getUltimoContexto,
  getUsuario,
  setContexto,
  TIPO_CONTEXTO,
} from './api.js';
import {
  consultarComerciosDelEmpleado,
  entrarEnContexto,
  RUTA_INICIO_CLIENTE,
  RUTA_LOGIN,
} from './contexto.js';
import { crearAvatar } from './selector-comercio.js';
import { mostrarToastPendiente } from './catalogo.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ID_HOJA = 'hoja-cambiar-cuenta';
const ID_TITULO_HOJA = 'hoja-cambiar-cuenta-titulo';
const FILAS_ESQUELETO = 2;

const ETIQUETA_ESTADO = {
  SUSPENDIDO: 'Suspendido',
  CERRADO_TEMPORALMENTE: 'Cerrado temporalmente',
};

const AVISO_ESTADO = {
  SUSPENDIDO: 'Comercio suspendido. Solo podés resolver pedidos en curso.',
  CERRADO_TEMPORALMENTE: 'No se aceptan pedidos nuevos.',
};

function crear(tag, className) {
  const nodo = document.createElement(tag);
  if (className) {
    nodo.className = className;
  }
  return nodo;
}

function crearIcono(figuras) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  figuras.forEach(([tag, atributos]) => {
    const hijo = document.createElementNS(SVG_NS, tag);
    Object.entries(atributos).forEach(([clave, valor]) => hijo.setAttribute(clave, String(valor)));
    svg.appendChild(hijo);
  });
  return svg;
}

const FIGURAS_USUARIO = [
  ['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }],
  ['circle', { cx: 12, cy: 7, r: 4 }],
];
const FIGURAS_TILDE = [['polyline', { points: '20 6 9 17 4 12' }]];

function crearAvatarCliente() {
  const avatar = crear('span', 'selector-avatar selector-avatar--panel selector-avatar--cliente');
  avatar.appendChild(crearIcono(FIGURAS_USUARIO));
  return avatar;
}

function crearFila({ testid, avatar, nombre, partes, etiqueta, etiquetaTestid, resaltada, actual, alElegir }) {
  const fila = crear('button', 'panel-comercios__fila');
  fila.type = 'button';
  fila.setAttribute('data-testid', testid);
  if (resaltada) {
    fila.classList.add('panel-comercios__fila--activa');
    fila.setAttribute('data-resaltada', 'true');
  }
  if (actual) {
    fila.setAttribute('aria-current', 'true');
  }
  fila.appendChild(avatar);
  const cuerpo = crear('span', 'panel-comercios__cuerpo');
  const titulo = crear('span', 'panel-comercios__nombre');
  titulo.textContent = nombre;
  cuerpo.appendChild(titulo);
  if (partes.length > 0) {
    const sub = crear('span', 'panel-comercios__sub');
    sub.setAttribute('data-testid', `${testid}-subtitulo`);
    sub.textContent = partes.join(' · ');
    cuerpo.appendChild(sub);
  }
  fila.appendChild(cuerpo);
  if (etiqueta) {
    const chip = crear('span', 'panel-comercios__etiqueta');
    chip.setAttribute('data-testid', etiquetaTestid);
    chip.textContent = etiqueta;
    fila.appendChild(chip);
  }
  if (actual) {
    const tilde = crear('span', 'panel-comercios__tilde');
    tilde.setAttribute('data-testid', 'tilde-contexto-actual');
    tilde.setAttribute('role', 'img');
    tilde.setAttribute('aria-label', 'Cuenta actual');
    tilde.appendChild(crearIcono(FIGURAS_TILDE));
    fila.appendChild(tilde);
  }
  fila.addEventListener('click', alElegir);
  return fila;
}

function pintarOpciones(lista, comercios, { actual, ultimo, mostrarUltimo }) {
  lista.replaceChildren();
  lista.setAttribute('aria-busy', 'false');
  const esUltimo = (tipo, comercioId) => mostrarUltimo && Boolean(ultimo) && ultimo.tipo === tipo && ultimo.comercioId === comercioId;
  const esActual = (tipo, comercioId) => Boolean(actual) && actual.tipo === tipo && actual.comercioId === comercioId;

  lista.appendChild(crearFila({
    testid: 'fila-contexto-cliente',
    avatar: crearAvatarCliente(),
    nombre: 'Cliente',
    partes: esUltimo(TIPO_CONTEXTO.CLIENTE, null) ? ['Último que usaste'] : [],
    resaltada: esUltimo(TIPO_CONTEXTO.CLIENTE, null),
    actual: esActual(TIPO_CONTEXTO.CLIENTE, null),
    alElegir: () => entrarEnContexto(TIPO_CONTEXTO.CLIENTE),
  }));

  comercios.forEach((comercio) => {
    const partes = ['Empleado'];
    if (AVISO_ESTADO[comercio.estado]) {
      partes.push(AVISO_ESTADO[comercio.estado]);
    }
    if (esUltimo(TIPO_CONTEXTO.EMPLEADO, comercio.id)) {
      partes.push('Último que usaste');
    }
    lista.appendChild(crearFila({
      testid: `fila-contexto-comercio-${comercio.id}`,
      avatar: crearAvatar(comercio, 'panel'),
      nombre: comercio.nombre,
      partes,
      etiqueta: ETIQUETA_ESTADO[comercio.estado] || null,
      etiquetaTestid: `etiqueta-estado-contexto-${comercio.id}`,
      resaltada: esUltimo(TIPO_CONTEXTO.EMPLEADO, comercio.id),
      actual: esActual(TIPO_CONTEXTO.EMPLEADO, comercio.id),
      alElegir: () => entrarEnContexto(TIPO_CONTEXTO.EMPLEADO, comercio.id, comercio.nombre),
    }));
  });
}

function pintarEsqueleto(lista) {
  lista.replaceChildren();
  lista.setAttribute('aria-busy', 'true');
  for (let i = 0; i < FILAS_ESQUELETO + 1; i += 1) {
    const fila = crear('div', 'panel-comercios__fila panel-comercios__fila--esqueleto');
    fila.appendChild(crear('span', 'skeleton selector-avatar selector-avatar--panel'));
    const cuerpo = crear('span', 'panel-comercios__cuerpo');
    cuerpo.appendChild(crear('span', 'skeleton panel-comercios__esqueleto-linea'));
    fila.appendChild(cuerpo);
    lista.appendChild(fila);
  }
}

function pintarError(lista, alReintentar) {
  lista.replaceChildren();
  lista.setAttribute('aria-busy', 'false');
  const error = crear('p', 'panel-comercios__error');
  error.setAttribute('data-testid', 'error-lista-contextos');
  error.textContent = 'No pudimos cargar tus cuentas. Intentá nuevamente.';
  lista.appendChild(error);
  const reintentar = crear('button', 'btn btn-secondary');
  reintentar.type = 'button';
  reintentar.setAttribute('data-testid', 'btn-reintentar-contextos');
  reintentar.textContent = 'Reintentar';
  reintentar.addEventListener('click', alReintentar);
  lista.appendChild(reintentar);
}

export function abrirHojaCambiarCuenta() {
  if (document.getElementById(ID_HOJA)) {
    return;
  }
  const elementoPrevio = document.activeElement;
  const overflowPrevio = document.body.style.overflow;

  const backdrop = crear('div', 'modal-backdrop');
  backdrop.id = ID_HOJA;
  backdrop.setAttribute('data-testid', 'hoja-cambiar-cuenta');

  const hoja = crear('div', 'product-modal-sheet panel-comercios');
  hoja.setAttribute('role', 'dialog');
  hoja.setAttribute('aria-modal', 'true');
  hoja.setAttribute('aria-labelledby', ID_TITULO_HOJA);

  const asa = crear('button', 'product-modal-sheet__handle');
  asa.type = 'button';
  asa.setAttribute('aria-label', 'Cerrar');
  asa.setAttribute('data-testid', 'btn-cerrar-hoja-cambiar-cuenta');
  asa.appendChild(crear('span'));
  hoja.appendChild(asa);

  const titulo = crear('h2', 'panel-comercios__titulo');
  titulo.id = ID_TITULO_HOJA;
  titulo.setAttribute('data-testid', 'titulo-cambiar-cuenta');
  titulo.textContent = 'Cambiar de cuenta';
  hoja.appendChild(titulo);

  const lista = crear('div', 'panel-comercios__lista');
  lista.setAttribute('data-testid', 'lista-contextos');
  hoja.appendChild(lista);

  backdrop.appendChild(hoja);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  function cerrar() {
    document.removeEventListener('keydown', alTeclear);
    document.body.style.overflow = overflowPrevio;
    backdrop.remove();
    if (elementoPrevio && typeof elementoPrevio.focus === 'function' && document.contains(elementoPrevio)) {
      elementoPrevio.focus();
    }
  }

  function alTeclear(evento) {
    if (evento.key === 'Escape') {
      cerrar();
    }
  }

  async function cargar() {
    pintarEsqueleto(lista);
    try {
      const comercios = await consultarComerciosDelEmpleado();
      pintarOpciones(lista, comercios, { actual: getContexto(), ultimo: null, mostrarUltimo: false });
    } catch {
      pintarError(lista, cargar);
    }
  }

  document.addEventListener('keydown', alTeclear);
  backdrop.addEventListener('click', (evento) => {
    if (evento.target === backdrop) {
      cerrar();
    }
  });
  asa.addEventListener('click', cerrar);
  asa.focus();
  cargar();
}

export async function initSeleccionarContexto() {
  const usuario = getUsuario();
  if (!usuario) {
    window.location.href = RUTA_LOGIN;
    return;
  }
  if (usuario.rol !== 'CLIENTE') {
    window.location.href = usuario.rol === 'ADMINISTRADOR' ? 'admin-dashboard.html' : 'comercio-dashboard.html';
    return;
  }

  const lista = document.getElementById('lista-contextos');
  const contenido = document.getElementById('selector-contenido');

  async function cargar() {
    contenido.classList.add('is-hidden');
    let comercios;
    try {
      comercios = await consultarComerciosDelEmpleado();
    } catch {
      setContexto(TIPO_CONTEXTO.CLIENTE, null, false);
      window.location.href = RUTA_INICIO_CLIENTE;
      return;
    }
    if (comercios.length === 0) {
      setContexto(TIPO_CONTEXTO.CLIENTE, null, false);
      window.location.href = RUTA_INICIO_CLIENTE;
      return;
    }
    pintarOpciones(lista, comercios, { actual: null, ultimo: getUltimoContexto(), mostrarUltimo: true });
    contenido.classList.remove('is-hidden');
    mostrarToastPendiente();
  }

  await cargar();
}
