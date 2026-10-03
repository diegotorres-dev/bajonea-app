package com.bajonea.backend.repositories;

import com.bajonea.backend.enums.EstadoToken;
import com.bajonea.backend.enums.TipoToken;
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
 * Inserción de {@code token} por JDBC en vez de por JPA, a propósito: un {@code save} de JPA que
 * viola el {@code UNIQUE} {@code uq_token_valor} marca como rollback-only la transacción en curso
 * (la del registro o la de {@code AuthService}) aunque la excepción se capture, y el reintento
 * posterior terminaría revertido. Con JDBC sobre la misma conexión, MySQL deshace solo la sentencia
 * fallida y la transacción sigue utilizable, de modo que el llamador puede capturar
 * {@link DuplicateKeyException} y reintentar con otro valor.
 */
@Repository
@RequiredArgsConstructor
public class TokenInsercionRepository {

    private static final String SQL_EXISTE = "SELECT COUNT(*) FROM token WHERE token = ?";

    private static final String SQL_INSERT = "INSERT INTO token "
            + "(usuario_id, tipo, token, fecha_creacion, fecha_vencimiento, estado, intentos_fallidos) "
            + "VALUES (?, ?, ?, ?, ?, ?, 0)";

    private final JdbcTemplate jdbcTemplate;

    public boolean existeValor(String valor) {
        Integer cantidad = jdbcTemplate.queryForObject(SQL_EXISTE, Integer.class, valor);
        return cantidad != null && cantidad > 0;
    }

    /**
     * @throws DuplicateKeyException si el valor ya existe (carrera entre el chequeo previo y el INSERT)
     */
    public Integer insertarPendiente(Integer usuarioId, TipoToken tipo, String valor,
            LocalDateTime fechaCreacion, LocalDateTime fechaVencimiento) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(conexion -> {
            PreparedStatement ps = conexion.prepareStatement(SQL_INSERT, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, usuarioId);
            ps.setString(2, tipo.name());
            ps.setString(3, valor);
            ps.setObject(4, fechaCreacion);
            ps.setObject(5, fechaVencimiento);
            ps.setString(6, EstadoToken.PENDIENTE.name());
            return ps;
        }, keyHolder);
        return keyHolder.getKey().intValue();
    }
}
