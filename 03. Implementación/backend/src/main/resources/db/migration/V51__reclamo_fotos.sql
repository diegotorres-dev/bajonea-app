CREATE TABLE `reclamo_foto` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reclamo_id` int(11) NOT NULL,
  `orden` int(11) NOT NULL,
  `nombre_original` varchar(255) NOT NULL,
  `tipo_contenido` varchar(50) NOT NULL,
  `tamano_bytes` int(11) NOT NULL,
  `fecha_creacion` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reclamo_foto_orden` (`reclamo_id`,`orden`),
  CONSTRAINT `ck_reclamo_foto_orden` CHECK (`orden` BETWEEN 1 AND 3),
  CONSTRAINT `fk_reclamo_foto_reclamo` FOREIGN KEY (`reclamo_id`) REFERENCES `reclamo` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reclamo_foto_archivo` (
  `foto_id` int(11) NOT NULL,
  `contenido` longblob NOT NULL,
  PRIMARY KEY (`foto_id`),
  CONSTRAINT `fk_reclamo_foto_archivo_foto` FOREIGN KEY (`foto_id`) REFERENCES `reclamo_foto` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
