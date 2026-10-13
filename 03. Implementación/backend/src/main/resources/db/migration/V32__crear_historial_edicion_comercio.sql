CREATE TABLE `historial_edicion_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `actor_rol` enum('DUENO','EMPLEADO') NOT NULL,
  `entidad_tipo` enum('PRODUCTO','IMAGEN_PRODUCTO','COMERCIO','HORARIO','RED_SOCIAL','GRUPO_EXTRA','EXTRA') NOT NULL,
  `entidad_id` int(11) DEFAULT NULL,
  `entidad_nombre` varchar(150) DEFAULT NULL,
  `accion` enum('CREAR','EDITAR','ELIMINAR','CAMBIAR_ESTADO') NOT NULL,
  `detalle` varchar(255) DEFAULT NULL,
  `fecha_hora` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hed_comercio_fecha` (`comercio_id`,`fecha_hora`,`id`),
  KEY `idx_hed_usuario` (`usuario_id`),
  CONSTRAINT `fk_hed_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_hed_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
