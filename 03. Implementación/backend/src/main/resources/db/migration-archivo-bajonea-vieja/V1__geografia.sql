-- Módulo Geografía: catálogo estático precargado por ETL desde la API Georef (Fase 2bis).
-- Fuente: docs/modelo-mvp.md, sección 2.

CREATE TABLE provincia (
    id     VARCHAR(2)   NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE localidad (
    id           VARCHAR(15)  NOT NULL,
    nombre       VARCHAR(150) NOT NULL,
    provincia_id VARCHAR(2)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_localidad_provincia FOREIGN KEY (provincia_id) REFERENCES provincia (id),
    INDEX idx_localidad_provincia (provincia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
