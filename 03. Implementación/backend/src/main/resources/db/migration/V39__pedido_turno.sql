ALTER TABLE `pedido`
  ADD COLUMN `fecha_pago_confirmado` datetime NULL,
  ADD COLUMN `turno_fecha` date NULL,
  ADD COLUMN `turno_horario_id` int(11) NULL,
  ADD KEY `idx_pedido_turno` (`comercio_id`, `turno_fecha`, `turno_horario_id`),
  ADD KEY `idx_pedido_fecha_pago` (`comercio_id`, `fecha_pago_confirmado`),
  ADD KEY `idx_pedido_turno_horario` (`turno_horario_id`),
  ADD CONSTRAINT `fk_pedido_turno_horario` FOREIGN KEY (`turno_horario_id`) REFERENCES `horario` (`id`);

UPDATE `pedido` p
JOIN (
  SELECT `pedido_id`, MIN(`fecha_hora`) AS `fecha_pago`
  FROM `historial_estado_pedido`
  WHERE `estado` = 'PENDIENTE_CONFIRMACION_COMERCIO'
  GROUP BY `pedido_id`
) h ON h.`pedido_id` = p.`id`
SET p.`fecha_pago_confirmado` = h.`fecha_pago`;
