-- Módulo Catálogo de Productos: producto, imagen_producto, producto_tag.
-- Fuente: docs/modelo-mvp.md, sección 6.
-- Límite de 5 imágenes por producto y unicidad de "es_principal" se validan a nivel aplicación
-- (CloudinaryService / ProductoService), no con un constraint de schema (MySQL no lo soporta nativamente).

CREATE TABLE producto (
    id                  INT            NOT NULL AUTO_INCREMENT,
    comercio_id         INT            NOT NULL,
    categoria_id        INT            NOT NULL,
    nombre              VARCHAR(150)   NOT NULL,
    descripcion         TEXT           NULL,
    precio              DECIMAL(10,2)  NOT NULL,
    estado              ENUM('DISPONIBLE','AGOTADO','DESCONTINUADO') NOT NULL DEFAULT 'DISPONIBLE',
    fecha_creacion      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME       NULL,
    fecha_baja          DATETIME       NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_producto_comercio FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    CONSTRAINT fk_producto_categoria FOREIGN KEY (categoria_id) REFERENCES categoria (id),
    INDEX idx_producto_comercio (comercio_id),
    INDEX idx_producto_categoria (categoria_id),
    INDEX idx_producto_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE imagen_producto (
    id            INT          NOT NULL AUTO_INCREMENT,
    producto_id   INT          NOT NULL,
    url           VARCHAR(500) NOT NULL,
    orden         INT          NOT NULL DEFAULT 0,
    es_principal  TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT fk_imagen_producto_producto FOREIGN KEY (producto_id) REFERENCES producto (id),
    INDEX idx_imagen_producto_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE producto_tag (
    producto_id  INT NOT NULL,
    tag_id       INT NOT NULL,
    PRIMARY KEY (producto_id, tag_id),
    CONSTRAINT fk_producto_tag_producto FOREIGN KEY (producto_id) REFERENCES producto (id),
    CONSTRAINT fk_producto_tag_tag FOREIGN KEY (tag_id) REFERENCES tag (id),
    INDEX idx_producto_tag_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
