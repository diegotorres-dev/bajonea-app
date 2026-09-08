# Modelo Relacional — Bajoneá (v3)

Generado a partir de `diccionario-de-datos.md` v1.3: 41 tablas, 268 campos, 53 relaciones FK. Pegar el bloque en [mermaid.live](https://mermaid.live) para exportar el PNG.

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
        VARCHAR150 calle
        VARCHAR10 numero
        VARCHAR30 piso_depto
        VARCHAR10 codigo_postal
        VARCHAR15 localidad_id FK
        INT cliente_id FK
        INT comercio_id FK
        TINYINT1 principal
        TINYINT1 eliminada
        DATETIME fecha_creacion
        DATETIME fecha_modificacion
        DATETIME fecha_baja
    }
    Usuario {
        INT id PK
        VARCHAR150 email UK
        VARCHAR255 password_hash
        ENUM_RolUsuario rol
        ENUM_EstadoUsuario estado
        TINYINT1 email_verificado
        VARCHAR500 foto_perfil_url
        INT intentos_fallidos
        DATETIME fecha_registro
        DATETIME fecha_ultimo_acceso
        DATETIME fecha_actualizacion
    }
    HistorialEstadoUsuario {
        INT id PK
        INT usuario_id FK
        ENUM_EstadoUsuario estado_origen
        ENUM_EstadoUsuario estado_destino
        VARCHAR500 motivo
        DATETIME fecha_hora
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
        DATETIME fecha_creacion
    }
    Comercio {
        INT id PK
        INT dueño_id FK
        VARCHAR150 nombre
        TEXT descripcion
        VARCHAR500 foto_perfil_url
        VARCHAR30 telefono
        VARCHAR150 email
        ENUM_TipoComercio tipo_comercio
        TINYINT1 acepta_delivery
        TINYINT1 acepta_retiro
        ENUM_EstadoComercio estado
        TINYINT1 cerrado_manualmente
        DATETIME fecha_resolicitud
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
        INT dueño_id FK
        VARCHAR50 mp_user_id
        VARCHAR255 access_token
        VARCHAR255 refresh_token
        VARCHAR255 public_key
        TINYINT1 activa
        DATETIME fecha_vinculacion
        DATETIME fecha_desvinculacion
        DATETIME token_expira
    }
    EmpleadoComercio {
        INT id PK
        INT empleado_id FK
        INT comercio_id FK
        ENUM_EstadoEmpleadoComercio estado
        DATETIME fecha_alta
        DATETIME fecha_baja
    }
    HistorialEstadoComercio {
        INT id PK
        INT comercio_id FK
        INT administrador_id FK
        ENUM_EstadoComercio estado_origen
        ENUM_EstadoComercio estado_destino
        VARCHAR500 motivo
        DATETIME fecha_hora
    }
    ConfiguracionTarifa {
        INT id PK
        INT administrador_id FK
        DECIMAL10,2 cargo_cliente
        DECIMAL10,2 cargo_comercio
        DATETIME fecha_vigencia
    }
    Token {
        INT id PK
        INT usuario_id FK
        ENUM_TipoToken tipo
        VARCHAR36 token UK
        DATETIME fecha_creacion
        DATETIME fecha_vencimiento
        DATETIME fecha_uso
        ENUM_EstadoToken estado
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
    }
    Soporte {
        INT id PK
        INT usuario_id FK
        TEXT mensaje_descargo
        DATETIME fecha_envio
        TINYINT1 atendido
        INT administrador_id FK
        ENUM_ResolucionSoporte resolucion
        DATETIME fecha_resolucion
    }
    Reclamo {
        INT id PK
        INT pedido_id FK
        TEXT descripcion
        DATETIME fecha_creacion
        ENUM_EstadoReclamo estado
        INT administrador_id FK
        VARCHAR500 nota_resolucion
        DATETIME fecha_resolucion
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
        INT cliente_id FK
        INT comercio_id FK
        TINYINT1 activo
    }
    ItemCarrito {
        INT id PK
        INT carrito_id FK
        INT producto_id FK
        INT cantidad
        VARCHAR255 nota
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
        VARCHAR500 detalle_rechazo
        DECIMAL10,2 subtotal
        DECIMAL10,2 cargo_servicio_cliente
        DECIMAL10,2 cargo_servicio_comercio
        DECIMAL10,2 total
        DATETIME fecha_creacion
    }
    DetallePedido {
        INT id PK
        INT pedido_id FK
        INT producto_id FK
        INT cantidad
        DECIMAL10,2 precio_unitario
        VARCHAR255 nota
        DECIMAL10,2 subtotal
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
        ENUM_CanceladoPor cancelado_por
        ENUM_FuenteEntrega fuente_entrega
        DATETIME fecha_hora
    }
    Pago {
        INT id PK
        INT pedido_id FK
        DECIMAL10,2 monto
        VARCHAR30 metodo_pago
        VARCHAR50 id_transaccion_mp
        DATETIME fecha_creacion
        DATETIME fecha_confirmacion
    }
    NotaCredito {
        INT id PK
        INT pago_id FK
        DECIMAL10,2 monto
        ENUM_EstadoNotaCredito estado
        INT intentos
        VARCHAR50 refund_id_mp
        DATETIME fecha_emision
        DATETIME fecha_proceso
        DATETIME fecha_fallido
    }
    Provincia }o--|| Localidad : "provincia_id"
    Usuario ||--|| Persona : "id"
    Persona ||--|| PersonaFisica : "id"
    Persona ||--|| PersonaJuridica : "id"
    PersonaFisica ||--|| Cliente : "id"
    PersonaFisica ||--|| Administrador : "id"
    PersonaFisica ||--|| Empleado : "id"
    PersonaJuridica ||--|| Dueno : "id"
    Dueno }o--|| Comercio : "dueño_id"
    Localidad }o--|| Direccion : "localidad_id"
    Cliente }o--|| Direccion : "cliente_id"
    Comercio ||--|| Direccion : "comercio_id"
    Usuario }o--|| HistorialEstadoUsuario : "usuario_id"
    Comercio }o--|| Horario : "comercio_id"
    Comercio }o--|| RedSocial : "comercio_id"
    Usuario }o--|| Token : "usuario_id"
    Usuario }o--|| Sesion : "usuario_id"
    Usuario }o--|| Notificacion : "usuario_id"
    Usuario }o--|| Soporte : "usuario_id"
    Administrador }o--|| Soporte : "administrador_id"
    Pedido ||--|| Reclamo : "pedido_id"
    Administrador }o--|| Reclamo : "administrador_id"
    Comercio }o--|| HistorialEstadoComercio : "comercio_id"
    Administrador }o--|| HistorialEstadoComercio : "administrador_id"
    Administrador }o--|| ConfiguracionTarifa : "administrador_id"
    Dueno ||--|| CuentaMercadoPago : "dueño_id"
    Empleado }o--|| EmpleadoComercio : "empleado_id"
    Comercio }o--|| EmpleadoComercio : "comercio_id"
    Comercio }o--|| Producto : "comercio_id"
    Categoria }o--|| Producto : "categoria_id"
    Producto }o--|| ImagenProducto : "producto_id"
    Producto }o--|| ProductoTag : "producto_id"
    Tag }o--|| ProductoTag : "tag_id"
    Comercio }o--|| GrupoExtra : "comercio_id"
    GrupoExtra }o--|| Extra : "grupo_extra_id"
    Producto }o--|| ProductoGrupoExtra : "producto_id"
    GrupoExtra }o--|| ProductoGrupoExtra : "grupo_extra_id"
    Cliente ||--|| Carrito : "cliente_id"
    Comercio }o--|| Carrito : "comercio_id"
    Carrito }o--|| ItemCarrito : "carrito_id"
    Producto }o--|| ItemCarrito : "producto_id"
    ItemCarrito }o--|| ItemCarritoExtra : "item_carrito_id"
    Extra }o--|| ItemCarritoExtra : "extra_id"
    Cliente }o--|| Pedido : "cliente_id"
    Comercio }o--|| Pedido : "comercio_id"
    Direccion }o--|| Pedido : "direccion_id"
    Pedido }o--|| DetallePedido : "pedido_id"
    Producto }o--|| DetallePedido : "producto_id"
    DetallePedido }o--|| DetallePedidoExtra : "detalle_pedido_id"
    Extra }o--|| DetallePedidoExtra : "extra_id"
    Pedido }o--|| HistorialEstadoPedido : "pedido_id"
    Pedido ||--|| Pago : "pedido_id"
    Pago ||--|| NotaCredito : "pago_id"
```
