import { apiFetch, getComercioActivoId, getUsuario } from './api.js';
import {
  activarComercio,
  contarNotificacionesNoLeidasOtros,
  destinoDeNavegacion,
  getComerciosEnMemoria,
  iniciarPollingComercios,
  resolverComercioActivo,
  getComercioActivoEnMemoria,
  refrescarComercios,
  rutaDeEstado,
  suscribirComercios,
  RUTA_DASHBOARD,
} from './comercio-activo.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ID_PANEL = 'panel-comercios';
const ID_TITULO_PANEL = 'panel-comercios-titulo';
const DURACION_MANTENER_APRETADO_MS = 500;
const TOLERANCIA_MOVIMIENTO_PX = 8;
const FILAS_ESQUELETO = 3;
const RUTA_CUENTA_DE_COBRO = 'comercio-perfil.html?vista=mercadopago';

const ICONOS = {
  chevronAbajo: [['polyline', { points: '6 9 12 15 18 9' }]],
  tilde: [['polyline', { points: '20 6 9 17 4 12' }]],
  mas: [
    ['line', { x1: 12, y1: 5, x2: 12, y2: 19 }],
    ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
  ],
};

const ETIQUETA_ESTADO = {
  PENDIENTE: 'Pendiente',
  RECHAZADO: 'Rechazado',
  RECHAZO_DEFINITIVO: 'Definitivo',
  SUSPENDIDO: 'Suspendido',
  CERRADO_TEMPORALMENTE: 'Cerrado temporalmente',
  INACTIVO: 'Inactivo',
};

const SUBTITULO_ESTADO = {
  PENDIENTE: 'En revisión',
  RECHAZO_DEFINITIVO: 'Sin más intentos',
};

const GRUPOS = [
  { clave: 'operativos', titulo: 'Operativos', pertenece: (comercio) => comercio.operativo },
  { clave: 'pendientes', titulo: 'Pendientes', pertenece: (comercio) => !comercio.operativo && comercio.estado === 'PENDIENTE' },
  {
    clave: 'rechazados',
    titulo: 'Rechazados',
    pertenece: (comercio) => comercio.estado === 'RECHAZADO' || comercio.estado === 'RECHAZO_DEFINITIVO',
    ordenar: (a, b) => Number(a.estado === 'RECHAZO_DEFINITIVO') - Number(b.estado === 'RECHAZO_DEFINITIVO'),
  },
  {
    clave: 'otros',
    titulo: 'Otros',
    pertenece: (comercio) => !comercio.operativo && !['PENDIENTE', 'RECHAZADO', 'RECHAZO_DEFINITIVO'].includes(comercio.estado),
  },
];

function crear(tag, className) {
  const nodo = document.createElement(tag);
  if (className) {
    nodo.className = className;
  }
  return nodo;
}

function crearIcono(nombre) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  ICONOS[nombre].forEach(([tag, atributos]) => {
    const hijo = document.createElementNS(SVG_NS, tag);
    Object.entries(atributos).forEach(([clave, valor]) => hijo.setAttribute(clave, String(valor)));
    svg.appendChild(hijo);
  });
  return svg;
}

export function iniciales(nombre) {
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) {
    return '?';
  }
  return palabras.slice(0, 2).map((palabra) => palabra.charAt(0).toUpperCase()).join('');
}

function pintarAvatar(contenedor, comercio) {
  contenedor.replaceChildren();
  if (comercio.fotoPerfilUrl) {
    const img = document.createElement('img');
    img.src = comercio.fotoPerfilUrl;
    img.alt = '';
    img.draggable = false;
    contenedor.appendChild(img);
    return;
  }
  const texto = crear('span', 'selector-avatar__iniciales');
  texto.textContent = iniciales(comercio.nombre);
  contenedor.appendChild(texto);
}

function crearAvatar(comercio, modificador) {
  const avatar = crear('span', `selector-avatar selector-avatar--${modificador}`);
  pintarAvatar(avatar, comercio);
  return avatar;
}

function crearEsqueletoFranja() {
  const franja = crear('div', 'comercio-franja comercio-franja--cargando');
  franja.setAttribute('data-testid', 'franja-comercio-cargando');
  franja.setAttribute('aria-busy', 'true');
  const avatar = crear('span', 'skeleton comercio-franja__esqueleto-avatar');
  const linea = crear('span', 'skeleton comercio-franja__esqueleto-linea');
  franja.appendChild(avatar);
  franja.appendChild(linea);
  return franja;
}

