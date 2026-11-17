# Modelo Relacional — Bajoneá (v3)

Actualizado a `diccionario-de-datos.md` v1.37: **56 tablas**. Este diagrama se regeneró completo a partir de las tablas del diccionario (columnas, tipos, claves primarias, foráneas y únicas). Respecto de la versión anterior (v1.16, 49 tablas):

- **Tablas nuevas (8):** `CierreTurno` (control del email de cierre de turno), `DocumentoComercio` y `DocumentoComercioArchivo` (documentación de habilitación del comercio), `TicketSoporte`, `MensajeSoporte` y `SoporteLimite` (soporte con conversación y límites antiabuso), `ReclamoFoto` y `ReclamoFotoArchivo` (fotos de los reclamos).
- **Tabla eliminada (1):** `Soporte` (se reemplazó por `TicketSoporte` y `MensajeSoporte`).
- **Columnas nuevas más relevantes:** `Direccion` (`nombre`, `referencia`, `principal_activa_cliente_id`), `Horario` (vigencia), `Usuario` (`motivo_suspension`, `suspendido_desde`), `Comercio` (suspensión de Dueño, `nombre_unico`), `Pedido` (copia de la dirección de entrega, turno), `Reclamo` (motivo, resolución, monto), `NotaCredito` (`reclamo_id`) y `DetallePedido` (`nota_credito_id`).
- Las tablas `GrupoExtra`, `Extra`, `ProductoGrupoExtra`, `ItemCarritoExtra` y `DetallePedidoExtra` siguen en el modelo, pero el sistema no las usa: los extras se descartaron (18/10/2026).
- Las relaciones se leen como "padre ‖——o{ hijo": la tabla de la izquierda es la referenciada y la de la derecha guarda la clave foránea (el nombre entre comillas).

Convenciones: `PK` clave primaria, `FK` clave foránea, `UK` clave única. Los tipos `ENUM_*` remiten a la sección 1 del diccionario de datos.

