-- Módulo Identidad: usuario -> persona -> persona_fisica / persona_juridica.
-- Cadena de herencia con PK compartida (sin AUTO_INCREMENT en persona/persona_fisica/persona_juridica).
-- Fuente: docs/modelo-mvp.md, sección 3.

CREATE TABLE usuario (
    id                  INT          NOT NULL AUTO_INCREMENT,
    email               VARCHAR(150) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    rol                 ENUM('CLIENTE','COMERCIO','ADMINISTRADOR') NOT NULL,
    estado              ENUM('PENDIENTE','ACTIVO','BLOQUEADO','SUSPENDIDO','INACTIVO') NOT NULL DEFAULT 'PENDIENTE',
    fecha_registro      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_ultimo_acceso DATETIME     NULL,
    fecha_actualizacion DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuario_email (email),
    INDEX idx_usuario_rol (rol),
    INDEX idx_usuario_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nodo intermedio real de la jerarquía de herencia (docs/modelo-mvp.md, nota de alcance 1).
-- Mapeo JPA a resolver en la Fase 4 (Usuario -> Persona -> PersonaFisica/PersonaJuridica encadenado).
CREATE TABLE persona (
    id INT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_persona_usuario FOREIGN KEY (id) REFERENCES usuario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE persona_fisica (
    id                  INT          NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    apellido            VARCHAR(100) NOT NULL,
    dni                 VARCHAR(10)  NOT NULL,
    fecha_nacimiento    DATE         NOT NULL,
    telefono            VARCHAR(30)  NOT NULL,
    fecha_modificacion  DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_persona_fisica_dni (dni),
    CONSTRAINT fk_persona_fisica_persona FOREIGN KEY (id) REFERENCES persona (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE persona_juridica (
    id                        INT          NOT NULL,
    razon_social              VARCHAR(150) NOT NULL,
    cuit                      VARCHAR(11)  NOT NULL,
    condicion_iva             ENUM('RESPONSABLE_INSCRIPTO','EXENTO','NO_INSCRIPTO','MONOTRIBUTO','RESPONSABLE_NACIONAL') NOT NULL,
    tipo_sociedad             ENUM('SA','SRL','SAS','SC','SCS','SCRL','SCSA','SCCS','CC','CS','CCSA','CA','SP','ST','ACP','EMP','EU','UTE') NOT NULL,
    domicilio_fiscal          VARCHAR(255) NOT NULL,
    fecha_inicio_actividades  DATE         NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_persona_juridica_cuit (cuit),
    CONSTRAINT fk_persona_juridica_persona FOREIGN KEY (id) REFERENCES persona (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
