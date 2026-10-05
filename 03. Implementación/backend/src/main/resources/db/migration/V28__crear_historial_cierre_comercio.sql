CREATE TABLE `historial_cierre_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comercio_id` int(11) NOT NULL,
  `accion` enum('CERRADO','REABIERTO') NOT NULL,
  `actor_usuario_id` int(11) DEFAULT NULL,
  `actor_rol` enum('DUENO','EMPLEADO','SISTEMA') NOT NULL,
  `fecha_hora` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_hci_comercio_fecha` (`comercio_id`,`fecha_hora`),
  KEY `idx_hci_actor_usuario` (`actor_usuario_id`),
  CONSTRAINT `fk_hci_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercio` (`id`),
  CONSTRAINT `fk_hci_actor_usuario` FOREIGN KEY (`actor_usuario_id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `ck_hci_actor` CHECK ((`actor_rol` = 'SISTEMA') = (`actor_usuario_id` IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
