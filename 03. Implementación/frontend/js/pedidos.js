import { apiFetch, getUsuario } from './api.js';
import { renderTopBar, renderBottomNav, pintarAvatarComercio, renderPedidoEstadoHeader } from './catalogo.js';
import { normalizarCampos } from './validators.js';

function normalizarPedido(pedido) {
  normalizarCampos(pedido, ['nombreCliente']);
  normalizarCampos(pedido.direccion, ['calle']);
  (pedido.detalles || []).forEach((detalle) => normalizarCampos(detalle, ['nombreProducto']));
  return pedido;
}

function normalizarComercios(comercios) {
  comercios.forEach((c) => {
    normalizarCampos(c, ['nombre', 'razonSocial']);
    normalizarCampos(c.direccion, ['calle']);
  });
  return comercios;
}

const ICONS = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  xCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

const ESTADO_INFO = {
  PENDIENTE: {
    label: 'Pendiente',
    dotClass: 'pedido-estado__dot--pendiente',
    iconClass: 'pedido-detail__icon--pendiente',
    icon: ICONS.clock,
    texto: (nombreComercio) => `Tu pedido fue enviado a ${nombreComercio}. Esperando confirmación.`,
  },
  EN_PREPARACION: {
    label: 'En preparación',
    dotClass: 'pedido-estado__dot--positivo',
    iconClass: 'pedido-detail__icon--preparacion',
    icon: ICONS.flame,
    texto: (nombreComercio) => `${nombreComercio} aceptó tu pedido y lo está preparando.`,
  },
  RECHAZADO: {
    label: 'Rechazado',
    dotClass: 'pedido-estado__dot--rechazado',
    iconClass: 'pedido-detail__icon--rechazado',
    icon: ICONS.xCircle,
    texto: (nombreComercio) => `${nombreComercio} rechazó tu pedido.`,
  },
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

function formatearFecha(fechaIso) {
  const fecha = new Date(fechaIso);
  const partes = fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${partes}, ${hora}`;
}

function formatearDireccion(direccion) {
  const partes = [`${direccion.calle} ${direccion.numero}`];
  if (direccion.pisoDepto) {
    partes.push(direccion.pisoDepto);
  }
  partes.push(direccion.nombreLocalidad);
  return partes.join(', ');
}

const MOTIVO_RECHAZO_LABEL = {
  SIN_STOCK: 'Sin stock',
  CERRADO: 'Comercio cerrado',
  ALTO_VOLUMEN_PEDIDOS: 'Alto volumen de pedidos',
  PRODUCTO_NO_DISPONIBLE_TEMPORAL: 'Producto no disponible temporalmente',
  SIN_DELIVERY_DISPONIBLE: 'Sin delivery disponible',
  PROBLEMA_TECNICO: 'Problema técnico',
  OTRO: 'Otro',
};

function formatearResumen(detalles) {
  const primeros = detalles.slice(0, 2).map((detalle) => `${detalle.cantidad}x ${detalle.nombreProducto}`);
  const resto = detalles.length - primeros.length;
  return resto > 0 ? `${primeros.join(', ')} y ${resto} más` : primeros.join(', ');
}

function renderEstadoDot(estado) {
  const info = ESTADO_INFO[estado];
  const span = crear('span', 'pedido-estado');
  span.setAttribute('data-testid', 'estado-pedido');
  const dot = crear('span', `pedido-estado__dot ${info.dotClass}`);
  span.appendChild(dot);
  const label = document.createElement('span');
  label.textContent = info.label;
  span.appendChild(label);
  return span;
}

function renderEmptyState(container, titulo, texto, icono) {
  container.innerHTML = '';
  const wrapper = crear('div', 'state-page');
  wrapper.setAttribute('data-testid', 'estado-vacio');
  const icon = crear('div', 'state-page__icon');
  icon.innerHTML = icono;
  wrapper.appendChild(icon);
  const h1 = document.createElement('h1');
  h1.className = 'state-page__title';
  h1.textContent = titulo;
  wrapper.appendChild(h1);
  const p = document.createElement('p');
  p.className = 'state-page__text';
  p.textContent = texto;
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

function renderPedidoCard(pedido, comercio) {
  const card = document.createElement('a');
  card.className = 'pedido-card';
  card.href = `pedido-detalle.html?id=${pedido.id}`;
  card.setAttribute('data-testid', `pedido-item-${pedido.id}`);

  const top = crear('div', 'pedido-card__top');
  const comercioRow = crear('div', 'pedido-card__comercio-row');
  const avatar = crear('div', 'pedido-card__avatar');
  pintarAvatarComercio(avatar, comercio || { nombre: `Pedido #${pedido.id}` });
  comercioRow.appendChild(avatar);
  const info = document.createElement('div');
  const comercioEl = crear('p', 'pedido-card__comercio');
  comercioEl.textContent = comercio ? comercio.nombre : `Pedido #${pedido.id}`;
  info.appendChild(comercioEl);
  const fechaEl = crear('p', 'pedido-card__fecha');
  fechaEl.textContent = `Pedido #${pedido.id} · ${formatearFecha(pedido.fechaCreacion)}`;
  info.appendChild(fechaEl);
  comercioRow.appendChild(info);
  top.appendChild(comercioRow);
  top.appendChild(renderEstadoDot(pedido.estado));
  card.appendChild(top);

  const resumen = crear('p', 'pedido-card__resumen');
  resumen.textContent = formatearResumen(pedido.detalles);
  card.appendChild(resumen);

  const bottom = crear('div', 'pedido-card__bottom');
  const total = crear('span', 'pedido-card__total');
  total.setAttribute('data-testid', 'total-pedido');
  total.textContent = formatearPrecio(pedido.total);
  bottom.appendChild(total);
  const verMas = crear('span', 'link');
  verMas.textContent = 'Ver detalle';
  bottom.appendChild(verMas);
  card.appendChild(bottom);

  return card;
}

export async function initPedidosHistorial() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    window.location.href = 'login.html';
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Mis pedidos' });
  renderBottomNav(document.getElementById('bottom-nav-slot'), 'pedidos');

  const container = document.getElementById('pedidos-content');

  const [pedidos, comercios] = await Promise.all([
    apiFetch('/pedidos/cliente'),
    apiFetch('/catalogo/comercios', { auth: false }),
  ]);
  (pedidos || []).forEach(normalizarPedido);
  normalizarComercios(comercios);

  if (!pedidos || pedidos.length === 0) {
    renderEmptyState(
      container,
      'Todavía no hiciste ningún pedido',
      'Cuando realices un pedido, vas a poder seguir su estado acá.',
      ICONS.list,
    );
    return;
  }

  const comercioPorId = new Map(comercios.map((comercio) => [comercio.id, comercio]));
  const ordenados = [...pedidos].sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

  const list = crear('div', 'pedido-list');
  ordenados.forEach((pedido) => {
    list.appendChild(renderPedidoCard(pedido, comercioPorId.get(pedido.comercioId)));
  });
  container.innerHTML = '';
  container.appendChild(list);
}

