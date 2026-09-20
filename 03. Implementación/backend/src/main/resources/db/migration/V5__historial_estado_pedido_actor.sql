-- Fase 19 (máquina de estados completa del Pedido): HistorialEstadoPedido pasa a ser la
-- fuente de trazabilidad completa del ciclo de vida (pedido a Diego, ver docs/DECISIONES.md).
-- La tabla ya traía `cancelado_por`/`fuente_entrega`, que el diccionario documenta como
-- poblados solo en estados terminales negativos o en ENTREGADO respectivamente. Diego pidió
-- "quién lo hizo" para CADA transición (aceptar, despachar, confirmar entrega, etc.), no solo
-- esas — ninguna columna existente cubre eso, así que se agrega `actor`, de propósito general,
-- que se completa siempre. `cancelado_por`/`fuente_entrega` se mantienen sin cambios, con su
-- semántica ya documentada.
ALTER TABLE `historial_estado_pedido`
  ADD COLUMN `actor` enum('CLIENTE','COMERCIO','SISTEMA') NOT NULL AFTER `estado`;
