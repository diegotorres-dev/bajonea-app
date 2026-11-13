import { apiFetch, ApiError, getUsuario } from './api.js';
import { exigirContextoCliente } from './contexto.js';
import { renderTopBar, renderBottomNav, pintarAvatarComercio, renderPedidoEstadoHeader, showToast } from './catalogo.js';
import { normalizarCampos } from './validators.js';
import { abrirHoja } from './hoja.js';
import { mostrarEsqueleto, mostrarErrorDeCarga } from './esqueletos.js';
import { crearBloqueReclamoCliente, crearChipReclamoDeLista, fechaDelReclamo } from './reclamos-comun.js';
import { enEscritorio, recargarAlCambiarDeModo } from './escritorio.js';
import { montarBarraClienteEnEscritorio } from './cliente-escritorio.js';

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
  checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

const ICON_CLASS = 'pedido-detail__icon--pendiente';

const TEXTO_PAGO_RECHAZADO = 'No pudimos procesar tu pago. Podés intentar de nuevo.';
const TEXTO_CONFIRMANDO_PAGO = 'Estamos confirmando tu pago. Esta pantalla se actualiza sola.';

const ESTADO_INFO = {
  PENDIENTE_PAGO: {
    label: 'Esperando pago',
    dotClass: 'pedido-estado__dot--pendiente',
    iconClass: ICON_CLASS,
    icon: ICONS.clock,
    texto: (_nombreComercio, pedido) => (pedido && pedido.pagoEstado === 'RECHAZADO' ? TEXTO_PAGO_RECHAZADO : 'Todavía no pagaste este pedido.'),
  },
  PENDIENTE_CONFIRMACION_COMERCIO: {
    label: 'Esperando al comercio',
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
  EN_CAMINO: {
    label: 'En camino',
    dotClass: 'pedido-estado__dot--positivo',
    iconClass: ICON_CLASS,
    icon: ICONS.truck,
    texto: (nombreComercio) => `Tu pedido de ${nombreComercio} está en camino.`,
  },
  LISTO_PARA_RETIRAR: {
    label: 'Listo para retirar',
    dotClass: 'pedido-estado__dot--positivo',
    iconClass: ICON_CLASS,
    icon: ICONS.bag,
    texto: (nombreComercio) => `Tu pedido está listo para retirar en ${nombreComercio}.`,
  },
  ENTREGADO: {
    label: 'Entregado',
    dotClass: 'pedido-estado__dot--positivo',
    iconClass: ICON_CLASS,
    icon: ICONS.checkCircle,
    texto: () => 'Tu pedido fue entregado.',
  },
  RECHAZADO: {
    label: 'Rechazado',
    dotClass: 'pedido-estado__dot--rechazado',
    iconClass: 'pedido-detail__icon--rechazado',
    icon: ICONS.xCircle,
    texto: (nombreComercio, pedido) => (rechazadoPorSuspensionDelComercio(pedido) ? TEXTO_RECHAZADO_POR_SUSPENSION : `${nombreComercio} rechazó tu pedido.`),
  },
  CANCELADO: {
    label: 'Cancelado',
    dotClass: 'pedido-estado__dot--rechazado',
    iconClass: ICON_CLASS,
    icon: ICONS.xCircle,
    texto: (_nombreComercio, pedido) => (pedido && pedido.reembolsoEstado ? 'Cancelaste este pedido. Estamos gestionando la devolución de tu pago.' : 'Cancelaste este pedido.'),
  },
  ANULADO: {
    label: 'Anulado',
    dotClass: 'pedido-estado__dot--rechazado',
    iconClass: ICON_CLASS,
    icon: ICONS.xCircle,
    texto: (nombreComercio) => `${nombreComercio} anuló tu pedido.`,
  },
  CANCELADO_POR_SISTEMA: {
    label: 'Cancelado',
    dotClass: 'pedido-estado__dot--rechazado',
    iconClass: ICON_CLASS,
    icon: ICONS.xCircle,
    texto: (_nombreComercio, pedido) => (canceladoPorSuspensionDelComercio(pedido) ? TEXTO_CANCELADO_POR_SUSPENSION : 'Tu pedido fue cancelado automáticamente.'),
  },
  EXPIRADO: {
    label: 'Expirado',
    dotClass: 'pedido-estado__dot--rechazado',
    iconClass: ICON_CLASS,
    icon: ICONS.clock,
    texto: () => 'El comercio no respondió a tiempo y el pedido se canceló.',
  },
  NO_RETIRADO: {
    label: 'No retirado',
    dotClass: 'pedido-estado__dot--vencido',
    iconClass: ICON_CLASS,
    icon: ICONS.xCircle,
    texto: (nombreComercio) => `${nombreComercio} cerró tu pedido como no retirado. Como ya estaba preparado, no hay devolución del pago.`,
  },
};

const ESTADO_INFO_DESCONOCIDO = {
  label: 'Estado no disponible',
  dotClass: 'pedido-estado__dot--vencido',
  iconClass: ICON_CLASS,
  icon: ICONS.clock,
  texto: () => 'Estamos actualizando el estado de este pedido.',
};

const TEXTO_COMERCIO_NO_DISPONIBLE = 'Este comercio no está recibiendo pedidos por ahora.';
const TEXTO_RECHAZADO_POR_SUSPENSION = 'El comercio no estaba disponible. Te devolvemos el dinero.';
const TEXTO_CANCELADO_POR_SUSPENSION = TEXTO_RECHAZADO_POR_SUSPENSION;

const ESTADO_INFO_SIN_ATENCION = {
  label: 'Cancelado',
  dotClass: 'pedido-estado__dot--rechazado',
  iconClass: ICON_CLASS,
  icon: ICONS.xCircle,
  texto: () => TEXTO_CANCELADO_POR_SUSPENSION,
};

const ESTADO_INFO_SIN_PAGAR = {
  label: 'Sin pagar',
  dotClass: 'pedido-estado__dot--pendiente',
  iconClass: ICON_CLASS,
  icon: ICONS.clock,
  texto: () => 'Todavía no pagaste este pedido.',
};

function canceladoPorSuspensionDelComercio(pedido) {
  return Boolean(pedido) && (pedido.estado === 'CANCELADO_POR_SISTEMA' || pedido.estado === 'ANULADO')
    && pedido.canceladoPor === 'SISTEMA' && pedido.reembolsoMotivo === 'SUSPENSION_COMERCIO';
}

function rechazadoPorSuspensionDelComercio(pedido) {
  return Boolean(pedido) && pedido.estado === 'RECHAZADO' && pedido.reembolsoMotivo === 'SUSPENSION_COMERCIO';
}

function infoDeEstadoPedido(estado, pedido) {
  if (pedido && pedido.comercioNoDisponible && estado === 'PENDIENTE_PAGO') {
    return ESTADO_INFO_SIN_PAGAR;
  }
  if (canceladoPorSuspensionDelComercio(pedido)) {
    return ESTADO_INFO_SIN_ATENCION;
  }
  return ESTADO_INFO[estado] || ESTADO_INFO_DESCONOCIDO;
}

function comercioDelPedido(pedido, comercioPorId) {
  const enCatalogo = comercioPorId.get(pedido.comercioId);
  if (enCatalogo) {
    return enCatalogo;
  }
  return { id: pedido.comercioId, nombre: pedido.comercioNombre, fotoPerfilUrl: pedido.comercioFotoUrl, fueraDelCatalogo: true };
}

const ESTADOS_CON_REEMBOLSO = ['RECHAZADO', 'CANCELADO', 'ANULADO', 'CANCELADO_POR_SISTEMA', 'EXPIRADO'];

function textoReembolso(pedido) {
  if (!ESTADOS_CON_REEMBOLSO.includes(pedido.estado) || !pedido.reembolsoEstado) return null;
  if (pedido.reembolsoEstado === 'PROCESADO') {
    return `Te devolvimos ${formatearPrecio(pedido.reembolsoMonto)} a tu medio de pago.`;
  }
  if (pedido.reembolsoEstado === 'FALLIDO' || pedido.reembolsoEstado === 'PENDIENTE_REVISION_MANUAL') {
    return 'No pudimos completar la devolución de tu pago automáticamente. La estamos revisando manualmente.';
  }
  return `Estamos procesando la devolución de ${formatearPrecio(pedido.reembolsoMonto)}.`;
}

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
  const partes = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
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

function renderEstadoDot(pedido) {
  const info = infoDeEstadoPedido(pedido.estado, pedido);
  const span = crear('span', 'pedido-estado');
  span.setAttribute('data-testid', 'estado-pedido');
  const dot = crear('span', `pedido-estado__dot ${info.dotClass}`);
  span.appendChild(dot);
  const label = document.createElement('span');
  label.textContent = info.label;
  span.appendChild(label);
  return span;
}

function renderEmptyState(container, titulo, texto, icono, accion = { texto: 'Explorar comercios', href: 'index.html', testid: 'btn-explorar-comercios' }) {
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
  cta.href = accion.href;
  cta.setAttribute('data-testid', accion.testid);
  cta.textContent = accion.texto;
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
  top.appendChild(renderEstadoDot(pedido));
  card.appendChild(top);

  const resumen = crear('p', 'pedido-card__resumen');
  resumen.textContent = formatearResumen(pedido.detalles);
  card.appendChild(resumen);

  const avisoComercio = pedido.comercioNoDisponible ? TEXTO_COMERCIO_NO_DISPONIBLE
    : (canceladoPorSuspensionDelComercio(pedido) ? TEXTO_CANCELADO_POR_SUSPENSION : null);
  if (avisoComercio) {
    const aviso = crear('p', 'pedido-card__aviso-comercio');
    aviso.setAttribute('data-testid', pedido.comercioNoDisponible ? 'aviso-comercio-no-disponible-pedido' : 'aviso-cancelado-por-suspension-pedido');
    aviso.textContent = avisoComercio;
    card.appendChild(aviso);
  }

  if (pedido.reclamo && pedido.reclamo.estado) {
    card.appendChild(crearChipReclamoDeLista(pedido.reclamo.estado));
  }

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
  if (!(await exigirContextoCliente())) {
    return;
  }
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    window.location.href = 'login.html';
    return;
  }

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Mis pedidos', destinoVolver: 'index.html' });
  renderBottomNav(document.getElementById('bottom-nav-slot'), 'pedidos');
  montarBarraClienteEnEscritorio({ activo: 'pedidos' });

  const container = document.getElementById('pedidos-content');
  mostrarEsqueleto(container, 'pedidos');

  let pedidos;
  let comercios;
  try {
    [pedidos, comercios] = await Promise.all([
      apiFetch('/pedidos/cliente'),
      apiFetch('/catalogo/comercios', { auth: false }),
    ]);
  } catch {
    mostrarErrorDeCarga(container, 'No pudimos cargar tus pedidos.');
    return;
  }
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

  recargarAlCambiarDeModo();
  if (enEscritorio()) {
    iniciarVistaMaestroDetalle({ container, pedidos, comercios, params: new URLSearchParams(window.location.search) });
    return;
  }

  const comercioPorId = new Map(comercios.map((comercio) => [comercio.id, comercio]));
  const ordenados = [...pedidos].sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

  const list = crear('div', 'pedido-list');
  ordenados.forEach((pedido) => {
    list.appendChild(renderPedidoCard(pedido, comercioDelPedido(pedido, comercioPorId)));
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
    { texto: 'Ver mis pedidos', href: 'pedidos.html', testid: 'btn-ver-mis-pedidos' },
  );
}

function abrirHojaDeAccionCliente({ endpoint, titulo, parrafos, etiqueta, etiquetaEnviando, variante, testid, mensajeExito, onActualizado, disparador }) {
  abrirHoja({
    disparador,
    titulo,
    parrafos,
    testid: `hoja-${testid}`,
    acciones: [
      {
        etiqueta,
        etiquetaEnviando,
        variante,
        testid: `btn-confirmar-${testid}`,
        alPulsar: async () => {
          const actualizado = await apiFetch(endpoint, { method: 'PUT' });
          normalizarPedido(actualizado);
          showToast(actualizado.reembolsoEstado ? `${mensajeExito}. Estamos gestionando la devolución de tu pago.` : mensajeExito);
          onActualizado(actualizado);
        },
      },
      { etiqueta: 'Volver', variante: 'segura', inicial: true, testid: 'btn-volver-hoja' },
    ],
  });
}

function abrirHojaCancelarPedido(pedido, onActualizado, disparador) {
  const yaPagado = pedido.estado !== 'PENDIENTE_PAGO';
  abrirHojaDeAccionCliente({
    endpoint: `/pedidos/cliente/${pedido.id}/cancelar`,
    titulo: `¿Cancelar el pedido #${pedido.id}?`,
    parrafos: [
      yaPagado
        ? `Ya lo pagaste. Si lo cancelás, te devolvemos los ${formatearPrecio(pedido.total)} a Mercado Pago. Puede demorar en verse en tu cuenta.`
        : 'Todavía no lo pagaste, así que no se te cobra nada.',
    ],
    etiqueta: 'Sí, cancelar pedido',
    etiquetaEnviando: 'Cancelando…',
    variante: 'peligro',
    testid: 'cancelar-pedido',
    mensajeExito: 'Pedido cancelado',
    onActualizado,
    disparador,
  });
}

function abrirHojaConfirmarRecepcion(pedido, onActualizado, disparador) {
  abrirHojaDeAccionCliente({
    endpoint: `/pedidos/cliente/${pedido.id}/entregar`,
    titulo: '¿Ya tenés tu pedido?',
    parrafos: ['Si no lo recibiste, no lo confirmes todavía.'],
    etiqueta: 'Sí, lo recibí',
    etiquetaEnviando: 'Confirmando…',
    variante: 'primaria',
    testid: 'confirmar-recepcion',
    mensajeExito: 'Entrega confirmada',
    onActualizado,
    disparador,
  });
}

const ESTADOS_FINALES_PEDIDO = new Set(['ENTREGADO', 'CANCELADO', 'CANCELADO_POR_SISTEMA', 'RECHAZADO', 'ANULADO', 'EXPIRADO', 'NO_RETIRADO']);

function firmaDelPedido(pedido) {
  return [pedido.estado, pedido.pagoEstado, pedido.comercioNoDisponible, pedido.reembolsoEstado].join('|');
}

function renderAccionesCliente(container, pedido, onActualizado, { procesando = false } = {}) {
  container.innerHTML = '';

  if (pedido.estado === 'PENDIENTE_PAGO') {
    if (pedido.pagoEstado === 'PAGADO') {
      return;
    }
    const irAPagarBtn = crear('button', 'btn btn-primary');
    irAPagarBtn.type = 'button';
    irAPagarBtn.setAttribute('data-testid', 'btn-ir-a-pagar');
    if (pedido.comercioNoDisponible) {
      irAPagarBtn.disabled = true;
      irAPagarBtn.textContent = 'Ir a pagar con Mercado Pago';
      container.appendChild(irAPagarBtn);
      const ayuda = crear('p', 'field__hint accion-ayuda');
      ayuda.setAttribute('data-testid', 'ayuda-pago-comercio-no-disponible');
      ayuda.textContent = 'Vas a poder pagar cuando el comercio vuelva a estar disponible, si el pedido no venció.';
      container.appendChild(ayuda);
      const cancelarSinPagar = crear('button', 'btn btn-peligro-contorno');
      cancelarSinPagar.type = 'button';
      cancelarSinPagar.classList.add('sep-t-12');
      cancelarSinPagar.setAttribute('data-testid', 'btn-cancelar-pedido');
      cancelarSinPagar.textContent = 'Cancelar pedido';
      cancelarSinPagar.addEventListener('click', (evento) => abrirHojaCancelarPedido(pedido, onActualizado, evento.currentTarget));
      container.appendChild(cancelarSinPagar);
      return;
    }
    if (procesando) {
      irAPagarBtn.disabled = true;
      irAPagarBtn.textContent = 'El pago se está procesando';
      container.appendChild(irAPagarBtn);
      return;
    }
    irAPagarBtn.textContent = 'Ir a pagar con Mercado Pago';
    irAPagarBtn.addEventListener('click', async () => {
      irAPagarBtn.disabled = true;
      const original = irAPagarBtn.textContent;
      irAPagarBtn.textContent = 'Generando link de pago...';
      try {
        const pago = await apiFetch(`/pedidos/cliente/${pedido.id}/pago`, { method: 'POST', handle5xxGlobally: false });
        if (pago.yaPagado) {
          showToast('Tu pago se realizó correctamente');
          const lista = await apiFetch('/pedidos/cliente');
          lista.forEach(normalizarPedido);
          const actualizado = lista.find((p) => p.id === pedido.id);
          if (actualizado) {
            onActualizado(actualizado);
            return;
          }
        } else if (pago.enRevision) {
          showToast('Tu pago está pendiente de confirmación');
          irAPagarBtn.disabled = false;
          irAPagarBtn.textContent = original;
          return;
        } else {
          window.location.href = pago.urlPago;
          return;
        }
      } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'No pudimos generar el link de pago', 'error');
        irAPagarBtn.disabled = false;
        irAPagarBtn.textContent = original;
      }
    });
    container.appendChild(irAPagarBtn);
    return;
  }

  if (pedido.estado === 'PENDIENTE_CONFIRMACION_COMERCIO' || pedido.estado === 'EN_PREPARACION') {
    const cancelarBtn = crear('button', 'btn btn-peligro-contorno');
    cancelarBtn.type = 'button';
    cancelarBtn.setAttribute('data-testid', 'btn-cancelar-pedido');
    cancelarBtn.textContent = 'Cancelar pedido';
    cancelarBtn.addEventListener('click', (evento) => abrirHojaCancelarPedido(pedido, onActualizado, evento.currentTarget));
    container.appendChild(cancelarBtn);
    return;
  }

  if (pedido.estado === 'EN_CAMINO') {
    const entregarBtn = crear('button', 'btn btn-primary');
    entregarBtn.type = 'button';
    entregarBtn.setAttribute('data-testid', 'btn-confirmar-entrega');
    entregarBtn.textContent = 'Confirmar que recibí mi pedido';
    entregarBtn.addEventListener('click', (evento) => abrirHojaConfirmarRecepcion(pedido, onActualizado, evento.currentTarget));
    container.appendChild(entregarBtn);
  }
}

