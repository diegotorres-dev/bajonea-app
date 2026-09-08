-- Cancelación/anulación parcial de ítems de un pedido confirmado, con nota de crédito
-- parcial propia por ítem. Ver docs/DECISIONES.md, entrada del 2026-08-28, para el
-- detalle de alternativas evaluadas y la decisión final.
--
-- Reglas de negocio de esta migración (documentadas acá, sin constraint de BD ni
-- lógica de aplicación en este tramo — quedan para el tramo que implemente el
-- Service/Controller de cancelación parcial):
--   1. `nota_credito_id` solo debe completarse cuando `estado != 'ACTIVO'`.
--   2. Una vez `CANCELADO` o `ANULADO`, el estado de un `detalle_pedido` es terminal
--      (sin transición de vuelta a `ACTIVO` ni entre `CANCELADO`/`ANULADO`).
--   3. `motivo_anulacion` se completa únicamente cuando `estado = 'ANULADO'`.
ALTER TABLE `detalle_pedido`
  ADD COLUMN `estado` enum('ACTIVO','CANCELADO','ANULADO') NOT NULL DEFAULT 'ACTIVO' AFTER `subtotal`,
  ADD COLUMN `motivo_anulacion` varchar(255) DEFAULT NULL AFTER `estado`,
  ADD COLUMN `nota_credito_id` int(11) DEFAULT NULL AFTER `motivo_anulacion`,
  ADD KEY `idx_detalle_pedido_nota_credito` (`nota_credito_id`),
  ADD CONSTRAINT `fk_detalle_pedido_nota_credito` FOREIGN KEY (`nota_credito_id`) REFERENCES `nota_credito` (`id`);

-- `nota_credito.pago_id` pasa de 1:1 a N:1 con `pago`: un mismo pago puede ahora
-- generar más de una nota de crédito (una por cada tanda de ítems cancelados/anulados
-- de su pedido), en vez de una única nota de crédito total por pago. Se agrega un
-- índice no único antes de soltar el UNIQUE para que la FK existente (`fk_nota_credito_pago`)
-- conserve un índice de soporte durante y después del cambio.
ALTER TABLE `nota_credito`
  ADD INDEX `idx_nota_credito_pago` (`pago_id`),
  DROP INDEX `uq_nota_credito_pago`;
