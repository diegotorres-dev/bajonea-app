import { apiFetch } from './api.js';
import { mensajeNombreUsuarioInvalido, mostrarErrorCampo, limpiarErrorCampo } from './validators.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ATRIBUTOS_SVG_BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

export const ICONS = {
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

export function h(etiqueta, atributos = {}, hijos = []) {
  const elemento = document.createElement(etiqueta);
  Object.entries(atributos).forEach(([nombre, valor]) => {
    if (valor === false || valor === null || valor === undefined) return;
    elemento.setAttribute(nombre, valor === true ? '' : valor);
  });
  hijos.forEach((hijo) => elemento.append(hijo));
  return elemento;
}

export function crearSvg(figuras, atributos = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  Object.entries({ ...ATRIBUTOS_SVG_BASE, ...atributos }).forEach(([nombre, valor]) => svg.setAttribute(nombre, valor));
  figuras.forEach(([etiqueta, figuraAtributos]) => {
    const figura = document.createElementNS(SVG_NS, etiqueta);
    Object.entries(figuraAtributos).forEach(([nombre, valor]) => figura.setAttribute(nombre, valor));
    svg.appendChild(figura);
  });
  return svg;
}

export function renderBanner(slot, kind, texto) {
  renderBannerTexto(slot, kind, texto);
}

export function renderBannerTexto(slot, kind, texto) {
  slot.replaceChildren();
  if (!texto) return;
  const icono = new DOMParser().parseFromString(ICONS[kind] || ICONS.info, 'text/html').body.firstElementChild;
  const contenido = h('div');
  contenido.textContent = texto;
  slot.appendChild(h('div', { class: `banner banner-${kind}`, style: 'margin-bottom:20px;' }, [icono, contenido]));
}

export function bindPasswordToggle(toggleBtn, input) {
  toggleBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

export function setLoading(button, loadingText, isLoading, originalHtml) {
  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = loadingText;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalHtml || originalHtml;
    button.disabled = false;
  }
}

export function construirTelefono(digitos) {
  return `+549${String(digitos || '').replace(/[ ()\-]/g, '')}`;
}

export function crearPasos({ pasos, barras, etiquetas }) {
  let actual = 0;
  return {
    mostrar(indice) {
      pasos.forEach((paso, i) => paso.classList.toggle('is-hidden', i !== indice));
      barras.forEach((barra, i) => barra.classList.toggle('step-progress__bar--done', i < indice));
      barras.forEach((barra, i) => barra.classList.toggle('step-progress__bar--active', i <= indice));
      etiquetas.forEach((etiqueta, i) => etiqueta.classList.toggle('is-active', i === indice));
      actual = indice;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    actual() {
      return actual;
    },
  };
}

export const MENSAJE_NOMBRE_USUARIO_EN_USO = 'Ese nombre de usuario ya está en uso';

const ICONOS_ESTADO_NOMBRE_USUARIO = {
  verificando: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
  disponible: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>',
  ocupado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
};

export function bindNombreUsuario({ inputId = 'nombreUsuario', valorOriginal = null } = {}) {
  const input = document.getElementById(inputId);
  const estadoEl = document.getElementById(`estado-${inputId}`);
  const errorId = `error-${inputId}`;
  const iconoEl = document.getElementById(`icono-${inputId}`);
  function obtenerOriginal() {
    const valor = typeof valorOriginal === 'function' ? valorOriginal() : valorOriginal;
    return valor ? valor.trim().toLowerCase() : null;
  }
  let estado = 'inactivo';
  let secuencia = 0;
  let pendiente = null;

  function ocultarIcono() {
    if (!iconoEl) return;
    iconoEl.className = 'input-shell__status-icon';
    iconoEl.innerHTML = '';
    iconoEl.style.display = 'none';
  }

  function mostrarIcono(variante) {
    if (!iconoEl) return;
    iconoEl.className = `input-shell__status-icon input-shell__status-icon--${variante}`;
    iconoEl.innerHTML = ICONOS_ESTADO_NOMBRE_USUARIO[variante] || '';
    iconoEl.style.display = 'flex';
  }

  function ocultarEstado() {
    estadoEl.textContent = '';
    estadoEl.classList.remove('field__status--ok');
    estadoEl.style.display = 'none';
    ocultarIcono();
  }

  function mostrarEstado(texto, ok) {
    estadoEl.textContent = texto;
    estadoEl.classList.toggle('field__status--ok', ok);
    estadoEl.style.display = 'block';
  }

  function reiniciar() {
    secuencia += 1;
    pendiente = null;
    estado = 'inactivo';
    limpiarErrorCampo(errorId);
    ocultarEstado();
  }

  function marcarEnUso() {
    estado = 'ocupado';
    estadoEl.textContent = '';
    estadoEl.classList.remove('field__status--ok');
    estadoEl.style.display = 'none';
    mostrarIcono('ocupado');
    mostrarErrorCampo(errorId, MENSAJE_NOMBRE_USUARIO_EN_USO);
  }

  async function consultarDisponibilidad(valor, miSecuencia) {
    try {
      const data = await apiFetch(`/auth/nombre-usuario/disponibilidad?nombreUsuario=${encodeURIComponent(valor)}`, { auth: false });
      if (miSecuencia !== secuencia) return;
      if (data.disponible) {
        estado = 'disponible';
        mostrarEstado('Nombre de usuario disponible', true);
        mostrarIcono('disponible');
      } else {
        marcarEnUso();
      }
    } catch {
      if (miSecuencia !== secuencia) return;
      estado = 'inactivo';
      ocultarEstado();
    }
  }

  input.addEventListener('input', reiniciar);
  input.addEventListener('blur', () => {
    input.value = input.value.trim().toLowerCase();
    const valor = input.value;
    if (!valor) return;
    const original = obtenerOriginal();
    if (original !== null && valor === original) {
      reiniciar();
      return;
    }
    const mensaje = mensajeNombreUsuarioInvalido(valor);
    if (mensaje) {
      reiniciar();
      mostrarErrorCampo(errorId, mensaje);
      return;
    }
    secuencia += 1;
    estado = 'verificando';
    limpiarErrorCampo(errorId);
    mostrarEstado('Verificando…', false);
    mostrarIcono('verificando');
    pendiente = consultarDisponibilidad(valor, secuencia);
  });

  return {
    async validarParaContinuar() {
      const valor = input.value.trim().toLowerCase();
      const original = obtenerOriginal();
      if (original !== null && valor === original) {
        return true;
      }
      const mensaje = mensajeNombreUsuarioInvalido(valor);
      if (mensaje) {
        mostrarErrorCampo(errorId, mensaje);
        return false;
      }
      if (estado === 'verificando' && pendiente) {
        await pendiente;
      }
      return estado !== 'ocupado';
    },
    haCambiado() {
      const original = obtenerOriginal();
      return original === null || input.value.trim().toLowerCase() !== original;
    },
    reiniciar,
    marcarEnUso,
  };
}
