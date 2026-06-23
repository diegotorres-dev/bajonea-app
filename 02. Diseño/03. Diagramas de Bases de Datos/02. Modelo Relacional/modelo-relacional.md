//=================================================================
// ENUMS VISUALES (SIN PKs, MUESTRAN SOLO SUS VALORES)
//=================================================================

Table ENUM_RolUsuario {
  CLIENTE val
  COMERCIO val
  ADMINISTRADOR val
}

Table ENUM_EstadoUsuario {
  PENDIENTE val
  ACTIVO val
  BLOQUEADO val
  SUSPENDIDO val
  INACTIVO val
}

Table ENUM_CondicionIva {
  RESPONSABLE_INSCRIPTO val
  EXENTO val
  NO_INSCRIPTO val
  MONOTRIBUTO val
  RESPONSABLE_NACIONAL val
}

Table ENUM_TipoPersonaJuridica {
  SA val
  SRL val
  SAS val
  SC val
  SCS val
  SCRL val
  SCSA val
  SCCS val
  CC val
  CS val
  CCSA val
  CA val
  SP val
  ST val
  ACP val
  EMP val
  EU val
  UTE val
}

Table ENUM_TipoComercio {
  RESTAURANTE val
  EMPRENDIMIENTO val
}

Table ENUM_EstadoComercio {
  PENDIENTE val
  APROBADO val
  RECHAZADO val
  SUSPENDIDO val
  INACTIVO val
  CERRADO_TEMPORALMENTE val
}

Table ENUM_DiaSemana {
  LUNES val
  MARTES val
  MIERCOLES val
  JUEVES val
  VIERNES val
  SABADO val
  DOMINGO val
}

Table ENUM_TipoAccionComercio {
  APROBACION val
  RECHAZO val
  SUSPENSION val
  REACTIVACION val
}

Table ENUM_TipoToken {
  VERIFICACION_EMAIL val
  RECUPERACION_PASSWORD val
  REACTIVACION_CUENTA val
}

Table ENUM_EstadoToken {
  PENDIENTE val
  UTILIZADO val
  EXPIRADO val
}

Table ENUM_TipoCierreSesion {
  MANUAL val
  AUTOMATICO val
  FORZADO val
}

Table ENUM_EstadoProducto {
  DISPONIBLE val
  AGOTADO val
  DESCONTINUADO val
}

Table ENUM_ModalidadEntrega {
  DOMICILIO val
  RETIRO val
}

Table ENUM_MotivoRechazo{
  SIN_STOCK val
  CERRADO val
  ALTO_VOLUMEN_PEDIDOS val
  PRODUCTO_NO_DISPONIBLE_TEMPORAL val
  SIN_DELIVERY_DISPONIBLE val
  PROBLEMA_TECNICO val
  OTRO val
}

Table ENUM_EstadoPedido {
  PENDIENTE_PAGO val
  PENDIENTE val
  EN_PREPARACION val
  EN_CAMINO val
  LISTO_PARA_RETIRAR val
  ENTREGADO val
  RECHAZADO val
  CANCELADO val
  ANULADO val
  CANCELADO_POR_SISTEMA val
  EXPIRADO val
}

Table ENUM_EstadoPagoPedido {
  PENDIENTE val
  PAGADO val
  RECHAZADO val
}

Table ENUM_CanceladoPor {
  CLIENTE val
  COMERCIO val
  SISTEMA val
}

Table ENUM_FuenteEntrega {
  CLIENTE val
  COMERCIO val
  COMERCIO_SIN_RETIRO val
  SISTEMA val
}

Table ENUM_EstadoNotaCredito {
  PENDIENTE val
  PROCESADO val
  PENDIENTE_REINTENTO val
  FALLIDO val
}

Table ENUM_EstadoReclamo {
  PENDIENTE val
  APROBADO val
  RECHAZADO val
}

Table ENUM_ResultadoSoporte {
  REACTIVADO val
  SUSPENSION_MANTENIDA val
}

Table ENUM_CanalNotificacion {
  PUSH val
  EMAIL val
}

Table ENUM_EstadoEnvioNotificacion {
  PENDIENTE val
  ENVIADO val
  FALLIDO val
}

