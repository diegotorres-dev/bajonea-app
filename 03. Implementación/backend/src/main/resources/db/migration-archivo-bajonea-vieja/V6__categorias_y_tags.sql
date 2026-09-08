-- Módulo Catálogo de Productos: categoria, tag. Gestionadas por el Administrador, baja lógica.
-- Fuente: docs/modelo-mvp.md, sección 6.

CREATE TABLE categoria (
    id                  INT          NOT NULL AUTO_INCREMENT,
    nombre              VARCHAR(100) NOT NULL,
    activo              TINYINT(1)   NOT NULL DEFAULT 1,
    fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME     NULL,
    fecha_baja          DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categoria_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tag (
    id                  INT          NOT NULL AUTO_INCREMENT,
    nombre              VARCHAR(100) NOT NULL,
    activo              TINYINT(1)   NOT NULL DEFAULT 1,
    fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  DATETIME     NULL,
    fecha_baja          DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tag_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
