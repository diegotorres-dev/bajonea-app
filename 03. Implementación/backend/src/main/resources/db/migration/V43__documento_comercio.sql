CREATE TABLE `documento_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `tipo` enum('LIBRETA_SANITARIA','CARNET_MANIPULACION_ALIMENTOS','HABILITACION_COMERCIAL','OTRO') NOT NULL,
  `descripcion` varchar(100) DEFAULT NULL,
  `nombre_original` varchar(255) NOT NULL,
  `tipo_mime` varchar(100) NOT NULL,
  `tamano_bytes` int(11) NOT NULL,
  `estado` enum('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  `motivo_rechazo` varchar(255) DEFAULT NULL,
  `fecha_subida` datetime NOT NULL,
  `fecha_resolucion` datetime DEFAULT NULL,
  `administrador_id` int(11) DEFAULT NULL,
  `subido_por_usuario_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_documento_comercio_bandeja` (`estado`,`fecha_subida`),
  KEY `idx_documento_comercio_conteo` (`comercio_id`,`estado`),
  KEY `idx_documento_comercio_administrador` (`administrador_id`),
  KEY `idx_documento_comercio_subido_por` (`subido_por_usuario_id`),
  CONSTRAINT `fk_documento_comercio_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_documento_comercio_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `administrador` (`id`),
  CONSTRAINT `fk_documento_comercio_subido_por` FOREIGN KEY (`subido_por_usuario_id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `ck_documento_comercio_motivo` CHECK (`estado` <> 'RECHAZADO' OR `motivo_rechazo` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `documento_comercio_archivo` (
  `documento_id` int(11) NOT NULL,
  `contenido` longblob NOT NULL,
  PRIMARY KEY (`documento_id`),
  CONSTRAINT `fk_documento_comercio_archivo_documento` FOREIGN KEY (`documento_id`) REFERENCES `documento_comercio` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `notificacion`
  MODIFY COLUMN `tipo` enum('NUEVO_PEDIDO','PEDIDO_ACEPTADO','PEDIDO_RECHAZADO','PEDIDO_EN_CAMINO','PEDIDO_LISTO_RETIRO','AVISO_75MIN_SIN_CONFIRMACION','PEDIDO_AUTOCONFIRMADO','PEDIDO_CANCELADO_CLIENTE','PEDIDO_ANULADO_COMERCIO','PEDIDO_CANCELADO_SISTEMA','PEDIDO_EXPIRADO_CLIENTE','PEDIDO_EXPIRADO_COMERCIO','COMERCIO_APROBADO','COMERCIO_RECHAZADO','COMERCIO_SUSPENDIDO','NUEVO_COMERCIO_PENDIENTE','NUEVA_RESOLICITUD_COMERCIO','NUEVO_RECLAMO','RECLAMO_APROBADO','RECLAMO_RECHAZADO','NUEVO_MENSAJE_SOPORTE','PRODUCTO_REMOVIDO_CARRITO','CUENTA_INACTIVADA','COMERCIO_INACTIVADO','PEDIDO_CERRADO_TIMER_SUSPENSION','REEMBOLSO_FALLIDO_DEFINITIVO','CLIENTE_SUSPENDIDO','SUSPENSION_LEVANTADA','PEDIDO_AUTOCONFIRMADO_COMERCIO','INVITACION_EMPLEADO','EMPLEADO_DESACTIVADO','PEDIDO_NO_RETIRADO','EMPLEADO_REACTIVADO','DOCUMENTO_APROBADO','DOCUMENTO_RECHAZADO','COMERCIO_APTO_VENTA','COMERCIO_SIN_APTITUD') NOT NULL;