function renderReclamoCliente(body, pedido) {
  const reclamo = pedido.reclamo;
  if (!reclamo) {
    return;
  }
  if (reclamo.estado) {
    body.appendChild(crearBloqueReclamoCliente(reclamo, pedido.total));
    return;
  }
  const seccion = crear('section', 'reclamo-ofrecimiento');
  seccion.setAttribute('data-testid', 'seccion-reclamar');
  if (reclamo.puedeReclamar) {
    const aviso = crear('p', 'reclamo-ofrecimiento__texto');
    aviso.setAttribute('data-testid', 'texto-plazo-reclamo');
    aviso.textContent = `¿Tuviste un problema con este pedido? Tenés hasta el ${fechaDelReclamo(reclamo.fechaLimiteReclamo)} para reclamar.`;
    seccion.appendChild(aviso);
    const boton = crear('a', 'btn btn-secondary');
    boton.href = `reclamo-nuevo.html?pedido=${pedido.id}`;
    boton.setAttribute('data-testid', 'btn-reclamar-pedido');
    boton.textContent = 'Tuve un problema con este pedido';
    seccion.appendChild(boton);
  } else if (reclamo.avisoPlazoVencido) {
    const aviso = crear('p', 'reclamo-ofrecimiento__texto');
    aviso.setAttribute('data-testid', 'texto-plazo-vencido');
    aviso.textContent = reclamo.avisoPlazoVencido;
    seccion.appendChild(aviso);
    const boton = crear('button', 'btn btn-secondary');
    boton.type = 'button';
    boton.disabled = true;
    boton.setAttribute('data-testid', 'btn-reclamar-pedido');
    boton.textContent = 'Tuve un problema con este pedido';
    seccion.appendChild(boton);
  } else {
    return;
  }
  body.appendChild(seccion);
}

