-- ============================================================================
-- BAJONEÁ — Base de Datos Física Definitiva
-- Base de datos: bajonea_final
-- Motor: MySQL 8.x (InnoDB, utf8mb4)
-- Generado a partir de: Diccionario de Datos v1.5
-- Fecha de generación: 2026-08-26
-- ============================================================================
--
-- ORDEN DE EJECUCIÓN DE ESTE ARCHIVO:
--   1. Creación de la base de datos
--   2. Tablas de catálogo geográfico (Provincia, Localidad) — VACÍAS aquí,
--      ver nota al final del archivo sobre la carga de datos Georef
--   3. Módulo Identidad (Usuario → Persona → PersonaFisica/PersonaJuridica →
--      Cliente/Administrador/Empleado/Dueño)
--   4. Módulo Comercio (Comercio, Horario, RedSocial, CuentaMercadoPago,
--      EmpleadoComercio, HistorialEstadoComercio, ConfiguracionTarifa)
--   5. Módulo Seguridad y Sesiones (Token, Sesion)
--   6. Módulo Notificaciones (Notificacion)
--   7. Módulo Atención y Soporte (Soporte, Reclamo)
--   8. Módulo Catálogo de Productos (Categoria, Tag, Producto, ImagenProducto,
--      ProductoTag, GrupoExtra, Extra, ProductoGrupoExtra)
--   9. Módulo Operaciones y Ventas (Carrito, ItemCarrito, ItemCarritoExtra,
--      Pedido, DetallePedido, DetallePedidoExtra, HistorialEstadoPedido,
--      Pago, NotaCredito)
--  10. Seed del usuario Administrador
--
-- ============================================================================

DROP DATABASE IF EXISTS bajonea_final;
CREATE DATABASE bajonea_final
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE bajonea_final;

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;
SET time_zone = '-03:00';

