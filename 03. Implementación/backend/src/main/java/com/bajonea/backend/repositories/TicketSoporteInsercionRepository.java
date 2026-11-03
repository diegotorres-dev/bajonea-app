package com.bajonea.backend.repositories;

import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.TipoTicketSoporte;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * Alta de una consulta de Soporte (ya con su primer mensaje contado) por JDBC, por la misma razón que {@link InvitacionInsercionRepository}: un {@code save}
 * de JPA que viola el {@code UNIQUE} del código marca la transacción como rollback-only aunque la excepción se capture,
 * y el reintento con otro código terminaría revertido junto con la consulta. Con JDBC sobre la misma conexión solo se
 * deshace la sentencia fallida y el servicio reintenta dentro de la misma transacción, sin abrir otra.
 */
@Repository
@RequiredArgsConstructor
public class TicketSoporteInsercionRepository {

    private static final String SQL = "INSERT INTO ticket_soporte (codigo, email, usuario_id, tipo, estado, ip, cantidad_mensajes, "
            + "creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)";

    private final JdbcTemplate jdbcTemplate;

    /**
     * @throws DuplicateKeyException si el código ya existe
     */
    public Integer insertar(String codigo, String email, Integer usuarioId, TipoTicketSoporte tipo, String ip, LocalDateTime ahora) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(conexion -> {
            PreparedStatement ps = conexion.prepareStatement(SQL, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, codigo);
            ps.setString(2, email);
            if (usuarioId == null) {
                ps.setNull(3, java.sql.Types.INTEGER);
            } else {
                ps.setInt(3, usuarioId);
            }
            ps.setString(4, tipo.name());
            ps.setString(5, EstadoTicketSoporte.ESPERA_SOPORTE.name());
            ps.setString(6, ip);
            ps.setObject(7, ahora);
            ps.setObject(8, ahora);
            return ps;
        }, keyHolder);
        return keyHolder.getKey().intValue();
    }
}
