-- Tramo MercadoPago 03 (creación de preferencia + webhook): la tabla `pago` de
-- docs/bajonea_final.sql solo tenía columnas para persistir el resultado final de un pago ya
-- resuelto (monto, metodo_pago, id_transaccion_mp, fecha_confirmacion) — no había forma de
-- guardar la preferencia de Checkout Pro creada contra MercadoPago antes de que el pago exista,
-- necesaria para poder reusarla (evitar preferencias duplicadas para el mismo Pedido, ver
-- `PagoService`/`MercadoPagoPagoService`) y para redirigir al Cliente a pagar.
--
-- `mp_preferencia_id`/`mp_init_point`/`mp_sandbox_init_point` se completan al crear la
-- preferencia (antes de que exista ningún pago real). `mp_estado` guarda el estado crudo que
-- devuelve la API de pagos de MercadoPago (`approved`/`pending`/`in_process`/`rejected`/
-- `cancelled`/etc., más granular que `EstadoPagoPedido` de `Pedido`, que solo tiene 3 valores) —
-- se completa recién cuando el webhook confirma un pago real, `id_transaccion_mp` pasa a ser el
-- id real del pago de MercadoPago en ese momento (antes de eso, sigue `NULL`).
ALTER TABLE `pago`
  ADD COLUMN `mp_preferencia_id` varchar(120) DEFAULT NULL AFTER `pedido_id`,
  ADD COLUMN `mp_init_point` varchar(500) DEFAULT NULL AFTER `mp_preferencia_id`,
  ADD COLUMN `mp_sandbox_init_point` varchar(500) DEFAULT NULL AFTER `mp_init_point`,
  ADD COLUMN `mp_estado` varchar(30) DEFAULT NULL AFTER `metodo_pago`;