export function montarFranjaComercio(slot) {
  slot.replaceChildren(crearEsqueletoFranja());

  let boton = null;
  let avatarEl = null;
  let nombreEl = null;
  let puntitoEl = null;
  let firma = '';

  function construir() {
    boton = crear('button', 'comercio-franja');
    boton.type = 'button';
    boton.setAttribute('aria-haspopup', 'dialog');
    boton.setAttribute('data-testid', 'franja-comercio');
    avatarEl = crear('span', 'selector-avatar selector-avatar--franja');
    nombreEl = crear('span', 'comercio-franja__nombre');
    nombreEl.setAttribute('data-testid', 'franja-comercio-nombre');
    const cambiar = crear('span', 'comercio-franja__cambiar');
    const textoCambiar = crear('span');
    textoCambiar.textContent = 'Cambiar';
    puntitoEl = crear('span', 'comercio-franja__puntito is-hidden');
    puntitoEl.setAttribute('data-testid', 'franja-comercio-puntito');
    const avisoPuntito = crear('span', 'sr-only');
    avisoPuntito.textContent = 'Hay notificaciones sin leer en tus otros comercios';
    puntitoEl.appendChild(avisoPuntito);
    cambiar.appendChild(textoCambiar);
    cambiar.appendChild(puntitoEl);
    cambiar.appendChild(crearIcono('chevronAbajo'));
    boton.appendChild(avatarEl);
    boton.appendChild(nombreEl);
    boton.appendChild(cambiar);
    boton.addEventListener('click', () => abrirPanelComercios());
    slot.replaceChildren(boton);
  }

  function actualizar() {
    const activo = getComercioActivoEnMemoria();
    if (!activo) {
      return;
    }
    if (!boton) {
      construir();
    }
    const firmaNueva = `${activo.id}|${activo.nombre}|${activo.fotoPerfilUrl || ''}`;
    if (firmaNueva !== firma) {
      firma = firmaNueva;
      pintarAvatar(avatarEl, activo);
      nombreEl.textContent = activo.nombre;
      boton.setAttribute('aria-label', `Comercio activo: ${activo.nombre}. Cambiar de comercio`);
    }
    puntitoEl.classList.toggle('is-hidden', contarNotificacionesNoLeidasOtros() === 0);
  }

  actualizar();
  return suscribirComercios(actualizar);
}

function textoContador(cantidad) {
  return cantidad === 1 ? '1 notificación' : `${cantidad} notificaciones`;
}

function crearFilaComercio(comercio, activoId, alElegir) {
  const accionable = comercio.operativo || Boolean(rutaDeEstado(comercio));
  const esOtros = !comercio.operativo && !rutaDeEstado(comercio);
  const fila = crear(esOtros ? 'div' : 'button', `panel-comercios__fila${esOtros ? ' panel-comercios__fila--inactiva' : ''}`);
  fila.setAttribute('data-testid', `fila-comercio-${comercio.id}`);
  fila.dataset.estado = comercio.estado;
  if (esOtros) {
    fila.setAttribute('aria-disabled', 'true');
  } else {
    fila.type = 'button';
  }
  const esActivo = comercio.operativo && comercio.id === activoId;
  if (esActivo) {
    fila.classList.add('panel-comercios__fila--activa');
    fila.setAttribute('aria-current', 'true');
  }

  fila.appendChild(crearAvatar(comercio, 'panel'));

  const cuerpo = crear('span', 'panel-comercios__cuerpo');
  const nombre = crear('span', 'panel-comercios__nombre');
  nombre.textContent = comercio.nombre;
  cuerpo.appendChild(nombre);
  const partes = [];
  if (SUBTITULO_ESTADO[comercio.estado]) {
    partes.push(SUBTITULO_ESTADO[comercio.estado]);
  }
  if (comercio.cantidadNotificacionesNoLeidas > 0) {
    partes.push(textoContador(comercio.cantidadNotificacionesNoLeidas));
  }
  if (partes.length > 0) {
    const sub = crear('span', 'panel-comercios__sub');
    sub.setAttribute('data-testid', `subtitulo-comercio-${comercio.id}`);
    sub.textContent = partes.join(' · ');
    cuerpo.appendChild(sub);
  }
  fila.appendChild(cuerpo);

  if (esActivo) {
    const tilde = crear('span', 'panel-comercios__tilde');
    tilde.setAttribute('data-testid', 'tilde-comercio-activo');
    tilde.setAttribute('role', 'img');
    tilde.setAttribute('aria-label', 'Comercio activo');
    tilde.appendChild(crearIcono('tilde'));
    fila.appendChild(tilde);
  } else if (!comercio.operativo) {
    const etiqueta = crear('span', `panel-comercios__etiqueta panel-comercios__etiqueta--${comercio.estado.toLowerCase().replace(/_/g, '-')}`);
    etiqueta.setAttribute('data-testid', `etiqueta-estado-comercio-${comercio.id}`);
    etiqueta.textContent = ETIQUETA_ESTADO[comercio.estado] || comercio.estado;
    fila.appendChild(etiqueta);
  }

  if (accionable) {
    fila.addEventListener('click', () => alElegir(comercio));
  }
  return fila;
}

