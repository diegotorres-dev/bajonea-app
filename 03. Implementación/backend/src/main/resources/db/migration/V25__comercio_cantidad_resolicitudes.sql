-- Cuántas veces el Dueño volvió a solicitar la aprobación de un comercio rechazado (corrección de datos
-- y re-solicitud). Es igual a la cantidad de filas RECHAZADO -> PENDIENTE de `historial_estado_comercio`
-- de ese comercio; la aplicación mantiene las dos cosas en la misma transacción. Los comercios existentes
-- quedan en 0 (sin ajuste de datos viejos).
ALTER TABLE `comercio`
  ADD COLUMN `cantidad_resolicitudes` int(11) NOT NULL DEFAULT 0 AFTER `fecha_resolicitud`;