Table ENUM_TipoNotificacion {
  NUEVO_PEDIDO val
  PEDIDO_ACEPTADO val
  PEDIDO_RECHAZADO val
  PEDIDO_EN_CAMINO val
  PEDIDO_LISTO_RETIRO val
  AVISO_75MIN_SIN_CONFIRMACION val
  PEDIDO_AUTOCONFIRMADO val
  PEDIDO_CANCELADO_CLIENTE val
  PEDIDO_ANULADO_COMERCIO val
  PEDIDO_CANCELADO_SISTEMA val
  PEDIDO_EXPIRADO_CLIENTE val
  PEDIDO_EXPIRADO_COMERCIO val
  COMERCIO_APROBADO val
  COMERCIO_RECHAZADO val
  COMERCIO_SUSPENDIDO val
  NUEVO_COMERCIO_PENDIENTE val
  NUEVA_RESOLICITUD_COMERCIO val
  NUEVO_RECLAMO val
  RECLAMO_APROBADO val
  RECLAMO_RECHAZADO val
  NUEVO_MENSAJE_SOPORTE val
  PRODUCTO_REMOVIDO_CARRITO val
  CUENTA_INACTIVADA val
  COMERCIO_INACTIVADO val
  PEDIDO_CERRADO_TIMER_SUSPENSION val
  REEMBOLSO_FALLIDO_DEFINITIVO val
  CLIENTE_SUSPENDIDO val
  SUSPENSION_LEVANTADA val
  PEDIDO_AUTOCONFIRMADO_COMERCIO val
}


//=================================================================
// TABLAS LOGICAS ORIGINALES
//=================================================================

Table Provincia {
  id varchar(2) [pk]
  nombre varchar(100) [not null]
}

Table Localidad {
  id varchar(15) [pk]
  nombre varchar(150) [not null]
  provincia_id varchar(2) [not null]
}

Table Usuario {
  id int [pk, increment]
  email varchar(150) [not null, unique]
  password_hash varchar(255) [not null]
  rol RolUsuario [not null]
  estado EstadoUsuario [not null, default: 'PENDIENTE']
  email_verificado boolean [not null, default: false]
  intentos_fallidos int [not null, default: 0]
  fecha_registro datetime [not null, default: `now()`]
  fecha_ultimo_acceso datetime
  fecha_bloqueo datetime
  fecha_suspension datetime
  motivo_suspension varchar(500)
  fecha_inactivo datetime
  fecha_reactivacion datetime
  fecha_actualizacion datetime
}

Table Persona {
  id int [pk]
}

Table PersonaFisica {
  id int [pk]
  nombre varchar(100) [not null]
  apellido varchar(100) [not null]
  dni varchar(10) [not null, unique]
  fecha_nacimiento date [not null]
  telefono varchar(30) [not null]
  fecha_modificacion datetime
}

Table PersonaJuridica {
  id int [pk]
  razon_social varchar(150) [not null]
  cuit varchar(11) [not null, unique]
  condicion_iva CondicionIva [not null]
  tipo_sociedad TipoPersonaJuridica [not null]
  domicilio_fiscal varchar(255) [not null]
  fecha_inicio_actividades date [not null]
}

Table Cliente {
  id int [pk]
}

Table Administrador {
  id int [pk]
}

Table Comercio {
  id int [pk, increment]
  persona_juridica_id int [not null]
  nombre varchar(150) [not null]
  descripcion text
  foto_perfil_url varchar(500) [not null]
  telefono varchar(30) [not null]
  email varchar(150) [not null]
  tipo_comercio TipoComercio [not null]
  acepta_delivery boolean [not null, default: false]
  acepta_retiro boolean [not null, default: false]
  estado EstadoComercio [not null, default: 'PENDIENTE']
  cerrado_manualmente boolean [not null, default: false]
  motivo_rechazo varchar(500)
  fecha_rechazo datetime
  fecha_resolicitud datetime
  fecha_suspension datetime
  motivo_suspension varchar(500)
  mp_vinculado boolean [not null, default: false]
  fecha_aprobacion datetime
  fecha_registro datetime [not null, default: `now()`]
  fecha_modificacion datetime
  fecha_reactivacion datetime
}

Table Direccion {
  id int [pk, increment]
  calle varchar(150) [not null]
  numero varchar(10) [not null]
  piso_depto varchar(30)
  codigo_postal varchar(10) [not null]
  localidad_id varchar(15) [not null]
  cliente_id int
  comercio_id int [unique]
  principal boolean [not null, default: false]
  eliminada boolean [not null, default: false]
  fecha_creacion datetime [not null, default: `now()`]
  fecha_modificacion datetime
  fecha_baja datetime
}

Table Horario {
  id int [pk, increment]
  comercio_id int [not null]
  dia_semana DiaSemana [not null]
  hora_apertura time [not null]
  hora_cierre time [not null]
}

