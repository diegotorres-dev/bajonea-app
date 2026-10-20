package com.bajonea.backend.services;

import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Base de las pruebas de turnos de pedido (Fase 2, T2) contra {@code bajonea_test}: comercios con los horarios
 * que cada prueba arma, pedidos pendientes de pago y lecturas directas de las columnas de turno.
 */
abstract class TurnoIntegrationBase extends CarritoIntegrationBase {

    @Autowired
    protected Clock clock;

    @Autowired
    protected HorarioEdicionService horarioEdicionService;

    @Autowired
    protected TurnoBackfillService turnoBackfillService;

    protected LocalDate hoy() {
        return LocalDate.now(clock);
    }

    protected static DiaSemana diaDe(LocalDate fecha) {
        return DiaSemana.values()[fecha.getDayOfWeek().getValue() - 1];
    }

    protected Dueno comercioSinHorarios() {
        Dueno dueno = comercioApto(false);
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", dueno.comercioId());
        return dueno;
    }

    protected int horario(int comercioId, LocalDate fechaDelDia, String apertura, String cierre) {
        jdbcTemplate.update("INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, ?, ?)",
                comercioId, diaDe(fechaDelDia).name(), apertura + ":00", cierre + ":00");
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    protected void horariosTodosLosDias(int comercioId, String apertura, String cierre) {
        for (DiaSemana dia : DiaSemana.values()) {
            jdbcTemplate.update("INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, ?, ?)",
                    comercioId, dia.name(), apertura + ":00", cierre + ":00");
        }
    }

    protected int pedidoPendiente(Dueno dueno) {
        return pedidoPendientePago(datos.registrarCliente(), dueno);
    }

    protected Map<String, Object> turnoDelPedido(int pedidoId) {
        return jdbcTemplate.queryForMap("SELECT turno_fecha, turno_horario_id, fecha_pago_confirmado, estado FROM pedido WHERE id = ?", pedidoId);
    }

    protected LocalDateTime fechaDelHistorialDePago(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT MIN(fecha_hora) FROM historial_estado_pedido WHERE pedido_id = ? "
                + "AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO'", LocalDateTime.class, pedidoId);
    }

    protected static LocalDate fechaDe(Object valor) {
        if (valor == null) {
            return null;
        }
        return valor instanceof LocalDate fecha ? fecha : ((java.sql.Date) valor).toLocalDate();
    }

    protected static LocalDateTime fechaHoraDe(Object valor) {
        if (valor == null) {
            return null;
        }
        return valor instanceof LocalDateTime fechaHora ? fechaHora : ((java.sql.Timestamp) valor).toLocalDateTime();
    }
}
