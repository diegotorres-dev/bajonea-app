import { h } from './form-utils.js';

export function crearEncabezadoTabla(variante, columnas, testid) {
  const celdas = columnas.map((columna) => {
    const celda = h('span', { class: `tabla-encabezado__celda${columna.etiqueta ? '' : ' tabla-encabezado__celda--vacia'}` });
    celda.textContent = columna.etiqueta;
    return celda;
  });
  return h('div', { class: `tabla-encabezado tabla--${variante}`, hidden: true, 'aria-hidden': 'true', 'data-testid': testid }, celdas);
}

export function observarColumnaNovedades(lista, encabezado) {
  function sincronizar() {
    const hayNovedades = Boolean(lista.querySelector('.cliente-admin-row__aviso, .dueno-admin-row__suspension'));
    lista.classList.toggle('tabla--sin-novedades', !hayNovedades);
    encabezado.classList.toggle('tabla--sin-novedades', !hayNovedades);
  }
  new MutationObserver(sincronizar).observe(lista, { childList: true, subtree: true });
  sincronizar();
}
