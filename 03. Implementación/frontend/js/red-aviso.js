const FALLOS_PARA_MOSTRAR_FRANJA = 2;
const TEXTO_FRANJA = 'Sin conexión · reintentando…';
const TEXTO_AVISO_RED = 'Sin conexión. No perdiste nada: tus datos siguen acá.';
const TEXTO_AVISO_SERVIDOR = 'Algo falló de nuestro lado. No perdiste nada: tus datos siguen acá.';

export class FalloRecuperable extends Error {
  constructor(tipo) {
    super(tipo);
    this.tipo = tipo;
  }
}

let fallosSeguidos = 0;
let franja = null;
let aviso = null;
let textoAviso = null;
let botonReintentar = null;
const pendientes = [];

function crear(tag, className) {
  const nodo = document.createElement(tag);
  if (className) {
    nodo.className = className;
  }
  return nodo;
}

function insertarFranja(nodo) {
  const slot = document.getElementById('top-bar-slot');
  if (slot) {
    slot.insertAdjacentElement('afterend', nodo);
    return;
  }
  const shell = document.querySelector('.app-shell');
  if (shell) {
    shell.prepend(nodo);
    return;
  }
  document.body.prepend(nodo);
}

function mostrarFranja() {
  if (franja && document.contains(franja)) {
    return;
  }
  franja = crear('div', 'franja-sin-conexion');
  franja.setAttribute('role', 'status');
  franja.setAttribute('aria-live', 'polite');
  franja.setAttribute('data-testid', 'franja-sin-conexion');
  franja.textContent = TEXTO_FRANJA;
  insertarFranja(franja);
}

function ocultarFranja() {
  if (franja) {
    franja.remove();
    franja = null;
  }
}

export function registrarFalloSegundoPlano() {
  fallosSeguidos += 1;
  if (fallosSeguidos >= FALLOS_PARA_MOSTRAR_FRANJA) {
    mostrarFranja();
  }
}

export function registrarExitoSegundoPlano() {
  fallosSeguidos = 0;
  ocultarFranja();
}

function textoPara(tipo) {
  return tipo === 'servidor' ? TEXTO_AVISO_SERVIDOR : TEXTO_AVISO_RED;
}

function construirAviso() {
  aviso = crear('div', 'aviso-red');
  aviso.setAttribute('role', 'alert');
  aviso.setAttribute('data-testid', 'aviso-red');
  textoAviso = crear('p', 'aviso-red__texto');
  textoAviso.setAttribute('data-testid', 'aviso-red-texto');
  botonReintentar = crear('button', 'aviso-red__reintentar');
  botonReintentar.type = 'button';
  botonReintentar.textContent = 'Reintentar';
  botonReintentar.setAttribute('data-testid', 'btn-reintentar-red');
  botonReintentar.addEventListener('click', reintentarTodo);
  aviso.append(textoAviso, botonReintentar);
  document.body.appendChild(aviso);
}

function quitarAvisoSiNoHayPendientes() {
  if (pendientes.length === 0 && aviso) {
    aviso.remove();
    aviso = null;
    textoAviso = null;
    botonReintentar = null;
  }
}

async function reintentarTodo() {
  if (!botonReintentar) {
    return;
  }
  botonReintentar.disabled = true;
  botonReintentar.textContent = 'Reintentando…';
  const lote = pendientes.splice(0, pendientes.length);
  await Promise.all(lote.map(async (pendiente) => {
    try {
      const resultado = await pendiente.reintentar();
      pendiente.resolver(resultado);
    } catch (error) {
      if (error instanceof FalloRecuperable) {
        pendiente.tipo = error.tipo;
        pendientes.push(pendiente);
      } else {
        pendiente.rechazar(error);
      }
    }
  }));
  if (pendientes.length > 0 && botonReintentar) {
    textoAviso.textContent = textoPara(pendientes[pendientes.length - 1].tipo);
    botonReintentar.disabled = false;
    botonReintentar.textContent = 'Reintentar';
    botonReintentar.focus();
  }
  quitarAvisoSiNoHayPendientes();
}

let avisoTimeout = null;

export function cerrarAvisoTimeout() {
  if (!avisoTimeout) {
    return;
  }
  const { nodo, previo } = avisoTimeout;
  nodo.remove();
  avisoTimeout = null;
  if (previo && document.contains(previo) && typeof previo.focus === 'function') {
    previo.focus();
  }
}

export function mostrarAvisoTimeout({ texto, enlace }) {
  cerrarAvisoTimeout();
  const previo = document.activeElement;
  const nodo = crear('div', 'aviso-red aviso-red--timeout');
  nodo.setAttribute('role', 'alert');
  nodo.setAttribute('data-testid', 'aviso-timeout');
  const cuerpo = crear('div', 'aviso-red__cuerpo');
  const titulo = crear('p', 'aviso-red__titulo');
  titulo.textContent = 'Se cortó la conexión.';
  titulo.setAttribute('data-testid', 'aviso-timeout-titulo');
  const detalle = crear('p', 'aviso-red__texto');
  detalle.setAttribute('data-testid', 'aviso-timeout-texto');
  detalle.append('Puede que ya se haya enviado: revisá ');
  if (enlace) {
    const ancla = crear('a', 'aviso-red__enlace');
    ancla.href = enlace;
    ancla.target = '_blank';
    ancla.rel = 'noopener';
    ancla.textContent = texto;
    ancla.setAttribute('data-testid', 'aviso-timeout-enlace');
    detalle.append(ancla);
  } else {
    detalle.append(texto);
  }
  detalle.append(' antes de volver a enviar.');
  cuerpo.append(titulo, detalle);
  const cerrar = crear('button', 'aviso-red__reintentar');
  cerrar.type = 'button';
  cerrar.textContent = 'Cerrar';
  cerrar.setAttribute('data-testid', 'btn-cerrar-aviso-timeout');
  cerrar.addEventListener('click', cerrarAvisoTimeout);
  nodo.append(cuerpo, cerrar);
  document.body.appendChild(nodo);
  avisoTimeout = { nodo, previo };
}

export function esperarReintento(reintentar, tipo) {
  return new Promise((resolver, rechazar) => {
    pendientes.push({ reintentar, resolver, rechazar, tipo });
    if (!aviso || !document.contains(aviso)) {
      construirAviso();
    }
    textoAviso.textContent = textoPara(tipo);
  });
}
