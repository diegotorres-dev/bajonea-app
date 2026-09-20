-- Tramo MercadoPago 03 (creación de preferencia + webhook), cierre de pendiente pedido por Diego:
-- el `log.warn` que ya existía en `MercadoPagoPagoService.procesarNotificacion` para el caso de
-- `external_reference` que no coincide con el `pedidoId` reclamado en la query no alcanza como
-- registro — Diego pidió un rastro persistente y consultable, no solo un log de servidor.
--
-- Tabla de auditoría de seguridad, sin relación con `pago` ni `cuenta_mercado_pago` (intencional:
-- el punto de esta tabla es justamente registrar casos donde no se pudo asociar con confianza).
-- `pedido_id` es FK opcional porque el pedido reclamado en la query puede no ser el real — se
-- guarda igual, como parte de la evidencia del intento. `motivo` es un ENUM pensado para poder
-- sumar otros casos a futuro (ej. firma inválida) sin cambiar el diseño de la tabla.
CREATE TABLE `alerta_webhook_mp` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedido_id` int(11) NULL,
  `mp_payment_id` varchar(50) NOT NULL,
  `mp_external_reference` varchar(120) NULL,
  `motivo` ENUM('EXTERNAL_REFERENCE_MISMATCH') NOT NULL,
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `ip_origen` varchar(45) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_alerta_webhook_mp_pedido` (`pedido_id`),
  KEY `idx_alerta_webhook_mp_payment` (`mp_payment_id`),
  CONSTRAINT `fk_alerta_webhook_mp_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
