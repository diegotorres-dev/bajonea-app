import { apiFetch, ApiError, getUsuario } from './api.js';
import { estadoHorario } from './catalogo.js';
import { normalizarCampos } from './validators.js';

const ICONS = {
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
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

function formatearDireccion(direccion) {
  const partes = [`${direccion.calle} ${direccion.numero}`];
  if (direccion.pisoDepto) {
    partes.push(direccion.pisoDepto);
  }
  partes.push(direccion.nombreLocalidad);
  return partes.join(', ');
}

function renderBanner(slot, kind, texto) {
  if (!texto) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = '';
  const banner = crear('div', `banner banner-${kind}`);
  banner.style.marginBottom = '20px';
  const iconWrap = document.createElement('span');
  iconWrap.innerHTML = ICONS[kind] || ICONS.warning;
  banner.appendChild(iconWrap.firstElementChild);
  const text = document.createElement('div');
  text.textContent = texto;
  banner.appendChild(text);
  slot.appendChild(banner);
}

export async function initCheckout() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    window.location.href = 'login.html';
    return;
  }

  const bannerSlot = document.getElementById('banner-slot');
  const steps = [document.getElementById('step-1'), document.getElementById('step-2'), document.getElementById('step-3')];
  const bars = document.querySelectorAll('.step-progress__bar');
  const labels = document.querySelectorAll('.step-progress__labels span');
  let currentStep = 0;
  let tipoEntregaSeleccionado = null;

  function mostrarPaso(index) {
    steps.forEach((step, i) => step.classList.toggle('is-hidden', i !== index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--done', i < index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--active', i <= index));
    labels.forEach((label, i) => label.classList.toggle('is-active', i === index));
    currentStep = index;
    renderBanner(bannerSlot, 'info', '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('back-btn').addEventListener('click', () => {
    if (currentStep > 0) {
      mostrarPaso(currentStep - 1);
    } else {
      window.location.href = 'carrito.html';
    }
  });

  let carrito;
  try {
    carrito = await apiFetch('/carrito');
    normalizarCampos(carrito, ['nombreComercio']);
  } catch {
    window.location.href = 'carrito.html';
    return;
  }

  if (!carrito.items || carrito.items.length === 0) {
    window.location.href = 'carrito.html';
    return;
  }

  const [comercios, cliente] = await Promise.all([
    apiFetch('/catalogo/comercios', { auth: false }),
    apiFetch('/clientes/perfil'),
  ]);
  comercios.forEach((c) => {
    normalizarCampos(c, ['nombre', 'razonSocial']);
    normalizarCampos(c.direccion, ['calle']);
  });
  normalizarCampos(cliente, ['nombre', 'apellido']);
  normalizarCampos(cliente.direccion, ['calle']);
  const comercio = comercios.find((c) => c.id === carrito.comercioId);

  if (!comercio) {
    renderBanner(bannerSlot, 'error', 'No pudimos cargar los datos del comercio. Volvé al carrito e intentá nuevamente.');
    document.getElementById('continuar-modalidad-btn').disabled = true;
    return;
  }

  const opcionesContainer = document.getElementById('delivery-options');
  const continuarBtn = document.getElementById('continuar-modalidad-btn');

  if (!estadoHorario(comercio.horarios).abierto) {
    renderBanner(bannerSlot, 'error', 'Este comercio está cerrado en este momento. No podés completar el pedido hasta que vuelva a abrir.');
    continuarBtn.disabled = true;
    return;
  }

  function crearOpcionEntrega(tipo, icono, titulo, subtitulo) {
    const btn = crear('button', 'delivery-option');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('data-testid', `btn-modalidad-${tipo.toLowerCase()}`);
    const iconWrap = crear('div', 'delivery-option__icon');
    iconWrap.innerHTML = icono;
    btn.appendChild(iconWrap);
    const body = crear('div', 'delivery-option__body');
    const h3 = document.createElement('h3');
    h3.textContent = titulo;
    body.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = subtitulo;
    body.appendChild(p);
    btn.appendChild(body);
    const radio = crear('div', 'delivery-option__radio');
    btn.appendChild(radio);
    btn.addEventListener('click', () => {
      tipoEntregaSeleccionado = tipo;
      opcionesContainer.querySelectorAll('.delivery-option').forEach((el) => el.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      continuarBtn.disabled = false;
    });
    return btn;
  }

  if (comercio.aceptaDelivery) {
    opcionesContainer.appendChild(
      crearOpcionEntrega('DOMICILIO', ICONS.truck, 'Envío a domicilio', 'Recibís el pedido en tu dirección'),
    );
  }
  if (comercio.aceptaRetiro) {
    opcionesContainer.appendChild(
      crearOpcionEntrega('RETIRO', ICONS.bag, 'Retiro en el local', `Retirás tu pedido en ${comercio.direccion ? formatearDireccion(comercio.direccion) : comercio.nombre}`),
    );
  }

  if (!comercio.aceptaDelivery && !comercio.aceptaRetiro) {
    renderBanner(bannerSlot, 'error', 'Este comercio no tiene modalidades de entrega disponibles en este momento.');
  } else if (opcionesContainer.children.length === 1) {
    opcionesContainer.children[0].click();
  }

  continuarBtn.addEventListener('click', () => {
    if (!tipoEntregaSeleccionado) {
      return;
    }
    renderStep2();
    mostrarPaso(1);
  });

  const step2Content = document.getElementById('step-2-content');
  const step3Content = document.getElementById('step-3-content');

  function renderStep2() {
    step2Content.innerHTML = '';

    if (tipoEntregaSeleccionado === 'DOMICILIO') {
      const h1 = document.createElement('h1');
      h1.className = 'title-md';
      h1.textContent = '¿A dónde enviamos tu pedido?';
      step2Content.appendChild(h1);

      if (!cliente.direccion) {
        const banner = crear('div', 'banner banner-error');
        banner.style.marginTop = '16px';
        banner.innerHTML = ICONS.warning;
        const text = document.createElement('span');
        text.textContent = 'No tenés una dirección registrada. No podemos continuar con el envío a domicilio.';
        banner.appendChild(text);
        step2Content.appendChild(banner);
        return;
      }

      const card = crear('div', 'summary-card');
      card.style.marginTop = '16px';
      const iconWrap = crear('div', 'summary-card__icon');
      iconWrap.innerHTML = ICONS.pin;
      card.appendChild(iconWrap);
      const body = crear('div', 'summary-card__body');
      const h3 = document.createElement('h3');
      h3.textContent = 'Dirección de entrega';
      body.appendChild(h3);
      const p = document.createElement('p');
      p.textContent = formatearDireccion(cliente.direccion);
      body.appendChild(p);
      card.appendChild(body);
      step2Content.appendChild(card);

      const confirmBtn = crear('button', 'btn btn-primary');
      confirmBtn.type = 'button';
      confirmBtn.style.marginTop = '24px';
      confirmBtn.setAttribute('data-testid', 'btn-confirmar-direccion');
      confirmBtn.textContent = 'Confirmar dirección';
      confirmBtn.addEventListener('click', () => {
        renderStep3();
        mostrarPaso(2);
      });
      step2Content.appendChild(confirmBtn);
    } else {
      const card = crear('div', 'summary-card');
      const iconWrap = crear('div', 'summary-card__icon');
      iconWrap.innerHTML = ICONS.bag;
      card.appendChild(iconWrap);
      const body = crear('div', 'summary-card__body');
      const h3 = document.createElement('h3');
      h3.textContent = comercio.nombre;
      body.appendChild(h3);
      const p = document.createElement('p');
      p.textContent = comercio.direccion ? formatearDireccion(comercio.direccion) : 'Retiro en el local';
      body.appendChild(p);
      card.appendChild(body);
      step2Content.appendChild(card);

      const info = crear('div', 'info-box');
      info.style.marginTop = '20px';
      info.style.flexDirection = 'column';
      info.style.gap = '10px';
      const infoTitle = document.createElement('p');
      infoTitle.style.fontWeight = '700';
      infoTitle.style.color = 'var(--color-text)';
      infoTitle.textContent = '¿Cómo funciona el retiro?';
      info.appendChild(infoTitle);
      ['Confirmás el pedido.', 'El comercio lo prepara y te avisa cuando está listo.', 'Vas al local con tu nombre y número de pedido.'].forEach((linea) => {
        const p2 = document.createElement('p');
        p2.textContent = linea;
        info.appendChild(p2);
      });
      step2Content.appendChild(info);

      const confirmBtn = crear('button', 'btn btn-primary');
      confirmBtn.type = 'button';
      confirmBtn.style.marginTop = '24px';
      confirmBtn.setAttribute('data-testid', 'btn-confirmar-retiro');
      confirmBtn.textContent = 'Confirmar retiro';
      confirmBtn.addEventListener('click', () => {
        renderStep3();
        mostrarPaso(2);
      });
      step2Content.appendChild(confirmBtn);
    }
  }

  function renderStep3() {
    step3Content.innerHTML = '';

    const h1 = document.createElement('h1');
    h1.className = 'title-md';
    h1.textContent = 'Resumen de tu pedido';
    step3Content.appendChild(h1);

    const modalidadCard = crear('div', 'summary-card');
    modalidadCard.style.marginTop = '16px';
    const iconWrap = crear('div', 'summary-card__icon');
    iconWrap.innerHTML = tipoEntregaSeleccionado === 'DOMICILIO' ? ICONS.truck : ICONS.bag;
    modalidadCard.appendChild(iconWrap);
    const body = crear('div', 'summary-card__body');
    const h3 = document.createElement('h3');
    h3.textContent = tipoEntregaSeleccionado === 'DOMICILIO' ? 'Envío a domicilio' : 'Retiro en el local';
    body.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = tipoEntregaSeleccionado === 'DOMICILIO' && cliente.direccion
      ? formatearDireccion(cliente.direccion)
      : (comercio.direccion ? formatearDireccion(comercio.direccion) : comercio.nombre);
    body.appendChild(p);
    modalidadCard.appendChild(body);
    const editBtn = crear('button', 'summary-card__edit');
    editBtn.type = 'button';
    editBtn.setAttribute('data-testid', 'btn-editar-modalidad');
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => mostrarPaso(0));
    modalidadCard.appendChild(editBtn);
    step3Content.appendChild(modalidadCard);

    const desglose = crear('div', 'section-heading');
    desglose.style.marginTop = '24px';
    desglose.textContent = 'Desglose del pedido';
    step3Content.appendChild(desglose);

    carrito.items.forEach((item) => {
      const line = crear('div', 'order-line');
      const label = document.createElement('span');
      label.textContent = `${item.cantidad}x ${item.nombreProducto}`;
      line.appendChild(label);
      const value = document.createElement('span');
      value.textContent = formatearPrecio(item.subtotal);
      line.appendChild(value);
      step3Content.appendChild(line);
    });

    const totalLine = crear('div', 'order-line order-line--total');
    const totalLabel = document.createElement('span');
    totalLabel.textContent = 'Total';
    totalLine.appendChild(totalLabel);
    const totalValue = document.createElement('span');
    totalValue.setAttribute('data-testid', 'total-carrito');
    totalValue.textContent = formatearPrecio(carrito.subtotal);
    totalLine.appendChild(totalValue);
    step3Content.appendChild(totalLine);

    const confirmBtn = crear('button', 'btn btn-primary');
    confirmBtn.type = 'button';
    confirmBtn.style.marginTop = '24px';
    confirmBtn.setAttribute('data-testid', 'btn-confirmar-pedido');
    confirmBtn.textContent = `Confirmar Pedido - ${formatearPrecio(carrito.subtotal)}`;
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Confirmando...';
      try {
        const pedido = await apiFetch('/pedidos/cliente', {
          method: 'POST',
          body: {
            tipoEntrega: tipoEntregaSeleccionado,
            direccionId: tipoEntregaSeleccionado === 'DOMICILIO' ? cliente.direccion.id : undefined,
          },
        });
        normalizarCampos(pedido.direccion, ['calle']);
        (pedido.detalles || []).forEach((detalle) => normalizarCampos(detalle, ['nombreProducto']));
        mostrarModalPedidoConfirmado(pedido);
      } catch (error) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = `Confirmar Pedido - ${formatearPrecio(carrito.subtotal)}`;
        renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos confirmar tu pedido. Intentá nuevamente.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    step3Content.appendChild(confirmBtn);
  }

  function mostrarModalPedidoConfirmado(pedido) {
    const backdrop = crear('div', 'modal-backdrop');
    backdrop.setAttribute('data-testid', 'modal-pedido-confirmado');
    const sheet = crear('div', 'modal-sheet');
    const icon = crear('div', 'modal-sheet__icon modal-sheet__icon--success');
    icon.innerHTML = ICONS.check;
    sheet.appendChild(icon);
    const title = document.createElement('h2');
    title.className = 'modal-sheet__title';
    title.textContent = '¡Pedido enviado!';
    sheet.appendChild(title);
    const text = document.createElement('p');
    text.className = 'modal-sheet__text';
    text.setAttribute('data-testid', 'mensaje-pedido-confirmado');
    text.textContent = `Tu pedido #${pedido.id} fue enviado a ${comercio.nombre}. Te avisaremos cuando el comercio lo confirme.`;
    sheet.appendChild(text);
    const cta = document.createElement('a');
    cta.className = 'btn btn-primary';
    cta.href = 'index.html';
    cta.setAttribute('data-testid', 'btn-volver-catalogo');
    cta.textContent = 'Volver al catálogo';
    sheet.appendChild(cta);
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
  }

  mostrarPaso(0);
}
