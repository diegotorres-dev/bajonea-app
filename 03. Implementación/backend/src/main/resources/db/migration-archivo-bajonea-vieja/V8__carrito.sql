-- Módulo Operaciones: carrito, item_carrito. Un carrito por cliente, un único comercio a la vez.
-- Fuente: docs/modelo-mvp.md, sección 7.

CREATE TABLE carrito (
    id           INT NOT NULL AUTO_INCREMENT,
    cliente_id   INT NOT NULL,
    comercio_id  INT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_carrito_cliente (cliente_id),
    CONSTRAINT fk_carrito_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id),
    CONSTRAINT fk_carrito_comercio FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    INDEX idx_carrito_comercio (comercio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE item_carrito (
    id           INT          NOT NULL AUTO_INCREMENT,
    carrito_id   INT          NOT NULL,
    producto_id  INT          NOT NULL,
    cantidad     INT          NOT NULL,
    nota         VARCHAR(255) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_item_carrito_carrito FOREIGN KEY (carrito_id) REFERENCES carrito (id),
    CONSTRAINT fk_item_carrito_producto FOREIGN KEY (producto_id) REFERENCES producto (id),
    INDEX idx_item_carrito_carrito (carrito_id),
    INDEX idx_item_carrito_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
