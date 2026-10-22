export function formatearPrecioEntero(valor) {
  const entero = Math.round(Number(valor));
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function crearPrecioUnitario(item) {
  const contenedor = document.createElement('div');
  contenedor.className = 'precio-unitario';

  const linea = document.createElement('p');
  linea.className = 'cart-item__unit-price';
  linea.setAttribute('data-testid', `item-precio-unitario-${item.id}`);

  if (item.precioCambio) {
    const anterior = document.createElement('s');
    anterior.className = 'precio-unitario__anterior';
    anterior.setAttribute('data-testid', `item-precio-anterior-${item.id}`);
    anterior.textContent = formatearPrecioEntero(item.precioVisto);
    linea.appendChild(anterior);
    linea.appendChild(document.createTextNode(' → '));
    const actual = document.createElement('span');
    actual.className = 'precio-unitario__actual';
    actual.textContent = `${formatearPrecioEntero(item.precioUnitario)} c/u`;
    linea.appendChild(actual);
  } else {
    linea.textContent = `${formatearPrecioEntero(item.precioUnitario)} c/u`;
  }
  contenedor.appendChild(linea);

  if (item.precioCambio) {
    const aviso = document.createElement('span');
    aviso.className = 'pedido-estado precio-unitario__aviso';
    aviso.setAttribute('data-testid', `item-precio-cambio-${item.id}`);
    const punto = document.createElement('span');
    punto.className = 'pedido-estado__dot pedido-estado__dot--pendiente';
    aviso.appendChild(punto);
    aviso.appendChild(document.createTextNode('Cambió el precio'));
    contenedor.appendChild(aviso);
  }

  return contenedor;
}
