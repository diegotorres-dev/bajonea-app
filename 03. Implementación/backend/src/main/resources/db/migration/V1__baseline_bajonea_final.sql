-- Migracion baseline de bajonea_final (Tramo 1, 2026-08-27 en adelante).
--
-- Declara como punto de partida el schema fisico que ya existe en bajonea_final
-- (41 tablas, generado desde docs/diccionario-de-datos.md v1.4) en reemplazo del
-- historial de Flyway V1-V17 que quedo atado a la base vieja `bajonea` (ver
-- backend/src/main/resources/db/migration-archivo-bajonea-vieja/, no borrado).
--
-- Extraido en vivo de bajonea_final via mysqldump --no-data el 2026-08-27, no
-- transcripto a mano desde docs/bajonea_final.sql -- la base fisica es la fuente
-- de verdad de este archivo, el .sql del repo es solo referencia.
--
-- Esta migracion se aplica via el mecanismo de baseline de Flyway
-- (spring.flyway.baseline-on-migrate=true, spring.flyway.baseline-version=1,
-- ver application.properties) y no como un CREATE TABLE literal: bajonea_final
-- ya tiene las 41 tablas y datos reales (Categoria/Tag/Provincia/Localidad/el
-- Administrador ya sembrado) antes de que este archivo exista, asi que Flyway
-- inserta un registro de baseline para la version 1 en vez de ejecutar este SQL.
-- El contenido de abajo queda como documentacion versionada del schema tal como
-- estaba el dia del baseline, y es el script real para recrear el schema desde
-- cero en un ambiente nuevo (ej. bajonea_test, CI).
--
-- SET FOREIGN_KEY_CHECKS=0/1 envuelve el bloque porque mysqldump --no-data
-- ordena las tablas alfabeticamente, no por dependencia de FK (ej. `carrito`
-- referencia a `cliente`/`comercio`, que vienen despues alfabeticamente).

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `administrador` (
  `id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_administrador_persona_fisica` FOREIGN KEY (`id`) REFERENCES `persona_fisica` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `carrito` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) NOT NULL,
  `comercio_id` int(11) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_carrito_cliente` (`cliente_id`),
  KEY `idx_carrito_comercio` (`comercio_id`),
  CONSTRAINT `fk_carrito_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`id`),
  CONSTRAINT `fk_carrito_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `categoria` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_modificacion` datetime DEFAULT NULL,
  `fecha_baja` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categoria_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `cliente` (
  `id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_cliente_persona_fisica` FOREIGN KEY (`id`) REFERENCES `persona_fisica` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dueno_id` int(11) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `foto_perfil_url` varchar(500) NOT NULL,
  `telefono` varchar(30) NOT NULL,
  `email` varchar(150) NOT NULL,
  `tipo_comercio` enum('RESTAURANTE','EMPRENDIMIENTO','ROTISERIA','HELADERIA','CAFETERIA','PANADERIA','PIZZERIA','PARRILLA','BAR','KIOSCO','FOOD_TRUCK','OTRO') NOT NULL,
  `acepta_delivery` tinyint(1) NOT NULL DEFAULT 0,
  `acepta_retiro` tinyint(1) NOT NULL DEFAULT 0,
  `estado` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE') NOT NULL DEFAULT 'PENDIENTE',
  `cerrado_manualmente` tinyint(1) NOT NULL DEFAULT 0,
  `fecha_resolicitud` datetime DEFAULT NULL,
  `mp_vinculado` tinyint(1) NOT NULL DEFAULT 0,
  `fecha_registro` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_modificacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comercio_dueno` (`dueno_id`),
  KEY `idx_comercio_estado` (`estado`),
  CONSTRAINT `fk_comercio_dueno` FOREIGN KEY (`dueno_id`) REFERENCES `dueno` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `configuracion_tarifa` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `administrador_id` int(11) NOT NULL,
  `cargo_cliente` decimal(10,2) NOT NULL,
  `cargo_comercio` decimal(10,2) NOT NULL,
  `fecha_vigencia` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_config_tarifa_admin` (`administrador_id`),
  KEY `idx_config_tarifa_vigencia` (`fecha_vigencia`),
  CONSTRAINT `fk_config_tarifa_admin` FOREIGN KEY (`administrador_id`) REFERENCES `administrador` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `cuenta_mercado_pago` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dueno_id` int(11) NOT NULL,
  `mp_user_id` varchar(50) NOT NULL,
  `access_token` varchar(255) NOT NULL,
  `refresh_token` varchar(255) NOT NULL,
  `public_key` varchar(255) DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_vinculacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_desvinculacion` datetime DEFAULT NULL,
  `token_expira` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cuenta_mp_dueno` (`dueno_id`),
  CONSTRAINT `fk_cuenta_mp_dueno` FOREIGN KEY (`dueno_id`) REFERENCES `dueno` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `detalle_pedido` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedido_id` int(11) NOT NULL,
  `producto_id` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `nota` varchar(255) DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_detalle_pedido_pedido` (`pedido_id`),
  KEY `fk_detalle_pedido_producto` (`producto_id`),
  CONSTRAINT `fk_detalle_pedido_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`),
  CONSTRAINT `fk_detalle_pedido_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `detalle_pedido_extra` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `detalle_pedido_id` int(11) NOT NULL,
  `extra_id` int(11) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_detalle_pedido_extra_detalle` (`detalle_pedido_id`),
  KEY `idx_detalle_pedido_extra_extra` (`extra_id`),
  CONSTRAINT `fk_detalle_pedido_extra_detalle` FOREIGN KEY (`detalle_pedido_id`) REFERENCES `detalle_pedido` (`id`),
  CONSTRAINT `fk_detalle_pedido_extra_extra` FOREIGN KEY (`extra_id`) REFERENCES `extra` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `direccion` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `calle` varchar(150) NOT NULL,
  `numero` varchar(10) NOT NULL,
  `piso_depto` varchar(30) DEFAULT NULL,
  `codigo_postal` varchar(10) NOT NULL,
  `localidad_id` varchar(15) NOT NULL,
  `cliente_id` int(11) DEFAULT NULL,
  `comercio_id` int(11) DEFAULT NULL,
  `principal` tinyint(1) NOT NULL DEFAULT 0,
  `eliminada` tinyint(1) NOT NULL DEFAULT 0,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_modificacion` datetime DEFAULT NULL,
  `fecha_baja` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_direccion_comercio` (`comercio_id`),
  KEY `idx_direccion_cliente` (`cliente_id`),
  KEY `idx_direccion_localidad` (`localidad_id`),
  CONSTRAINT `fk_direccion_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`id`),
  CONSTRAINT `fk_direccion_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_direccion_localidad` FOREIGN KEY (`localidad_id`) REFERENCES `localidad` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `dueno` (
  `id` int(11) NOT NULL,
  `persona_fisica_id` int(11) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dueno_persona_fisica` (`persona_fisica_id`),
  CONSTRAINT `fk_dueno_persona_juridica` FOREIGN KEY (`id`) REFERENCES `persona_juridica` (`id`),
  CONSTRAINT `fk_dueno_persona_fisica` FOREIGN KEY (`persona_fisica_id`) REFERENCES `persona_fisica` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `empleado` (
  `id` int(11) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_empleado_persona_fisica` FOREIGN KEY (`id`) REFERENCES `persona_fisica` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `empleado_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `empleado_id` int(11) NOT NULL,
  `comercio_id` int(11) NOT NULL,
  `estado` enum('PENDIENTE','ACTIVO','DESACTIVADO') NOT NULL DEFAULT 'PENDIENTE',
  `fecha_alta` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_baja` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_empleado_comercio` (`empleado_id`,`comercio_id`),
  KEY `idx_empleado_comercio_comercio` (`comercio_id`),
  KEY `idx_empleado_comercio_empleado` (`empleado_id`),
  CONSTRAINT `fk_empleado_comercio_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_empleado_comercio_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `empleado` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `extra` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `grupo_extra_id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `precio` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_modificacion` datetime DEFAULT NULL,
  `fecha_baja` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_extra_grupo` (`grupo_extra_id`),
  CONSTRAINT `fk_extra_grupo_extra` FOREIGN KEY (`grupo_extra_id`) REFERENCES `grupo_extra` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `grupo_extra` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `cantidad_maxima` int(11) NOT NULL DEFAULT 1,
  `obligatorio` tinyint(1) NOT NULL DEFAULT 0,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_modificacion` datetime DEFAULT NULL,
  `fecha_baja` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_grupo_extra_comercio` (`comercio_id`),
  CONSTRAINT `fk_grupo_extra_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `historial_estado_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `administrador_id` int(11) DEFAULT NULL,
  `estado_origen` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE') NOT NULL,
  `estado_destino` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE') NOT NULL,
  `motivo` varchar(500) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hec_comercio` (`comercio_id`),
  KEY `idx_hec_administrador` (`administrador_id`),
  KEY `idx_hec_fecha` (`fecha_hora`),
  CONSTRAINT `fk_hec_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `administrador` (`id`),
  CONSTRAINT `fk_hec_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `historial_estado_pedido` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedido_id` int(11) NOT NULL,
  `estado` enum('PENDIENTE_PAGO','PENDIENTE','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','RECHAZADO','CANCELADO','ANULADO','CANCELADO_POR_SISTEMA','EXPIRADO') NOT NULL,
  `cancelado_por` enum('CLIENTE','COMERCIO','SISTEMA') DEFAULT NULL,
  `fuente_entrega` enum('CLIENTE','COMERCIO','COMERCIO_SIN_RETIRO','SISTEMA') DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hep_pedido_fecha` (`pedido_id`,`fecha_hora`),
  CONSTRAINT `fk_hep_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `historial_estado_usuario` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `estado_origen` enum('PENDIENTE','ACTIVO','BLOQUEADO','SUSPENDIDO','INACTIVO') DEFAULT NULL,
  `estado_destino` enum('PENDIENTE','ACTIVO','BLOQUEADO','SUSPENDIDO','INACTIVO') NOT NULL,
  `motivo` varchar(500) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_heu_usuario` (`usuario_id`),
  KEY `idx_heu_fecha` (`fecha_hora`),
  CONSTRAINT `fk_heu_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `horario` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `dia_semana` enum('LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO') NOT NULL,
  `hora_apertura` time NOT NULL,
  `hora_cierre` time NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_horario_comercio` (`comercio_id`),
  CONSTRAINT `fk_horario_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `imagen_producto` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `producto_id` int(11) NOT NULL,
  `url` varchar(500) NOT NULL,
  `orden` int(11) NOT NULL DEFAULT 0,
  `es_principal` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_imagen_producto_producto` (`producto_id`),
  CONSTRAINT `fk_imagen_producto_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `item_carrito` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `carrito_id` int(11) NOT NULL,
  `producto_id` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL,
  `nota` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_item_carrito_carrito` (`carrito_id`),
  KEY `idx_item_carrito_producto` (`producto_id`),
  CONSTRAINT `fk_item_carrito_carrito` FOREIGN KEY (`carrito_id`) REFERENCES `carrito` (`id`),
  CONSTRAINT `fk_item_carrito_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `item_carrito_extra` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `item_carrito_id` int(11) NOT NULL,
  `extra_id` int(11) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_item_carrito_extra_item` (`item_carrito_id`),
  KEY `idx_item_carrito_extra_extra` (`extra_id`),
  CONSTRAINT `fk_item_carrito_extra_extra` FOREIGN KEY (`extra_id`) REFERENCES `extra` (`id`),
  CONSTRAINT `fk_item_carrito_extra_item` FOREIGN KEY (`item_carrito_id`) REFERENCES `item_carrito` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `localidad` (
  `id` varchar(15) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `provincia_id` varchar(2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_localidad_provincia` (`provincia_id`),
  CONSTRAINT `fk_localidad_provincia` FOREIGN KEY (`provincia_id`) REFERENCES `provincia` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `nota_credito` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pago_id` int(11) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `estado` enum('PENDIENTE','PROCESADO','PENDIENTE_REINTENTO','FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
  `intentos` int(11) NOT NULL DEFAULT 0,
  `refund_id_mp` varchar(50) DEFAULT NULL,
  `fecha_emision` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_proceso` datetime DEFAULT NULL,
  `fecha_fallido` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nota_credito_pago` (`pago_id`),
  KEY `idx_nota_credito_estado` (`estado`),
  CONSTRAINT `fk_nota_credito_pago` FOREIGN KEY (`pago_id`) REFERENCES `pago` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `notificacion` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `tipo` enum('NUEVO_PEDIDO','PEDIDO_ACEPTADO','PEDIDO_RECHAZADO','PEDIDO_EN_CAMINO','PEDIDO_LISTO_RETIRO','AVISO_75MIN_SIN_CONFIRMACION','PEDIDO_AUTOCONFIRMADO','PEDIDO_CANCELADO_CLIENTE','PEDIDO_ANULADO_COMERCIO','PEDIDO_CANCELADO_SISTEMA','PEDIDO_EXPIRADO_CLIENTE','PEDIDO_EXPIRADO_COMERCIO','COMERCIO_APROBADO','COMERCIO_RECHAZADO','COMERCIO_SUSPENDIDO','NUEVO_COMERCIO_PENDIENTE','NUEVA_RESOLICITUD_COMERCIO','NUEVO_RECLAMO','RECLAMO_APROBADO','RECLAMO_RECHAZADO','NUEVO_MENSAJE_SOPORTE','PRODUCTO_REMOVIDO_CARRITO','CUENTA_INACTIVADA','COMERCIO_INACTIVADO','PEDIDO_CERRADO_TIMER_SUSPENSION','REEMBOLSO_FALLIDO_DEFINITIVO','CLIENTE_SUSPENDIDO','SUSPENSION_LEVANTADA','PEDIDO_AUTOCONFIRMADO_COMERCIO','INVITACION_EMPLEADO','EMPLEADO_DESACTIVADO') NOT NULL,
  `mensaje` varchar(500) NOT NULL,
  `leida` tinyint(1) NOT NULL DEFAULT 0,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `canal` enum('PUSH','EMAIL') NOT NULL,
  `estado` enum('PENDIENTE','ENVIADO','FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
  `fecha_envio` datetime DEFAULT NULL,
  `entidad_tipo` enum('PEDIDO','COMERCIO') DEFAULT NULL,
  `entidad_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notificacion_usuario_leida` (`usuario_id`,`leida`),
  KEY `idx_notificacion_estado` (`estado`),
  CONSTRAINT `fk_notificacion_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `pago` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedido_id` int(11) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `metodo_pago` varchar(30) DEFAULT NULL,
  `id_transaccion_mp` varchar(50) DEFAULT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_confirmacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pago_pedido` (`pedido_id`),
  CONSTRAINT `fk_pago_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `pedido` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) NOT NULL,
  `comercio_id` int(11) NOT NULL,
  `direccion_id` int(11) DEFAULT NULL,
  `modalidad_entrega` enum('DOMICILIO','RETIRO') NOT NULL,
  `estado` enum('PENDIENTE_PAGO','PENDIENTE','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','RECHAZADO','CANCELADO','ANULADO','CANCELADO_POR_SISTEMA','EXPIRADO') NOT NULL DEFAULT 'PENDIENTE_PAGO',
  `pago_estado` enum('PENDIENTE','PAGADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  `cancelado_por` enum('CLIENTE','COMERCIO','SISTEMA') DEFAULT NULL,
  `motivo` varchar(500) DEFAULT NULL,
  `fuente_entrega` enum('CLIENTE','COMERCIO','COMERCIO_SIN_RETIRO','SISTEMA') DEFAULT NULL,
  `fecha_entrega` datetime DEFAULT NULL,
  `suspension_retiro_expira` datetime DEFAULT NULL,
  `primer_aviso_emitido` tinyint(1) NOT NULL DEFAULT 0,
  `motivo_rechazo` enum('SIN_STOCK','CERRADO','ALTO_VOLUMEN_PEDIDOS','PRODUCTO_NO_DISPONIBLE_TEMPORAL','SIN_DELIVERY_DISPONIBLE','PROBLEMA_TECNICO','OTRO') DEFAULT NULL,
  `comentario_rechazo` varchar(500) DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `cargo_servicio_cliente` decimal(10,2) NOT NULL,
  `cargo_servicio_comercio` decimal(10,2) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pedido_cliente` (`cliente_id`),
  KEY `idx_pedido_comercio` (`comercio_id`),
  KEY `idx_pedido_estado` (`estado`),
  KEY `idx_pedido_fecha_creacion` (`fecha_creacion`),
  KEY `fk_pedido_direccion` (`direccion_id`),
  CONSTRAINT `fk_pedido_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`id`),
  CONSTRAINT `fk_pedido_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_pedido_direccion` FOREIGN KEY (`direccion_id`) REFERENCES `direccion` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `persona` (
  `id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_persona_usuario` FOREIGN KEY (`id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `persona_fisica` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `apellido` varchar(100) NOT NULL,
  `dni` varchar(10) NOT NULL,
  `fecha_nacimiento` date NOT NULL,
  `telefono` varchar(30) NOT NULL,
  `fecha_modificacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_persona_fisica_dni` (`dni`),
  CONSTRAINT `fk_persona_fisica_persona` FOREIGN KEY (`id`) REFERENCES `persona` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `persona_juridica` (
  `id` int(11) NOT NULL,
  `razon_social` varchar(150) NOT NULL,
  `cuit` varchar(11) NOT NULL,
  `condicion_iva` enum('RESPONSABLE_INSCRIPTO','EXENTO','NO_INSCRIPTO','MONOTRIBUTO','RESPONSABLE_NACIONAL') NOT NULL,
  `tipo_sociedad` enum('SA','SRL','SAS','SC','SCS','SCRL','SCSA','SCCS','CC','CS','CCSA','CA','SP','ST','ACP','EMP','EU','UTE') NOT NULL,
  `domicilio_fiscal` varchar(255) NOT NULL,
  `fecha_inicio_actividades` date NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_persona_juridica_cuit` (`cuit`),
  CONSTRAINT `fk_persona_juridica_persona` FOREIGN KEY (`id`) REFERENCES `persona` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `producto` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `categoria_id` int(11) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `precio` decimal(10,2) NOT NULL,
  `estado` enum('DISPONIBLE','AGOTADO','DESCONTINUADO') NOT NULL DEFAULT 'DISPONIBLE',
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_modificacion` datetime DEFAULT NULL,
  `fecha_baja` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_producto_comercio` (`comercio_id`),
  KEY `idx_producto_categoria` (`categoria_id`),
  KEY `idx_producto_estado` (`estado`),
  CONSTRAINT `fk_producto_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categoria` (`id`),
  CONSTRAINT `fk_producto_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `producto_grupo_extra` (
  `producto_id` int(11) NOT NULL,
  `grupo_extra_id` int(11) NOT NULL,
  PRIMARY KEY (`producto_id`,`grupo_extra_id`),
  KEY `idx_producto_grupo_extra_grupo` (`grupo_extra_id`),
  CONSTRAINT `fk_producto_grupo_extra_grupo` FOREIGN KEY (`grupo_extra_id`) REFERENCES `grupo_extra` (`id`),
  CONSTRAINT `fk_producto_grupo_extra_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `producto_tag` (
  `producto_id` int(11) NOT NULL,
  `tag_id` int(11) NOT NULL,
  PRIMARY KEY (`producto_id`,`tag_id`),
  KEY `idx_producto_tag_tag` (`tag_id`),
  CONSTRAINT `fk_producto_tag_producto` FOREIGN KEY (`producto_id`) REFERENCES `producto` (`id`),
  CONSTRAINT `fk_producto_tag_tag` FOREIGN KEY (`tag_id`) REFERENCES `tag` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `provincia` (
  `id` varchar(2) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `reclamo` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedido_id` int(11) NOT NULL,
  `descripcion` text NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `estado` enum('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  `administrador_id` int(11) DEFAULT NULL,
  `nota_resolucion` varchar(500) DEFAULT NULL,
  `fecha_resolucion` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reclamo_pedido` (`pedido_id`),
  KEY `idx_reclamo_estado` (`estado`),
  KEY `fk_reclamo_administrador` (`administrador_id`),
  CONSTRAINT `fk_reclamo_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `administrador` (`id`),
  CONSTRAINT `fk_reclamo_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `red_social` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `tipo` enum('INSTAGRAM','FACEBOOK','TIKTOK','WHATSAPP','X','SITIO_WEB','OTRO') NOT NULL,
  `url` varchar(500) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_modificacion` datetime DEFAULT NULL,
  `fecha_baja` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_red_social_comercio_tipo` (`comercio_id`,`tipo`),
  KEY `idx_red_social_comercio` (`comercio_id`),
  CONSTRAINT `fk_red_social_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `sesion` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_inicio` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_cierre` datetime DEFAULT NULL,
  `tipo_cierre` enum('MANUAL','AUTOMATICO','FORZADO') DEFAULT NULL,
  `ip_origen` varchar(45) NOT NULL,
  `navegador` varchar(255) DEFAULT NULL,
  `dispositivo` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sesion_usuario_activa` (`usuario_id`,`activa`),
  CONSTRAINT `fk_sesion_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `soporte` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `mensaje_descargo` text NOT NULL,
  `fecha_envio` datetime NOT NULL DEFAULT current_timestamp(),
  `atendido` tinyint(1) NOT NULL DEFAULT 0,
  `administrador_id` int(11) DEFAULT NULL,
  `resolucion` enum('REACTIVADO','SUSPENSION_MANTENIDA') DEFAULT NULL,
  `fecha_resolucion` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_soporte_usuario` (`usuario_id`),
  KEY `idx_soporte_atendido` (`atendido`),
  KEY `fk_soporte_administrador` (`administrador_id`),
  CONSTRAINT `fk_soporte_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `administrador` (`id`),
  CONSTRAINT `fk_soporte_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `tag` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_modificacion` datetime DEFAULT NULL,
  `fecha_baja` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tag_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `token` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `tipo` enum('VERIFICACION_EMAIL','RECUPERACION_PASSWORD','REACTIVACION_CUENTA','INVITACION_EMPLEADO') NOT NULL,
  `token` varchar(36) NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_vencimiento` datetime NOT NULL,
  `fecha_uso` datetime DEFAULT NULL,
  `estado` enum('PENDIENTE','UTILIZADO','EXPIRADO') NOT NULL DEFAULT 'PENDIENTE',
  `intentos_fallidos` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_token_valor` (`token`),
  KEY `idx_token_usuario_tipo_estado` (`usuario_id`,`tipo`,`estado`),
  CONSTRAINT `fk_token_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `usuario` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol` enum('CLIENTE','DUENO','EMPLEADO','ADMINISTRADOR') NOT NULL,
  `estado` enum('PENDIENTE','ACTIVO','BLOQUEADO','SUSPENDIDO','INACTIVO') NOT NULL DEFAULT 'PENDIENTE',
  `email_verificado` tinyint(1) NOT NULL DEFAULT 0,
  `foto_perfil_url` varchar(500) DEFAULT NULL,
  `intentos_fallidos` int(11) NOT NULL DEFAULT 0,
  `fecha_registro` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_ultimo_acceso` datetime DEFAULT NULL,
  `fecha_actualizacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuario_email` (`email`),
  KEY `idx_usuario_rol` (`rol`),
  KEY `idx_usuario_estado` (`estado`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
