package com.bajonea.backend.repositories;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Alta del carrito de un Cliente por JDBC con {@code INSERT ... ON DUPLICATE KEY UPDATE cliente_id = cliente_id}:
 * crea la fila si no existe y, si existe, no cambia nada. En ambos casos la deja bloqueada: sobre una fila existente
 * {@code ON DUPLICATE KEY UPDATE} toma un bloqueo exclusivo (no uno compartido que haya que mejorar después), así que
 * varias llamadas simultáneas se encolan en vez de interbloquearse. Evita leer primero con {@code SELECT ... FOR
 * UPDATE}: sobre una clave ausente InnoDB toma un bloqueo de intervalo y dos primeras llamadas del mismo Cliente se
 * interbloquearían al insertar; y evita el error de clave duplicada del alta con {@code save}. No lee la fila, así
 * que no fija la foto de la transacción.
 */
@Repository
@RequiredArgsConstructor
public class CarritoInsercionRepository {

    private static final String SQL = "INSERT INTO carrito (cliente_id) VALUES (?) ON DUPLICATE KEY UPDATE cliente_id = cliente_id";

    private final JdbcTemplate jdbcTemplate;

    public void crearSiNoExiste(Integer clienteId) {
        jdbcTemplate.update(SQL, clienteId);
    }
}
