package com.bajonea.backend.repositories;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Alta del pago de un pedido por JDBC con {@code INSERT ... ON DUPLICATE KEY UPDATE pedido_id = pedido_id}: crea la
 * fila si el pedido todavía no tiene pago y, si ya lo tiene, no cambia nada. Evita leer primero con {@code SELECT ... FOR
 * UPDATE}: sobre una clave ausente InnoDB toma un bloqueo de intervalo, y dos altas de pedidos distintos que caen en el
 * mismo intervalo se interbloquean al insertar. Quien llama lee después la fila (que ahora sí existe) con
 * {@code FOR UPDATE} para saber cuál de las preferencias quedó guardada.
 */
@Repository
@RequiredArgsConstructor
public class PagoInsercionRepository {

    private static final String SQL = "INSERT INTO pago (pedido_id, monto, mp_preferencia_id, mp_init_point, mp_sandbox_init_point, fecha_creacion) "
            + "VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE pedido_id = pedido_id";

    private final JdbcTemplate jdbcTemplate;

    public void crearSiNoExiste(Integer pedidoId, BigDecimal monto, String preferenciaId, String initPoint, String sandboxInitPoint,
            LocalDateTime fechaCreacion) {
        jdbcTemplate.update(SQL, pedidoId, monto, preferenciaId, initPoint, sandboxInitPoint, fechaCreacion);
    }
}
