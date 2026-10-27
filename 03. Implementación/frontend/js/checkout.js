import { apiFetch, ApiError, getUsuario } from './api.js';
import { exigirContextoCliente } from './contexto.js';
import { showToast } from './catalogo.js';
import { crearBannerCierre, crearBotonVolverAlCatalogo, esConflictoDeCierre, estaAbiertoParaClientes } from './apertura-comercio.js';
import { normalizarCampos } from './validators.js';
import { crearPrecioUnitario } from './precio-cambio.js';
import {
  MAXIMO_DIRECCIONES,
  MENSAJE_CUPO_LLENO,
  RUTA_MIS_DIRECCIONES,
  cargarDirecciones,
  abrirFormularioDireccion,
  crearTarjetaDireccionEntrega,
  habilitarFlechasRadiogroup,
  ajustarTabindexRadios,
  FIGURAS_MAS,
} from './direcciones.js';
import { h, crearSvg } from './form-utils.js';

const CLAVE_CHECKOUT_PENDIENTE = 'bajonea_checkout_pendiente';
const MENSAJE_SIN_DIRECCIONES = 'No tenés una dirección registrada. Agregá una para recibir tu pedido a domicilio.';
const MENSAJE_DIRECCION_INEXISTENTE = 'La dirección que elegiste ya no existe. Elegí otra para continuar con tu pedido.';