function crearEsqueletoFila() {
  const fila = crear('div', 'panel-comercios__fila panel-comercios__fila--esqueleto');
  fila.appendChild(crear('span', 'skeleton selector-avatar selector-avatar--panel'));
  const cuerpo = crear('span', 'panel-comercios__cuerpo');
  const linea = crear('span', 'skeleton panel-comercios__esqueleto-linea');
  cuerpo.appendChild(linea);
  fila.appendChild(cuerpo);
  return fila;
}

function hayOperativoSinCuentaDeCobro(comercios) {
  return Boolean(comercios) && comercios.some((comercio) => comercio.operativo && comercio.estado === 'APROBADO');
}

function pintarLista(lista, comercios, alElegir) {
  lista.replaceChildren();
  lista.setAttribute('aria-busy', 'false');
  if (!comercios) {
    lista.setAttribute('aria-busy', 'true');
    for (let i = 0; i < FILAS_ESQUELETO; i += 1) {
      lista.appendChild(crearEsqueletoFila());
    }
    return;
  }
  const activoId = getComercioActivoId();
  GRUPOS.forEach((grupo) => {
    const miembros = comercios.filter(grupo.pertenece);
    if (grupo.ordenar) {
      miembros.sort(grupo.ordenar);
    }
    if (miembros.length === 0) {
      return;
    }
    const seccion = crear('section', 'panel-comercios__grupo');
    seccion.setAttribute('data-testid', `grupo-comercios-${grupo.clave}`);
    const titulo = crear('h3', 'panel-comercios__grupo-titulo');
    titulo.textContent = grupo.titulo;
    seccion.appendChild(titulo);
    miembros.forEach((comercio) => seccion.appendChild(crearFilaComercio(comercio, activoId, alElegir)));
    lista.appendChild(seccion);
  });
}

