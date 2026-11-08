function nodo(etiqueta, clase, hijos = []) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  hijos.forEach((hijo) => el.appendChild(hijo));
  return el;
}

function linea(modificador) {
  return nodo('div', `skeleton esqueleto-linea${modificador ? ` esqueleto-linea--${modificador}` : ''}`);
}

function tarjetaComercio() {
  const avatar = nodo('div', 'comercio-card__avatar skeleton');
  const cuerpo = nodo('div', 'comercio-card__body', [
    linea('titulo'),
    nodo('div', 'esqueleto-espacio'),
    linea('w60'),
    nodo('div', 'esqueleto-espacio'),
    nodo('div', 'esqueleto-fila', [nodo('div', 'skeleton esqueleto-pastilla'), nodo('div', 'skeleton esqueleto-pastilla')]),
  ]);
  return nodo('div', 'comercio-card comercio-card--esqueleto', [avatar, cuerpo]);
}

function tarjetaPedido() {
  const arriba = nodo('div', 'pedido-card__top', [
    nodo('div', 'pedido-card__comercio-row', [
      nodo('div', 'pedido-card__avatar skeleton'),
      nodo('div', 'esqueleto-columna', [linea('w60'), linea('w40')]),
    ]),
    linea('w25'),
  ]);
  const abajo = nodo('div', 'pedido-card__bottom', [linea('w25'), linea('w25')]);
  return nodo('div', 'pedido-card pedido-card--esqueleto', [arriba, linea('w80'), nodo('div', 'esqueleto-espacio'), abajo]);
}

function filaCarrito() {
  const arriba = nodo('div', 'cart-item__top', [
    nodo('div', 'cart-item__thumb skeleton'),
    nodo('div', 'cart-item__info esqueleto-columna', [linea('w60'), linea('w40')]),
  ]);
  const abajo = nodo('div', 'cart-item__bottom', [nodo('div', 'skeleton esqueleto-stepper'), linea('w25')]);
  return nodo('div', 'cart-item cart-item--esqueleto', [arriba, abajo]);
}

function cabeceraCarrito() {
  return nodo('div', 'cart-comercio-card cart-comercio-card--esqueleto', [
    nodo('div', 'cart-comercio-card__avatar skeleton'),
    nodo('div', 'esqueleto-columna esqueleto-columna--centrada', [linea('w40'), linea('w60')]),
  ]);
}

function filaAviso() {
  return nodo('div', 'notification-item notification-item--esqueleto', [
    nodo('div', 'skeleton esqueleto-punto'),
    nodo('div', 'esqueleto-columna', [linea('w80'), linea('w40')]),
  ]);
}

function tarjetaProducto() {
  return nodo('div', 'explore-product-card explore-product-card--esqueleto', [
    nodo('div', 'explore-product-card__thumb skeleton'),
    nodo('div', 'explore-product-card__body esqueleto-columna', [linea('w80'), linea('w25'), linea('w40')]),
  ]);
}

const TIPOS = {
  comercios: { crear: tarjetaComercio, clase: 'esqueleto-lista', cantidad: 3 },
  pedidos: { crear: tarjetaPedido, clase: 'pedido-list', cantidad: 3 },
  carrito: { crear: filaCarrito, clase: 'esqueleto-carrito', cantidad: 2, antes: cabeceraCarrito },
  avisos: { crear: filaAviso, clase: 'notification-list', cantidad: 4 },
  productos: { crear: tarjetaProducto, clase: 'esqueleto-lista', cantidad: 3 },
};

export function crearEsqueleto(tipo, cantidad) {
  const definicion = TIPOS[tipo];
  const envoltorio = nodo('div', `esqueleto ${definicion.clase}`);
  envoltorio.setAttribute('role', 'status');
  envoltorio.setAttribute('aria-busy', 'true');
  envoltorio.setAttribute('data-testid', `esqueleto-${tipo}`);
  const leyenda = nodo('span', 'sr-only');
  leyenda.textContent = 'Cargando…';
  envoltorio.appendChild(leyenda);
  if (definicion.antes) envoltorio.appendChild(definicion.antes());
  for (let i = 0; i < (cantidad || definicion.cantidad); i += 1) {
    envoltorio.appendChild(definicion.crear());
  }
  return envoltorio;
}

export function mostrarEsqueleto(contenedor, tipo, cantidad) {
  if (!contenedor) return;
  contenedor.replaceChildren(crearEsqueleto(tipo, cantidad));
}

export function mostrarErrorDeCarga(contenedor, mensaje = 'No pudimos cargar esta pantalla.') {
  if (!contenedor) return;
  const texto = nodo('p', 'state-page__text');
  texto.textContent = mensaje;
  const boton = nodo('button', 'btn btn-secondary');
  boton.type = 'button';
  boton.setAttribute('data-testid', 'btn-reintentar-carga');
  boton.textContent = 'Reintentar';
  boton.addEventListener('click', () => window.location.reload());
  const envoltorio = nodo('div', 'state-page state-page--inline', [texto, boton]);
  envoltorio.setAttribute('role', 'alert');
  envoltorio.setAttribute('data-testid', 'error-de-carga');
  contenedor.replaceChildren(envoltorio);
}
