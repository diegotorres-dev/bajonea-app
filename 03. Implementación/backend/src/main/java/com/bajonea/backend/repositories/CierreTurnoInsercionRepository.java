package com.bajonea.backend.repositories;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Alta de la foto de un cierre por JDBC. El {@code UNIQUE (comercio_id, turno_fecha, horario_id)} es la red de
 * seguridad contra dos corridas simultáneas: la segunda inserción espera a que la primera confirme y recibe la
 * clave duplicada, que se traduce en {@code false} (otra corrida ya cerró ese turno) sin tocar la fila ganadora.
 * No se usa {@code ON DUPLICATE KEY UPDATE} porque el conector devuelve la misma cantidad de filas afectadas para
 * una inserción y para una fila existente sin cambios, y no se podría distinguir quién ganó. La inserción es la
 * única escritura de la transacción de cierre y sus claves foráneas solo toman bloqueos compartidos sobre
 * {@code comercio} y {@code horario}.
 */
@Repository
@RequiredArgsConstructor
public class CierreTurnoInsercionRepository {

    private static final String SQL = "INSERT INTO cierre_turno (comercio_id, turno_fecha, horario_id, inicio, fin, "
            + "cantidad_pedidos, vendido, comision, neto, pendientes_al_cierre, fecha_cierre, email_estado, email_ultimo_error, email_intentos) "
            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)";

    private final JdbcTemplate jdbcTemplate;

    public boolean insertar(Integer comercioId, LocalDate turnoFecha, Integer horarioId, LocalDateTime inicio,
            LocalDateTime fin, int cantidadPedidos, BigDecimal vendido, BigDecimal comision, BigDecimal neto,
            int pendientesAlCierre, LocalDateTime fechaCierre, String emailEstadoInicial, String emailMotivo) {
        try {
            jdbcTemplate.update(SQL, comercioId, turnoFecha, horarioId, inicio, fin, cantidadPedidos, vendido, comision,
                    neto, pendientesAlCierre, fechaCierre, emailEstadoInicial, emailMotivo);
            return true;
        } catch (DuplicateKeyException e) {
            return false;
        }
    }
}
