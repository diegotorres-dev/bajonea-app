import { ApiError } from './api.js';
import { showToast } from './catalogo.js';
import { getComercioActivoEnMemoria, refrescarComercios, suscribirComercios } from './comercio-activo.js';
import { abrirComercio, cerrarComercio, modoSwitchCierre, tieneCierre } from './apertura-comercio.js';

const ID_TITULO = 'cierre-comercio-titulo';
const ID_SUBTITULO = 'cierre-comercio-subtitulo';
const ID_TITULO_MODAL = 'cierre-comercio-modal-titulo';
const MENSAJE_ERROR_GENERICO = 'No pudimos actualizar el estado. Probá de nuevo.';

const TEXTOS_POR_MODO = {
  ABIERTO: { titulo: 'Recibiendo pedidos', subtitulo: () => 'Pausalo cuando quieras dentro de tu horario', encendido: true },
  PAUSADO: { titulo: 'Pedidos pausados', subtitulo: (comercio) => comercio.textoReapertura || '', encendido: false },
  FUERA_DE_HORARIO: { titulo: 'Fuera de horario', subtitulo: () => 'Podés pausar dentro de tu horario', encendido: false },
};

function crear(tag, className) {
  const nodo = document.createElement(tag);
  if (className) {
    nodo.className = className;
  }
  return nodo;
}

function crearEsqueleto() {
  const tarjeta = crear('div', 'cierre-card cierre-card--cargando');
  tarjeta.setAttribute('data-testid', 'tarjeta-cierre-comercio-cargando');
  tarjeta.setAttribute('aria-busy', 'true');
  const texto = crear('div', 'cierre-card__texto');
  texto.appendChild(crear('span', 'skeleton cierre-card__esqueleto-titulo'));
  texto.appendChild(crear('span', 'skeleton cierre-card__esqueleto-subtitulo'));
  tarjeta.appendChild(texto);
  tarjeta.appendChild(crear('span', 'skeleton cierre-card__esqueleto-switch'));
  return tarjeta;
}

function pedirConfirmacionCierre(disparador) {
  return new Promise((resolver) => {
    const backdrop = crear('div', 'modal-backdrop');
    backdrop.setAttribute('data-testid', 'modal-cierre-comercio');
    const hoja = crear('div', 'modal-sheet');
    hoja.setAttribute('role', 'dialog');
    hoja.setAttribute('aria-modal', 'true');
    hoja.setAttribute('aria-labelledby', ID_TITULO_MODAL);

    const titulo = crear('h2', 'modal-sheet__title');
    titulo.id = ID_TITULO_MODAL;
    titulo.textContent = '¿Dejar de recibir pedidos?';
    const texto = crear('p', 'modal-sheet__text');
    texto.textContent = 'Los pedidos en curso siguen su camino.';
    const confirmar = crear('button', 'btn btn-primary cierre-modal__confirmar');
    confirmar.type = 'button';
    confirmar.textContent = 'Cerrar';
    confirmar.setAttribute('data-testid', 'btn-confirmar-cierre-comercio');
    const cancelar = crear('button', 'btn btn-tertiary');
    cancelar.type = 'button';
    cancelar.textContent = 'Cancelar';
    cancelar.setAttribute('data-testid', 'btn-cancelar-cierre-comercio');

    hoja.append(titulo, texto, confirmar, cancelar);
    backdrop.appendChild(hoja);
    document.body.appendChild(backdrop);
    cancelar.focus();

    function terminar(resultado) {
      document.removeEventListener('keydown', alTeclear);
      backdrop.remove();
      if (disparador && document.contains(disparador)) {
        disparador.focus();
      }
      resolver(resultado);
    }

    function alTeclear(evento) {
      if (evento.key === 'Escape') {
        terminar(false);
      }
    }

    document.addEventListener('keydown', alTeclear);
    backdrop.addEventListener('click', (evento) => {
      if (evento.target === backdrop) {
        terminar(false);
      }
    });
    cancelar.addEventListener('click', () => terminar(false));
    confirmar.addEventListener('click', () => terminar(true));
  });
}

