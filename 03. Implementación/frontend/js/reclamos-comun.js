import { h } from './form-utils.js';
import { texto } from './admin-hojas.js';
import { fechaLegible } from './soporte-comun.js';

export const MAX_DESCRIPCION_RECLAMO = 1000;
export const MIN_DESCRIPCION_RECLAMO = 10;
export const MAX_MOTIVO_RECHAZO = 500;
export const MIN_MOTIVO_RECHAZO = 10;

const MOTIVOS = Object.freeze({
  NO_RECIBI_PEDIDO: 'No recibí el pedido',
  FALTAN_PRODUCTOS: 'Faltan productos',
  PRODUCTOS_EQUIVOCADOS: 'Productos equivocados',
  PRODUCTO_EN_MAL_ESTADO: 'Producto en mal estado',
  COBRO_INCORRECTO: 'Cobro incorrecto',
  OTRO: 'Otro problema',
});

const ESTADOS = Object.freeze({
  PENDIENTE: { texto: 'En revisión', punto: 'pedido-estado__dot--pendiente', chip: 'Reclamo en revisión' },
  APROBADO: { texto: 'Aprobado', punto: 'pedido-estado__dot--positivo', chip: 'Reclamo aprobado' },
  RECHAZADO: { texto: 'Rechazado', punto: 'pedido-estado__dot--rechazado', chip: 'Reclamo rechazado' },
});

const ESTADO_DESCONOCIDO = { texto: 'Estado no disponible', punto: 'pedido-estado__dot--vencido', chip: 'Reclamo' };

export const TIPOS_RESOLUCION = Object.freeze({
  REEMBOLSO_TOTAL: 'Reembolso total',
  REEMBOLSO_PARCIAL: 'Reembolso parcial',
  RECHAZO: 'Reclamo rechazado',
});

export function etiquetaMotivoReclamo(motivo) {
  return MOTIVOS[motivo] || 'Otro problema';
}

export function formatearMonto(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return '$0';
  }
  const centavos = Math.round(numero * 100);
  const enteros = Math.floor(centavos / 100);
  const resto = centavos % 100;
  const miles = String(enteros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return resto === 0 ? `$${miles}` : `$${miles},${String(resto).padStart(2, '0')}`;
}

export function fechaDelReclamo(fechaHora) {
  return fechaLegible(fechaHora);
}

export function crearEstadoReclamo(estado, testid) {
  const datos = ESTADOS[estado] || ESTADO_DESCONOCIDO;
  return h('span', { class: 'pedido-estado', 'data-testid': testid, 'data-estado': estado }, [
    h('span', { class: `pedido-estado__dot ${datos.punto}`, 'aria-hidden': 'true' }),
    texto('span', '', datos.texto),
  ]);
}

export function crearChipReclamoDeLista(estado) {
  const datos = ESTADOS[estado] || ESTADO_DESCONOCIDO;
  return h('span', { class: 'reclamo-chip-lista', 'data-testid': 'chip-reclamo', 'data-estado': estado }, [
    h('span', { class: `pedido-estado__dot ${datos.punto}`, 'aria-hidden': 'true' }),
    texto('span', '', datos.chip),
  ]);
}

function textoDeReembolsoCliente(reclamo, totalPagado) {
  const monto = formatearMonto(reclamo.montoAprobado);
  if (reclamo.tipoResolucion === 'REEMBOLSO_PARCIAL') {
    return `Aprobamos tu reclamo. Te devolvemos ${monto} de los ${formatearMonto(totalPagado)} que pagaste.`;
  }
  return `Aprobamos tu reclamo. Te devolvemos ${monto}.`;
}

export function crearBloqueReclamoCliente(reclamo, totalPagado) {
  const hijos = [
    h('div', { class: 'reclamo-bloque__encabezado' }, [
      texto('h3', 'reclamo-bloque__titulo', 'Tu reclamo'),
      crearEstadoReclamo(reclamo.estado, 'estado-reclamo'),
    ]),
    texto('p', 'reclamo-bloque__linea', `${etiquetaMotivoReclamo(reclamo.motivo)} · Enviado el ${fechaDelReclamo(reclamo.fechaCreacion)}`, { 'data-testid': 'linea-reclamo' }),
  ];
  if (reclamo.estado === 'PENDIENTE') {
    hijos.push(texto('p', 'reclamo-bloque__texto', 'Lo estamos revisando. Te avisamos cuando tengamos novedades.', { 'data-testid': 'texto-reclamo-pendiente' }));
  } else if (reclamo.estado === 'APROBADO') {
    hijos.push(texto('p', 'reclamo-bloque__texto', textoDeReembolsoCliente(reclamo, totalPagado), { 'data-testid': 'texto-reclamo-aprobado' }));
    hijos.push(texto('p', 'reclamo-bloque__nota', reclamo.reembolsoEnProceso
      ? 'El reembolso está en proceso y puede tardar unos días en verse en tu medio de pago.'
      : 'El reembolso ya fue enviado a Mercado Pago. Puede tardar unos días en verse en tu medio de pago.', { 'data-testid': 'texto-reembolso-reclamo' }));
  } else if (reclamo.estado === 'RECHAZADO') {
    hijos.push(texto('p', 'reclamo-bloque__texto', 'No pudimos aprobar tu reclamo.', { 'data-testid': 'texto-reclamo-rechazado' }));
    hijos.push(h('p', { class: 'reclamo-bloque__motivo', 'data-testid': 'motivo-reclamo-rechazado' }, [
      texto('span', 'reclamo-bloque__motivo-rotulo', 'Motivo: '),
      texto('span', '', reclamo.motivoRechazo || ''),
    ]));
    hijos.push(texto('a', 'btn btn-secondary', 'Contactar a Soporte', { href: 'soporte.html?tipo=OTRA', 'data-testid': 'btn-contactar-soporte-reclamo' }));
  }
  return h('section', { class: 'reclamo-bloque', 'aria-label': 'Tu reclamo', 'data-testid': 'bloque-reclamo' }, hijos);
}

export function crearBloqueReclamoDueno(reclamo) {
  const hijos = [
    h('div', { class: 'reclamo-bloque__encabezado' }, [
      texto('h3', 'reclamo-bloque__titulo', 'Reclamo del Cliente'),
      crearEstadoReclamo(reclamo.estado, 'estado-reclamo-dueno'),
    ]),
    texto('p', 'reclamo-bloque__linea', `Motivo: ${etiquetaMotivoReclamo(reclamo.motivo)}`, { 'data-testid': 'motivo-reclamo-dueno' }),
  ];
  if (reclamo.estado === 'APROBADO' && reclamo.montoAprobado !== null && reclamo.montoAprobado !== undefined && Number(reclamo.montoAprobado) > 0) {
    const monto = formatearMonto(reclamo.montoAprobado);
    hijos.push(texto('p', 'reclamo-bloque__texto', reclamo.reembolsoEnProceso
      ? `Se están reembolsando ${monto} al Cliente.`
      : `Se reembolsaron ${monto} al Cliente.`, { 'data-testid': 'texto-reembolso-dueno' }));
  }
  return h('section', { class: 'reclamo-bloque', 'aria-label': 'Reclamo del Cliente', 'data-testid': 'bloque-reclamo-dueno' }, hijos);
}