```mermaid
erDiagram
    Provincia {
        VARCHAR2 id PK
        VARCHAR100 nombre
    }
    Localidad {
        VARCHAR15 id PK
        VARCHAR150 nombre
        VARCHAR2 provincia_id FK
    }
    Direccion {
        INT id PK
        VARCHAR40 nombre
        VARCHAR150 calle
        VARCHAR10 numero
        VARCHAR30 piso_depto
        VARCHAR10 codigo_postal
        VARCHAR150 referencia
        VARCHAR15 localidad_id FK
        INT cliente_id FK
        INT comercio_id FK,UK
        TINYINT1 principal
        TINYINT1 eliminada
        DATETIME fecha_creacion
        DATETIME fecha_modificacion
        DATETIME fecha_baja
        INT principal_activa_cliente_id UK
    }
    Usuario {
        INT id PK
        VARCHAR254 email UK
        VARCHAR20 nombre_usuario UK
        VARCHAR255 password_hash
        ENUM_RolUsuario rol
        ENUM_EstadoUsuario estado
        TINYINT1 email_verificado
        VARCHAR500 foto_perfil_url
        INT intentos_fallidos
        VARCHAR500 motivo_suspension
        DATETIME suspendido_desde
        DATETIME fecha_registro
        DATETIME fecha_ultimo_acceso
        DATETIME fecha_actualizacion
    }
    HistorialEstadoUsuario {
        INT id PK
        INT usuario_id FK
        INT administrador_id FK
        ENUM_EstadoUsuario estado_origen
        ENUM_EstadoUsuario estado_destino
        VARCHAR500 motivo
        DATETIME fecha_hora
    }
    HistorialCambioNombreUsuario {
        INT id PK
        INT usuario_id FK
        VARCHAR20 nombre_usuario_anterior
        VARCHAR20 nombre_usuario_nuevo
        DATETIME fecha_cambio
    }
    Persona {
        INT id PK,FK
    }
    PersonaFisica {
        INT id PK,FK
        VARCHAR100 nombre
        VARCHAR100 apellido
        VARCHAR10 dni UK
        DATE fecha_nacimiento
        VARCHAR30 telefono
        DATETIME fecha_modificacion
    }
    PersonaJuridica {
        INT id PK,FK
        VARCHAR150 razon_social
        VARCHAR11 cuit UK
        ENUM_CondicionIva condicion_iva
        ENUM_TipoPersonaJuridica tipo_sociedad
        VARCHAR255 domicilio_fiscal
        DATE fecha_inicio_actividades
    }
    Cliente {
        INT id PK,FK
    }
    Administrador {
        INT id PK,FK
    }
    Empleado {
        INT id PK,FK
        DATETIME fecha_creacion
    }
    Dueno {
        INT id PK,FK
        INT persona_fisica_id FK,UK
        DATETIME fecha_creacion
    }
    Comercio {
        INT id PK
        INT dueno_id FK
        VARCHAR150 nombre
        VARCHAR150 nombre_unico UK
        TEXT descripcion
        VARCHAR500 foto_perfil_url
        VARCHAR30 telefono
        VARCHAR150 email
        ENUM_TipoComercio tipo_comercio
        TINYINT1 acepta_delivery
        TINYINT1 acepta_retiro
        ENUM_EstadoComercio estado
        ENUM_OrigenSuspension suspension_origen
        DATETIME suspendido_desde
        VARCHAR500 motivo_suspension
        TINYINT1 cerrado_manualmente
        DATETIME fecha_resolicitud
        INT cantidad_resolicitudes
        TINYINT1 mp_vinculado
        DATETIME fecha_registro
        DATETIME fecha_modificacion
    }
    Horario {
        INT id PK
        INT comercio_id FK
        ENUM_DiaSemana dia_semana
        TIME hora_apertura
        TIME hora_cierre
        DATE vigente_desde
        DATE vigente_hasta
    }
    RedSocial {
        INT id PK
        INT comercio_id FK
        ENUM_TipoRedSocial tipo
        VARCHAR500 url
        DATETIME fecha_creacion
        DATETIME fecha_modificacion
        DATETIME fecha_baja
    }
    CuentaMercadoPago {
        INT id PK
        INT dueno_id FK,UK
        VARCHAR50 mp_user_id
        VARCHAR500 access_token
        VARCHAR500 refresh_token
        VARCHAR255 public_key
        TINYINT1 activa
        TINYINT1 es_cuenta_prueba
        DATETIME fecha_vinculacion
        DATETIME fecha_desvinculacion
        DATETIME token_expira
        VARCHAR50 mp_user_id_activo UK
    }
    CodigoVinculacionMp {
        INT id PK
        INT dueno_id FK
        VARCHAR64 identificador_intento UK
        VARCHAR128 codigo_verificacion
        DATETIME fecha_creacion
        TINYINT1 usado
    }
    EmpleadoComercio {
        INT id PK
        INT empleado_id FK
        INT comercio_id FK
        ENUM_EstadoEmpleadoComercio estado
        DATETIME fecha_alta
        DATETIME fecha_baja
    }
    InvitacionEmpleado {
        INT id PK
        INT comercio_id FK
        VARCHAR254 email
        CHAR6 codigo
        ENUM_EstadoInvitacionEmpleado estado
        INT intentos_fallidos
        INT invitado_por_usuario_id FK
        INT usuario_aceptante_id FK
        DATETIME fecha_creacion
        DATETIME fecha_vencimiento
        DATETIME fecha_resolucion
        TINYINT1 pendiente_clave
    }
    HistorialEmpleadoComercio {
        INT id PK
        INT comercio_id FK
        INT empleado_comercio_id FK
        INT invitacion_id FK
        ENUM_EstadoEmpleadoComercio estado_origen
        ENUM_EstadoEmpleadoComercio estado_destino
        ENUM_MotivoHistorialEmpleado motivo
        INT actor_usuario_id FK
        DATETIME fecha_hora
    }
    HistorialEdicionComercio {
        INT id PK
        INT comercio_id FK
        INT usuario_id FK
        ENUM_ActorEdicion actor_rol
        ENUM_TipoEntidadEdicion entidad_tipo
        INT entidad_id
        VARCHAR150 entidad_nombre
        ENUM_AccionEdicion accion
        VARCHAR255 detalle
        DATETIME fecha_hora
    }
    HistorialEstadoComercio {
        INT id PK
        INT comercio_id FK
        INT administrador_id FK
        ENUM_EstadoComercio estado_origen
        ENUM_EstadoComercio estado_destino
        VARCHAR500 motivo
        ENUM_OrigenSuspension suspension_origen
        DATETIME fecha_hora
    }
    HistorialCambioComercio {
        INT id PK
        INT historial_estado_comercio_id FK
        VARCHAR40 campo
        TEXT valor_anterior
        TEXT valor_nuevo
    }
    HistorialCierreComercio {
        INT id PK
        INT comercio_id FK
        ENUM_AccionCierre accion
        INT actor_usuario_id FK
        ENUM_ActorCierre actor_rol
        DATETIME fecha_hora
    }
    CierreTurno {
        INT id PK
        INT comercio_id FK
        DATE turno_fecha
        INT horario_id FK
        DATETIME inicio
        DATETIME fin
        INT cantidad_pedidos
        DECIMAL14,2 vendido
        DECIMAL14,2 comision
        DECIMAL14,2 neto
        INT pendientes_al_cierre
        DATETIME fecha_cierre
        ENUM_EstadoEmailCierreTurno email_estado
        INT email_intentos
        DATETIME email_proximo_intento
        DATETIME email_envio_iniciado
        DATETIME email_fecha_envio
        VARCHAR500 email_ultimo_error
    }
    DocumentoComercio {
        INT id PK
        INT comercio_id FK
        ENUM_TipoDocumentoComercio tipo
        VARCHAR100 descripcion
        VARCHAR255 nombre_original
        VARCHAR100 tipo_mime
        INT tamano_bytes
        ENUM_EstadoDocumentoComercio estado
        VARCHAR255 motivo_rechazo
        DATETIME fecha_subida
        DATETIME fecha_resolucion
        INT administrador_id FK
        INT subido_por_usuario_id FK
    }
    DocumentoComercioArchivo {
        INT documento_id PK,FK
        LONGBLOB contenido
    }
    ConfiguracionTarifa {
        INT id PK
        INT administrador_id FK
        DECIMAL10,2 cargo_cliente
        ENUM_TipoCargo tipo_cargo_cliente
        DECIMAL10,2 cargo_comercio
        ENUM_TipoCargo tipo_cargo_comercio
        DATETIME fecha_vigencia
    }
    Token {
        INT id PK
        INT usuario_id FK
        ENUM_TipoToken tipo
        VARCHAR36 token UK
        DATETIME fecha_vencimiento
        DATETIME fecha_uso
        ENUM_EstadoToken estado
        INT intentos_fallidos
    }
    Sesion {
        INT id PK
        INT usuario_id FK
        TINYINT1 activa
        DATETIME fecha_inicio
        DATETIME fecha_cierre
        ENUM_TipoCierreSesion tipo_cierre
        VARCHAR45 ip_origen
        VARCHAR255 navegador
        VARCHAR255 dispositivo
    }
    Notificacion {
        INT id PK
        INT usuario_id FK
        ENUM_TipoNotificacion tipo
        VARCHAR500 mensaje
        TINYINT1 leida
        DATETIME fecha_creacion
        ENUM_CanalNotificacion canal
        ENUM_EstadoEnvioNotificacion estado
        DATETIME fecha_envio
        ENUM_TipoEntidadNotificacion entidad_tipo
        INT entidad_id
        INT comercio_id
    }
    TicketSoporte {
        INT id PK
        VARCHAR8 codigo UK
        VARCHAR254 email
        INT usuario_id FK
        ENUM_TipoTicketSoporte tipo
        ENUM_EstadoTicketSoporte estado
        VARCHAR45 ip
        INT cantidad_mensajes
        DATETIME creado_en
        DATETIME actualizado_en
        DATETIME cerrado_en
    }
    MensajeSoporte {
        INT id PK
        INT ticket_id FK
        ENUM_AutorMensajeSoporte autor
        VARCHAR1000 texto
        DATETIME creado_en
        TINYINT1 email_enviado
    }
    SoporteLimite {
        VARCHAR300 clave PK
        INT cantidad
        DATETIME ventana_inicio
    }
    Reclamo {
        INT id PK
        INT pedido_id FK,UK
        ENUM_MotivoReclamo motivo
        TEXT descripcion
        DATETIME fecha_creacion
        ENUM_EstadoReclamo estado
        ENUM_TipoResolucionReclamo tipo_resolucion
        DECIMAL10,2 monto_aprobado
        INT administrador_id FK
        VARCHAR500 nota_resolucion
        DATETIME fecha_resolucion
    }
    ReclamoFoto {
        INT id PK
        INT reclamo_id FK
        INT orden
        VARCHAR255 nombre_original
        VARCHAR50 tipo_contenido
        INT tamano_bytes
        DATETIME fecha_creacion
    }
    ReclamoFotoArchivo {
        INT foto_id PK,FK
        LONGBLOB contenido
    }
    Categoria {
        INT id PK
        VARCHAR100 nombre UK
        TINYINT1 activo
        DATETIME fecha_creacion
        DATETIME fecha_modificacion
        DATETIME fecha_baja
    }
    Tag {
        INT id PK
        VARCHAR100 nombre UK
        TINYINT1 activo
        DATETIME fecha_creacion
        DATETIME fecha_modificacion
        DATETIME fecha_baja
    }
    Producto {
        INT id PK
        INT comercio_id FK
        INT categoria_id FK
        VARCHAR150 nombre
        TEXT descripcion
        DECIMAL10,2 precio
        ENUM_EstadoProducto estado
        DATETIME fecha_creacion
        DATETIME fecha_modificacion
        DATETIME fecha_baja
    }
    ImagenProducto {
        INT id PK
        INT producto_id FK
        VARCHAR500 url
        INT orden
        TINYINT1 es_principal
    }
    ProductoTag {
        INT producto_id PK,FK
        INT tag_id PK,FK
    }
    GrupoExtra {
        INT id PK
        INT comercio_id FK
        VARCHAR100 nombre
        INT cantidad_maxima
        TINYINT1 obligatorio
        DATETIME fecha_creacion
        DATETIME fecha_modificacion
        DATETIME fecha_baja
    }
    Extra {
        INT id PK
        INT grupo_extra_id FK
        VARCHAR100 nombre
        DECIMAL10,2 precio
        DATETIME fecha_creacion
        DATETIME fecha_modificacion
        DATETIME fecha_baja
    }
    ProductoGrupoExtra {
        INT producto_id PK,FK
        INT grupo_extra_id PK,FK
    }
    Carrito {
        INT id PK
        INT cliente_id FK,UK
        INT comercio_id FK
        TINYINT1 activo
    }
    ItemCarrito {
        INT id PK
        INT carrito_id FK
        INT producto_id FK
        INT cantidad
        VARCHAR255 nota
        DECIMAL10,2 precio_visto
    }
    ItemCarritoExtra {
        INT id PK
        INT item_carrito_id FK
        INT extra_id FK
        DECIMAL10,2 precio_unitario
        DATETIME fecha_creacion
    }
    Pedido {
        INT id PK
        INT cliente_id FK
        INT comercio_id FK
        INT direccion_id FK
        VARCHAR150 entrega_calle
        VARCHAR10 entrega_numero
        VARCHAR30 entrega_piso_depto
        VARCHAR10 entrega_codigo_postal
        VARCHAR15 entrega_localidad_id
        VARCHAR150 entrega_referencia
        ENUM_ModalidadEntrega modalidad_entrega
        ENUM_EstadoPedido estado
        ENUM_EstadoPagoPedido pago_estado
        ENUM_CanceladoPor cancelado_por
        VARCHAR500 motivo
        ENUM_FuenteEntrega fuente_entrega
        DATETIME fecha_entrega
        DATETIME suspension_retiro_expira
        TINYINT1 primer_aviso_emitido
        ENUM_MotivoRechazo motivo_rechazo
        VARCHAR500 comentario_rechazo
        DECIMAL10,2 subtotal
        DECIMAL10,2 cargo_servicio_cliente
        DECIMAL10,2 cargo_servicio_comercio
        DECIMAL10,2 total
        DATETIME fecha_creacion
        DATETIME fecha_pago_confirmado
        DATE turno_fecha
        INT turno_horario_id FK
    }
    DetallePedido {
        INT id PK
        INT pedido_id FK
        INT producto_id FK
        INT cantidad
        DECIMAL10,2 precio_unitario
        VARCHAR255 nota
        DECIMAL10,2 subtotal
        ENUM_EstadoDetallePedido estado
        VARCHAR255 motivo_anulacion
        INT nota_credito_id FK
    }
    DetallePedidoExtra {
        INT id PK
        INT detalle_pedido_id FK
        INT extra_id FK
        DECIMAL10,2 precio_unitario
        DATETIME fecha_creacion
    }
    HistorialEstadoPedido {
        INT id PK
        INT pedido_id FK
        ENUM_EstadoPedido estado
        ENUM_ActorPedido actor_rol
        INT actor_usuario_id FK
        ENUM_MotivoTimeoutPedido motivo_timeout
        DATETIME fecha_hora
    }
    Pago {
        INT id PK
        INT pedido_id FK,UK
        VARCHAR120 mp_preferencia_id
        VARCHAR500 mp_init_point
        VARCHAR500 mp_sandbox_init_point
        DECIMAL10,2 monto
        VARCHAR30 metodo_pago
        VARCHAR30 mp_estado
        VARCHAR50 id_transaccion_mp
        DATETIME fecha_creacion
        DATETIME fecha_confirmacion
    }
    AlertaWebhookMp {
        INT id PK
        INT pedido_id FK
        VARCHAR50 mp_payment_id
        VARCHAR120 mp_external_reference
        ENUM_MotivoAlertaWebhookMp motivo
        DATETIME fecha_creacion
        VARCHAR45 ip_origen
        DECIMAL10,2 monto_esperado
        DECIMAL10,2 monto_capturado
    }
    NotaCredito {
        INT id PK
        INT pago_id FK
        DECIMAL10,2 monto
        ENUM_MotivoNotaCredito motivo
        ENUM_EstadoNotaCredito estado
        INT intentos
        VARCHAR50 refund_id_mp
        VARCHAR50 mp_payment_id
        VARCHAR500 ultimo_error
        INT reclamo_id FK,UK
        DATETIME fecha_emision
        DATETIME fecha_proceso
        DATETIME fecha_fallido
    }
    Provincia ||--o{ Localidad : "provincia_id"
    Localidad ||--o{ Direccion : "localidad_id"
    Cliente |o--o{ Direccion : "cliente_id"
    Comercio |o--o| Direccion : "comercio_id"
    Usuario ||--o{ HistorialEstadoUsuario : "usuario_id"
    Usuario |o--o{ HistorialEstadoUsuario : "administrador_id"
    Usuario ||--o{ HistorialCambioNombreUsuario : "usuario_id"
    Usuario ||--|| Persona : "id"
    Persona ||--|| PersonaFisica : "id"
    Persona ||--|| PersonaJuridica : "id"
    PersonaFisica ||--|| Cliente : "id"
    PersonaFisica ||--|| Administrador : "id"
    PersonaFisica ||--|| Empleado : "id"
    PersonaJuridica ||--|| Dueno : "id"
    PersonaFisica ||--o| Dueno : "persona_fisica_id"
    Dueno ||--o{ Comercio : "dueno_id"
    Comercio ||--o{ Horario : "comercio_id"
    Comercio ||--o{ RedSocial : "comercio_id"
    Dueno ||--o| CuentaMercadoPago : "dueno_id"
    Dueno ||--o{ CodigoVinculacionMp : "dueno_id"
    Empleado ||--o{ EmpleadoComercio : "empleado_id"
    Comercio ||--o{ EmpleadoComercio : "comercio_id"
    Comercio ||--o{ InvitacionEmpleado : "comercio_id"
    Usuario ||--o{ InvitacionEmpleado : "invitado_por_usuario_id"
    Usuario |o--o{ InvitacionEmpleado : "usuario_aceptante_id"
    Comercio ||--o{ HistorialEmpleadoComercio : "comercio_id"
    EmpleadoComercio |o--o{ HistorialEmpleadoComercio : "empleado_comercio_id"
    InvitacionEmpleado |o--o{ HistorialEmpleadoComercio : "invitacion_id"
    Usuario |o--o{ HistorialEmpleadoComercio : "actor_usuario_id"
    Comercio ||--o{ HistorialEdicionComercio : "comercio_id"
    Usuario ||--o{ HistorialEdicionComercio : "usuario_id"
    Comercio ||--o{ HistorialEstadoComercio : "comercio_id"
    Administrador |o--o{ HistorialEstadoComercio : "administrador_id"
    HistorialEstadoComercio ||--o{ HistorialCambioComercio : "historial_estado_comercio_id"
    Comercio ||--o{ HistorialCierreComercio : "comercio_id"
    Usuario |o--o{ HistorialCierreComercio : "actor_usuario_id"
    Comercio ||--o{ CierreTurno : "comercio_id"
    Horario ||--o{ CierreTurno : "horario_id"
    Comercio ||--o{ DocumentoComercio : "comercio_id"
    Administrador |o--o{ DocumentoComercio : "administrador_id"
    Usuario ||--o{ DocumentoComercio : "subido_por_usuario_id"
    DocumentoComercio ||--|| DocumentoComercioArchivo : "documento_id"
    Administrador ||--o{ ConfiguracionTarifa : "administrador_id"
    Usuario ||--o{ Token : "usuario_id"
    Usuario ||--o{ Sesion : "usuario_id"
    Usuario ||--o{ Notificacion : "usuario_id"
    Usuario |o--o{ TicketSoporte : "usuario_id"
    TicketSoporte ||--o{ MensajeSoporte : "ticket_id"
    Pedido ||--o| Reclamo : "pedido_id"
    Administrador |o--o{ Reclamo : "administrador_id"
    Reclamo ||--o{ ReclamoFoto : "reclamo_id"
    ReclamoFoto ||--|| ReclamoFotoArchivo : "foto_id"
    Comercio ||--o{ Producto : "comercio_id"
    Categoria ||--o{ Producto : "categoria_id"
    Producto ||--o{ ImagenProducto : "producto_id"
    Producto ||--o{ ProductoTag : "producto_id"
    Tag ||--o{ ProductoTag : "tag_id"
    Comercio ||--o{ GrupoExtra : "comercio_id"
    GrupoExtra ||--o{ Extra : "grupo_extra_id"
    Producto ||--o{ ProductoGrupoExtra : "producto_id"
    GrupoExtra ||--o{ ProductoGrupoExtra : "grupo_extra_id"
    Cliente ||--o| Carrito : "cliente_id"
    Comercio |o--o{ Carrito : "comercio_id"
    Carrito ||--o{ ItemCarrito : "carrito_id"
    Producto ||--o{ ItemCarrito : "producto_id"
    ItemCarrito ||--o{ ItemCarritoExtra : "item_carrito_id"
    Extra ||--o{ ItemCarritoExtra : "extra_id"
    Cliente ||--o{ Pedido : "cliente_id"
    Comercio ||--o{ Pedido : "comercio_id"
    Direccion |o--o{ Pedido : "direccion_id"
    Horario |o--o{ Pedido : "turno_horario_id"
    Pedido ||--o{ DetallePedido : "pedido_id"
    Producto ||--o{ DetallePedido : "producto_id"
    NotaCredito |o--o{ DetallePedido : "nota_credito_id"
    DetallePedido ||--o{ DetallePedidoExtra : "detalle_pedido_id"
    Extra ||--o{ DetallePedidoExtra : "extra_id"
    Pedido ||--o{ HistorialEstadoPedido : "pedido_id"
    Usuario |o--o{ HistorialEstadoPedido : "actor_usuario_id"
    Pedido ||--o| Pago : "pedido_id"
    Pedido |o--o{ AlertaWebhookMp : "pedido_id"
    Pago ||--o{ NotaCredito : "pago_id"
    Reclamo |o--o| NotaCredito : "reclamo_id"
```