-- ============================================================================
-- 2. MÓDULO GEOGRAFÍA
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: Provincia
-- Catálogo estático de provincias de Argentina (API Georef). Solo lectura.
-- ----------------------------------------------------------------------------
CREATE TABLE provincia (
    id      VARCHAR(2)   NOT NULL,
    nombre  VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Localidad
-- Catálogo estático de localidades de Argentina (API Georef).
-- Excepción MVP: Tolhuin (Tierra del Fuego) se carga manualmente, no viene
-- del endpoint /localidades de Georef.
-- ----------------------------------------------------------------------------
CREATE TABLE localidad (
    id            VARCHAR(15)  NOT NULL,
    nombre        VARCHAR(150) NOT NULL,
    provincia_id  VARCHAR(2)   NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_localidad_provincia (provincia_id),
    CONSTRAINT fk_localidad_provincia
        FOREIGN KEY (provincia_id) REFERENCES provincia (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Direccion
-- Direcciones de clientes (varias) o comercios (exactamente una).
-- cliente_id y comercio_id son mutuamente excluyentes (regla de aplicación).
-- NOTA: las FK hacia Cliente y Comercio se agregan más adelante en este
-- script (fk_direccion_cliente, fk_direccion_comercio), una vez creadas
-- esas tablas, ya que Direccion depende de ambas y ambas dependen de
-- Localidad. Se resuelve con FOREIGN_KEY_CHECKS=0 durante toda la carga.
-- ----------------------------------------------------------------------------
CREATE TABLE direccion (
    id                  INT          NOT NULL AUTO_INCREMENT,
    calle               VARCHAR(150) NOT NULL,
    numero              VARCHAR(10)  NOT NULL,
    piso_depto          VARCHAR(30)  NULL,
    codigo_postal       VARCHAR(10)  NOT NULL,
    localidad_id        VARCHAR(15)  NOT NULL,
    cliente_id          INT          NULL,
    comercio_id         INT          NULL,
    principal           TINYINT(1)   NOT NULL DEFAULT 0,
    eliminada           TINYINT(1)   NOT NULL DEFAULT 0,
    fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME     NULL,
    fecha_baja          DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_direccion_comercio (comercio_id),
    INDEX idx_direccion_cliente (cliente_id),
    INDEX idx_direccion_localidad (localidad_id),
    CONSTRAINT fk_direccion_localidad
        FOREIGN KEY (localidad_id) REFERENCES localidad (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. MÓDULO IDENTIDAD Y HERENCIA
-- Usuario → Persona → {PersonaFisica → Cliente/Administrador/Empleado}
--                   → {PersonaJuridica → Dueño}
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMs de este módulo (se declaran inline en cada columna, como es estándar
-- en MySQL; se listan acá en comentario a modo de referencia)
-- RolUsuario:   CLIENTE, DUENO, EMPLEADO, ADMINISTRADOR
-- EstadoUsuario: PENDIENTE, ACTIVO, BLOQUEADO, SUSPENDIDO, INACTIVO
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Tabla: Usuario
-- ----------------------------------------------------------------------------
CREATE TABLE usuario (
    id                    INT           NOT NULL AUTO_INCREMENT,
    email                 VARCHAR(150)  NOT NULL,
    password_hash         VARCHAR(255)  NOT NULL,
    rol                   ENUM('CLIENTE','DUENO','EMPLEADO','ADMINISTRADOR') NOT NULL,
    estado                ENUM('PENDIENTE','ACTIVO','BLOQUEADO','SUSPENDIDO','INACTIVO') NOT NULL DEFAULT 'PENDIENTE',
    email_verificado      TINYINT(1)    NOT NULL DEFAULT 0,
    foto_perfil_url       VARCHAR(500)  NULL,
    intentos_fallidos     INT           NOT NULL DEFAULT 0,
    fecha_registro        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_ultimo_acceso   DATETIME      NULL,
    fecha_actualizacion   DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuario_email (email),
    INDEX idx_usuario_rol (rol),
    INDEX idx_usuario_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: HistorialEstadoUsuario
-- ----------------------------------------------------------------------------
CREATE TABLE historial_estado_usuario (
    id              INT      NOT NULL AUTO_INCREMENT,
    usuario_id      INT      NOT NULL,
    estado_origen   ENUM('PENDIENTE','ACTIVO','BLOQUEADO','SUSPENDIDO','INACTIVO') NULL,
    estado_destino  ENUM('PENDIENTE','ACTIVO','BLOQUEADO','SUSPENDIDO','INACTIVO') NOT NULL,
    motivo          VARCHAR(500) NULL,
    fecha_hora      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_heu_usuario (usuario_id),
    INDEX idx_heu_fecha (fecha_hora),
    CONSTRAINT fk_heu_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Persona (nodo intermedio de herencia, PK compartida con Usuario)
-- ----------------------------------------------------------------------------
CREATE TABLE persona (
    id  INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_persona_usuario
        FOREIGN KEY (id) REFERENCES usuario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: PersonaFisica
-- ----------------------------------------------------------------------------
CREATE TABLE persona_fisica (
    id                  INT          NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    apellido            VARCHAR(100) NOT NULL,
    dni                 VARCHAR(10)  NOT NULL,
    fecha_nacimiento    DATE         NOT NULL,
    telefono            VARCHAR(30)  NOT NULL,
    fecha_modificacion  DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_persona_fisica_dni (dni),
    CONSTRAINT fk_persona_fisica_persona
        FOREIGN KEY (id) REFERENCES persona (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: PersonaJuridica
-- ----------------------------------------------------------------------------
CREATE TABLE persona_juridica (
    id                          INT           NOT NULL,
    razon_social                VARCHAR(150)  NOT NULL,
    cuit                        VARCHAR(11)   NOT NULL,
    condicion_iva               ENUM('RESPONSABLE_INSCRIPTO','EXENTO','NO_INSCRIPTO','MONOTRIBUTO','RESPONSABLE_NACIONAL') NOT NULL,
    tipo_sociedad               ENUM('SA','SRL','SAS','SC','SCS','SCRL','SCSA','SCCS','CC','CS','CCSA','CA','SP','ST','ACP','EMP','EU','UTE') NOT NULL,
    domicilio_fiscal            VARCHAR(255)  NOT NULL,
    fecha_inicio_actividades    DATE          NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_persona_juridica_cuit (cuit),
    CONSTRAINT fk_persona_juridica_persona
        FOREIGN KEY (id) REFERENCES persona (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Cliente
-- ----------------------------------------------------------------------------
CREATE TABLE cliente (
    id  INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_cliente_persona_fisica
        FOREIGN KEY (id) REFERENCES persona_fisica (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Administrador
-- ----------------------------------------------------------------------------
CREATE TABLE administrador (
    id  INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_administrador_persona_fisica
        FOREIGN KEY (id) REFERENCES persona_fisica (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Empleado
-- ----------------------------------------------------------------------------
CREATE TABLE empleado (
    id              INT      NOT NULL,
    fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_empleado_persona_fisica
        FOREIGN KEY (id) REFERENCES persona_fisica (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Dueno (normalizado sin "ñ" por decisión de Diego — evita riesgos de
-- encoding en entidades JPA, filesystem y herramientas)
-- ----------------------------------------------------------------------------
CREATE TABLE dueno (
    id                  INT      NOT NULL,
    persona_fisica_id   INT      NOT NULL,
    fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_dueno_persona_fisica (persona_fisica_id),
    CONSTRAINT fk_dueno_persona_juridica
        FOREIGN KEY (id) REFERENCES persona_juridica (id),
    CONSTRAINT fk_dueno_persona_fisica
        FOREIGN KEY (persona_fisica_id) REFERENCES persona_fisica (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================================
-- 4. MÓDULO COMERCIO
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: Comercio
-- ----------------------------------------------------------------------------
CREATE TABLE comercio (
    id                    INT           NOT NULL AUTO_INCREMENT,
    dueno_id              INT           NOT NULL,
    nombre                VARCHAR(150)  NOT NULL,
    descripcion           TEXT          NULL,
    foto_perfil_url       VARCHAR(500)  NOT NULL,
    telefono              VARCHAR(30)   NOT NULL,
    email                 VARCHAR(150)  NOT NULL,
    tipo_comercio         ENUM('RESTAURANTE','EMPRENDIMIENTO','ROTISERIA','HELADERIA','CAFETERIA','PANADERIA','PIZZERIA','PARRILLA','BAR','KIOSCO','FOOD_TRUCK','OTRO') NOT NULL,
    acepta_delivery       TINYINT(1)    NOT NULL DEFAULT 0,
    acepta_retiro         TINYINT(1)    NOT NULL DEFAULT 0,
    estado                ENUM('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE') NOT NULL DEFAULT 'PENDIENTE',
    cerrado_manualmente   TINYINT(1)    NOT NULL DEFAULT 0,
    fecha_resolicitud     DATETIME      NULL,
    mp_vinculado          TINYINT(1)    NOT NULL DEFAULT 0,
    fecha_registro        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion    DATETIME      NULL,
    PRIMARY KEY (id),
    INDEX idx_comercio_dueno (dueno_id),
    INDEX idx_comercio_estado (estado),
    CONSTRAINT fk_comercio_dueno
        FOREIGN KEY (dueno_id) REFERENCES dueno (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ahora que Cliente y Comercio existen, se agregan las FK pendientes de Direccion
ALTER TABLE direccion
    ADD CONSTRAINT fk_direccion_cliente
        FOREIGN KEY (cliente_id) REFERENCES cliente (id),
    ADD CONSTRAINT fk_direccion_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id);

-- ----------------------------------------------------------------------------
-- Tabla: Horario
-- ----------------------------------------------------------------------------
CREATE TABLE horario (
    id            INT   NOT NULL AUTO_INCREMENT,
    comercio_id   INT   NOT NULL,
    dia_semana    ENUM('LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO') NOT NULL,
    hora_apertura TIME  NOT NULL,
    hora_cierre   TIME  NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_horario_comercio (comercio_id),
    CONSTRAINT fk_horario_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: RedSocial
-- ----------------------------------------------------------------------------
CREATE TABLE red_social (
    id                  INT           NOT NULL AUTO_INCREMENT,
    comercio_id         INT           NOT NULL,
    tipo                ENUM('INSTAGRAM','FACEBOOK','TIKTOK','WHATSAPP','X','SITIO_WEB','OTRO') NOT NULL,
    url                 VARCHAR(500)  NOT NULL,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME      NULL,
    fecha_baja          DATETIME      NULL,
    PRIMARY KEY (id),
    INDEX idx_red_social_comercio (comercio_id),
    UNIQUE KEY uq_red_social_comercio_tipo (comercio_id, tipo),
    CONSTRAINT fk_red_social_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: CuentaMercadoPago
-- ----------------------------------------------------------------------------
CREATE TABLE cuenta_mercado_pago (
    id                    INT           NOT NULL AUTO_INCREMENT,
    dueno_id              INT           NOT NULL,
    mp_user_id            VARCHAR(50)   NOT NULL,
    access_token          VARCHAR(255)  NOT NULL,
    refresh_token         VARCHAR(255)  NOT NULL,
    public_key            VARCHAR(255)  NULL,
    activa                TINYINT(1)    NOT NULL DEFAULT 1,
    fecha_vinculacion     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_desvinculacion  DATETIME      NULL,
    token_expira          DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cuenta_mp_dueno (dueno_id),
    CONSTRAINT fk_cuenta_mp_dueno
        FOREIGN KEY (dueno_id) REFERENCES dueno (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: EmpleadoComercio
-- ----------------------------------------------------------------------------
CREATE TABLE empleado_comercio (
    id            INT       NOT NULL AUTO_INCREMENT,
    empleado_id   INT       NOT NULL,
    comercio_id   INT       NOT NULL,
    estado        ENUM('PENDIENTE','ACTIVO','DESACTIVADO') NOT NULL DEFAULT 'PENDIENTE',
    fecha_alta    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_baja    DATETIME  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_empleado_comercio (empleado_id, comercio_id),
    INDEX idx_empleado_comercio_comercio (comercio_id),
    INDEX idx_empleado_comercio_empleado (empleado_id),
    CONSTRAINT fk_empleado_comercio_empleado
        FOREIGN KEY (empleado_id) REFERENCES empleado (id),
    CONSTRAINT fk_empleado_comercio_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: HistorialEstadoComercio
-- ----------------------------------------------------------------------------
CREATE TABLE historial_estado_comercio (
    id                INT      NOT NULL AUTO_INCREMENT,
    comercio_id       INT      NOT NULL,
    administrador_id  INT      NULL,
    estado_origen     ENUM('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE') NOT NULL,
    estado_destino    ENUM('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE') NOT NULL,
    motivo            VARCHAR(500) NULL,
    fecha_hora        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_hec_comercio (comercio_id),
    INDEX idx_hec_administrador (administrador_id),
    INDEX idx_hec_fecha (fecha_hora),
    CONSTRAINT fk_hec_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    CONSTRAINT fk_hec_administrador
        FOREIGN KEY (administrador_id) REFERENCES administrador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: ConfiguracionTarifa
-- ----------------------------------------------------------------------------
CREATE TABLE configuracion_tarifa (
    id                INT           NOT NULL AUTO_INCREMENT,
    administrador_id  INT           NOT NULL,
    cargo_cliente     DECIMAL(10,2) NOT NULL,
    cargo_comercio    DECIMAL(10,2) NOT NULL,
    fecha_vigencia    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_config_tarifa_admin (administrador_id),
    INDEX idx_config_tarifa_vigencia (fecha_vigencia),
    CONSTRAINT fk_config_tarifa_admin
        FOREIGN KEY (administrador_id) REFERENCES administrador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. MÓDULO SEGURIDAD Y SESIONES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: Token
-- ----------------------------------------------------------------------------
CREATE TABLE token (
    id                  INT           NOT NULL AUTO_INCREMENT,
    usuario_id          INT           NOT NULL,
    tipo                ENUM('VERIFICACION_EMAIL','RECUPERACION_PASSWORD','REACTIVACION_CUENTA','INVITACION_EMPLEADO') NOT NULL,
    token               VARCHAR(36)   NOT NULL,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento   DATETIME      NOT NULL,
    fecha_uso           DATETIME      NULL,
    estado              ENUM('PENDIENTE','UTILIZADO','EXPIRADO') NOT NULL DEFAULT 'PENDIENTE',
    intentos_fallidos   INT           NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_token_valor (token),
    INDEX idx_token_usuario_tipo_estado (usuario_id, tipo, estado),
    CONSTRAINT fk_token_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Sesion
-- ----------------------------------------------------------------------------
CREATE TABLE sesion (
    id             INT           NOT NULL AUTO_INCREMENT,
    usuario_id     INT           NOT NULL,
    activa         TINYINT(1)    NOT NULL DEFAULT 1,
    fecha_inicio   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre   DATETIME      NULL,
    tipo_cierre    ENUM('MANUAL','AUTOMATICO','FORZADO') NULL,
    ip_origen      VARCHAR(45)   NOT NULL,
    navegador      VARCHAR(255)  NULL,
    dispositivo    VARCHAR(255)  NULL,
    PRIMARY KEY (id),
    INDEX idx_sesion_usuario_activa (usuario_id, activa),
    CONSTRAINT fk_sesion_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. MÓDULO NOTIFICACIONES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: Notificacion
-- ----------------------------------------------------------------------------
CREATE TABLE notificacion (
    id              INT           NOT NULL AUTO_INCREMENT,
    usuario_id      INT           NOT NULL,
    tipo            ENUM(
        'NUEVO_PEDIDO','PEDIDO_ACEPTADO','PEDIDO_RECHAZADO','PEDIDO_EN_CAMINO',
        'PEDIDO_LISTO_RETIRO','AVISO_75MIN_SIN_CONFIRMACION','PEDIDO_AUTOCONFIRMADO',
        'PEDIDO_CANCELADO_CLIENTE','PEDIDO_ANULADO_COMERCIO','PEDIDO_CANCELADO_SISTEMA',
        'PEDIDO_EXPIRADO_CLIENTE','PEDIDO_EXPIRADO_COMERCIO','COMERCIO_APROBADO',
        'COMERCIO_RECHAZADO','COMERCIO_SUSPENDIDO','NUEVO_COMERCIO_PENDIENTE',
        'NUEVA_RESOLICITUD_COMERCIO','NUEVO_RECLAMO','RECLAMO_APROBADO','RECLAMO_RECHAZADO',
        'NUEVO_MENSAJE_SOPORTE','PRODUCTO_REMOVIDO_CARRITO','CUENTA_INACTIVADA',
        'COMERCIO_INACTIVADO','PEDIDO_CERRADO_TIMER_SUSPENSION','REEMBOLSO_FALLIDO_DEFINITIVO',
        'CLIENTE_SUSPENDIDO','SUSPENSION_LEVANTADA','PEDIDO_AUTOCONFIRMADO_COMERCIO',
        'INVITACION_EMPLEADO','EMPLEADO_DESACTIVADO'
    ) NOT NULL,
    mensaje         VARCHAR(500)  NOT NULL,
    leida           TINYINT(1)    NOT NULL DEFAULT 0,
    fecha_creacion  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    canal           ENUM('PUSH','EMAIL') NOT NULL,
    estado          ENUM('PENDIENTE','ENVIADO','FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
    fecha_envio     DATETIME      NULL,
    entidad_tipo    ENUM('PEDIDO','COMERCIO') NULL,
    entidad_id      INT           NULL,
    PRIMARY KEY (id),
    INDEX idx_notificacion_usuario_leida (usuario_id, leida),
    INDEX idx_notificacion_estado (estado),
    CONSTRAINT fk_notificacion_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. MÓDULO ATENCIÓN Y SOPORTE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: Soporte
-- ----------------------------------------------------------------------------
CREATE TABLE soporte (
    id                 INT       NOT NULL AUTO_INCREMENT,
    usuario_id         INT       NOT NULL,
    mensaje_descargo   TEXT      NOT NULL,
    fecha_envio        DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atendido           TINYINT(1) NOT NULL DEFAULT 0,
    administrador_id   INT       NULL,
    resolucion         ENUM('REACTIVADO','SUSPENSION_MANTENIDA') NULL,
    fecha_resolucion   DATETIME  NULL,
    PRIMARY KEY (id),
    INDEX idx_soporte_usuario (usuario_id),
    INDEX idx_soporte_atendido (atendido),
    CONSTRAINT fk_soporte_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    CONSTRAINT fk_soporte_administrador
        FOREIGN KEY (administrador_id) REFERENCES administrador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NOTA: la tabla Reclamo depende de Pedido (módulo 9), por lo que su CREATE
-- se ubica más adelante en este script, luego de creada la tabla `pedido`.
-- ============================================================================
-- 8. MÓDULO CATÁLOGO DE PRODUCTOS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: Categoria
-- ----------------------------------------------------------------------------
CREATE TABLE categoria (
    id                  INT           NOT NULL AUTO_INCREMENT,
    nombre              VARCHAR(100)  NOT NULL,
    activo              TINYINT(1)    NOT NULL DEFAULT 1,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME      NULL,
    fecha_baja          DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categoria_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Tag
-- ----------------------------------------------------------------------------
CREATE TABLE tag (
    id                  INT           NOT NULL AUTO_INCREMENT,
    nombre              VARCHAR(100)  NOT NULL,
    activo              TINYINT(1)    NOT NULL DEFAULT 1,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME      NULL,
    fecha_baja          DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tag_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Producto
-- ----------------------------------------------------------------------------
CREATE TABLE producto (
    id                  INT           NOT NULL AUTO_INCREMENT,
    comercio_id         INT           NOT NULL,
    categoria_id        INT           NOT NULL,
    nombre              VARCHAR(150)  NOT NULL,
    descripcion         TEXT          NULL,
    precio              DECIMAL(10,2) NOT NULL,
    estado              ENUM('DISPONIBLE','AGOTADO','DESCONTINUADO') NOT NULL DEFAULT 'DISPONIBLE',
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME      NULL,
    fecha_baja          DATETIME      NULL,
    PRIMARY KEY (id),
    INDEX idx_producto_comercio (comercio_id),
    INDEX idx_producto_categoria (categoria_id),
    INDEX idx_producto_estado (estado),
    CONSTRAINT fk_producto_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    CONSTRAINT fk_producto_categoria
        FOREIGN KEY (categoria_id) REFERENCES categoria (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: ImagenProducto
-- ----------------------------------------------------------------------------
CREATE TABLE imagen_producto (
    id             INT           NOT NULL AUTO_INCREMENT,
    producto_id    INT           NOT NULL,
    url            VARCHAR(500)  NOT NULL,
    orden          INT           NOT NULL DEFAULT 0,
    es_principal   TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    INDEX idx_imagen_producto_producto (producto_id),
    CONSTRAINT fk_imagen_producto_producto
        FOREIGN KEY (producto_id) REFERENCES producto (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: ProductoTag (unión M:N)
-- ----------------------------------------------------------------------------
CREATE TABLE producto_tag (
    producto_id  INT NOT NULL,
    tag_id       INT NOT NULL,
    PRIMARY KEY (producto_id, tag_id),
    INDEX idx_producto_tag_tag (tag_id),
    CONSTRAINT fk_producto_tag_producto
        FOREIGN KEY (producto_id) REFERENCES producto (id),
    CONSTRAINT fk_producto_tag_tag
        FOREIGN KEY (tag_id) REFERENCES tag (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: GrupoExtra
-- ----------------------------------------------------------------------------
CREATE TABLE grupo_extra (
    id                  INT           NOT NULL AUTO_INCREMENT,
    comercio_id         INT           NOT NULL,
    nombre              VARCHAR(100)  NOT NULL,
    cantidad_maxima     INT           NOT NULL DEFAULT 1,
    obligatorio         TINYINT(1)    NOT NULL DEFAULT 0,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME      NULL,
    fecha_baja          DATETIME      NULL,
    PRIMARY KEY (id),
    INDEX idx_grupo_extra_comercio (comercio_id),
    CONSTRAINT fk_grupo_extra_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Extra
-- ----------------------------------------------------------------------------
CREATE TABLE extra (
    id                  INT           NOT NULL AUTO_INCREMENT,
    grupo_extra_id      INT           NOT NULL,
    nombre              VARCHAR(100)  NOT NULL,
    precio              DECIMAL(10,2) NOT NULL DEFAULT 0,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME      NULL,
    fecha_baja          DATETIME      NULL,
    PRIMARY KEY (id),
    INDEX idx_extra_grupo (grupo_extra_id),
    CONSTRAINT fk_extra_grupo_extra
        FOREIGN KEY (grupo_extra_id) REFERENCES grupo_extra (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: ProductoGrupoExtra (unión M:N)
-- ----------------------------------------------------------------------------
CREATE TABLE producto_grupo_extra (
    producto_id      INT NOT NULL,
    grupo_extra_id   INT NOT NULL,
    PRIMARY KEY (producto_id, grupo_extra_id),
    INDEX idx_producto_grupo_extra_grupo (grupo_extra_id),
    CONSTRAINT fk_producto_grupo_extra_producto
        FOREIGN KEY (producto_id) REFERENCES producto (id),
    CONSTRAINT fk_producto_grupo_extra_grupo
        FOREIGN KEY (grupo_extra_id) REFERENCES grupo_extra (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 9. MÓDULO OPERACIONES Y VENTAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: Carrito
-- ----------------------------------------------------------------------------
CREATE TABLE carrito (
    id            INT        NOT NULL AUTO_INCREMENT,
    cliente_id    INT        NOT NULL,
    comercio_id   INT        NULL,
    activo        TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_carrito_cliente (cliente_id),
    INDEX idx_carrito_comercio (comercio_id),
    CONSTRAINT fk_carrito_cliente
        FOREIGN KEY (cliente_id) REFERENCES cliente (id),
    CONSTRAINT fk_carrito_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: ItemCarrito
-- ----------------------------------------------------------------------------
CREATE TABLE item_carrito (
    id            INT           NOT NULL AUTO_INCREMENT,
    carrito_id    INT           NOT NULL,
    producto_id   INT           NOT NULL,
    cantidad      INT           NOT NULL,
    nota          VARCHAR(255)  NULL,
    PRIMARY KEY (id),
    INDEX idx_item_carrito_carrito (carrito_id),
    INDEX idx_item_carrito_producto (producto_id),
    CONSTRAINT fk_item_carrito_carrito
        FOREIGN KEY (carrito_id) REFERENCES carrito (id),
    CONSTRAINT fk_item_carrito_producto
        FOREIGN KEY (producto_id) REFERENCES producto (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: ItemCarritoExtra
-- ----------------------------------------------------------------------------
CREATE TABLE item_carrito_extra (
    id                INT           NOT NULL AUTO_INCREMENT,
    item_carrito_id   INT           NOT NULL,
    extra_id          INT           NOT NULL,
    precio_unitario   DECIMAL(10,2) NOT NULL,
    fecha_creacion    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_item_carrito_extra_item (item_carrito_id),
    INDEX idx_item_carrito_extra_extra (extra_id),
    CONSTRAINT fk_item_carrito_extra_item
        FOREIGN KEY (item_carrito_id) REFERENCES item_carrito (id),
    CONSTRAINT fk_item_carrito_extra_extra
        FOREIGN KEY (extra_id) REFERENCES extra (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Pedido
-- ----------------------------------------------------------------------------
CREATE TABLE pedido (
    id                        INT           NOT NULL AUTO_INCREMENT,
    cliente_id                INT           NOT NULL,
    comercio_id               INT           NOT NULL,
    direccion_id              INT           NULL,
    modalidad_entrega         ENUM('DOMICILIO','RETIRO') NOT NULL,
    estado                    ENUM('PENDIENTE_PAGO','PENDIENTE','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','RECHAZADO','CANCELADO','ANULADO','CANCELADO_POR_SISTEMA','EXPIRADO') NOT NULL DEFAULT 'PENDIENTE_PAGO',
    pago_estado               ENUM('PENDIENTE','PAGADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
    cancelado_por             ENUM('CLIENTE','COMERCIO','SISTEMA') NULL,
    motivo                    VARCHAR(500)  NULL,
    fuente_entrega            ENUM('CLIENTE','COMERCIO','COMERCIO_SIN_RETIRO','SISTEMA') NULL,
    fecha_entrega             DATETIME      NULL,
    suspension_retiro_expira  DATETIME      NULL,
    primer_aviso_emitido      TINYINT(1)    NOT NULL DEFAULT 0,
    motivo_rechazo            ENUM('SIN_STOCK','CERRADO','ALTO_VOLUMEN_PEDIDOS','PRODUCTO_NO_DISPONIBLE_TEMPORAL','SIN_DELIVERY_DISPONIBLE','PROBLEMA_TECNICO','OTRO') NULL,
    comentario_rechazo        VARCHAR(500)  NULL,
    subtotal                  DECIMAL(10,2) NOT NULL,
    cargo_servicio_cliente    DECIMAL(10,2) NOT NULL,
    cargo_servicio_comercio   DECIMAL(10,2) NOT NULL,
    total                     DECIMAL(10,2) NOT NULL,
    fecha_creacion            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_pedido_cliente (cliente_id),
    INDEX idx_pedido_comercio (comercio_id),
    INDEX idx_pedido_estado (estado),
    INDEX idx_pedido_fecha_creacion (fecha_creacion),
    CONSTRAINT fk_pedido_cliente
        FOREIGN KEY (cliente_id) REFERENCES cliente (id),
    CONSTRAINT fk_pedido_comercio
        FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    CONSTRAINT fk_pedido_direccion
        FOREIGN KEY (direccion_id) REFERENCES direccion (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: DetallePedido
-- ----------------------------------------------------------------------------
CREATE TABLE detalle_pedido (
    id                INT           NOT NULL AUTO_INCREMENT,
    pedido_id         INT           NOT NULL,
    producto_id       INT           NOT NULL,
    cantidad          INT           NOT NULL,
    precio_unitario   DECIMAL(10,2) NOT NULL,
    nota              VARCHAR(255)  NULL,
    subtotal          DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_detalle_pedido_pedido (pedido_id),
    CONSTRAINT fk_detalle_pedido_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedido (id),
    CONSTRAINT fk_detalle_pedido_producto
        FOREIGN KEY (producto_id) REFERENCES producto (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: DetallePedidoExtra
-- ----------------------------------------------------------------------------
CREATE TABLE detalle_pedido_extra (
    id                  INT           NOT NULL AUTO_INCREMENT,
    detalle_pedido_id   INT           NOT NULL,
    extra_id            INT           NOT NULL,
    precio_unitario     DECIMAL(10,2) NOT NULL,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_detalle_pedido_extra_detalle (detalle_pedido_id),
    INDEX idx_detalle_pedido_extra_extra (extra_id),
    CONSTRAINT fk_detalle_pedido_extra_detalle
        FOREIGN KEY (detalle_pedido_id) REFERENCES detalle_pedido (id),
    CONSTRAINT fk_detalle_pedido_extra_extra
        FOREIGN KEY (extra_id) REFERENCES extra (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: HistorialEstadoPedido
-- ----------------------------------------------------------------------------
CREATE TABLE historial_estado_pedido (
    id              INT       NOT NULL AUTO_INCREMENT,
    pedido_id       INT       NOT NULL,
    estado          ENUM('PENDIENTE_PAGO','PENDIENTE','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','RECHAZADO','CANCELADO','ANULADO','CANCELADO_POR_SISTEMA','EXPIRADO') NOT NULL,
    cancelado_por   ENUM('CLIENTE','COMERCIO','SISTEMA') NULL,
    fuente_entrega  ENUM('CLIENTE','COMERCIO','COMERCIO_SIN_RETIRO','SISTEMA') NULL,
    fecha_hora      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_hep_pedido_fecha (pedido_id, fecha_hora),
    CONSTRAINT fk_hep_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedido (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Pago
-- ----------------------------------------------------------------------------
CREATE TABLE pago (
    id                    INT           NOT NULL AUTO_INCREMENT,
    pedido_id             INT           NOT NULL,
    monto                 DECIMAL(10,2) NOT NULL,
    metodo_pago           VARCHAR(30)   NULL,
    id_transaccion_mp     VARCHAR(50)   NULL,
    fecha_creacion        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_confirmacion    DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pago_pedido (pedido_id),
    CONSTRAINT fk_pago_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedido (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: NotaCredito
-- ----------------------------------------------------------------------------
CREATE TABLE nota_credito (
    id              INT           NOT NULL AUTO_INCREMENT,
    pago_id         INT           NOT NULL,
    monto           DECIMAL(10,2) NOT NULL,
    estado          ENUM('PENDIENTE','PROCESADO','PENDIENTE_REINTENTO','FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
    intentos        INT           NOT NULL DEFAULT 0,
    refund_id_mp    VARCHAR(50)   NULL,
    fecha_emision   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_proceso   DATETIME      NULL,
    fecha_fallido   DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_nota_credito_pago (pago_id),
    INDEX idx_nota_credito_estado (estado),
    CONSTRAINT fk_nota_credito_pago
        FOREIGN KEY (pago_id) REFERENCES pago (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: Reclamo (depende de Pedido, por eso se crea recién acá)
-- ----------------------------------------------------------------------------
CREATE TABLE reclamo (
    id                  INT           NOT NULL AUTO_INCREMENT,
    pedido_id           INT           NOT NULL,
    descripcion         TEXT          NOT NULL,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado              ENUM('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
    administrador_id    INT           NULL,
    nota_resolucion     VARCHAR(500)  NULL,
    fecha_resolucion    DATETIME      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_reclamo_pedido (pedido_id),
    INDEX idx_reclamo_estado (estado),
    CONSTRAINT fk_reclamo_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedido (id),
    CONSTRAINT fk_reclamo_administrador
        FOREIGN KEY (administrador_id) REFERENCES administrador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================================
-- 10. SEED DEL USUARIO ADMINISTRADOR
-- ============================================================================
-- Email: admin@bajonea.com
-- Password: Diego123  (hash BCrypt real, rounds=10, formato $2a$ compatible
-- con Spring Security BCryptPasswordEncoder)
--
-- IMPORTANTE: cambiar esta contraseña luego del primer login en producción.
-- ============================================================================

-- Usuario (rol ADMINISTRADOR, ya activo y con email verificado)
INSERT INTO usuario (
    email, password_hash, rol, estado, email_verificado,
    foto_perfil_url, intentos_fallidos, fecha_registro, fecha_ultimo_acceso,
    fecha_actualizacion
) VALUES (
    'admin@bajonea.com',
    '$2a$10$CwPcySrfowJ6.6HfbhILju/HAyJx5gh4MFk1Idp4RXcymhe/TJYP6',
    'ADMINISTRADOR',
    'ACTIVO',
    1,
    NULL,
    0,
    NOW(),
    NULL,
    NULL
);

SET @admin_usuario_id = LAST_INSERT_ID();

-- Historial de estado (registro inicial, PENDIENTE -> ACTIVO)
INSERT INTO historial_estado_usuario (usuario_id, estado_origen, estado_destino, motivo, fecha_hora)
VALUES (@admin_usuario_id, NULL, 'ACTIVO', 'Alta inicial del administrador del sistema', NOW());

-- Persona (nodo de herencia)
INSERT INTO persona (id) VALUES (@admin_usuario_id);

-- PersonaFisica
INSERT INTO persona_fisica (
    id, nombre, apellido, dni, fecha_nacimiento, telefono, fecha_modificacion
) VALUES (
    @admin_usuario_id,
    'Diego',
    'Administrador',
    '00000000',
    '1990-01-01',
    '2964000000',
    NULL
);

-- Administrador
INSERT INTO administrador (id) VALUES (@admin_usuario_id);

-- ============================================================================
-- FIN DEL SCRIPT DE SCHEMA + SEED ADMIN
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- PENDIENTE — CARGA DE DATOS GEOGRÁFICOS (Provincia y Localidad)
-- ============================================================================
-- Este script deja las tablas `provincia` y `localidad` con su estructura
-- creada pero VACÍAS. La carga real (24 provincias + ~4.037 localidades
-- desde la API Georef de datos.gob.ar, más la fila manual de Tolhuin que
-- no existe en el endpoint /localidades) debe hacerse con Claude Code,
-- que sí tiene acceso de red a `apis.datos.gob.ar` desde tu entorno.
--
-- Prompt sugerido para Claude Code:
--
--   "Necesito poblar las tablas `provincia` y `localidad` de la base
--   `bajonea_final` (MySQL) con datos reales de la API Georef
--   (https://apis.datos.gob.ar/georef/api/provincias y /localidades).
--   La tabla `provincia` tiene columnas (id VARCHAR(2), nombre VARCHAR(100)).
--   La tabla `localidad` tiene columnas (id VARCHAR(15), nombre VARCHAR(150),
--   provincia_id VARCHAR(2) FK a provincia.id). Traé las 24 provincias y
--   todas las localidades del país. Además, agregá manualmente una fila para
--   Tolhuin (Tierra del Fuego, provincia_id = 'T') ya que no existe en el
--   endpoint /localidades de Georef — usá el mismo criterio de ID
--   alfanumérico que ya se usó en el Tramo 16.12 del proyecto (ver
--   docs/modelo-mvp.md si existe en el repo). Generá los INSERT como un
--   archivo .sql aparte para importar después del schema principal."
--
-- Una vez que tengas ese archivo, importalo en phpMyAdmin DESPUÉS de haber
-- importado este script (bajonea_final_schema.sql), ya que localidad
-- depende de provincia, y direccion depende de localidad.
-- ============================================================================