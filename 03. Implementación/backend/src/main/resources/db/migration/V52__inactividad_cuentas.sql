UPDATE `usuario` SET `fecha_ultimo_acceso` = NOW();

ALTER TABLE `usuario`
  MODIFY COLUMN `fecha_ultimo_acceso` datetime NOT NULL DEFAULT current_timestamp(),
  ADD KEY `idx_usuario_estado_ultimo_acceso` (`estado`, `fecha_ultimo_acceso`);

ALTER TABLE `sesion`
  MODIFY COLUMN `tipo_cierre` enum('MANUAL','AUTOMATICO','FORZADO','SUSPENSION','INACTIVIDAD') NULL;

ALTER TABLE `pedido`
  ADD KEY `idx_pedido_comercio_fecha_creacion` (`comercio_id`, `fecha_creacion`);
