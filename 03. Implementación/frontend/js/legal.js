import { getToken } from './api.js';
import { h } from './form-utils.js';

const volver = document.querySelector('[data-testid="legal-volver"]');

if (volver) {
  volver.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = getToken() ? 'index.html' : 'login.html';
  });
}

function montarIndice() {
  const pagina = document.querySelector('.legal-pagina');
  if (!pagina) {
    return;
  }
  const items = Array.from(pagina.querySelectorAll(':scope > section.legal-seccion'))
    .map((seccion) => ({ seccion, titulo: seccion.querySelector('h2')?.textContent.trim() }))
    .filter((item) => item.titulo);
  if (items.length < 2) {
    return;
  }
  const botones = items.map(({ seccion, titulo }, indice) => {
    const boton = h('button', { type: 'button', class: 'legal-indice__boton', 'data-testid': `legal-indice-${indice + 1}` }, [titulo]);
    boton.addEventListener('click', () => {
      const encabezado = seccion.querySelector('h2');
      seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
      encabezado.setAttribute('tabindex', '-1');
      encabezado.focus({ preventScroll: true });
    });
    return boton;
  });
  const indice = h('nav', { class: 'legal-indice', hidden: true, 'aria-label': 'Secciones de esta página', 'data-testid': 'legal-indice' }, [
    h('p', { class: 'legal-indice__titulo' }, ['En esta página']),
    h('ul', { class: 'legal-indice__lista' }, botones.map((boton) => h('li', {}, [boton]))),
  ]);
  pagina.parentElement.insertBefore(indice, pagina);

  function marcarActual() {
    const alFinal = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    let actual = 0;
    items.forEach((item, i) => {
      if (item.seccion.getBoundingClientRect().top <= 140) {
        actual = i;
      }
    });
    if (alFinal) {
      actual = items.length - 1;
    }
    botones.forEach((boton, i) => {
      if (i === actual) {
        boton.setAttribute('aria-current', 'true');
      } else {
        boton.removeAttribute('aria-current');
      }
    });
  }
  let pendiente = false;
  window.addEventListener(
    'scroll',
    () => {
      if (pendiente) {
        return;
      }
      pendiente = true;
      window.requestAnimationFrame(() => {
        pendiente = false;
        marcarActual();
      });
    },
    { passive: true },
  );
  marcarActual();
}

montarIndice();
