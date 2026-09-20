-- Fase 19 (pedido a Diego, ver docs/DECISIONES.md): renombra el valor `COMERCIO` del ENUM de
-- `historial_estado_pedido.actor_rol` a `DUENO` (ASCII, sin ñ, consistente con el resto de
-- identificadores del proyecto). Motivo: con `EMPLEADO` ya agregado como anticipación de diseño,
-- `COMERCIO` quedaba ambiguo — no distinguía si quien actuó en nombre del comercio fue el Dueño
-- o, a futuro, un Empleado. `DUENO` dice exactamente quién actuó hoy (todo call site real de
-- `registrarHistorial` con este valor ya resuelve el usuario del Dueño, nunca de un Empleado,
-- que no existe como entidad todavía).
--
-- Distinto del rename PENDIENTE→PENDIENTE_CONFIRMACION_COMERCIO de V6: acá no hay datos en
-- Railway/`bajonea_final` que preservar (esta migración solo se aplica contra
-- `bajonea_practicas3`), así que el valor viejo `COMERCIO` se elimina del ENUM en vez de quedar
-- como remanente — no hace falta mantenerlo.
ALTER TABLE `historial_estado_pedido`
  MODIFY COLUMN `actor_rol` ENUM('CLIENTE','COMERCIO','SISTEMA','EMPLEADO','DUENO') NOT NULL;

UPDATE `historial_estado_pedido` SET `actor_rol` = 'DUENO' WHERE `actor_rol` = 'COMERCIO';

ALTER TABLE `historial_estado_pedido`
  MODIFY COLUMN `actor_rol` ENUM('CLIENTE','DUENO','SISTEMA','EMPLEADO') NOT NULL;
