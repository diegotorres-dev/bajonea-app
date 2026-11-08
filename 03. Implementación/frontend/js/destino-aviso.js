export const ROL_AVISO = {
  CLIENTE: 'CLIENTE',
  DUENO: 'DUENO',
  EMPLEADO: 'EMPLEADO',
};

const RUTA_PANEL = 'comercio-dashboard.html';
const RUTA_DOCUMENTACION = 'comercio-documentacion.html';
const RUTA_EQUIPO = 'comercio-perfil.html?vista=equipo';
const RUTA_SELECTOR = 'seleccionar-contexto.html';
const RUTA_CARRITO = 'carrito.html';
const RUTA_PEDIDO_COMERCIO = 'comercio-pedido-detalle.html';
const RUTA_PEDIDO_CLIENTE = 'pedido-detalle.html';
const RUTA_RECHAZADO = 'comercio-rechazado.html';
const RUTA_RECHAZO_DEFINITIVO = 'comercio-rechazo-definitivo.html';

const PANEL_DEL_DUENO = {
  COMERCIO_APROBADO: 'Ver panel',
  COMERCIO_SUSPENDIDO: 'Ver panel',
  SUSPENSION_LEVANTADA: 'Ver panel',
  COMERCIO_APTO_VENTA: 'Ir al panel',
  COMERCIO_SIN_APTITUD: 'Ver qué falta',
};

const PANEL_DEL_EQUIPO = {
  COMERCIO_SUSPENDIDO_EQUIPO: 'Ver panel',
  COMERCIO_SUSPENSION_LEVANTADA_EQUIPO: 'Ver panel',
};

const DOCUMENTACION_DEL_DUENO = ['DOCUMENTO_APROBADO', 'DOCUMENTO_RECHAZADO'];
const EQUIPO_DEL_DUENO = ['INVITACION_EMPLEADO', 'EMPLEADO_DESACTIVADO'];
const RECLAMOS = ['RECLAMO_APROBADO', 'RECLAMO_RECHAZADO', 'RECLAMO_REEMBOLSO_DUENO'];

function destinoDePedido(notificacion, rol) {
  if (notificacion.entidadTipo !== 'PEDIDO' || !Number.isInteger(notificacion.entidadId)) {
    return null;
  }
  const ruta = rol === ROL_AVISO.CLIENTE ? RUTA_PEDIDO_CLIENTE : RUTA_PEDIDO_COMERCIO;
  return {
    href: `${ruta}?id=${notificacion.entidadId}`,
    texto: RECLAMOS.includes(notificacion.tipo) ? 'Ver reclamo' : 'Ver pedido',
  };
}

function destinoDeRechazo(notificacion, comercios) {
  const comercio = Array.isArray(comercios)
    ? comercios.find((candidato) => candidato.id === notificacion.entidadId)
    : null;
  if (comercio && comercio.estado === 'RECHAZO_DEFINITIVO') {
    return { href: `${RUTA_RECHAZO_DEFINITIVO}?id=${comercio.id}`, texto: 'Ver comercio' };
  }
  if (comercio && comercio.estado === 'RECHAZADO') {
    return { href: `${RUTA_RECHAZADO}?id=${comercio.id}`, texto: 'Ver comercio' };
  }
  if (comercio) {
    return { href: RUTA_PANEL, texto: 'Ver panel' };
  }
  return { href: `${RUTA_RECHAZADO}?id=${notificacion.entidadId}`, texto: 'Ver comercio' };
}

export function destinoDeAviso(notificacion, rol, comercios = null) {
  if (!notificacion) {
    return null;
  }
  const tipo = notificacion.tipo;
  const esDueno = rol === ROL_AVISO.DUENO;
  const esEmpleado = rol === ROL_AVISO.EMPLEADO;
  const esCliente = rol === ROL_AVISO.CLIENTE;

  const pedido = destinoDePedido(notificacion, rol);
  if (pedido) {
    return pedido;
  }
  if (esDueno) {
    if (PANEL_DEL_DUENO[tipo]) {
      return { href: RUTA_PANEL, texto: PANEL_DEL_DUENO[tipo] };
    }
    if (DOCUMENTACION_DEL_DUENO.includes(tipo)) {
      return { href: RUTA_DOCUMENTACION, texto: 'Ver documentación' };
    }
    if (EQUIPO_DEL_DUENO.includes(tipo)) {
      return { href: RUTA_EQUIPO, texto: 'Ver equipo' };
    }
    if (tipo === 'COMERCIO_RECHAZADO' && Number.isInteger(notificacion.entidadId)) {
      return destinoDeRechazo(notificacion, comercios);
    }
    return null;
  }
  if (esEmpleado) {
    return PANEL_DEL_EQUIPO[tipo] ? { href: RUTA_PANEL, texto: PANEL_DEL_EQUIPO[tipo] } : null;
  }
  if (esCliente) {
    if (tipo === 'EMPLEADO_REACTIVADO') {
      return { href: RUTA_SELECTOR, texto: 'Cambiar de cuenta' };
    }
    if (tipo === 'PRODUCTO_REMOVIDO_CARRITO') {
      return { href: RUTA_CARRITO, texto: 'Ver carrito' };
    }
  }
  return null;
}
