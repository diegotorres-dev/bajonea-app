import { h } from './form-utils.js';

const PATRON_ETIQUETA = /^\s*(\d+)\.\s*(.*)$/;

function leerPasos(contenedorEtiquetas) {
  return Array.from(contenedorEtiquetas.querySelectorAll('span')).map((etiqueta, indice) => {
    const coincidencia = PATRON_ETIQUETA.exec(etiqueta.textContent);
    return {
      numero: coincidencia ? coincidencia[1] : String(indice + 1),
      nombre: coincidencia ? coincidencia[2] : etiqueta.textContent.trim(),
      activo: etiqueta.classList.contains('is-active'),
    };
  });
}

export function montarPasosLaterales(progreso) {
  const contenedorEtiquetas = progreso.querySelector('.step-progress__labels');
  if (!contenedorEtiquetas || progreso.querySelector('.pasos-laterales')) {
    return;
  }
  const titulo = h('p', { class: 'pasos-laterales__titulo', hidden: true }, ['Tu avance']);
  const lista = h('ol', { class: 'pasos-laterales', hidden: true, 'aria-label': 'Pasos del registro', 'data-testid': 'pasos-laterales' });
  const nota = h('p', { class: 'pasos-laterales__nota', hidden: true }, ['Podés volver a un paso anterior sin perder lo que cargaste.']);
  progreso.append(titulo, lista, nota);

  function sincronizar() {
    const pasos = leerPasos(contenedorEtiquetas);
    const indiceActivo = pasos.findIndex((paso) => paso.activo);
    const actuales = Array.from(lista.children);
    const mismaForma = actuales.length === pasos.length && actuales.every((item, i) => item.dataset.nombre === pasos[i].nombre);
    if (!mismaForma) {
      lista.replaceChildren(
        ...pasos.map((paso, i) =>
          h('li', { class: 'pasos-laterales__paso', 'data-nombre': paso.nombre, 'data-testid': `paso-lateral-${i + 1}` }, [
            h('span', { class: 'pasos-laterales__numero', 'aria-hidden': 'true' }, [paso.numero]),
            h('span', { class: 'pasos-laterales__nombre' }, [paso.nombre]),
          ]),
        ),
      );
    }
    Array.from(lista.children).forEach((item, i) => {
      const completado = indiceActivo > i;
      const activo = indiceActivo === i;
      item.classList.toggle('is-active', activo);
      item.classList.toggle('is-done', completado);
      if (activo) {
        item.setAttribute('aria-current', 'step');
      } else {
        item.removeAttribute('aria-current');
      }
      item.setAttribute('data-estado', activo ? 'activo' : completado ? 'completado' : 'pendiente');
    });
  }

  new MutationObserver(sincronizar).observe(contenedorEtiquetas, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
    characterData: true,
  });
  sincronizar();
}

export function enlazarPasoAtras(alVolver) {
  document.querySelectorAll('[data-accion-asistente="atras"]').forEach((boton) => {
    boton.addEventListener('click', alVolver);
  });
}