const MENSAJE_PROCESANDO = 'Tu pago se está procesando. Esto puede tardar unos segundos.';
const MENSAJE_PENDIENTE = 'Tu pago está pendiente de confirmación.';
const MENSAJE_PAGADO = 'Tu pago se realizó correctamente';
const MENSAJE_RECHAZADO = 'El pago no se pudo procesar. Podés intentar de nuevo desde la sección "Mis pedidos".';
const INTERVALO_SINCRONIZACION_MS = 3000;
const MAX_INTENTOS_SINCRONIZACION = 15;
const INTERVALO_LISTA_MS = 15000;

function leerVueltaDeMercadoPago(params) {
  const vueltaMpParam = params.get('pago');
  const vueltaMp = ['exito', 'pendiente', 'fallo'].includes(vueltaMpParam) ? vueltaMpParam : null;
  const paymentIdParam = params.get('payment_id') || params.get('collection_id');
  const paymentId = paymentIdParam && /^[0-9]{1,20}$/.test(paymentIdParam) ? paymentIdParam : null;
  return { vueltaMp, paymentId };
}

function crearDetallePedido({ container, comercios, pedido: pedidoInicial, vueltaMp, paymentId, alRenderizar = null, alCambiarPedido = null }) {
  let pedido = pedidoInicial;
  let abandonado = false;
  let ultimoEstado = `${pedido.estado}|${pedido.pagoEstado}`;

  function comercioActual() {
    return comercios.find((c) => c.id === pedido.comercioId);
  }

  function pagoEnProceso() {
    return (vueltaMp === 'exito' || vueltaMp === 'pendiente')
      && pedido.estado === 'PENDIENTE_PAGO'
      && pedido.pagoEstado === 'PENDIENTE';
  }

  function fijarPedido(nuevo) {
    pedido = nuevo;
    if (alCambiarPedido) {
      alCambiarPedido(nuevo);
    }
  }

  function renderDetalle() {
    const comercio = comercioActual();
    const nombreDelComercio = comercio ? comercio.nombre : (pedido.comercioNombre || 'El comercio');
    const info = infoDeEstadoPedido(pedido.estado, pedido);

    let motivoInfo = null;
    if (pedido.estado === 'RECHAZADO' && pedido.motivoRechazo) {
      motivoInfo = { motivoLabel: MOTIVO_RECHAZO_LABEL[pedido.motivoRechazo] || 'Motivo no disponible', comentario: pedido.comentarioRechazo };
    } else if (canceladoPorSuspensionDelComercio(pedido)) {
      motivoInfo = null;
    } else if (pedido.estado === 'ANULADO' && pedido.motivoRechazo) {
      motivoInfo = { motivoLabel: MOTIVO_RECHAZO_LABEL[pedido.motivoRechazo] || 'Motivo no disponible', comentario: pedido.comentarioRechazo };
    } else if (pedido.estado === 'ANULADO' && pedido.motivoAnulacion) {
      motivoInfo = { motivoLabel: pedido.motivoAnulacion, comentario: null };
    }

    renderPedidoEstadoHeader(container, {
      iconClass: info.iconClass,
      icono: info.icon,
      label: info.label,
      texto: pagoEnProceso() ? TEXTO_CONFIRMANDO_PAGO : info.texto(nombreDelComercio, pedido),
      numeroTexto: `Pedido #${pedido.id} · ${formatearFecha(pedido.fechaCreacion)}`,
      motivoRechazo: motivoInfo,
      reembolsoTexto: textoReembolso(pedido),
    });

    const body = crear('div', 'screen-body screen-body--tight');

    if (pedido.comercioNoDisponible) {
      const franja = crear('div', 'banner banner-warning');
      franja.setAttribute('role', 'status');
      franja.setAttribute('data-testid', 'franja-comercio-no-disponible');
      franja.classList.add('sep-b-16');
      franja.textContent = TEXTO_COMERCIO_NO_DISPONIBLE;
      body.appendChild(franja);
    }

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
    if (pedido.tipoEntrega === 'DOMICILIO' && pedido.direccion && pedido.direccion.referencia) {
      const referencia = document.createElement('p');
      referencia.className = 'referencia-entrega';
      referencia.setAttribute('data-testid', 'referencia-entrega-pedido');
      referencia.textContent = `Referencia: ${pedido.direccion.referencia}`;
      modalidadBody.appendChild(referencia);
    }
    modalidadCard.appendChild(modalidadBody);
    body.appendChild(modalidadCard);

    const desglose = crear('div', 'section-heading');
    desglose.classList.add('sep-t-20');
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
        nota.classList.add('sep-t-neg-4');
        nota.classList.add('sep-b-6');
        nota.textContent = `Nota: "${detalle.nota}"`;
        body.appendChild(nota);
      }
    });

    const cargoLine = crear('div', 'order-line');
    const cargoLabel = document.createElement('span');
    cargoLabel.textContent = 'Cargo por servicio';
    cargoLine.appendChild(cargoLabel);
    const cargoValue = document.createElement('span');
    cargoValue.textContent = formatearPrecio(pedido.cargoServicioCliente);
    cargoLine.appendChild(cargoValue);
    body.appendChild(cargoLine);

    const totalLine = crear('div', 'order-line order-line--total');
    const totalLabel = document.createElement('span');
    totalLabel.textContent = 'Total';
    totalLine.appendChild(totalLabel);
    const totalValue = document.createElement('span');
    totalValue.textContent = formatearPrecio(pedido.total);
    totalLine.appendChild(totalValue);
    body.appendChild(totalLine);

    renderReclamoCliente(body, pedido);

    const accionesSlot = crear('div', 'pedido-acciones');
    accionesSlot.classList.add('sep-t-24');
    body.appendChild(accionesSlot);
    renderAccionesCliente(accionesSlot, pedido, (actualizado) => {
      fijarPedido(actualizado);
      renderActual();
    }, { procesando: pagoEnProceso() });

    if (comercio) {
      const verComercio = document.createElement('a');
      verComercio.className = 'btn btn-secondary';
      verComercio.classList.add('sep-t-12');
      verComercio.href = `comercio-detalle.html?id=${comercio.id}`;
      verComercio.setAttribute('data-testid', 'btn-ver-comercio');
      verComercio.textContent = 'Ver comercio';
      body.appendChild(verComercio);
    }

    container.appendChild(body);
  }

  function renderActual() {
    if (alRenderizar) {
      alRenderizar(pedido);
    }
    renderDetalle();
  }

  function mostrarResultado(finalizado) {
    if (pedido.pagoEstado === 'PAGADO') {
      showToast(MENSAJE_PAGADO);
    } else if (pedido.estado === 'PENDIENTE_PAGO' && pedido.pagoEstado === 'RECHAZADO') {
      showToast(MENSAJE_RECHAZADO, 'error');
    } else if (pedido.estado === 'PENDIENTE_PAGO') {
      if (vueltaMp === 'exito' && !finalizado) {
        showToast(MENSAJE_PROCESANDO);
      } else {
        showToast(MENSAJE_PENDIENTE);
      }
    }
  }

  async function sincronizar() {
    const actualizado = await apiFetch(`/pedidos/cliente/${pedido.id}/pago/sincronizar`, {
      method: 'POST',
      body: paymentId ? { paymentId } : undefined,
    });
    normalizarPedido(actualizado);
    return actualizado;
  }

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function ciclo() {
    window.addEventListener('pagehide', () => { abandonado = true; });
    const maxIntentos = vueltaMp === 'fallo' ? 1 : MAX_INTENTOS_SINCRONIZACION;
    for (let intento = 1; intento <= maxIntentos; intento += 1) {
      if (abandonado) {
        return;
      }
      try {
        fijarPedido(await sincronizar());
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
          return;
        }
        if (intento === maxIntentos) {
          renderActual();
          mostrarResultado(true);
          return;
        }
      }
      if (abandonado) {
        return;
      }
      const estadoActual = `${pedido.estado}|${pedido.pagoEstado}`;
      const cambio = estadoActual !== ultimoEstado;
      ultimoEstado = estadoActual;
      const sigueEsperando = pagoEnProceso();
      const ultimo = intento === maxIntentos || !sigueEsperando;
      if (cambio || intento === 1 || ultimo) {
        renderActual();
        mostrarResultado(ultimo);
      }
      if (ultimo) {
        return;
      }
      await esperar(INTERVALO_SINCRONIZACION_MS);
    }
  }

  return { renderActual, renderDetalle, ciclo, fijarPedido, obtenerPedido: () => pedido };
}

