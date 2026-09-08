import { apiFetch, ApiError, getUsuario } from './api.js';
import { renderTopBar, renderBottomNav, showToast, pintarAvatarComercio, actualizarContadorCarrito } from './catalogo.js';
import { normalizarCampos, excedeSubtotalMaximo, mensajeSubtotalMaximoExcedido } from './validators.js';

const ICONS = {
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

function crear(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatearPrecio(valor) {
  const entero = Math.round(Number(valor));
  return `$${entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function renderVacio(container) {
  container.innerHTML = '';
  const wrapper = crear('div', 'state-page');
  const icon = crear('div', 'state-page__icon');
  icon.innerHTML = ICONS.bag;
  wrapper.appendChild(icon);
  const h1 = document.createElement('h1');
  h1.className = 'state-page__title';
  h1.textContent = 'Tu carrito está vacío';
  wrapper.appendChild(h1);
  const p = document.createElement('p');
  p.className = 'state-page__text';
  p.textContent = 'Explorá los comercios disponibles y agregá productos para comenzar tu pedido.';
  wrapper.appendChild(p);
  const actions = crear('div', 'state-page__actions');
  const cta = document.createElement('a');
  cta.className = 'btn btn-primary';
  cta.href = 'index.html';
  cta.setAttribute('data-testid', 'btn-explorar-comercios');
  cta.textContent = 'Explorar comercios';
  actions.appendChild(cta);
  wrapper.appendChild(actions);
  container.appendChild(wrapper);
}

function crearAccionVaciarHeader(onConfirm) {
  const btn = crear('button', 'top-bar__vaciar-btn');
  btn.type = 'button';
  btn.textContent = 'Vaciar todo';
  btn.setAttribute('aria-label', 'Vaciar carrito');
  btn.setAttribute('data-testid', 'btn-vaciar-carrito');
  btn.addEventListener('click', () => {
    mostrarModalVaciarCarrito(onConfirm);
  });
  return btn;
}

function mostrarModalVaciarCarrito(onConfirm) {
  const backdrop = crear('div', 'modal-backdrop');
  backdrop.setAttribute('data-testid', 'modal-vaciar-carrito');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-sheet__icon">${ICONS.trash}</div>
      <h2 class="modal-sheet__title">¿Vaciar el carrito?</h2>
      <p class="modal-sheet__text">Vas a eliminar todos los productos del carrito. Esta acción no se puede deshacer.</p>
      <button class="btn btn-primary" type="button" id="confirmar-vaciar-btn" style="margin-bottom:12px;" data-testid="btn-confirmar-vaciar-carrito">Sí, vaciar carrito</button>
      <button class="btn btn-tertiary" type="button" id="cancelar-vaciar-btn" data-testid="btn-cancelar-vaciar-carrito">Cancelar</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('cancelar-vaciar-btn').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
    }
  });
  document.getElementById('confirmar-vaciar-btn').addEventListener('click', async () => {
    const btn = document.getElementById('confirmar-vaciar-btn');
    btn.disabled = true;
    btn.textContent = 'Vaciando...';
    try {
      await apiFetch('/carrito', { method: 'DELETE' });
      backdrop.remove();
      onConfirm();
    } catch (error) {
      btn.disabled = false;
      btn.textContent = 'Sí, vaciar carrito';
      showToast(error instanceof ApiError ? error.message : 'No pudimos vaciar el carrito. Intentá nuevamente.', 'error');
    }
  });
}

function renderItem(item, producto, onCambio) {
  const row = crear('div', 'cart-item');
  row.setAttribute('data-testid', `item-carrito-${item.id}`);

  const top = crear('div', 'cart-item__top');

  const thumb = crear('div', 'cart-item__thumb');
  const imagenes = producto && producto.imagenes && producto.imagenes.length > 0 ? producto.imagenes : [];
  const principal = imagenes.find((imagen) => imagen.esPrincipal) || imagenes[0];
  if (principal) {
    const img = document.createElement('img');
    img.src = principal.url;
    img.alt = '';
    thumb.appendChild(img);
  }
  top.appendChild(thumb);

  const info = crear('div', 'cart-item__info');
  const nombre = document.createElement('h3');
  nombre.textContent = item.nombreProducto;
  info.appendChild(nombre);
  const precioUnit = crear('p', 'cart-item__unit-price');
  precioUnit.textContent = `${formatearPrecio(item.precioUnitario)} c/u`;
  info.appendChild(precioUnit);
  if (item.nota) {
    const nota = crear('p', 'cart-item__nota');
    nota.textContent = `Nota: "${item.nota}"`;
    info.appendChild(nota);
  }
  top.appendChild(info);

  const removeBtn = crear('button', 'cart-item__remove');
  removeBtn.type = 'button';
  removeBtn.innerHTML = ICONS.trash;
  removeBtn.setAttribute('aria-label', `Eliminar ${item.nombreProducto}`);
  removeBtn.setAttribute('data-testid', `btn-eliminar-item-carrito-${item.id}`);
  removeBtn.addEventListener('click', async () => {
    removeBtn.disabled = true;
    try {
      const carrito = await apiFetch(`/carrito/items/${item.id}`, { method: 'DELETE' });
      onCambio(carrito);
    } catch (error) {
      removeBtn.disabled = false;
      showToast(error instanceof ApiError ? error.message : 'No pudimos eliminar el producto.', 'error');
    }
  });
  top.appendChild(removeBtn);
  row.appendChild(top);

  const bottom = crear('div', 'cart-item__bottom');
  const stepper = crear('div', 'stepper');
  const minusBtn = crear('button', 'stepper__btn');
  minusBtn.type = 'button';
  minusBtn.innerHTML = item.cantidad === 1 ? ICONS.trash : ICONS.minus;
  minusBtn.setAttribute('aria-label', item.cantidad === 1 ? 'Eliminar producto' : 'Restar cantidad');
  minusBtn.setAttribute('data-testid', `btn-restar-cantidad-${item.id}`);
  const valueSpan = crear('span', 'stepper__value');
  valueSpan.textContent = String(item.cantidad);
  valueSpan.setAttribute('data-testid', `cantidad-item-carrito-${item.id}`);
  const plusBtn = crear('button', 'stepper__btn');
  plusBtn.type = 'button';
  plusBtn.innerHTML = ICONS.plus;
  plusBtn.disabled = item.cantidad >= 20;
  plusBtn.setAttribute('aria-label', 'Sumar cantidad');
  plusBtn.setAttribute('data-testid', `btn-sumar-cantidad-${item.id}`);
  stepper.appendChild(minusBtn);
  stepper.appendChild(valueSpan);
  stepper.appendChild(plusBtn);
  bottom.appendChild(stepper);

  async function cambiarCantidad(nuevaCantidad) {
    minusBtn.disabled = true;
    plusBtn.disabled = true;
    try {
      let carrito;
      if (nuevaCantidad < 1) {
        carrito = await apiFetch(`/carrito/items/${item.id}`, { method: 'DELETE' });
      } else {
        carrito = await apiFetch(`/carrito/items/${item.id}`, { method: 'PUT', body: { cantidad: nuevaCantidad } });
      }
      onCambio(carrito);
    } catch (error) {
      minusBtn.disabled = false;
      plusBtn.disabled = false;
      showToast(error instanceof ApiError ? error.message : 'No pudimos actualizar la cantidad.', 'error');
    }
  }

  minusBtn.addEventListener('click', () => cambiarCantidad(item.cantidad - 1));
  plusBtn.addEventListener('click', () => {
    if (excedeSubtotalMaximo(item.precioUnitario, item.cantidad + 1)) {
      showToast(mensajeSubtotalMaximoExcedido(), 'error');
      return;
    }
    cambiarCantidad(Math.min(20, item.cantidad + 1));
  });

  const subtotal = crear('span', 'cart-item__subtotal');
  subtotal.setAttribute('data-testid', `subtotal-item-carrito-${item.id}`);
  subtotal.textContent = formatearPrecio(item.subtotal);
  bottom.appendChild(subtotal);
  row.appendChild(bottom);

  return row;
}

function renderConProductos(container, footerSlot, carrito, comercioInfo, productoPorId, onCambio) {
  container.innerHTML = '';

  const comercioCard = crear('div', 'cart-comercio-card');
  comercioCard.setAttribute('data-testid', 'tarjeta-comercio-carrito');
  const avatar = crear('div', 'cart-comercio-card__avatar');
  pintarAvatarComercio(avatar, comercioInfo || { nombre: carrito.nombreComercio });
  comercioCard.appendChild(avatar);
  const label = crear('p', 'cart-comercio-card__label');
  label.textContent = 'Vas a hacer un pedido a';
  comercioCard.appendChild(label);
  const nombre = crear('p', 'cart-comercio-card__nombre');
  nombre.textContent = carrito.nombreComercio;
  comercioCard.appendChild(nombre);
  container.appendChild(comercioCard);

  const list = crear('div', 'cart-list');
  carrito.items.forEach((item) => {
    list.appendChild(renderItem(item, productoPorId.get(item.productoId), onCambio));
  });
  container.appendChild(list);

  footerSlot.innerHTML = '';
  const footer = crear('div', 'cart-footer');
  const summaryRow = crear('div', 'cart-summary__row cart-summary__row--total');
  const subtotalLabel = document.createElement('span');
  subtotalLabel.textContent = 'Subtotal';
  summaryRow.appendChild(subtotalLabel);
  const value = document.createElement('span');
  value.setAttribute('data-testid', 'total-carrito');
  value.textContent = formatearPrecio(carrito.subtotal);
  summaryRow.appendChild(value);
  footer.appendChild(summaryRow);

  const confirmarBtn = document.createElement('a');
  confirmarBtn.className = 'btn btn-primary';
  confirmarBtn.href = 'checkout.html';
  confirmarBtn.setAttribute('data-testid', 'btn-confirmar-pedido');
  confirmarBtn.textContent = `Confirmar pedido - ${formatearPrecio(carrito.subtotal)}`;
  footer.appendChild(confirmarBtn);
  footerSlot.appendChild(footer);
}

export async function initCarrito() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    window.location.href = 'login.html';
    return;
  }

  renderBottomNav(document.getElementById('bottom-nav-slot'), 'carrito');

  const container = document.getElementById('carrito-content');
  const footerSlot = document.getElementById('carrito-footer-slot');

  let comercios = null;
  let productosCache = null;

  async function pintar(carrito) {
    normalizarCampos(carrito, ['nombreComercio']);
    (carrito.items || []).forEach((item) => normalizarCampos(item, ['nombreProducto']));
    actualizarContadorCarrito();
    const tieneItems = Boolean(carrito.items && carrito.items.length > 0);
    const accion = tieneItems ? crearAccionVaciarHeader(() => pintar({ comercioId: null, nombreComercio: null, items: [], subtotal: 0 })) : null;
    renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Mi carrito', accion });

    if (!tieneItems) {
      footerSlot.innerHTML = '';
      renderVacio(container);
      return;
    }
    if (!comercios) {
      comercios = await apiFetch('/catalogo/comercios', { auth: false });
      comercios.forEach((c) => {
        normalizarCampos(c, ['nombre', 'razonSocial']);
        normalizarCampos(c.direccion, ['calle']);
      });
    }
    const comercioInfo = comercios.find((c) => c.id === carrito.comercioId);
    if (!productosCache || productosCache.comercioId !== carrito.comercioId) {
      try {
        const productos = await apiFetch(`/catalogo/comercios/${carrito.comercioId}/productos`, { auth: false });
        productos.forEach((producto) => normalizarCampos(producto, ['nombre']));
        productosCache = { comercioId: carrito.comercioId, porId: new Map(productos.map((producto) => [producto.id, producto])) };
      } catch {
        productosCache = { comercioId: carrito.comercioId, porId: new Map() };
      }
    }
    renderConProductos(container, footerSlot, carrito, comercioInfo, productosCache.porId, pintar);
  }

  const carrito = await apiFetch('/carrito');
  await pintar(carrito);
}