Table Token {
  id int [pk, increment]
  usuario_id int [not null]
  tipo TipoToken [not null]
  token varchar(36) [not null, unique]
  fecha_creacion datetime [not null, default: `now()`]
  fecha_vencimiento datetime [not null]
  fecha_uso datetime
  estado EstadoToken [not null, default: 'PENDIENTE']
}

Table Sesion {
  id int [pk, increment]
  usuario_id int [not null]
  activa boolean [not null, default: true]
  fecha_inicio datetime [not null, default: `now()`]
  fecha_cierre datetime
  tipo_cierre TipoCierreSesion
  ip_origen varchar(45) [not null]
  navegador varchar(255)
  dispositivo varchar(255)
}

Table Notificacion {
  id int [pk, increment]
  usuario_id int [not null]
  tipo TipoNotificacion [not null]
  mensaje varchar(500) [not null]
  leida boolean [not null, default: false]
  fecha_creacion datetime [not null, default: `now()`]
  canal CanalNotificacion [not null]
  estado EstadoEnvioNotificacion [not null, default: 'PENDIENTE']
  fecha_envio datetime
}

Table Soporte {
  id int [pk, increment]
  usuario_id int [not null]
  mensaje_descargo text [not null]
  fecha_envio datetime [not null, default: `now()`]
  atendido boolean [not null, default: false]
  administrador_id int
  resultado ResultadoSoporte
  fecha_resolucion datetime
}

Table Reclamo {
  id int [pk, increment]
  pedido_id int [not null, unique]
  descripcion text [not null]
  fecha_creacion datetime [not null, default: `now()`]
  estado EstadoReclamo [not null, default: 'PENDIENTE']
  administrador_id int
  motivo_rechazo varchar(500)
  fecha_resolucion datetime
}

Table HistorialAccionComercio {
  id int [pk, increment]
  comercio_id int [not null]
  administrador_id int [not null]
  tipo_accion TipoAccionComercio [not null]
  motivo varchar(500)
  estado_resultante EstadoComercio [not null]
  fecha_hora datetime [not null, default: `now()`]
}

Table ConfiguracionTarifa {
  id int [pk, increment]
  administrador_id int [not null]
  cargo_cliente decimal(10,2) [not null]
  cargo_comercio decimal(10,2) [not null]
  fecha_vigencia datetime [not null, default: `now()`]
}

Table CuentaMercadoPago {
  id int [pk, increment]
  comercio_id int [not null, unique]
  mp_user_id varchar(50) [not null]
  access_token varchar(255) [not null]
  refresh_token varchar(255) [not null]
  public_key varchar(255)
  activa boolean [not null, default: true]
  fecha_vinculacion datetime [not null, default: `now()`]
  fecha_desvinculacion datetime
  token_expira datetime
}

Table Categoria {
  id int [pk, increment]
  nombre varchar(100) [not null, unique]
  activo boolean [not null, default: true]
  fecha_creacion datetime [not null, default: `now()`]
  fecha_modificacion datetime 
  fecha_baja datetime
}

Table Tag {
  id int [pk, increment]
  nombre varchar(100) [not null, unique]
  activo boolean [not null, default: true]
  fecha_creacion datetime [not null, default: `now()`]
  fecha_modificacion datetime 
  fecha_baja datetime
}

Table Producto {
  id int [pk, increment]
  comercio_id int [not null]
  categoria_id int [not null]
  nombre varchar(150) [not null]
  descripcion text
  precio decimal(10,2) [not null]
  estado EstadoProducto [not null, default: 'DISPONIBLE']
  fecha_creacion datetime [not null, default: `now()`]
  fecha_modificacion datetime
  fecha_baja datetime
}

Table ImagenProducto {
  id int [pk, increment]
  producto_id int [not null]
  url varchar(500) [not null]
  orden int [not null, default: 0]
  es_principal boolean [not null, default: false]
}

Table ProductoTag {
  producto_id int [not null]
  tag_id int [not null]

  indexes {
    (producto_id, tag_id) [pk]
  }
}

Table Carrito {
  id int [pk, increment]
  cliente_id int [not null, unique]
  comercio_id int
  activo boolean [not null, default: true]
}

Table ItemCarrito {
  id int [pk, increment]
  carrito_id int [not null]
  producto_id int [not null]
  cantidad int [not null]
  nota varchar(255)
}

