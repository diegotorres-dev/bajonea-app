DROP TABLE IF EXISTS `soporte`;

CREATE TABLE `ticket_soporte` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `email` varchar(254) NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `tipo` enum('APELACION_CUENTA','APELACION_COMERCIO','NO_PUEDO_ENTRAR','COMERCIO_RECHAZADO_DOCUMENTOS_COBROS','OTRA') NOT NULL,
  `estado` enum('ESPERA_SOPORTE','ESPERA_PERSONA','CERRADO') NOT NULL DEFAULT 'ESPERA_SOPORTE',
  `ip` varchar(45) NOT NULL,
  `cantidad_mensajes` int(11) NOT NULL DEFAULT 0,
  `creado_en` datetime NOT NULL,
  `actualizado_en` datetime NOT NULL,
  `cerrado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ticket_soporte_codigo` (`codigo`),
  KEY `idx_ticket_soporte_email_codigo` (`email`,`codigo`),
  KEY `idx_ticket_soporte_email_creado` (`email`,`creado_en`),
  KEY `idx_ticket_soporte_estado_actualizado` (`estado`,`actualizado_en`),
  KEY `idx_ticket_soporte_ip_creado` (`ip`,`creado_en`),
  KEY `idx_ticket_soporte_usuario` (`usuario_id`,`estado`),
  CONSTRAINT `fk_ticket_soporte_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `ck_ticket_soporte_cierre` CHECK ((`estado` = 'CERRADO' AND `cerrado_en` IS NOT NULL) OR (`estado` <> 'CERRADO' AND `cerrado_en` IS NULL)),
  CONSTRAINT `ck_ticket_soporte_mensajes` CHECK (`cantidad_mensajes` BETWEEN 0 AND 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ticket_soporte_mensaje` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticket_id` int(11) NOT NULL,
  `autor` enum('PERSONA','SOPORTE') NOT NULL,
  `texto` varchar(1000) NOT NULL,
  `creado_en` datetime NOT NULL,
  `email_enviado` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ticket_soporte_mensaje_ticket` (`ticket_id`,`id`),
  CONSTRAINT `fk_ticket_soporte_mensaje_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `ticket_soporte` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `soporte_limite` (
  `clave` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `cantidad` int(11) NOT NULL DEFAULT 0,
  `ventana_inicio` datetime NOT NULL,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
