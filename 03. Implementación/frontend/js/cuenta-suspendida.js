const SVG_NS = 'http://www.w3.org/2000/svg';
const ID_HOJA = 'hoja-cuenta-suspendida';
const ID_PANTALLA = 'pantalla-cuenta-suspendida';

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

function iconoCandado() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  [['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]
    .forEach(([nombre, valor]) => svg.setAttribute(nombre, valor));
  const cuerpo = document.createElementNS(SVG_NS, 'rect');
  [['x', '3'], ['y', '11'], ['width', '18'], ['height', '11'], ['rx', '2']].forEach(([nombre, valor]) => cuerpo.setAttribute(nombre, valor));
  const arco = document.createElementNS(SVG_NS, 'path');
  arco.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
  svg.append(cuerpo, arco);
  return svg;
}

function cajaMotivo(motivo, testid) {
  if (!motivo) return null;
  const caja = crear('div', 'suspension-motivo', { 'data-testid': testid });
  caja.append(crearTexto('span', 'suspension-motivo__etiqueta', 'Motivo'), crearTexto('p', 'suspension-motivo__texto', motivo));
  return caja;
}

function atraparFoco(contenedor, alEscape) {
  function alTeclear(evento) {
    if (evento.key === 'Escape' && alEscape) {
      evento.stopPropagation();
      alEscape();
      return;
    }
    if (evento.key !== 'Tab') return;
    const enfocables = Array.from(contenedor.querySelectorAll('button, a[href], input, select, textarea'))
      .filter((elemento) => !elemento.disabled && elemento.tabIndex >= 0);
    if (enfocables.length === 0) {
      evento.preventDefault();
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
    } else if (!contenedor.contains(document.activeElement)) {
      evento.preventDefault();
      primero.focus();
    }
  }
  document.addEventListener('keydown', alTeclear, true);
  return () => document.removeEventListener('keydown', alTeclear, true);
}

export function abrirHojaCuentaSuspendida({ motivo, alCerrar = null }) {
  if (document.getElementById(ID_HOJA)) {
    return;
  }
  const icono = crear('div', 'modal-sheet__icon');
  icono.appendChild(iconoCandado());
  const titulo = crearTexto('h2', 'modal-sheet__title', 'Cuenta suspendida', { id: 'hoja-cuenta-suspendida-titulo', 'data-testid': 'titulo-cuenta-suspendida' });
  const caja = cajaMotivo(motivo, 'motivo-cuenta-suspendida');
  const acciones = crear('div', 'suspension-acciones', { 'data-testid': 'acciones-cuenta-suspendida' });
  const cerrar = crearTexto('button', 'btn btn-primary', 'Cerrar', { type: 'button', 'data-testid': 'btn-cerrar-cuenta-suspendida' });
  acciones.appendChild(cerrar);
  const hoja = crear('div', 'modal-sheet', { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'hoja-cuenta-suspendida-titulo' });
  hoja.append(icono, titulo);
  if (caja) hoja.appendChild(caja);
  hoja.appendChild(acciones);
  const fondo = crear('div', 'modal-backdrop', { id: ID_HOJA, 'data-testid': 'hoja-cuenta-suspendida' });
  fondo.appendChild(hoja);
  document.body.appendChild(fondo);
  cerrar.focus();

  const quitarAtrapaFoco = atraparFoco(hoja, cerrarHoja);

  function cerrarHoja() {
    quitarAtrapaFoco();
    fondo.remove();
    if (alCerrar) alCerrar();
  }

  cerrar.addEventListener('click', cerrarHoja);
}

export function mostrarPantallaCuentaSuspendida({ motivo, alCerrarSesion }) {
  if (document.getElementById(ID_PANTALLA)) {
    return;
  }
  const icono = crear('div', 'suspension-pantalla__icono');
  icono.appendChild(iconoCandado());
  const titulo = crearTexto('h1', 'suspension-pantalla__titulo', 'Tu cuenta fue suspendida', { id: 'pantalla-cuenta-suspendida-titulo', 'data-testid': 'titulo-sesion-suspendida' });
  const caja = cajaMotivo(motivo, 'motivo-sesion-suspendida');

  const lista = crear('ul', 'suspension-que-pasa__lista');
  lista.append(
    crearTexto('li', '', 'Tus pedidos ya pagados siguen su curso.', { 'data-testid': 'que-pasa-pedidos-pagados' }),
    crearTexto('li', '', 'No podés hacer pedidos nuevos.', { 'data-testid': 'que-pasa-pedidos-nuevos' }),
  );
  const queSePasa = crear('section', 'suspension-que-pasa', { 'aria-labelledby': 'suspension-que-pasa-titulo', 'data-testid': 'que-pasa-ahora' });
  queSePasa.append(crearTexto('h2', 'suspension-que-pasa__titulo', 'Qué pasa ahora', { id: 'suspension-que-pasa-titulo' }), lista);

  const acciones = crear('div', 'suspension-acciones', { 'data-testid': 'acciones-sesion-suspendida' });
  const cerrarSesion = crearTexto('button', 'btn btn-primary', 'Cerrar sesión', { type: 'button', 'data-testid': 'btn-cerrar-sesion-suspendida' });
  acciones.appendChild(cerrarSesion);

  const contenido = crear('div', 'suspension-pantalla__contenido');
  contenido.append(icono, titulo);
  if (caja) contenido.appendChild(caja);
  contenido.append(queSePasa, acciones);

  const pantalla = crear('div', 'pantalla-completa suspension-pantalla', {
    id: ID_PANTALLA,
    role: 'alertdialog',
    'aria-modal': 'true',
    'aria-labelledby': 'pantalla-cuenta-suspendida-titulo',
    'data-testid': 'pantalla-sesion-suspendida',
  });
  pantalla.appendChild(contenido);
  document.body.appendChild(pantalla);
  document.body.style.overflow = 'hidden';
  cerrarSesion.focus();
  atraparFoco(pantalla, null);
  cerrarSesion.addEventListener('click', () => {
    cerrarSesion.disabled = true;
    alCerrarSesion();
  });
}
