-- Tramo MercadoPago 02 (vinculación OAuth): agrega el valor `APTO_VENTA` al ENUM de
-- `comercio.estado` y a `historial_estado_comercio.estado_origen`/`estado_destino`.
--
-- `APTO_VENTA` significa: el comercio ya fue aprobado por el Administrador Y además cumple los
-- requisitos adicionales para ser visible y vender (hoy, el único requisito es tener una
-- `CuentaMercadoPago` activa vinculada). La transición APROBADO<->APTO_VENTA es 100% automática
-- del sistema (sin intervención de Administrador), disparada al vincular/desvincular la cuenta
-- de Mercado Pago del Dueño — ver `MercadoPagoOAuthService`/`ComercioService.activarAptoVenta`/
-- `desactivarAptoVenta`.
--
-- Mismo patrón que V6 (rename PENDIENTE->PENDIENTE_CONFIRMACION_COMERCIO en EstadoPedido): se
-- repite la lista completa de valores del ENUM porque MySQL no tiene ALTER TYPE incremental.
ALTER TABLE `comercio`
  MODIFY COLUMN `estado` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE','APTO_VENTA') NOT NULL DEFAULT 'PENDIENTE';

ALTER TABLE `historial_estado_comercio`
  MODIFY COLUMN `estado_origen` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE','APTO_VENTA') NOT NULL,
  MODIFY COLUMN `estado_destino` enum('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE','APTO_VENTA') NOT NULL;
