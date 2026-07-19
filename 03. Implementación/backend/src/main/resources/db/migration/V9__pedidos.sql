-- Módulo Operaciones: pedido, detalle_pedido. Ciclo de vida recortado del MVP:
-- PENDIENTE -> EN_PREPARACION / RECHAZADO. Sin pago, sin flujo posterior a EN_PREPARACION.
-- Fuente: docs/modelo-mvp.md, sección 7.

CREATE TABLE pedido (
    id                    INT           NOT NULL AUTO_INCREMENT,
    cliente_id            INT           NOT NULL,
    comercio_id           INT           NOT NULL,
    direccion_id          INT           NULL,
    tipo_entrega          ENUM('DOMICILIO','RETIRO') NOT NULL,
    estado                ENUM('PENDIENTE','EN_PREPARACION','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
    motivo_rechazo        ENUM('SIN_STOCK','CERRADO','ALTO_VOLUMEN_PEDIDOS','PRODUCTO_NO_DISPONIBLE_TEMPORAL','SIN_DELIVERY_DISPONIBLE','PROBLEMA_TECNICO','OTRO') NULL,
    comentario_rechazo    VARCHAR(500)  NULL,
    subtotal              DECIMAL(10,2) NOT NULL,
    fecha_creacion        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id),
    CONSTRAINT fk_pedido_comercio FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    CONSTRAINT fk_pedido_direccion FOREIGN KEY (direccion_id) REFERENCES direccion (id),
    INDEX idx_pedido_cliente (cliente_id),
    INDEX idx_pedido_comercio (comercio_id),
    INDEX idx_pedido_estado (estado),
    INDEX idx_pedido_fecha_creacion (fecha_creacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE detalle_pedido (
    id               INT           NOT NULL AUTO_INCREMENT,
    pedido_id        INT           NOT NULL,
    producto_id      INT           NOT NULL,
    cantidad         INT           NOT NULL,
    precio_unitario  DECIMAL(10,2) NOT NULL,
    nota             VARCHAR(255)  NULL,
    subtotal         DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_detalle_pedido_pedido FOREIGN KEY (pedido_id) REFERENCES pedido (id),
    CONSTRAINT fk_detalle_pedido_producto FOREIGN KEY (producto_id) REFERENCES producto (id),
    INDEX idx_detalle_pedido_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