const ICONS = {
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
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

function renderBanner(slot, kind, texto, testid) {
  if (!texto) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = '';
  const banner = crear('div', `banner banner-${kind}`);
  banner.style.marginBottom = '20px';
  if (testid) {
    banner.setAttribute('data-testid', testid);
  }
  const iconWrap = document.createElement('span');
  iconWrap.innerHTML = ICONS[kind] || ICONS.warning;
  banner.appendChild(iconWrap.firstElementChild);
  const text = document.createElement('div');
  text.textContent = texto;
  banner.appendChild(text);
  slot.appendChild(banner);
}

function renderAvisoCierre(slot, texto, botonAccion) {
  slot.innerHTML = '';
  const banner = crearBannerCierre(texto);
  banner.style.marginBottom = '20px';
  slot.appendChild(banner);
  botonAccion.disabled = true;
  botonAccion.classList.add('is-hidden');
  const anterior = botonAccion.parentElement.querySelector('[data-testid="btn-volver-al-catalogo"]');
  if (anterior) {
    anterior.remove();
  }
  const volver = crearBotonVolverAlCatalogo();
  volver.style.marginTop = botonAccion.style.marginTop;
  botonAccion.after(volver);
}

export async function initCheckout() {
  if (!(await exigirContextoCliente())) {
    return;
  }
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    window.location.href = 'login.html';
    return;
  }

  const bannerSlot = document.getElementById('banner-slot');
  const steps = [document.getElementById('step-1'), document.getElementById('step-2'), document.getElementById('step-3'), document.getElementById('step-4')];
  const bars = document.querySelectorAll('.step-progress__bar');
  const labels = document.querySelectorAll('.step-progress__labels span');
  const backBtn = document.getElementById('back-btn');
  let currentStep = 0;
  let tipoEntregaSeleccionado = null;
  let montosActualizados = false;
  let direcciones = [];
  let direccionElegida = null;

  function mostrarPaso(index) {
    steps.forEach((step, i) => step.classList.toggle('is-hidden', i !== index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--done', i < index));
    bars.forEach((bar, i) => bar.classList.toggle('step-progress__bar--active', i <= index));
    labels.forEach((label, i) => label.classList.toggle('is-active', i === index));
    currentStep = index;
    backBtn.style.visibility = index === 3 ? 'hidden' : 'visible';
    renderBanner(bannerSlot, 'info', '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backBtn.addEventListener('click', () => {
    if (currentStep === 3) {
      return;
    }
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

  const comercios = await apiFetch('/catalogo/comercios', { auth: false });
  comercios.forEach((c) => {
    normalizarCampos(c, ['nombre', 'razonSocial']);
    normalizarCampos(c.direccion, ['calle']);
  });
  const comercio = comercios.find((c) => c.id === carrito.comercioId);

  if (!comercio) {
    renderBanner(bannerSlot, 'error', 'No pudimos cargar los datos del comercio. Volvé al carrito e intentá nuevamente.');
    document.getElementById('continuar-modalidad-btn').disabled = true;
    return;
  }

  const opcionesContainer = document.getElementById('delivery-options');
  const continuarBtn = document.getElementById('continuar-modalidad-btn');

  if (!estaAbiertoParaClientes(comercio)) {
    renderAvisoCierre(bannerSlot, 'Este comercio está cerrado en este momento. No podés completar el pedido hasta que vuelva a abrir.', continuarBtn);
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
  const step4Content = document.getElementById('step-4-content');

  function crearTituloEntrega() {
    const titulo = document.createElement('h1');
    titulo.className = 'title-md';
    titulo.textContent = '¿Dónde recibís tu pedido?';
    return titulo;
  }

  async function renderEntregaDomicilio() {
    step2Content.replaceChildren(crearTituloEntrega(), h('div', { class: 'direcciones-entrega', 'aria-busy': 'true', 'data-testid': 'esqueleto-direcciones-entrega' }, [
      h('div', { class: 'skeleton direccion-esqueleto' }),
      h('div', { class: 'skeleton direccion-esqueleto' }),
    ]));
    try {
      direcciones = await cargarDirecciones();
    } catch (error) {
      const reintentar = h('button', { type: 'button', class: 'btn btn-secondary', style: 'margin-top:16px;', 'data-testid': 'btn-reintentar-direcciones-entrega' }, ['Reintentar']);
      reintentar.addEventListener('click', renderEntregaDomicilio);
      const aviso = crear('div', 'banner banner-error');
      aviso.setAttribute('role', 'alert');
      aviso.style.marginTop = '16px';
      aviso.setAttribute('data-testid', 'error-direcciones-entrega');
      const texto = document.createElement('span');
      texto.textContent = 'No pudimos cargar tus direcciones.';
      aviso.appendChild(texto);
      step2Content.replaceChildren(crearTituloEntrega(), aviso, reintentar);
      return;
    }
    const previa = direccionElegida ? direcciones.find((d) => d.id === direccionElegida.id) : null;
    direccionElegida = previa || direcciones.find((d) => d.principal) || direcciones[0] || null;
    pintarEntregaDomicilio();
  }

  function abrirAltaDesdeCheckout() {
    abrirFormularioDireccion({
      alGuardar: (guardada) => {
        if (guardada) {
          direccionElegida = { id: guardada.id };
        }
        renderEntregaDomicilio();
      },
    });
  }

  function irAAdministrarDirecciones() {
    try {
      sessionStorage.setItem(CLAVE_CHECKOUT_PENDIENTE, JSON.stringify({
        comercioId: carrito.comercioId,
        tipoEntrega: tipoEntregaSeleccionado,
        direccionId: direccionElegida ? direccionElegida.id : null,
      }));
    } catch (error) {
      sessionStorage.removeItem(CLAVE_CHECKOUT_PENDIENTE);
    }
    window.location.href = `${RUTA_MIS_DIRECCIONES}&desde=checkout`;
  }

  function pintarEntregaDomicilio() {
    const titulo = crearTituloEntrega();
    if (direcciones.length === 0) {
      const banner = crear('div', 'banner banner-error');
      banner.setAttribute('role', 'alert');
      banner.style.marginTop = '16px';
      banner.innerHTML = ICONS.warning;
      const text = document.createElement('span');
      text.textContent = MENSAJE_SIN_DIRECCIONES;
      banner.appendChild(text);
      const agregar = h('button', { type: 'button', class: 'btn btn-primary', style: 'margin-top:16px;', 'data-testid': 'btn-agregar-primera-direccion' }, ['Agregar dirección']);
      agregar.addEventListener('click', abrirAltaDesdeCheckout);
      step2Content.replaceChildren(titulo, banner, agregar);
      return;
    }

    const grupo = h('div', { class: 'direcciones-entrega', role: 'radiogroup', 'aria-label': 'Dirección de entrega', 'data-testid': 'radiogroup-direcciones' });
    direcciones.forEach((direccion) => {
      const tarjeta = crearTarjetaDireccionEntrega(direccion, direccionElegida && direccion.id === direccionElegida.id);
      tarjeta.addEventListener('click', () => {
        direccionElegida = direccion;
        grupo.querySelectorAll('[role="radio"]').forEach((radio) => radio.setAttribute('aria-checked', String(radio === tarjeta)));
        ajustarTabindexRadios(grupo);
      });
      grupo.appendChild(tarjeta);
    });
    ajustarTabindexRadios(grupo);
    habilitarFlechasRadiogroup(grupo, { seleccionarAlMover: true });

    const cupoLleno = direcciones.length >= MAXIMO_DIRECCIONES;
    const agregar = h('button', {
      type: 'button',
      class: 'btn-punteado',
      disabled: cupoLleno,
      'aria-describedby': cupoLleno ? 'aviso-cupo-checkout' : null,
      'data-testid': 'btn-agregar-otra-direccion',
    }, [crearSvg(FIGURAS_MAS), 'Agregar otra dirección']);
    agregar.addEventListener('click', abrirAltaDesdeCheckout);
    const elementos = [titulo, grupo, agregar];
    if (cupoLleno) {
      const aviso = crear('div', 'banner banner-info');
      aviso.id = 'aviso-cupo-checkout';
      aviso.setAttribute('role', 'status');
      aviso.style.marginTop = '12px';
      aviso.setAttribute('data-testid', 'aviso-cupo-checkout');
      const texto = document.createElement('span');
      texto.append(`${MENSAJE_CUPO_LLENO} `);
      const enlace = h('a', { href: `${RUTA_MIS_DIRECCIONES}&desde=checkout`, class: 'link', 'data-testid': 'enlace-mis-direcciones-cupo' }, ['Mis direcciones']);
      enlace.addEventListener('click', (evento) => {
        evento.preventDefault();
        irAAdministrarDirecciones();
      });
      texto.appendChild(enlace);
      aviso.appendChild(texto);
      elementos.push(aviso);
    }

    const administrar = h('button', { type: 'button', class: 'btn-text', style: 'margin-top:12px;min-height:44px;display:block;', 'data-testid': 'enlace-administrar-direcciones' }, ['Administrar mis direcciones']);
    administrar.addEventListener('click', irAAdministrarDirecciones);
    elementos.push(administrar);

    const confirmBtn = crear('button', 'btn btn-primary');
    confirmBtn.type = 'button';
    confirmBtn.style.marginTop = '16px';
    confirmBtn.setAttribute('data-testid', 'btn-confirmar-direccion');
    confirmBtn.textContent = 'Confirmar dirección';
    confirmBtn.addEventListener('click', () => {
      renderStep3();
      mostrarPaso(2);
    });
    elementos.push(confirmBtn);
    step2Content.replaceChildren(...elementos);
  }

  function renderStep2() {
    step2Content.innerHTML = '';

    if (tipoEntregaSeleccionado === 'DOMICILIO') {
      renderEntregaDomicilio();
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
    p.textContent = tipoEntregaSeleccionado === 'DOMICILIO' && direccionElegida
      ? formatearDireccion(direccionElegida)
      : (comercio.direccion ? formatearDireccion(comercio.direccion) : comercio.nombre);
    body.appendChild(p);
    if (tipoEntregaSeleccionado === 'DOMICILIO' && direccionElegida && direccionElegida.referencia) {
      const referencia = document.createElement('p');
      referencia.textContent = `Referencia: ${direccionElegida.referencia}`;
      referencia.setAttribute('data-testid', 'referencia-resumen');
      body.appendChild(referencia);
    }
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
      if (item.precioCambio) {
        const detalle = crear('div', 'order-line__detalle');
        detalle.appendChild(label);
        detalle.appendChild(crearPrecioUnitario(item));
        line.appendChild(detalle);
      } else {
        line.appendChild(label);
      }
      const value = document.createElement('span');
      value.textContent = formatearPrecio(item.subtotal);
      line.appendChild(value);
      step3Content.appendChild(line);
    });

    const cargoServicio = carrito.cargoServicioCliente || 0;
    const totalConCargo = carrito.subtotal + cargoServicio;

    const cargoLine = crear('div', 'order-line');
    const cargoLabel = document.createElement('span');
    cargoLabel.textContent = 'Cargo por servicio';
    cargoLine.appendChild(cargoLabel);
    const cargoValue = document.createElement('span');
    cargoValue.setAttribute('data-testid', 'cargo-servicio-carrito');
    cargoValue.textContent = formatearPrecio(cargoServicio);
    cargoLine.appendChild(cargoValue);
    step3Content.appendChild(cargoLine);

    const totalLine = crear('div', 'order-line order-line--total');
    const totalLabel = document.createElement('span');
    totalLabel.textContent = 'Total';
    totalLine.appendChild(totalLabel);
    const totalValue = document.createElement('span');
    totalValue.setAttribute('data-testid', 'total-carrito');
    totalValue.textContent = formatearPrecio(totalConCargo);
    totalLine.appendChild(totalValue);
    step3Content.appendChild(totalLine);

    const confirmBtn = crear('button', 'btn btn-primary');
    confirmBtn.type = 'button';
    confirmBtn.style.marginTop = '24px';
    confirmBtn.setAttribute('data-testid', montosActualizados ? 'btn-confirmar-nuevo-total' : 'btn-confirmar-pedido');
    const textoBoton = `${montosActualizados ? 'Confirmar con el nuevo total' : 'Ir a pagar'} - ${formatearPrecio(totalConCargo)}`;
    confirmBtn.textContent = textoBoton;
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Procesando...';
      try {
        const pedido = await apiFetch('/pedidos/cliente', {
          method: 'POST',
          body: {
            tipoEntrega: tipoEntregaSeleccionado,
            direccionId: tipoEntregaSeleccionado === 'DOMICILIO' ? direccionElegida.id : undefined,
            totalEsperado: totalConCargo,
          },
        });
        normalizarCampos(pedido.direccion, ['calle']);
        (pedido.detalles || []).forEach((detalle) => normalizarCampos(detalle, ['nombreProducto']));
        renderStep4(pedido);
        mostrarPaso(3);
      } catch (error) {
        confirmBtn.textContent = textoBoton;
        if (error instanceof ApiError && error.status === 409 && error.data && error.data.codigo === 'PRECIO_CAMBIO') {
          const hayItemConPrecioNuevo = (error.data.items || []).some((item) => item.precioCambio);
          carrito.items = error.data.items;
          carrito.subtotal = error.data.subtotal;
          carrito.cargoServicioCliente = error.data.cargoServicioCliente;
          carrito.total = error.data.total;
          montosActualizados = true;
          renderStep3();
          renderBanner(
            bannerSlot,
            'warning',
            hayItemConPrecioNuevo ? error.message : 'El cargo por servicio cambió. Revisá el nuevo total antes de pagar.',
            'aviso-total-cambio',
          );
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (error instanceof ApiError && error.status === 404 && tipoEntregaSeleccionado === 'DOMICILIO' && /direcci[oó]n/i.test(error.message || '')) {
          confirmBtn.disabled = false;
          direccionElegida = null;
          mostrarPaso(1);
          renderEntregaDomicilio().then(() => renderBanner(bannerSlot, 'error', MENSAJE_DIRECCION_INEXISTENTE));
          return;
        }
        if (esConflictoDeCierre(error)) {
          renderAvisoCierre(bannerSlot, error.message, confirmBtn);
        } else {
          confirmBtn.disabled = false;
          renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos confirmar tu pedido. Intentá nuevamente.');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    step3Content.appendChild(confirmBtn);
  }

  function renderStep4(pedido) {
    step4Content.innerHTML = '';

    const h1 = document.createElement('h1');
    h1.className = 'title-md';
    h1.textContent = 'Pago';
    step4Content.appendChild(h1);

    const p = document.createElement('p');
    p.className = 'subtitle';
    p.textContent = 'Te vamos a redirigir a Mercado Pago para completar el pago.';
    step4Content.appendChild(p);

    const totalLine = crear('div', 'order-line order-line--total');
    totalLine.style.marginTop = '16px';
    const totalLabel = document.createElement('span');
    totalLabel.textContent = 'Total';
    totalLine.appendChild(totalLabel);
    const totalValue = document.createElement('span');
    totalValue.textContent = formatearPrecio(pedido.total);
    totalLine.appendChild(totalValue);
    step4Content.appendChild(totalLine);

    const irAPagarBtn = crear('button', 'btn btn-primary');
    irAPagarBtn.type = 'button';
    irAPagarBtn.style.marginTop = '24px';
    irAPagarBtn.setAttribute('data-testid', 'btn-ir-a-pagar');
    irAPagarBtn.textContent = 'Ir a pagar con Mercado Pago';
    irAPagarBtn.addEventListener('click', async () => {
      irAPagarBtn.disabled = true;
      const original = irAPagarBtn.textContent;
      irAPagarBtn.textContent = 'Generando link de pago...';
      try {
        const pago = await apiFetch(`/pedidos/cliente/${pedido.id}/pago`, { method: 'POST', handle5xxGlobally: false });
        if (pago.yaPagado) {
          showToast('Tu pago se realizó correctamente');
          window.location.href = `pedido-detalle.html?id=${pedido.id}&pago=exito`;
          return;
        }
        if (pago.enRevision) {
          showToast('Tu pago está pendiente de confirmación');
          irAPagarBtn.disabled = false;
          irAPagarBtn.textContent = original;
          return;
        }
        window.location.href = pago.urlPago;
      } catch (error) {
        if (error instanceof ApiError && error.status === 503) {
          showToast(error.message, 'error');
          irAPagarBtn.disabled = false;
          irAPagarBtn.textContent = original;
          return;
        }
        renderBanner(bannerSlot, 'error', error instanceof ApiError ? error.message : 'No pudimos generar el link de pago. Intentá nuevamente.');
        irAPagarBtn.disabled = false;
        irAPagarBtn.textContent = original;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    step4Content.appendChild(irAPagarBtn);
  }

  mostrarPaso(0);

  let pendiente = null;
  try {
    pendiente = JSON.parse(sessionStorage.getItem(CLAVE_CHECKOUT_PENDIENTE) || 'null');
    sessionStorage.removeItem(CLAVE_CHECKOUT_PENDIENTE);
  } catch (error) {
    pendiente = null;
  }
  if (pendiente && pendiente.comercioId === carrito.comercioId && pendiente.tipoEntrega === 'DOMICILIO' && comercio.aceptaDelivery) {
    const opcion = opcionesContainer.querySelector('[data-testid="btn-modalidad-domicilio"]');
    if (opcion) {
      opcion.click();
      direccionElegida = pendiente.direccionId ? { id: pendiente.direccionId } : null;
      continuarBtn.click();
    }
  }
}
