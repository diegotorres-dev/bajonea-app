-- Fase 19 (rediseño de HistorialEstadoPedido, pedido a Diego, ver docs/DECISIONES.md): `actor`
-- se aclara a `actor_rol` (ahora que existe `actor_usuario_id`, distinguir "qué rol" de "qué
-- usuario puntual" evita ambigüedad de nombre). Se agrega `actor_usuario_id` (FK opcional a
-- `usuario`, NULL cuando actor_rol=SISTEMA) para trazabilidad de qué usuario específico disparó
-- la transición, y `motivo_timeout` (NULL salvo en las transiciones de los 4 jobs de
-- PedidoSchedulerService) para saber qué timeout puntual la disparó. `cancelado_por` y
-- `fuente_entrega` se eliminan de esta tabla: son redundantes con `actor_rol` en esta tabla
-- (a diferencia de `Pedido.cancelado_por`/`Pedido.fuente_entrega`, que sí se mantienen, ver
-- docs/DECISIONES.md) y `fuente_entrega` además ya vive en `Pedido`, no cambia por transición.
ALTER TABLE `historial_estado_pedido`
  CHANGE COLUMN `actor` `actor_rol` ENUM('CLIENTE','COMERCIO','SISTEMA') NOT NULL,
  ADD COLUMN `actor_usuario_id` INT NULL AFTER `actor_rol`,
  ADD COLUMN `motivo_timeout` ENUM('TIMEOUT_PAGO','TIMEOUT_ENTREGA','TIMEOUT_RESPUESTA_COMERCIO','TIMEOUT_RETIRO_SUSPENSION') NULL AFTER `actor_usuario_id`,
  DROP COLUMN `cancelado_por`,
  DROP COLUMN `fuente_entrega`,
  ADD CONSTRAINT `fk_historial_estado_pedido_actor_usuario` FOREIGN KEY (`actor_usuario_id`) REFERENCES `usuario` (`id`) ON DELETE RESTRICT;
