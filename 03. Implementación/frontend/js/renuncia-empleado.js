import { apiFetch, ApiError, completarRenuncia } from './api.js';
import { h } from './form-utils.js';

const ID_HOJA = 'hoja-renuncia-empleado';
const MENSAJE_SIN_CONEXION = 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.';
const MENSAJE_ERROR_GENERICO = 'No pudimos procesar tu salida del equipo. Intentá de nuevo.';
const MENSAJE_NO_DISPONIBLE = 'No encontramos este comercio entre los tuyos. Es posible que ya no formes parte del equipo.';
const OPCIONES_RED = { handle5xxGlobally: false, handleRedGlobally: false };

function mensajeDeRenuncia(error) {
  if (!(error instanceof ApiError)) {
    return MENSAJE_ERROR_GENERICO;
  }
  if (error.status === 0) {
    return MENSAJE_SIN_CONEXION;
  }
  if (error.status === 404) {
    return MENSAJE_NO_DISPONIBLE;
  }
  if (error.status === 409 && error.message) {
    return error.message;
  }
  return MENSAJE_ERROR_GENERICO;
}

export function abrirHojaRenuncia(comercio) {
  if (document.getElementById(ID_HOJA)) {
    return;
  }
  const overflowPrevio = document.body.style.overflow;
  const backdrop = h('div', { class: 'modal-backdrop', id: ID_HOJA, 'data-testid': ID_HOJA });
  const hoja = h('div', { class: 'modal-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${ID_HOJA}-titulo` });

  const titulo = h('h2', { class: 'modal-sheet__title', id: `${ID_HOJA}-titulo`, 'data-testid': 'titulo-renuncia' });
  titulo.textContent = `¿Dejar de trabajar en ${comercio.nombre}?`;

  const texto = h('p', { class: 'modal-sheet__text', 'data-testid': 'texto-renuncia' });
  texto.textContent = 'Vas a salir del equipo y no vas a poder volver a operar en este comercio. Se le notificará al dueño. Tu cuenta y tus datos personales continuarán intactos.';

  const casilla = h('input', { type: 'checkbox', id: 'renuncia-entiendo', 'data-testid': 'check-renuncia-entiendo' });
  const etiqueta = h('label', { for: 'renuncia-entiendo' });
  etiqueta.textContent = 'Entiendo que para volver el dueño me tiene que invitar de nuevo.';
  const fila = h('div', { class: 'checkbox-row renuncia-hoja__casilla' }, [casilla, etiqueta]);

  const aviso = h('p', { class: 'renuncia-hoja__error is-hidden', role: 'alert', 'data-testid': 'error-renuncia' });

  const confirmar = h('button', { class: 'btn btn-primary renuncia-hoja__peligro', type: 'button', 'data-testid': 'btn-confirmar-renuncia' });
  confirmar.textContent = 'Dejar de trabajar';
  confirmar.disabled = true;
  const volver = h('button', { class: 'btn btn-tertiary', type: 'button', 'data-testid': 'btn-volver-renuncia' });
  volver.textContent = 'Volver';

  hoja.append(titulo, texto, fila, aviso, confirmar, volver);
  backdrop.append(hoja);
  document.body.append(backdrop);
  document.body.style.overflow = 'hidden';
  casilla.focus();

  let ocupado = false;

  function cerrar() {
    document.removeEventListener('keydown', alTeclear);
    document.body.style.overflow = overflowPrevio;
    backdrop.remove();
  }

  function alTeclear(evento) {
    if (evento.key === 'Escape' && !ocupado) {
      cerrar();
    }
  }

  function ocultarError() {
    aviso.textContent = '';
    aviso.classList.add('is-hidden');
  }

  casilla.addEventListener('change', () => {
    confirmar.disabled = ocupado || !casilla.checked;
    ocultarError();
  });

  volver.addEventListener('click', () => {
    if (!ocupado) {
      cerrar();
    }
  });

  backdrop.addEventListener('click', (evento) => {
    if (evento.target === backdrop && !ocupado) {
      cerrar();
    }
  });

  confirmar.addEventListener('click', async () => {
    if (ocupado || !casilla.checked) {
      return;
    }
    ocupado = true;
    confirmar.disabled = true;
    volver.disabled = true;
    casilla.disabled = true;
    confirmar.textContent = 'Saliendo...';
    ocultarError();
    try {
      await apiFetch(`/empleados/comercios/${comercio.id}/renunciar`, { ...OPCIONES_RED, method: 'PUT' });
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflowPrevio;
      completarRenuncia(comercio.id, comercio.nombre);
    } catch (error) {
      ocupado = false;
      casilla.disabled = false;
      volver.disabled = false;
      confirmar.disabled = !casilla.checked;
      confirmar.textContent = 'Dejar de trabajar';
      aviso.textContent = mensajeDeRenuncia(error);
      aviso.classList.remove('is-hidden');
    }
  });

  document.addEventListener('keydown', alTeclear);
}
