-- Módulo Seguridad: token de un solo uso, exclusivamente VERIFICACION_EMAIL en el MVP.
-- Fuente: docs/modelo-mvp.md, sección 5.

CREATE TABLE token (
    id                  INT          NOT NULL AUTO_INCREMENT,
    usuario_id          INT          NOT NULL,
    tipo                ENUM('VERIFICACION_EMAIL') NOT NULL,
    token               VARCHAR(36)  NOT NULL,
    fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento   DATETIME     NOT NULL,
    usado               TINYINT(1)   NOT NULL DEFAULT 0,
    fecha_uso           DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_token_token (token),
    CONSTRAINT fk_token_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    INDEX idx_token_usuario_tipo_usado (usuario_id, tipo, usado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
