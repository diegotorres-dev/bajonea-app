-- Cliente puede cambiar su nombre de usuario desde el perfil (revierte parcialmente la
-- decisión previa de "no se puede modificar"), con límite de 3 cambios cada 30 días corridos.
-- Mismo criterio que `alerta_webhook_mp` (V15): tabla chica de auditoría de un evento puntual,
-- sin relación con otras tablas de negocio más allá del usuario dueño del cambio.
CREATE TABLE `historial_cambio_nombre_usuario` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `nombre_usuario_anterior` varchar(20) NOT NULL,
  `nombre_usuario_nuevo` varchar(20) NOT NULL,
  `fecha_cambio` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_historial_cambio_nombre_usuario_usuario_fecha` (`usuario_id`, `fecha_cambio`),
  CONSTRAINT `fk_historial_cambio_nombre_usuario_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
