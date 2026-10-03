-- Agrega `RECHAZO_DEFINITIVO` (al final) al ENUM de `comercio.estado` y de las dos columnas de estado
-- de `historial_estado_comercio`: estado terminal de un comercio al que el Administrador rechazó de forma
-- definitiva (a pedido, o porque agotó las re-solicitudes). Sin salida desde la aplicación.
-- Mismo patrón que V12 y V20: MySQL no tiene ALTER TYPE incremental, se repite la lista completa.
ALTER TABLE `comercio`
  MODIFY COLUMN `estado` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE','APTO_VENTA','RECHAZO_DEFINITIVO') NOT NULL DEFAULT 'PENDIENTE';

ALTER TABLE `historial_estado_comercio`
  MODIFY COLUMN `estado_origen` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE','APTO_VENTA','RECHAZO_DEFINITIVO') NOT NULL,
  MODIFY COLUMN `estado_destino` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE','APTO_VENTA','RECHAZO_DEFINITIVO') NOT NULL;