function renderNoEncontrado(container) {
  renderEmptyState(
    container,
    'No encontramos este pedido',
    'El pedido que buscás no existe o no pertenece a tu cuenta.',
    ICONS.alert,
  );
}

export async function initPedidoDetalle() {
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    window.location.href = 'login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const pedidoId = Number(params.get('id'));
  const container = document.getElementById('detalle-content');

  if (!pedidoId) {
    renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Pedido' });
    renderNoEncontrado(container);
    return;
  }

  const [pedidos, comercios] = await Promise.all([
    apiFetch('/pedidos/cliente'),
    apiFetch('/catalogo/comercios', { auth: false }),
  ]);
  pedidos.forEach(normalizarPedido);
  normalizarComercios(comercios);
  const pedido = pedidos.find((p) => p.id === pedidoId);

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: pedido ? `Pedido #${pedido.id}` : 'Pedido' });

  if (!pedido) {
    renderNoEncontrado(container);
    return;
  }

  const comercio = comercios.find((c) => c.id === pedido.comercioId);
  const info = ESTADO_INFO[pedido.estado];

  renderPedidoEstadoHeader(container, {
    iconClass: info.iconClass,
    icono: info.icon,
    label: info.label,
    texto: info.texto(comercio ? comercio.nombre : 'El comercio'),
    numeroTexto: `Pedido #${pedido.id} · ${formatearFecha(pedido.fechaCreacion)}`,
    motivoRechazo: pedido.estado === 'RECHAZADO' && pedido.motivoRechazo
      ? {
        motivoLabel: MOTIVO_RECHAZO_LABEL[pedido.motivoRechazo] || pedido.motivoRechazo,
        comentario: pedido.comentarioRechazo,
      }
      : null,
  });

  const body = crear('div', 'screen-body screen-body--tight');

  const modalidadCard = crear('div', 'summary-card');
  const modalidadIcon = crear('div', 'summary-card__icon');
  modalidadIcon.innerHTML = pedido.tipoEntrega === 'DOMICILIO' ? ICONS.truck : ICONS.bag;
  modalidadCard.appendChild(modalidadIcon);
  const modalidadBody = crear('div', 'summary-card__body');
  const modalidadTitulo = document.createElement('h3');
  modalidadTitulo.textContent = pedido.tipoEntrega === 'DOMICILIO' ? 'Envío a domicilio' : 'Retiro en el local';
  modalidadBody.appendChild(modalidadTitulo);
  const modalidadTexto = document.createElement('p');
  if (pedido.tipoEntrega === 'DOMICILIO' && pedido.direccion) {
    modalidadTexto.textContent = formatearDireccion(pedido.direccion);
  } else if (comercio) {
    modalidadTexto.textContent = comercio.direccion ? formatearDireccion(comercio.direccion) : comercio.nombre;
  } else {
    modalidadTexto.textContent = '';
  }
  modalidadBody.appendChild(modalidadTexto);
  modalidadCard.appendChild(modalidadBody);
  body.appendChild(modalidadCard);

  const desglose = crear('div', 'section-heading');
  desglose.style.marginTop = '20px';
  desglose.textContent = 'Desglose del pedido';
  body.appendChild(desglose);

  pedido.detalles.forEach((detalle) => {
    const line = crear('div', 'order-line');
    const label = document.createElement('span');
    label.textContent = `${detalle.cantidad}x ${detalle.nombreProducto}`;
    line.appendChild(label);
    const value = document.createElement('span');
    value.textContent = formatearPrecio(detalle.subtotal);
    line.appendChild(value);
    body.appendChild(line);
    if (detalle.nota) {
      const nota = crear('p', 'field__hint');
      nota.style.marginTop = '-4px';
      nota.style.marginBottom = '6px';
      nota.textContent = `Nota: "${detalle.nota}"`;
      body.appendChild(nota);
    }
  });

  const totalLine = crear('div', 'order-line order-line--total');
  const totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total';
  totalLine.appendChild(totalLabel);
  const totalValue = document.createElement('span');
  totalValue.textContent = formatearPrecio(pedido.total);
  totalLine.appendChild(totalValue);
  body.appendChild(totalLine);

  if (comercio) {
    const verComercio = document.createElement('a');
    verComercio.className = 'btn btn-secondary';
    verComercio.style.marginTop = '24px';
    verComercio.href = `comercio-detalle.html?id=${comercio.id}`;
    verComercio.setAttribute('data-testid', 'btn-ver-comercio');
    verComercio.textContent = 'Ver comercio';
    body.appendChild(verComercio);
  }

  container.appendChild(body);
}
