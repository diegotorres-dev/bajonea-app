ALTER TABLE `alerta_webhook_mp`
  MODIFY `motivo` ENUM('EXTERNAL_REFERENCE_MISMATCH','PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO','PAGO_APROBADO_DUPLICADO','SPLIT_NO_APLICADO') NOT NULL,
  ADD COLUMN `monto_esperado` decimal(10,2) NULL AFTER `mp_external_reference`,
  ADD COLUMN `monto_capturado` decimal(10,2) NULL AFTER `monto_esperado`;
