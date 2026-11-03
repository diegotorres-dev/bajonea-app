package com.bajonea.backend.repositories;

import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Filas de contador de los límites del módulo de Soporte, por JDBC. {@link #bloquear} crea la fila si no existe con
 * {@code INSERT ... ON DUPLICATE KEY UPDATE clave = clave} y la lee con {@code SELECT ... FOR UPDATE}: no hay una lectura
 * previa sobre una clave ausente (que tomaría un bloqueo de intervalo y se interbloquearía con otra alta de una clave
 * vecina) y la fila queda bloqueada hasta el fin de la transacción, así que todo lo que cuenta o decide bajo esa clave
 * corre de a uno. Es lo que sustituye al índice único parcial que MariaDB 10.4 no tiene.
 */
@Repository
@RequiredArgsConstructor
public class SoporteLimiteRepository {

    public record Contador(int cantidad, LocalDateTime ventanaInicio) {
    }

    private static final String SQL_ASEGURAR = "INSERT INTO soporte_limite (clave, cantidad, ventana_inicio) VALUES (?, 0, ?) "
            + "ON DUPLICATE KEY UPDATE clave = clave";
    private static final String SQL_LEER = "SELECT cantidad, ventana_inicio FROM soporte_limite WHERE clave = ? FOR UPDATE";
    private static final String SQL_ACTUALIZAR = "UPDATE soporte_limite SET cantidad = ?, ventana_inicio = ? WHERE clave = ?";

    private final JdbcTemplate jdbcTemplate;

    public Contador bloquear(String clave, LocalDateTime ahora) {
        jdbcTemplate.update(SQL_ASEGURAR, clave, ahora);
        return jdbcTemplate.queryForObject(SQL_LEER,
                (rs, fila) -> new Contador(rs.getInt("cantidad"), rs.getObject("ventana_inicio", LocalDateTime.class)), clave);
    }

    public void actualizar(String clave, int cantidad, LocalDateTime ventanaInicio) {
        jdbcTemplate.update(SQL_ACTUALIZAR, cantidad, ventanaInicio, clave);
    }
}
