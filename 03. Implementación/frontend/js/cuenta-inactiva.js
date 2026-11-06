import { apiFetch, ApiError } from './api.js';
import { atraparFoco } from './documentos-comun.js';
import { normalizarCampos } from './validators.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ID_PANTALLA = 'pantalla-cuenta-inactiva';
const MENSAJE_ERROR_POR_DEFECTO = 'No pudimos reactivar tu cuenta. Probá de nuevo.';

function crear(etiqueta, clase, atributos = {}) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  Object.entries(atributos).forEach(([nombre, valor]) => elemento.setAttribute(nombre, valor));
  return elemento;
}

function crearTexto(etiqueta, clase, texto, atributos = {}) {
  const elemento = crear(etiqueta, clase, atributos);
  elemento.textContent = texto;
  return elemento;
}

function iconoPausa() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  [['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]
    .forEach(([nombre, valor]) => svg.setAttribute(nombre, valor));
  const circulo = document.createElementNS(SVG_NS, 'circle');
  [['cx', '12'], ['cy', '12'], ['r', '10']].forEach(([nombre, valor]) => circulo.setAttribute(nombre, valor));
  const izquierda = document.createElementNS(SVG_NS, 'line');
  [['x1', '10'], ['y1', '9'], ['x2', '10'], ['y2', '15']].forEach(([nombre, valor]) => izquierda.setAttribute(nombre, valor));
  const derecha = document.createElementNS(SVG_NS, 'line');
  [['x1', '14'], ['y1', '9'], ['x2', '14'], ['y2', '15']].forEach(([nombre, valor]) => derecha.setAttribute(nombre, valor));
  svg.append(circulo, izquierda, derecha);
  return svg;
}

function textoDeComercio(comercio) {
  normalizarCampos(comercio, ['nombre']);
  return comercio.resultado === 'VUELVE'
    ? `${comercio.nombre} vuelve a estar disponible.`
    : `${comercio.nombre} sigue suspendido. Si creés que es un error, escribinos.`;
}

function seccionDeComercios(comercios) {
  const lista = crear('ul', 'suspension-que-pasa__lista');
  comercios.forEach((comercio) => {
    const vuelve = comercio.resultado === 'VUELVE';
    lista.appendChild(crearTexto('li', '', textoDeComercio(comercio), {
      'data-testid': `${vuelve ? 'comercio-vuelve' : 'comercio-sigue-suspendido'}-${comercio.comercioId}`,
    }));
  });
  const seccion = crear('section', 'suspension-que-pasa', { 'aria-labelledby': 'cuenta-inactiva-comercios-titulo', 'data-testid': 'comercios-cuenta-inactiva' });
  seccion.append(crearTexto('h2', 'suspension-que-pasa__titulo', 'Tus comercios', { id: 'cuenta-inactiva-comercios-titulo' }), lista);
  return seccion;
}

export function mostrarPantallaCuentaInactiva({ nombreUsuario, password, comercios = [], alReactivar, alVolver }) {
  if (document.getElementById(ID_PANTALLA)) {
    return;
  }
  let credenciales = { nombreUsuario, password };
  let ocupado = false;
  let cerrada = false;

  const icono = crear('div', 'suspension-pantalla__icono');
  icono.appendChild(iconoPausa());
  const titulo = crearTexto('h1', 'suspension-pantalla__titulo', 'Tu cuenta está inactiva', { id: 'pantalla-cuenta-inactiva-titulo', 'data-testid': 'titulo-cuenta-inactiva' });
  const texto = crearTexto('p', 'subtitle', 'Pasaron más de 3 meses sin que ingresaras, así que la dejamos en pausa. Tus datos y tus pedidos están a salvo.', { 'data-testid': 'texto-cuenta-inactiva' });
  texto.style.marginBottom = '20px';

  const errorSlot = crear('div', 'cuenta-inactiva__error', { role: 'alert', tabindex: '-1', 'data-testid': 'error-reactivar-cuenta' });
  errorSlot.hidden = true;
  const estado = crear('p', 'is-hidden', { role: 'status', 'aria-live': 'polite', 'data-testid': 'estado-reactivar-cuenta' });

  const acciones = crear('div', 'suspension-acciones', { 'data-testid': 'acciones-cuenta-inactiva' });
  const reactivar = crearTexto('button', 'btn btn-primary', 'Reactivar mi cuenta', { type: 'button', 'data-testid': 'btn-reactivar-cuenta-inactiva' });
  const soporte = crearTexto('a', 'btn btn-secondary', 'Contactar a Soporte', { href: 'soporte.html?tipo=NO_PUEDO_ENTRAR', 'data-testid': 'btn-soporte-cuenta-inactiva' });
  const volver = crearTexto('button', 'btn btn-tertiary', 'Volver a ingresar', { type: 'button', 'data-testid': 'btn-volver-a-ingresar' });
  acciones.append(reactivar, soporte, volver);

  const contenido = crear('div', 'suspension-pantalla__contenido');
  contenido.append(icono, titulo, texto);
  if (comercios.length > 0) contenido.appendChild(seccionDeComercios(comercios));
  contenido.append(errorSlot, estado, acciones);

  const pantalla = crear('div', 'pantalla-completa suspension-pantalla', {
    id: ID_PANTALLA,
    role: 'alertdialog',
    'aria-modal': 'true',
    'aria-labelledby': 'pantalla-cuenta-inactiva-titulo',
    'data-testid': 'pantalla-cuenta-inactiva',
  });
  pantalla.appendChild(contenido);
  document.body.appendChild(pantalla);
  const overflowPrevio = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  reactivar.focus();

  function descartarCredenciales() {
    credenciales = null;
  }

  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    descartarCredenciales();
    quitarAtrapaFoco();
    window.removeEventListener('pagehide', descartarCredenciales);
    pantalla.remove();
    document.body.style.overflow = overflowPrevio;
  }

  function salir() {
    if (ocupado) return;
    cerrar();
    if (alVolver) alVolver();
  }

  const quitarAtrapaFoco = atraparFoco(pantalla, salir, () => ocupado);
  window.addEventListener('pagehide', descartarCredenciales);

  function mostrarError(mensaje) {
    errorSlot.textContent = mensaje;
    errorSlot.hidden = false;
    errorSlot.focus();
  }

  function ponerOcupado(valor) {
    ocupado = valor;
    reactivar.disabled = valor;
    volver.disabled = valor;
    soporte.setAttribute('aria-disabled', String(valor));
    soporte.tabIndex = valor ? -1 : 0;
    reactivar.textContent = valor ? 'Reactivando…' : 'Reactivar mi cuenta';
    estado.textContent = valor ? 'Reactivando tu cuenta…' : '';
  }

  soporte.addEventListener('click', (evento) => {
    if (ocupado) evento.preventDefault();
  });
  volver.addEventListener('click', salir);

  reactivar.addEventListener('click', async () => {
    if (ocupado || !credenciales) return;
    errorSlot.hidden = true;
    errorSlot.textContent = '';
    ponerOcupado(true);
    let data;
    try {
      data = await apiFetch('/auth/reactivar-cuenta/con-credenciales', {
        method: 'POST',
        auth: false,
        body: { nombreUsuario: credenciales.nombreUsuario, password: credenciales.password },
        handle5xxGlobally: false,
        handleRedGlobally: false,
      });
    } catch (error) {
      ponerOcupado(false);
      mostrarError(error instanceof ApiError && error.message ? error.message : MENSAJE_ERROR_POR_DEFECTO);
      return;
    }
    ocupado = false;
    cerrar();
    await alReactivar(data);
  });
}
