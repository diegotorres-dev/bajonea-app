-- Ampliación de alcance (Tramo 16.19, ver docs/DECISIONES.md): vincula una notificación de
-- pedido con el pedido real, para que el frontend pueda ofrecer un botón "Ver pedido".
-- Nullable a propósito: solo las notificaciones generadas desde PedidoService (nuevo pedido,
-- aceptado, rechazado) llevan pedido_id; el resto (aprobación de comercio, producto agotado
-- en carrito) sigue sin vincularse a ningún pedido.

ALTER TABLE notificacion
    ADD COLUMN pedido_id INT NULL AFTER usuario_id,
    ADD CONSTRAINT fk_notificacion_pedido FOREIGN KEY (pedido_id) REFERENCES pedido (id);