export function abrirPanelComercios() {
  if (document.getElementById(ID_PANEL)) {
    return;
  }
  const elementoPrevio = document.activeElement;
  const overflowPrevio = document.body.style.overflow;

  const backdrop = crear('div', 'modal-backdrop');
  backdrop.id = ID_PANEL;
  backdrop.setAttribute('data-testid', 'panel-comercios');

  const hoja = crear('div', 'product-modal-sheet panel-comercios');
  hoja.setAttribute('role', 'dialog');
  hoja.setAttribute('aria-modal', 'true');
  hoja.setAttribute('aria-labelledby', ID_TITULO_PANEL);

  const asa = crear('button', 'product-modal-sheet__handle');
  asa.type = 'button';
  asa.setAttribute('aria-label', 'Cerrar');
  asa.setAttribute('data-testid', 'btn-cerrar-panel-comercios');
  asa.appendChild(crear('span'));
  hoja.appendChild(asa);

  const titulo = crear('h2', 'panel-comercios__titulo');
  titulo.id = ID_TITULO_PANEL;
  titulo.textContent = 'Tus comercios';
  hoja.appendChild(titulo);

  const aviso = crear('div', 'banner banner-warning panel-comercios__aviso is-hidden');
  aviso.setAttribute('data-testid', 'aviso-vincular-mercadopago');
  const textoAviso = crear('span', 'panel-comercios__aviso-texto');
  textoAviso.textContent = 'Vinculá Mercado Pago para empezar a vender';
  const vincular = crear('button', 'btn btn-secondary banner__accion');
  vincular.type = 'button';
  vincular.textContent = 'Vincular cuenta';
  vincular.setAttribute('data-testid', 'btn-aviso-vincular-mercadopago');
  vincular.addEventListener('click', () => {
    window.location.href = RUTA_CUENTA_DE_COBRO;
  });
  aviso.appendChild(textoAviso);
  aviso.appendChild(vincular);
  hoja.appendChild(aviso);

  const lista = crear('div', 'panel-comercios__lista');
  lista.setAttribute('data-testid', 'lista-comercios');
  hoja.appendChild(lista);

  const pie = crear('div', 'panel-comercios__pie is-hidden');
  const agregar = crear('button', 'btn btn-primary panel-comercios__agregar');
  agregar.type = 'button';
  agregar.setAttribute('data-testid', 'btn-agregar-comercio');
  agregar.appendChild(crearIcono('mas'));
  const textoAgregar = crear('span');
  textoAgregar.textContent = 'Agregar comercio';
  agregar.appendChild(textoAgregar);
  agregar.addEventListener('click', () => {
    window.location.href = 'agregar-comercio.html';
  });
  pie.appendChild(agregar);
  hoja.appendChild(pie);

  backdrop.appendChild(hoja);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  function alElegir(comercio) {
    if (comercio.operativo) {
      activarComercio(comercio.id);
      window.location.href = RUTA_DASHBOARD;
      return;
    }
    window.location.href = rutaDeEstado(comercio);
  }

  const repintar = (comercios) => {
    pintarLista(lista, comercios, alElegir);
    aviso.classList.toggle('is-hidden', !hayOperativoSinCuentaDeCobro(comercios));
  };
  repintar(getComerciosEnMemoria());
  const desuscribir = suscribirComercios(repintar);
  refrescarComercios().catch(() => {
    if (!getComerciosEnMemoria()) {
      lista.replaceChildren();
      const error = crear('p', 'panel-comercios__error');
      error.setAttribute('data-testid', 'error-panel-comercios');
      error.textContent = 'No pudimos cargar tus comercios. Intentá nuevamente.';
      lista.appendChild(error);
    }
  });
  apiFetch('/comercios/alta-adicional/elegibilidad')
    .then((elegibilidad) => {
      if (elegibilidad && elegibilidad.elegible) {
        pie.classList.remove('is-hidden');
      }
    })
    .catch(() => {});

  function cerrar() {
    desuscribir();
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

  document.addEventListener('keydown', alTeclear);
  backdrop.addEventListener('click', (evento) => {
    if (evento.target === backdrop) {
      cerrar();
    }
  });
  asa.addEventListener('click', cerrar);
  asa.focus();
}

export function enlazarMantenerApretado(elemento, alDisparar) {
  let temporizador = null;
  let origenX = 0;
  let origenY = 0;
  let suprimirClick = false;
  let liberarSupresion = null;

  function cancelar() {
    if (temporizador !== null) {
      window.clearTimeout(temporizador);
      temporizador = null;
    }
  }

  elemento.addEventListener('pointerdown', (evento) => {
    if (evento.pointerType !== 'touch') {
      return;
    }
    suprimirClick = false;
    if (liberarSupresion !== null) {
      window.clearTimeout(liberarSupresion);
      liberarSupresion = null;
    }
    origenX = evento.clientX;
    origenY = evento.clientY;
    cancelar();
    temporizador = window.setTimeout(() => {
      temporizador = null;
      suprimirClick = true;
      liberarSupresion = window.setTimeout(() => {
        suprimirClick = false;
        liberarSupresion = null;
      }, 1000);
      alDisparar();
    }, DURACION_MANTENER_APRETADO_MS);
  });

  elemento.addEventListener('pointermove', (evento) => {
    if (temporizador === null) {
      return;
    }
    if (Math.hypot(evento.clientX - origenX, evento.clientY - origenY) > TOLERANCIA_MOVIMIENTO_PX) {
      cancelar();
    }
  });

  elemento.addEventListener('pointerup', cancelar);
  elemento.addEventListener('pointercancel', cancelar);

  elemento.addEventListener('click', (evento) => {
    if (suprimirClick) {
      suprimirClick = false;
      evento.preventDefault();
      evento.stopPropagation();
    }
  }, true);

  elemento.addEventListener('contextmenu', (evento) => evento.preventDefault());
}

export async function prepararPaginaDueno({ slotFranja = null } = {}) {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'DUENO') {
    window.location.href = 'login.html';
    return null;
  }
  if (slotFranja) {
    montarFranjaComercio(slotFranja);
  }
  const destino = await resolverComercioActivo();
  if (destino.tipo !== 'operativo') {
    window.location.href = destinoDeNavegacion(destino);
    return null;
  }
  if (slotFranja) {
    iniciarPollingComercios();
  }
  return destino.comercio;
}