export async function initPedidoDetalle() {
  if (!(await exigirContextoCliente())) {
    return;
  }
  const usuario = getUsuario();
  if (!usuario || usuario.rol !== 'CLIENTE') {
    window.location.href = 'login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const pedidoId = Number(params.get('id'));
  const container = document.getElementById('detalle-content');
  const { vueltaMp, paymentId } = leerVueltaDeMercadoPago(params);

  if (enEscritorio() && pedidoId) {
    window.location.replace(`pedidos.html${window.location.search}`);
    return;
  }

  montarBarraClienteEnEscritorio({ activo: 'pedidos' });

  if (!pedidoId) {
    renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: 'Pedido', destinoVolver: 'pedidos.html' });
    renderNoEncontrado(container);
    return;
  }

  async function cargarPedido(opciones) {
    const lista = await apiFetch('/pedidos/cliente', opciones);
    lista.forEach(normalizarPedido);
    return lista.find((p) => p.id === pedidoId);
  }

  const comercios = await apiFetch('/catalogo/comercios', { auth: false });
  normalizarComercios(comercios);
  const pedido = await cargarPedido();

  renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: pedido ? `Pedido #${pedido.id}` : 'Pedido', destinoVolver: 'pedidos.html' });

  if (!pedido) {
    renderNoEncontrado(container);
    return;
  }

  const detalle = crearDetallePedido({
    container,
    comercios,
    pedido,
    vueltaMp,
    paymentId,
    alRenderizar: (actual) => renderTopBar(document.getElementById('top-bar-slot'), { mostrarVolver: true, titulo: `Pedido #${actual.id}`, destinoVolver: 'pedidos.html' }),
  });

  detalle.renderDetalle();

  if (!vueltaMp) {
    window.setInterval(async () => {
      const actual = detalle.obtenerPedido();
      if (document.hidden || ESTADOS_FINALES_PEDIDO.has(actual.estado)) {
        return;
      }
      try {
        const vigente = await cargarPedido({ segundoPlano: true });
        if (vigente && firmaDelPedido(vigente) !== firmaDelPedido(actual)) {
          detalle.fijarPedido(vigente);
          detalle.renderActual();
        }
      } catch {
      }
    }, 15000);
    return;
  }

  await detalle.ciclo();
}

