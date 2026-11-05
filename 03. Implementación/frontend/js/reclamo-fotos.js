import { h, crearSvg } from './form-utils.js';
import { texto } from './admin-hojas.js';

const MAXIMO_FOTOS = 3;
const FORMATOS_ACEPTADOS = 'image/jpeg,image/png,image/webp';

export function crearSelectorDeFotos() {
  const seleccion = [];
  let bloqueado = false;
  const entrada = h('input', {
    type: 'file',
    accept: FORMATOS_ACEPTADOS,
    class: 'sr-only',
    id: 'reclamo-foto-entrada',
    tabindex: '-1',
    'aria-hidden': 'true',
    'data-testid': 'input-reclamo-foto',
  });
  const lista = h('ul', { class: 'reclamo-fotos__lista', 'data-testid': 'lista-reclamo-fotos' });
  const anuncio = h('p', { class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'anuncio-reclamo-fotos' });
  let ultimoQuitado = null;

  function crearMiniatura(item, indice) {
    const numero = indice + 1;
    const imagen = h('img', { src: item.url, alt: `Foto ${numero}`, class: 'reclamo-fotos__imagen', 'data-testid': `miniatura-reclamo-foto-${numero}` });
    imagen.addEventListener('error', () => {
      imagen.replaceWith(texto('span', 'reclamo-fotos__sin-vista', 'Sin vista previa', { 'data-testid': `sin-vista-reclamo-foto-${numero}` }));
    });
    const quitar = texto('button', 'reclamo-fotos__quitar', 'Quitar', {
      type: 'button',
      'aria-label': `Quitar foto ${numero}`,
      'data-testid': `btn-quitar-reclamo-foto-${numero}`,
    });
    quitar.disabled = bloqueado;
    quitar.addEventListener('click', () => {
      URL.revokeObjectURL(item.url);
      seleccion.splice(seleccion.indexOf(item), 1);
      ultimoQuitado = indice;
      anuncio.textContent = `Foto quitada. Tenés ${seleccion.length} de ${MAXIMO_FOTOS}.`;
      pintar();
    });
    return h('li', { class: 'reclamo-fotos__item', 'data-testid': `reclamo-foto-${numero}` }, [
      h('div', { class: 'reclamo-fotos__vista' }, [imagen]),
      texto('span', 'reclamo-fotos__nombre', item.archivo.name, { 'data-testid': `nombre-reclamo-foto-${numero}` }),
      quitar,
    ]);
  }

  function crearBotonAgregar() {
    const boton = h('button', { type: 'button', class: 'reclamo-fotos__agregar', 'data-testid': 'btn-agregar-reclamo-foto' }, [
      crearSvg([['line', { x1: '12', y1: '5', x2: '12', y2: '19' }], ['line', { x1: '5', y1: '12', x2: '19', y2: '12' }]], { 'aria-hidden': 'true' }),
      texto('span', '', 'Agregar'),
    ]);
    boton.setAttribute('aria-label', seleccion.length === 0 ? 'Agregar una foto' : 'Agregar otra foto');
    boton.disabled = bloqueado;
    boton.addEventListener('click', () => entrada.click());
    return h('li', { class: 'reclamo-fotos__item reclamo-fotos__item--agregar' }, [boton]);
  }

  function pintar() {
    lista.replaceChildren(...seleccion.map(crearMiniatura));
    if (seleccion.length < MAXIMO_FOTOS) {
      lista.appendChild(crearBotonAgregar());
    }
    if (ultimoQuitado !== null) {
      const botones = lista.querySelectorAll('.reclamo-fotos__quitar');
      const destino = botones[Math.min(ultimoQuitado, botones.length - 1)] || lista.querySelector('.reclamo-fotos__agregar');
      if (destino) destino.focus();
      ultimoQuitado = null;
    }
  }

  entrada.addEventListener('change', () => {
    const archivo = entrada.files && entrada.files[0];
    entrada.value = '';
    if (!archivo || seleccion.length >= MAXIMO_FOTOS) return;
    seleccion.push({ archivo, url: URL.createObjectURL(archivo) });
    anuncio.textContent = `Foto agregada. Tenés ${seleccion.length} de ${MAXIMO_FOTOS}.`;
    pintar();
    const agregar = lista.querySelector('.reclamo-fotos__agregar');
    if (agregar) agregar.focus();
  });

  pintar();

  const elemento = h('div', { class: 'field reclamo-fotos', 'data-testid': 'campo-reclamo-fotos' }, [
    texto('span', 'field__label', 'Fotos (opcional)', { id: 'reclamo-fotos-rotulo' }),
    texto('p', 'soporte-privacidad', 'Hasta 3 fotos de 5 MB. Solo las ve nuestro equipo.', { id: 'reclamo-fotos-ayuda', 'data-testid': 'ayuda-reclamo-fotos' }),
    lista,
    entrada,
    anuncio,
  ]);
  lista.setAttribute('aria-labelledby', 'reclamo-fotos-rotulo');
  lista.setAttribute('aria-describedby', 'reclamo-fotos-ayuda');

  return {
    elemento,
    archivos: () => seleccion.map((item) => item.archivo),
    bloquear(valor) {
      bloqueado = valor;
      pintar();
    },
  };
}
