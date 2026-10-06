package com.bajonea.backend.repositories;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * Altas de {@code empleado} y de {@code empleado_comercio} por JDBC con "insertar, y si ya existe, no hacer
 * nada", en vez de leer primero y decidir. Aceptar una invitación no puede preguntar con un
 * {@code SELECT ... FOR UPDATE} si la fila ya existe: sobre una clave ausente InnoDB toma un bloqueo de
 * intervalo, y dos aceptaciones simultáneas de personas distintas caerían en el mismo intervalo y se
 * interbloquearían al insertar. Un {@code INSERT} que choca con la clave única solo revierte su sentencia
 * (no marca la transacción como rollback-only, a diferencia de un {@code save} de JPA) y el llamador sigue.
 * Quien llama tiene que haber vaciado antes el contexto de persistencia ({@code flush}): las filas
 * referenciadas por clave foránea (la persona física) pueden estar todavía pendientes de escribir.
 */
@Repository
@RequiredArgsConstructor
public class EmpleadoInsercionRepository {

    private static final String SQL_INSERT_EMPLEADO = "INSERT INTO empleado (id, fecha_creacion) VALUES (?, ?)";

    private static final String SQL_INSERT_RELACION = "INSERT INTO empleado_comercio "
            + "(empleado_id, comercio_id, estado, fecha_alta) VALUES (?, ?, 'ACTIVO', ?)";

    private final JdbcTemplate jdbcTemplate;

    /**
     * @return {@code true} si creó la fila de {@code empleado}, {@code false} si ya existía
     */
    public boolean insertarEmpleadoSiNoExiste(Integer usuarioId, LocalDateTime fechaCreacion) {
        try {
            jdbcTemplate.update(SQL_INSERT_EMPLEADO, usuarioId, fechaCreacion);
            return true;
        } catch (DuplicateKeyException ex) {
            return false;
        }
    }

    /**
     * @return el id de la relación creada, o vacío si ya existía una para ese empleado y comercio (en cualquier
     *         estado: la restricción única es por par)
     */
    public Optional<Integer> insertarRelacionActivaSiNoExiste(Integer empleadoId, Integer comercioId, LocalDateTime fechaAlta) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        try {
            jdbcTemplate.update(conexion -> {
                PreparedStatement ps = conexion.prepareStatement(SQL_INSERT_RELACION, Statement.RETURN_GENERATED_KEYS);
                ps.setInt(1, empleadoId);
                ps.setInt(2, comercioId);
                ps.setObject(3, fechaAlta);
                return ps;
            }, keyHolder);
            return Optional.of(keyHolder.getKey().intValue());
        } catch (DuplicateKeyException ex) {
            return Optional.empty();
        }
    }
}