const FILTROS_PEDIDOS = [
  { clave: 'todos', etiqueta: 'Todos', coincide: () => true },
  { clave: 'en-curso', etiqueta: 'En curso', coincide: (pedido) => !ESTADOS_FINALES_PEDIDO.has(pedido.estado) },
  { clave: 'entregados', etiqueta: 'Entregados', coincide: (pedido) => pedido.estado === 'ENTREGADO' || pedido.estado === 'NO_RETIRADO' },
  { clave: 'cancelados', etiqueta: 'Cancelados', coincide: (pedido) => ['RECHAZADO', 'CANCELADO', 'CANCELADO_POR_SISTEMA', 'ANULADO', 'EXPIRADO'].includes(pedido.estado) },
];

function iniciarVistaMaestroDetalle({ container, pedidos: pedidosIniciales, comercios, params }) {
  const comercioPorId = new Map(comercios.map((comercio) => [comercio.id, comercio]));
  let pedidos = [...pedidosIniciales].sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
  let seleccionId = Number(params.get('id')) || null;
  let filtroActivo = 'todos';
  let detalle = null;
  let vueltaPendiente = leerVueltaDeMercadoPago(params);
  let firmaListaPintada = null;

  const columnaLista = crear('div', 'pedidos-escritorio__columna');
  const filtros = crear('div', 'chip-row pedidos-filtros');
  filtros.setAttribute('role', 'group');
  filtros.setAttribute('aria-label', 'Filtrar pedidos por estado');
  filtros.setAttribute('data-testid', 'filtros-pedidos');
  const lista = crear('div', 'pedido-list');
  lista.setAttribute('data-testid', 'lista-pedidos-escritorio');
  columnaLista.append(filtros, lista);
  const panel = crear('section', 'pedidos-escritorio__detalle');
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', 'Detalle del pedido');
  panel.setAttribute('data-testid', 'detalle-pedido-escritorio');
  const maestro = crear('div', 'pedidos-escritorio');
  maestro.append(columnaLista, panel);
  container.replaceChildren(maestro);

  function visibles() {
    const filtro = FILTROS_PEDIDOS.find((f) => f.clave === filtroActivo);
    return pedidos.filter(filtro.coincide);
  }

  function reflejarSeleccionEnUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('pago');
    url.searchParams.delete('payment_id');
    url.searchParams.delete('collection_id');
    if (seleccionId) {
      url.searchParams.set('id', String(seleccionId));
    } else {
      url.searchParams.delete('id');
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  function pintarFiltros() {
    filtros.replaceChildren(...FILTROS_PEDIDOS.map((filtro) => {
      const chip = crear('button', 'chip');
      chip.type = 'button';
      chip.textContent = filtro.etiqueta;
      chip.setAttribute('aria-pressed', String(filtro.clave === filtroActivo));
      chip.setAttribute('data-testid', `filtro-pedidos-${filtro.clave}`);
      chip.addEventListener('click', () => {
        filtroActivo = filtro.clave;
        pintarFiltros();
        pintarLista();
      });
      return chip;
    }));
  }

  function firmaLista() {
    return JSON.stringify([filtroActivo, seleccionId, pedidos.map((pedido) => `${pedido.id}:${firmaDelPedido(pedido)}`)]);
  }

  function pintarLista() {
    firmaListaPintada = firmaLista();
    const items = visibles();
    if (items.length === 0) {
      const vacio = crear('p', 'pedidos-escritorio__vacio');
      vacio.setAttribute('data-testid', 'pedidos-filtro-vacio');
      vacio.textContent = 'No hay pedidos con este filtro.';
      lista.replaceChildren(vacio);
      return;
    }
    lista.replaceChildren(...items.map((pedido) => {
      const tarjeta = renderPedidoCard(pedido, comercioDelPedido(pedido, comercioPorId));
      tarjeta.href = `pedidos.html?id=${pedido.id}`;
      if (pedido.id === seleccionId) {
        tarjeta.setAttribute('aria-current', 'true');
      }
      tarjeta.addEventListener('click', (evento) => {
        if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey || evento.button !== 0) {
          return;
        }
        evento.preventDefault();
        seleccionar(pedido.id, { enfocar: true });
      });
      return tarjeta;
    }));
  }

  function pintarPanelVacio(titulo, texto) {
    const vacio = crear('div', 'pedidos-escritorio__vacio');
    vacio.setAttribute('data-testid', 'pedidos-elegi-uno');
    const bloque = document.createElement('div');
    const t = crear('p', 'state-page__title');
    t.textContent = titulo;
    bloque.appendChild(t);
    if (texto) {
      const p = crear('p', 'state-page__text');
      p.textContent = texto;
      bloque.appendChild(p);
    }
    vacio.appendChild(bloque);
    panel.replaceChildren(vacio);
    detalle = null;
  }

  function pintarPanel() {
    const pedido = pedidos.find((p) => p.id === seleccionId);
    if (!seleccionId) {
      pintarPanelVacio('Elegí un pedido', 'Seleccioná un pedido de la lista para ver su detalle.');
      return;
    }
    if (!pedido) {
      pintarPanelVacio('No encontramos este pedido', 'El pedido que buscás no existe o no pertenece a tu cuenta.');
      return;
    }
    const vuelta = vueltaPendiente && vueltaPendiente.pedidoId === pedido.id ? vueltaPendiente : null;
    detalle = crearDetallePedido({
      container: panel,
      comercios,
      pedido,
      vueltaMp: vuelta ? vuelta.vueltaMp : null,
      paymentId: vuelta ? vuelta.paymentId : null,
      alCambiarPedido: (nuevo) => {
        const indice = pedidos.findIndex((p) => p.id === nuevo.id);
        if (indice >= 0) {
          pedidos[indice] = nuevo;
        }
        if (firmaLista() !== firmaListaPintada) {
          pintarLista();
        }
      },
    });
    detalle.renderDetalle();
    if (vuelta && vuelta.vueltaMp) {
      vueltaPendiente = null;
      detalle.ciclo();
    }
  }

  function seleccionar(id, { enfocar = false } = {}) {
    seleccionId = id;
    reflejarSeleccionEnUrl();
    pintarLista();
    pintarPanel();
    if (enfocar) {
      const tarjeta = lista.querySelector('[aria-current="true"]');
      if (tarjeta) {
        tarjeta.focus({ preventScroll: true });
      }
    }
  }

  lista.addEventListener('keydown', (evento) => {
    if (evento.key !== 'ArrowDown' && evento.key !== 'ArrowUp') {
      return;
    }
    const tarjetas = [...lista.querySelectorAll('.pedido-card')];
    const actual = tarjetas.indexOf(document.activeElement);
    if (actual < 0) {
      return;
    }
    evento.preventDefault();
    const destino = tarjetas[Math.max(0, Math.min(tarjetas.length - 1, actual + (evento.key === 'ArrowDown' ? 1 : -1)))];
    destino.focus();
  });

  if (vueltaPendiente.vueltaMp && seleccionId) {
    vueltaPendiente = { ...vueltaPendiente, pedidoId: seleccionId };
  } else {
    vueltaPendiente = null;
  }

  pintarFiltros();
  pintarLista();
  pintarPanel();
  if (seleccionId) {
    reflejarSeleccionEnUrl();
  }

  window.setInterval(async () => {
    if (document.hidden) {
      return;
    }
    try {
      const lote = await apiFetch('/pedidos/cliente', { segundoPlano: true });
      lote.forEach(normalizarPedido);
      const nuevos = [...lote].sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
      const firmaAntes = pedidos.map((pedido) => `${pedido.id}:${firmaDelPedido(pedido)}`).join('|');
      const firmaDespues = nuevos.map((pedido) => `${pedido.id}:${firmaDelPedido(pedido)}`).join('|');
      if (firmaAntes === firmaDespues) {
        return;
      }
      const anterior = pedidos.find((p) => p.id === seleccionId);
      pedidos = nuevos;
      pintarLista();
      const vigente = pedidos.find((p) => p.id === seleccionId);
      if (vigente && (!anterior || firmaDelPedido(anterior) !== firmaDelPedido(vigente))) {
        if (detalle) {
          detalle.fijarPedido(vigente);
          detalle.renderActual();
        } else {
          pintarPanel();
        }
      }
    } catch {
    }
  }, INTERVALO_LISTA_MS);
}
