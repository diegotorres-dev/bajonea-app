import { h } from './form-utils.js';

export const MAX_MOTIVO = 500;

export function texto(etiqueta, clase, contenido, atributos = {}) {
  const elemento = h(etiqueta, { ...(clase ? { class: clase } : {}), ...atributos });
  elemento.textContent = contenido;
  return elemento;
}

export function plural(cantidad, singular, pluralTexto) {
  return cantidad === 1 ? singular : pluralTexto;
}

export function fechaLegible(fechaIso) {
  return new Date(fechaIso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function abrirHoja({ clase = 'product-modal-sheet', id, titulo, testid, hijos }) {
  const hoja = h('div', { class: clase, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-titulo`, 'data-testid': testid }, [
    h('div', { class: 'product-modal-sheet__handle' }, [h('span')]),
    h('div', { class: 'product-modal-sheet__body' }, [texto('h2', 'cliente-modal__titulo', titulo, { id: `${id}-titulo`, 'data-testid': `${testid}-titulo` }), ...hijos]),
  ]);
  const fondo = h('div', { class: 'modal-backdrop', 'data-testid': `${testid}-fondo` }, [hoja]);
  document.body.appendChild(fondo);
  const overflowPrevio = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return { hoja, fondo, overflowPrevio };
}

export function cajaInformativa(titulo, lineas, testid) {
  const caja = h('div', { class: 'cliente-modal__caja', 'data-testid': testid });
  caja.appendChild(texto('p', 'cliente-modal__caja-titulo', titulo));
  const items = h('ul', { class: 'cliente-modal__caja-lista' });
  lineas.forEach((linea) => items.appendChild(texto('li', '', linea)));
  caja.appendChild(items);
  return { caja, items };
}

export function campoTexto({ id, etiqueta, ayuda, placeholder, minimo }) {
  const area = h('textarea', { id, maxlength: String(MAX_MOTIVO), placeholder, 'aria-describedby': `${id}-contador`, 'data-testid': `input-${id}` });
  const contador = texto('span', '', minimo ? `0 / ${MAX_MOTIVO} · mínimo ${minimo}` : `0 / ${MAX_MOTIVO}`, { id: `${id}-contador`, 'data-testid': `contador-${id}` });
  const campo = h('div', { class: 'field' }, [
    texto('label', 'field__label', etiqueta, { for: id }),
    ...(ayuda ? [texto('p', 'field__hint', ayuda)] : []),
    h('div', { class: 'textarea-shell' }, [area]),
    h('div', { class: 'textarea-counter' }, [contador]),
  ]);
  area.addEventListener('input', () => {
    contador.textContent = minimo ? `${area.value.length} / ${MAX_MOTIVO} · mínimo ${minimo}` : `${area.value.length} / ${MAX_MOTIVO}`;
  });
  return { campo, area };
}
