package com.bajonea.backend.repositories;

import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
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
 * Inserción de {@code invitacion_empleado} por JDBC en vez de por JPA, por la misma razón que
 * {@link TokenInsercionRepository}: un {@code save} de JPA que viola un {@code UNIQUE} marca como
 * rollback-only la transacción en curso aunque la excepción se capture, y el reintento terminaría
 * revertido. Con JDBC sobre la misma conexión solo se deshace la sentencia fallida y el llamador puede
 * capturar {@link DuplicateKeyException}.
 * <p>
 * Dos índices pueden chocar: {@code uq_inv_pendiente_email_codigo} (el mismo email con el mismo código
 * entre invitaciones pendientes, se resuelve con otro código) y {@code uq_inv_pendiente_comercio_email}
 * (ya hay una pendiente del par, no se resuelve reintentando). El nombre del índice viaja en el mensaje de
 * la excepción.
 */
@Repository
@RequiredArgsConstructor
public class InvitacionInsercionRepository {

    public static final String INDICE_PENDIENTE_POR_COMERCIO_Y_EMAIL = "uq_inv_pendiente_comercio_email";

    private static final String SQL_EXISTE_CODIGO_PENDIENTE =
            "SELECT COUNT(*) FROM invitacion_empleado WHERE email = ? AND codigo = ? AND estado = 'PENDIENTE'";

    private static final String SQL_INSERT = "INSERT INTO invitacion_empleado "
            + "(comercio_id, email, codigo, estado, intentos_fallidos, invitado_por_usuario_id, fecha_creacion, fecha_vencimiento) "
            + "VALUES (?, ?, ?, ?, 0, ?, ?, ?)";

    private final JdbcTemplate jdbcTemplate;

    public boolean existeCodigoPendiente(String email, String codigo) {
        Integer cantidad = jdbcTemplate.queryForObject(SQL_EXISTE_CODIGO_PENDIENTE, Integer.class, email, codigo);
        return cantidad != null && cantidad > 0;
    }

    /**
     * @throws DuplicateKeyException si choca alguno de los dos únicos parciales de las pendientes
     */
    public Integer insertarPendiente(Integer comercioId, String email, String codigo, Integer invitadoPorUsuarioId,
            LocalDateTime fechaCreacion, LocalDateTime fechaVencimiento) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(conexion -> {
            PreparedStatement ps = conexion.prepareStatement(SQL_INSERT, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, comercioId);
            ps.setString(2, email);
            ps.setString(3, codigo);
            ps.setString(4, EstadoInvitacionEmpleado.PENDIENTE.name());
            ps.setInt(5, invitadoPorUsuarioId);
            ps.setObject(6, fechaCreacion);
            ps.setObject(7, fechaVencimiento);
            return ps;
        }, keyHolder);
        return keyHolder.getKey().intValue();
    }
}
