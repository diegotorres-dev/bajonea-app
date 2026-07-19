-- Módulo Notificaciones: notificacion, in-app vía polling. Sin canal email, sin tipo estructurado.
-- Fuente: docs/modelo-mvp.md, sección 8.

CREATE TABLE notificacion (
    id              INT          NOT NULL AUTO_INCREMENT,
    usuario_id      INT          NOT NULL,
    mensaje         VARCHAR(500) NOT NULL,
    leida           TINYINT(1)   NOT NULL DEFAULT 0,
    fecha_creacion  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_notificacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    INDEX idx_notificacion_usuario_leida (usuario_id, leida)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
