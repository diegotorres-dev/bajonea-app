ALTER TABLE `usuario`
  ADD COLUMN `motivo_suspension` varchar(500) NULL AFTER `intentos_fallidos`,
  ADD COLUMN `suspendido_desde` datetime NULL AFTER `motivo_suspension`,
  ADD CONSTRAINT `ck_usuario_suspension` CHECK (
    (`estado` = 'SUSPENDIDO' AND `motivo_suspension` IS NOT NULL AND `suspendido_desde` IS NOT NULL)
    OR (`estado` <> 'SUSPENDIDO' AND `motivo_suspension` IS NULL AND `suspendido_desde` IS NULL)
  );

ALTER TABLE `historial_estado_usuario`
  ADD COLUMN `administrador_id` int(11) NULL AFTER `usuario_id`,
  ADD KEY `idx_heu_administrador` (`administrador_id`),
  ADD CONSTRAINT `fk_heu_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `usuario` (`id`);

ALTER TABLE `sesion`
  MODIFY COLUMN `tipo_cierre` enum('MANUAL','AUTOMATICO','FORZADO','SUSPENSION') NULL;

ALTER TABLE `nota_credito`
  MODIFY COLUMN `motivo` enum('RECHAZO_COMERCIO','CANCELACION_CLIENTE','ANULACION_COMERCIO','SUSPENSION_COMERCIO','EXPIRACION_SIN_RESPUESTA','SUSPENSION_CLIENTE','RECLAMO') NULL;

ALTER TABLE `historial_estado_pedido`
  MODIFY COLUMN `motivo_timeout` enum('TIMEOUT_PAGO','TIMEOUT_ENTREGA','TIMEOUT_RESPUESTA_COMERCIO','TIMEOUT_RETIRO_SUSPENSION','SUSPENSION_CLIENTE') NULL;
