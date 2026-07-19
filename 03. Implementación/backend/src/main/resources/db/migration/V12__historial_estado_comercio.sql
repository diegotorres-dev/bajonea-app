-- Reincorporación de HistorialEstadoComercio (Fase 8, enmienda de alcance con el mismo
-- criterio que Sesion en la Fase 7). Ver docs/DECISIONES.md y docs/modelo-mvp.md, nota de
-- alcance 13. Única fuente del motivo de rechazo de un Comercio: el diccionario completo
-- eliminó Comercio.motivo_rechazo en v1.1 a favor de esta tabla.

CREATE TABLE historial_estado_comercio (
    id                  INT          NOT NULL AUTO_INCREMENT,
    comercio_id         INT          NOT NULL,
    administrador_id    INT          NULL,
    estado_origen       ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'SUSPENDIDO', 'INACTIVO', 'CERRADO_TEMPORALMENTE') NULL,
    estado_destino      ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'SUSPENDIDO', 'INACTIVO', 'CERRADO_TEMPORALMENTE') NOT NULL,
    motivo              VARCHAR(500) NULL,
    fecha_hora          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_historial_estado_comercio_comercio FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    CONSTRAINT fk_historial_estado_comercio_administrador FOREIGN KEY (administrador_id) REFERENCES administrador (id),
    INDEX idx_historial_estado_comercio_comercio (comercio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
