-- Fase 19 (corrección post-pruebas manuales, pedido a Diego, ver docs/DECISIONES.md): el valor
-- `PENDIENTE` de EstadoPedido (pago ya confirmado, esperando que el Comercio acepte o rechace)
-- se renombra a `PENDIENTE_CONFIRMACION_COMERCIO` — se confundía visualmente con
-- `PENDIENTE_PAGO` pese a significar lo opuesto (uno espera al Cliente, el otro al Comercio).
--
-- El literal viejo `PENDIENTE` se mantiene en la lista del ENUM a propósito, sin uso desde el
-- código Java de acá en adelante: Diego pidió explícitamente no migrar ni tocar los pedidos de
-- prueba que ya quedaron en Railway con ese valor. Si se quitara `PENDIENTE` de la lista en vez
-- de conservarlo, MySQL invalidaría/truncaría el valor de esas filas existentes al aplicar el
-- ALTER, que es exactamente lo que Diego pidió evitar.
ALTER TABLE `pedido`
  MODIFY COLUMN `estado` enum('PENDIENTE_PAGO','PENDIENTE','PENDIENTE_CONFIRMACION_COMERCIO','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','RECHAZADO','CANCELADO','ANULADO','CANCELADO_POR_SISTEMA','EXPIRADO') NOT NULL DEFAULT 'PENDIENTE_PAGO';

ALTER TABLE `historial_estado_pedido`
  MODIFY COLUMN `estado` enum('PENDIENTE_PAGO','PENDIENTE','PENDIENTE_CONFIRMACION_COMERCIO','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR','ENTREGADO','RECHAZADO','CANCELADO','ANULADO','CANCELADO_POR_SISTEMA','EXPIRADO') NOT NULL;