Table Pedido {
  id int [pk, increment]
  cliente_id int [not null]
  comercio_id int [not null]
  direccion_id int
  modalidad_entrega ModalidadEntrega [not null]
  estado EstadoPedido [not null, default: 'PENDIENTE_PAGO']
  pago_estado EstadoPagoPedido [not null, default: 'PENDIENTE']
  cancelado_por CanceladoPor
  motivo varchar (500)
  fuente_entrega FuenteEntrega
  fecha_entrega datetime
  suspension_retiro_expira datetime
  primer_aviso_emitido boolean [not null, default: false]
  motivo_rechazo MotivoRechazo
  detalle_rechazo varchar (500)
  subtotal decimal(10,2) [not null]
  cargo_servicio_cliente decimal(10,2) [not null]
  cargo_servicio_comercio decimal(10,2) [not null]
  total decimal(10,2) [not null]
  fecha_creacion datetime [not null, default: `now()`]
  fecha_pago datetime
  fecha_aceptacion datetime
  fecha_listo datetime
  fecha_despacho datetime
  fecha_cancelacion datetime
}

Table DetallePedido {
  id int [pk, increment]
  pedido_id int [not null]
  producto_id int [not null]
  cantidad int [not null]
  precio_unitario decimal(10,2) [not null]
  nota varchar(255)
  subtotal decimal(10,2) [not null]
}

Table HistorialEstadoPedido {
  id int [pk, increment]
  pedido_id int [not null]
  estado EstadoPedido [not null]
  cancelado_por CanceladoPor
  fuente_entrega FuenteEntrega
  fecha_hora datetime [not null, default: `now()`]
}

Table Pago {
  id int [pk, increment]
  pedido_id int [not null, unique]
  monto decimal(10,2) [not null]
  metodo_pago varchar(30)
  id_transaccion_mp varchar(50)
  fecha_creacion datetime [not null, default: `now()`]
  fecha_confirmacion datetime
}

Table NotaCredito {
  id int [pk, increment]
  pago_id int [not null, unique]
  monto decimal(10,2) [not null]
  estado EstadoNotaCredito [not null, default: 'PENDIENTE']
  intentos int [not null, default: 0]
  refund_id_mp varchar(50)
  fecha_emision datetime [not null, default: `now()`]
  fecha_proceso datetime
  fecha_fallido datetime
}

//=================================================================
// RELACIONES LÓGICAS DEL MODELO BASE
//=================================================================
Ref: Localidad.provincia_id > Provincia.id
Ref: Persona.id - Usuario.id
Ref: PersonaFisica.id - Persona.id
Ref: PersonaJuridica.id - Persona.id
Ref: Cliente.id - PersonaFisica.id
Ref: Administrador.id - PersonaFisica.id
Ref: Comercio.persona_juridica_id > PersonaJuridica.id
Ref: Direccion.localidad_id > Localidad.id
Ref: Direccion.cliente_id > Cliente.id
Ref: Direccion.comercio_id - Comercio.id
Ref: Horario.comercio_id > Comercio.id
Ref: Token.usuario_id > Usuario.id
Ref: Sesion.usuario_id > Usuario.id
Ref: Notificacion.usuario_id > Usuario.id
Ref: Soporte.usuario_id > Usuario.id
Ref: Soporte.administrador_id > Administrador.id
Ref: Reclamo.pedido_id - Pedido.id
Ref: Reclamo.administrador_id > Administrador.id
Ref: HistorialAccionComercio.comercio_id > Comercio.id
Ref: HistorialAccionComercio.administrador_id > Administrador.id
Ref: ConfiguracionTarifa.administrador_id > Administrador.id
Ref: CuentaMercadoPago.comercio_id - Comercio.id
Ref: Producto.comercio_id > Comercio.id
Ref: Producto.categoria_id > Categoria.id
Ref: ImagenProducto.producto_id > Producto.id
Ref: ProductoTag.producto_id > Producto.id
Ref: ProductoTag.tag_id > Tag.id
Ref: Carrito.cliente_id - Cliente.id
Ref: Carrito.comercio_id > Comercio.id
Ref: ItemCarrito.carrito_id > Carrito.id
Ref: ItemCarrito.producto_id > Producto.id
Ref: Pedido.cliente_id > Cliente.id
Ref: Pedido.comercio_id > Comercio.id
Ref: Pedido.direccion_id > Direccion.id
Ref: DetallePedido.pedido_id > Pedido.id
Ref: DetallePedido.producto_id > Producto.id
Ref: HistorialEstadoPedido.pedido_id > Pedido.id
Ref: Pago.pedido_id > Pedido.id
Ref: NotaCredito.pago_id - Pago.id
Ref: Notificacion.canal > ENUM_CanalNotificacion.PUSH
Ref: Notificacion.estado > ENUM_EstadoEnvioNotificacion.PENDIENTE

