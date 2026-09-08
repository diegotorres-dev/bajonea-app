-- Enmienda formal de alcance del MVP (Fase 7): recuperación de contraseña, bloqueo de
-- cuenta tras 3 intentos fallidos y reactivación de cuenta. Ver docs/DECISIONES.md
-- (2026-07-17, "Enmienda formal de alcance del MVP") y docs/modelo-mvp.md, nota de
-- alcance 12.

ALTER TABLE usuario
    ADD COLUMN intentos_fallidos INT NOT NULL DEFAULT 0 AFTER estado;

ALTER TABLE token
    MODIFY COLUMN tipo ENUM('VERIFICACION_EMAIL', 'RECUPERACION_PASSWORD', 'REACTIVACION_CUENTA') NOT NULL;

CREATE TABLE sesion (
    id              INT          NOT NULL AUTO_INCREMENT,
    usuario_id      INT          NOT NULL,
    activa          TINYINT(1)   NOT NULL DEFAULT 1,
    fecha_inicio    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre    DATETIME     NULL,
    tipo_cierre     ENUM('MANUAL', 'AUTOMATICO', 'FORZADO') NULL,
    ip_origen       VARCHAR(45)  NOT NULL,
    navegador       VARCHAR(255) NULL,
    dispositivo     VARCHAR(255) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    INDEX idx_sesion_usuario_activa (usuario_id, activa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
