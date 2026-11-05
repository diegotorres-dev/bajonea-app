package com.bajonea.backend.repositories;

import com.bajonea.backend.enums.RolUsuario;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Lectura de las cuentas que la inactivación automática puede procesar. La condición de elegibilidad vive en un solo
 * lugar ({@link #CONDICION}) y la usan las dos consultas: la que arma la lista de candidatos de la corrida y la que
 * la revalida con la fila del usuario ya bloqueada. Una cuenta es elegible si está {@code ACTIVO}, no es de un
 * Administrador, su último acceso es anterior al corte, no tiene un pedido en curso como comprador, no tiene un
 * pedido en curso en ninguno de sus comercios y ninguno de sus comercios recibió un pedido desde el corte.
 */
@Repository
@RequiredArgsConstructor
public class InactividadCuentaRepository {

    public record Candidato(Integer usuarioId, RolUsuario rol) {
    }

    private static final String EN_CURSO = "('PENDIENTE_PAGO','PENDIENTE_CONFIRMACION_COMERCIO','EN_PREPARACION','EN_CAMINO','LISTO_PARA_RETIRAR')";

    static final String CONDICION = "u.estado = 'ACTIVO' AND u.rol <> 'ADMINISTRADOR' AND u.fecha_ultimo_acceso < ? "
            + "AND NOT EXISTS (SELECT 1 FROM pedido p WHERE p.cliente_id = u.id AND p.estado IN " + EN_CURSO + ") "
            + "AND NOT EXISTS (SELECT 1 FROM comercio c JOIN pedido p ON p.comercio_id = c.id "
            + "WHERE c.dueno_id = u.id AND p.estado IN " + EN_CURSO + ") "
            + "AND NOT EXISTS (SELECT 1 FROM comercio c JOIN pedido p ON p.comercio_id = c.id "
            + "WHERE c.dueno_id = u.id AND p.fecha_creacion >= ?)";

    private final JdbcTemplate jdbcTemplate;

    public List<Candidato> candidatos(LocalDateTime corte, int tope) {
        return jdbcTemplate.query(
                "SELECT u.id, u.rol FROM usuario u WHERE " + CONDICION + " ORDER BY u.fecha_ultimo_acceso, u.id LIMIT ?",
                (rs, fila) -> new Candidato(rs.getInt(1), RolUsuario.valueOf(rs.getString(2))), corte, corte, tope);
    }

    public boolean sigueElegible(Integer usuarioId, LocalDateTime corte) {
        Integer cantidad = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM usuario u WHERE u.id = ? AND " + CONDICION, Integer.class, usuarioId, corte, corte);
        return cantidad != null && cantidad > 0;
    }
}