//=================================================================
// CONEXIONES VISUALES HACIA LOS ENUMS (SIN ALTERAR TIPOS NI PKs)
//=================================================================
Ref: Usuario.rol > ENUM_RolUsuario.CLIENTE
Ref: Usuario.estado > ENUM_EstadoUsuario.PENDIENTE
Ref: PersonaJuridica.condicion_iva > ENUM_CondicionIva.RESPONSABLE_INSCRIPTO
Ref: PersonaJuridica.tipo_sociedad > ENUM_TipoPersonaJuridica.SA
Ref: Comercio.tipo_comercio > ENUM_TipoComercio.RESTAURANTE
Ref: Comercio.estado > ENUM_EstadoComercio.PENDIENTE
Ref: Horario.dia_semana > ENUM_DiaSemana.LUNES
Ref: Token.tipo > ENUM_TipoToken.VERIFICACION_EMAIL
Ref: Token.estado > ENUM_EstadoToken.PENDIENTE
Ref: Sesion.tipo_cierre > ENUM_TipoCierreSesion.MANUAL
Ref: Notificacion.tipo > ENUM_TipoNotificacion.NUEVO_PEDIDO
Ref: Soporte.resultado > ENUM_ResultadoSoporte.REACTIVADO
Ref: Reclamo.estado > ENUM_EstadoReclamo.PENDIENTE
Ref: HistorialAccionComercio.tipo_accion > ENUM_TipoAccionComercio.APROBACION
Ref: HistorialAccionComercio.estado_resultante > ENUM_EstadoComercio.PENDIENTE
Ref: Producto.estado > ENUM_EstadoProducto.DISPONIBLE
Ref: Pedido.modalidad_entrega > ENUM_ModalidadEntrega.DOMICILIO
Ref: Pedido.estado > ENUM_EstadoPedido.PENDIENTE_PAGO
Ref: Pedido.pago_estado > ENUM_EstadoPagoPedido.PENDIENTE
Ref: Pedido.cancelado_por > ENUM_CanceladoPor.CLIENTE
Ref: Pedido.fuente_entrega > ENUM_FuenteEntrega.CLIENTE
Ref: HistorialEstadoPedido.estado > ENUM_EstadoPedido.PENDIENTE_PAGO
Ref: HistorialEstadoPedido.cancelado_por > ENUM_CanceladoPor.CLIENTE
Ref: HistorialEstadoPedido.fuente_entrega > ENUM_FuenteEntrega.CLIENTE
Ref: NotaCredito.estado > ENUM_EstadoNotaCredito.PENDIENTE
Ref: Pedido.motivo_rechazo > ENUM_MotivoRechazo.SIN_STOCK

//=================================================================
// CONTAINER GROUPS (TABLE GROUPS)
//=================================================================
TableGroup Geografia {
  Provincia
  Localidad
  Direccion
}

TableGroup Identidad_Usuarios {
  Usuario
  Persona
  PersonaFisica
  PersonaJuridica
  Cliente
  Administrador
  ENUM_RolUsuario
  ENUM_EstadoUsuario
}

TableGroup Modulo_Comercio {
  Comercio
  Horario
  CuentaMercadoPago
  HistorialAccionComercio
  ConfiguracionTarifa
  ENUM_CondicionIva
  ENUM_TipoPersonaJuridica
  ENUM_TipoComercio
  ENUM_EstadoComercio
  ENUM_DiaSemana
  ENUM_TipoAccionComercio
}

TableGroup Seguridad_Sesiones {
  Sesion
  Token
  ENUM_TipoToken
  ENUM_EstadoToken
  ENUM_TipoCierreSesion
}

TableGroup Sistema_Notificaciones {
  Notificacion
  ENUM_TipoNotificacion
  ENUM_CanalNotificacion
  ENUM_EstadoEnvioNotificacion
}

TableGroup Atencion_Soporte {
  Soporte
  Reclamo
  ENUM_EstadoReclamo
  ENUM_ResultadoSoporte
}

TableGroup Catalogo_Productos {
  Categoria
  Tag
  Producto
  ImagenProducto
  ProductoTag
  ENUM_EstadoProducto
}

TableGroup Operaciones_Ventas {
  Carrito
  ItemCarrito
  Pedido
  DetallePedido
  HistorialEstadoPedido
  Pago
  NotaCredito
  ENUM_ModalidadEntrega
  ENUM_EstadoPedido
  ENUM_EstadoPagoPedido
  ENUM_CanceladoPor
  ENUM_FuenteEntrega
  ENUM_EstadoNotaCredito
}
