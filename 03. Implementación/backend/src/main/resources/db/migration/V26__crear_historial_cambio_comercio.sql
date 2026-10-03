-- Qué datos cambió el Dueño al corregir y volver a solicitar un comercio rechazado: una fila por campo
-- que realmente cambió, colgada de la fila RECHAZADO -> PENDIENTE de `historial_estado_comercio` que
-- dejó esa re-solicitud. `campo` es un enum Java (CampoCambioComercio), no un ENUM de MySQL: agregar un
-- campo a comparar no pide migración. Los valores se guardan como texto legible (la dirección, los
-- horarios y las redes sociales ya serializados). Los datos fiscales y del representante se guardan en
-- texto plano, igual que en `persona_juridica` / `persona_fisica`.
CREATE TABLE `historial_cambio_comercio` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `historial_estado_comercio_id` int(11) NOT NULL,
  `campo` varchar(40) NOT NULL,
  `valor_anterior` text DEFAULT NULL,
  `valor_nuevo` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hcc_historial_campo` (`historial_estado_comercio_id`, `campo`),
  CONSTRAINT `fk_hcc_historial_estado_comercio` FOREIGN KEY (`historial_estado_comercio_id`) REFERENCES `historial_estado_comercio` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
