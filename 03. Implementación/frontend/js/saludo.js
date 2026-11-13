import { getNombre } from './api.js';

export function pintarSaludo(elemento) {
  if (!elemento) {
    return;
  }
  const nombre = getNombre();
  elemento.classList.add('saludo');
  if (!nombre) {
    elemento.textContent = 'Hola 👋';
    return;
  }
  const spanNombre = document.createElement('span');
  spanNombre.className = 'saludo__nombre';
  spanNombre.setAttribute('data-testid', 'saludo-nombre');
  spanNombre.textContent = nombre;
  spanNombre.title = nombre;
  elemento.replaceChildren('Hola, ', spanNombre, ' 👋');
}
