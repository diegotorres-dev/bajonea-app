-- Módulo Identidad / Comercio: roles de negocio.
-- cliente.id y administrador.id son FK a persona_fisica.id (sin AUTO_INCREMENT propio).
-- comercio.persona_juridica_id es FK a persona_juridica.id (columna propia con AUTO_INCREMENT).
-- Fuente: docs/modelo-mvp.md, secciones 3 y 4.

CREATE TABLE cliente (
    id INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_cliente_persona_fisica FOREIGN KEY (id) REFERENCES persona_fisica (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE comercio (
    id                    INT          NOT NULL AUTO_INCREMENT,
    persona_juridica_id   INT          NOT NULL,
    nombre                VARCHAR(150) NOT NULL,
    descripcion           TEXT         NULL,
    foto_perfil_url       VARCHAR(500) NULL,
    telefono              VARCHAR(30)  NOT NULL,
    email                 VARCHAR(150) NOT NULL,
    tipo_comercio         ENUM('RESTAURANTE','EMPRENDIMIENTO') NOT NULL,
    acepta_delivery       TINYINT(1)   NOT NULL DEFAULT 0,
    acepta_retiro         TINYINT(1)   NOT NULL DEFAULT 0,
    estado                ENUM('PENDIENTE','APROBADO','RECHAZADO','SUSPENDIDO','INACTIVO','CERRADO_TEMPORALMENTE') NOT NULL DEFAULT 'PENDIENTE',
    fecha_registro        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion    DATETIME     NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_comercio_persona_juridica FOREIGN KEY (persona_juridica_id) REFERENCES persona_juridica (id),
    INDEX idx_comercio_persona_juridica (persona_juridica_id),
    INDEX idx_comercio_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE administrador (
    id INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_administrador_persona_fisica FOREIGN KEY (id) REFERENCES persona_fisica (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
