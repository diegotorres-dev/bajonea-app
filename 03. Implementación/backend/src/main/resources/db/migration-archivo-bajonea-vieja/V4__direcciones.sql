-- Módulo Identidad: direccion, modelo completo (docs/modelo-mvp.md, sección 3).
-- Exclusión mutua cliente_id / comercio_id: NO se fuerza con CHECK, se valida a nivel aplicación
-- (RegistroService / ProductoService), según decisión ya documentada en el modelo aprobado.

CREATE TABLE direccion (
    id                  INT          NOT NULL AUTO_INCREMENT,
    calle               VARCHAR(150) NOT NULL,
    numero              VARCHAR(10)  NOT NULL,
    piso_depto          VARCHAR(30)  NULL,
    codigo_postal       VARCHAR(10)  NOT NULL,
    localidad_id        VARCHAR(15)  NOT NULL,
    cliente_id          INT          NULL,
    comercio_id         INT          NULL,
    principal           TINYINT(1)   NOT NULL DEFAULT 0,
    eliminada           TINYINT(1)   NOT NULL DEFAULT 0,
    fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME     NULL,
    fecha_baja          DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_direccion_comercio (comercio_id),
    CONSTRAINT fk_direccion_localidad FOREIGN KEY (localidad_id) REFERENCES localidad (id),
    CONSTRAINT fk_direccion_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id),
    CONSTRAINT fk_direccion_comercio FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    INDEX idx_direccion_cliente (cliente_id),
    INDEX idx_direccion_localidad (localidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