export function montarSwitchCierre(slot) {
  slot.replaceChildren(crearEsqueleto());

  let construido = false;
  let ocupado = false;
  let tarjeta = null;
  let tituloEl = null;
  let subtituloEl = null;
  let boton = null;

  function construir() {
    tarjeta = crear('div', 'cierre-card');
    tarjeta.setAttribute('data-testid', 'tarjeta-cierre-comercio');
    const texto = crear('div', 'cierre-card__texto');
    tituloEl = crear('p', 'cierre-card__titulo');
    tituloEl.id = ID_TITULO;
    tituloEl.setAttribute('data-testid', 'titulo-cierre-comercio');
    subtituloEl = crear('p', 'cierre-card__subtitulo');
    subtituloEl.id = ID_SUBTITULO;
    subtituloEl.setAttribute('data-testid', 'subtitulo-cierre-comercio');
    texto.append(tituloEl, subtituloEl);

    boton = crear('button', 'cierre-switch');
    boton.type = 'button';
    boton.setAttribute('role', 'switch');
    boton.setAttribute('aria-labelledby', ID_TITULO);
    boton.setAttribute('aria-describedby', ID_SUBTITULO);
    boton.setAttribute('data-testid', 'switch-cierre-comercio');
    boton.appendChild(crear('span', 'cierre-switch__perilla'));
    boton.addEventListener('click', alternar);

    tarjeta.append(texto, boton);
    slot.replaceChildren(tarjeta);
    construido = true;
  }

  function actualizar() {
    const activo = getComercioActivoEnMemoria();
    if (!activo) {
      return;
    }
    if (!tieneCierre(activo)) {
      if (construido || slot.firstChild) {
        slot.replaceChildren();
        construido = false;
      }
      return;
    }
    if (!construido) {
      construir();
    }
    const modo = modoSwitchCierre(activo);
    const textos = TEXTOS_POR_MODO[modo];
    const bloqueado = !activo.puedeCambiarCierre;
    const subtitulo = textos.subtitulo(activo);
    tarjeta.dataset.estado = modo;
    tarjeta.classList.toggle('cierre-card--bloqueado', bloqueado);
    tituloEl.textContent = textos.titulo;
    subtituloEl.textContent = subtitulo;
    subtituloEl.hidden = subtitulo === '';
    boton.setAttribute('aria-checked', String(textos.encendido));
    boton.disabled = bloqueado;
  }

  async function ejecutar(accion) {
    try {
      await accion();
      await refrescarComercios();
    } catch (error) {
      const mensaje = error instanceof ApiError && error.status === 409 && error.message ? error.message : MENSAJE_ERROR_GENERICO;
      showToast(mensaje, 'error');
      await refrescarComercios().catch(() => {});
    }
  }

  async function alternar() {
    if (ocupado || boton.disabled) {
      return;
    }
    const activo = getComercioActivoEnMemoria();
    if (!activo || !tieneCierre(activo)) {
      return;
    }
    const modo = modoSwitchCierre(activo);
    if (modo === 'FUERA_DE_HORARIO') {
      return;
    }
    ocupado = true;
    tarjeta.classList.add('cierre-card--ocupada');
    boton.setAttribute('aria-busy', 'true');
    try {
      if (modo === 'ABIERTO') {
        if (await pedirConfirmacionCierre(boton)) {
          await ejecutar(() => cerrarComercio(activo.id));
        }
      } else {
        await ejecutar(() => abrirComercio(activo.id));
      }
    } finally {
      ocupado = false;
      if (tarjeta) {
        tarjeta.classList.remove('cierre-card--ocupada');
        boton.removeAttribute('aria-busy');
      }
      actualizar();
    }
  }

  actualizar();
  return suscribirComercios(actualizar);
}
