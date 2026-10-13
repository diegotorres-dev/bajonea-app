ALTER TABLE `notificacion`
  ADD COLUMN `comercio_id` int(11) DEFAULT NULL AFTER `entidad_id`,
  ADD KEY `idx_notificacion_usuario_comercio` (`usuario_id`,`comercio_id`,`leida`,`fecha_creacion`);

UPDATE `notificacion`
   SET `comercio_id` = `entidad_id`
 WHERE `entidad_tipo` = 'COMERCIO';

UPDATE `notificacion` n
  JOIN `pedido` p ON p.`id` = n.`entidad_id`
   SET n.`comercio_id` = p.`comercio_id`
 WHERE n.`entidad_tipo` = 'PEDIDO'
   AND n.`tipo` IN ('NUEVO_PEDIDO','PEDIDO_CANCELADO_CLIENTE','PEDIDO_EXPIRADO_COMERCIO');
