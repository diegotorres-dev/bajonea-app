-- Reincorporación de Horario (Fase 16a, enmienda de alcance con el mismo criterio que Sesion
-- (Fase 7) y HistorialEstadoComercio (Fase 8). Alcance acotado: solo carga en el registro de
-- Comercio y lectura, sin edición todavía (ver CLAUDE.md §5 y docs/DECISIONES.md).
-- Un comercio puede tener 0 o más filas por dia_semana (horario partido); un dia sin ninguna
-- fila significa cerrado ese dia, sin flag booleano dedicado.

CREATE TABLE horario (
    id            INT      NOT NULL AUTO_INCREMENT,
    comercio_id   INT      NOT NULL,
    dia_semana    ENUM('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO') NOT NULL,
    hora_apertura TIME     NOT NULL,
    hora_cierre   TIME     NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_horario_comercio FOREIGN KEY (comercio_id) REFERENCES comercio (id),
    INDEX idx_horario_comercio (comercio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
