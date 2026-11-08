let contador = 0;

const SELECTOR_FOCO = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function crear(tag, className) {
  const nodo = document.createElement(tag);
  if (className) {
    nodo.className = className;
  }
  return nodo;
}

function claseDeVariante(variante) {
  if (variante === 'peligro') {
    return 'btn hoja__accion hoja__accion--peligro';
  }
  if (variante === 'primaria') {
    return 'btn btn-primary hoja__accion';
  }
  return 'btn btn-secondary hoja__accion hoja__accion--segura';
}

export function abrirHoja({ titulo, texto, parrafos = [], acciones, testid = 'hoja', disparador: disparadorExplicito = null }) {
  contador += 1;
  const idTitulo = `hoja-titulo-${contador}`;
  const idTexto = `hoja-texto-${contador}`;
  const disparador = disparadorExplicito || document.activeElement;
  const overflowPrevio = document.body.style.overflow;

  const fondo = crear('div', 'modal-backdrop');
  fondo.setAttribute('data-testid', testid);
  const hoja = crear('div', 'modal-sheet hoja');
  hoja.setAttribute('role', 'dialog');
  hoja.setAttribute('aria-modal', 'true');
  hoja.setAttribute('aria-labelledby', idTitulo);
  hoja.setAttribute('aria-describedby', idTexto);

  const tituloEl = crear('h2', 'modal-sheet__title');
  tituloEl.id = idTitulo;
  tituloEl.setAttribute('data-testid', `${testid}-titulo`);
  tituloEl.textContent = titulo;

  const cuerpo = crear('div', 'hoja__texto');
  cuerpo.id = idTexto;
  const lineas = texto ? [texto, ...parrafos] : parrafos;
  lineas.forEach((linea, indice) => {
    const p = crear('p', 'modal-sheet__text hoja__parrafo');
    p.setAttribute('data-testid', `${testid}-texto-${indice + 1}`);
    p.textContent = linea;
    cuerpo.appendChild(p);
  });

  const error = crear('p', 'hoja__error is-hidden');
  error.setAttribute('role', 'alert');
  error.setAttribute('data-testid', `${testid}-error`);

  const contenedorAcciones = crear('div', 'hoja__acciones');
  let ocupada = false;
  let cerrada = false;
  let botonInicial = null;
  const botones = [];

  function cerrar() {
    if (cerrada) {
      return;
    }
    cerrada = true;
    document.removeEventListener('keydown', alTeclear, true);
    fondo.remove();
    document.body.style.overflow = overflowPrevio;
    if (disparador && typeof disparador.focus === 'function' && document.contains(disparador)) {
      disparador.focus();
    }
  }

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.classList.remove('is-hidden');
  }

  function limpiarError() {
    error.textContent = '';
    error.classList.add('is-hidden');
  }

  function fijarOcupada(valor) {
    ocupada = valor;
    botones.forEach(({ boton }) => {
      boton.disabled = valor;
    });
    hoja.setAttribute('aria-busy', String(valor));
  }

  acciones.forEach((accion) => {
    const boton = crear('button', claseDeVariante(accion.variante));
    boton.type = 'button';
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
        cerrar();
        return;
      }
      limpiarError();
      fijarOcupada(true);
      boton.textContent = accion.etiquetaEnviando || 'Enviando…';
      try {
        await accion.alPulsar({ mostrarError, cerrar });
        cerrar();
      } catch (fallo) {
        fijarOcupada(false);
        boton.textContent = accion.etiqueta;
        mostrarError(fallo && fallo.message ? fallo.message : 'No pudimos completar la acción. Probá de nuevo.');
        boton.focus();
      }
    });
    contenedorAcciones.appendChild(boton);
  });

  function alTeclear(evento) {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      if (!ocupada) {
        cerrar();
      }
      return;
    }
    if (evento.key !== 'Tab') {
      return;
    }
    const enfocables = [...hoja.querySelectorAll(SELECTOR_FOCO)];
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
    if (evento.target === fondo && !ocupada) {
      cerrar();
    }
  });
  document.addEventListener('keydown', alTeclear, true);

  hoja.append(tituloEl, cuerpo, error, contenedorAcciones);
  fondo.appendChild(hoja);
  document.body.appendChild(fondo);
  document.body.style.overflow = 'hidden';
  (botonInicial || botones[botones.length - 1].boton).focus();

  return { cerrar, mostrarError, limpiarError };
}
