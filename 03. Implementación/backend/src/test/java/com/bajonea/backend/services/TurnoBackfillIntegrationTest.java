package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Asignación de turnos a pedidos anteriores a la migración V39 y la propia migración, contra {@code bajonea_test}:
 * el relleno de {@code fecha_pago_confirmado} desde el historial, la clave foránea del turno, y el proceso de Java
 * (asigna, no pisa, es idempotente y deja sin turno a un comercio sin franjas).
 */
class TurnoBackfillIntegrationTest extends TurnoIntegrationBase {

    private int pedidoPagadoSinTurno(Dueno dueno, LocalDateTime fechaPago) {
        int pedidoId = pedidoPendiente(dueno);
        jdbcTemplate.update("UPDATE pedido SET estado = 'EN_PREPARACION', pago_estado = 'PAGADO', fecha_pago_confirmado = ? WHERE id = ?",
                fechaPago, pedidoId);
        return pedidoId;
    }

    @Test
    void asignaElTurnoALosPedidosPagadosYNoPisaNiRepiteNada() {
        Dueno dueno = comercioSinHorarios();
        int turno = horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        LocalDate haceDosSemanas = hoy().minusDays(14);
        int dentro = pedidoPagadoSinTurno(dueno, haceDosSemanas.atTime(13, 0));
        int fuera = pedidoPagadoSinTurno(dueno, haceDosSemanas.atTime(18, 0));
        int sinFechaDePago = pedidoPendiente(dueno);
        int yaAsignado = pedidoPagadoSinTurno(dueno, haceDosSemanas.atTime(14, 0));
        LocalDate fechaPrevia = hoy().minusDays(7);
        jdbcTemplate.update("UPDATE pedido SET turno_fecha = ?, turno_horario_id = ? WHERE id = ?", fechaPrevia, turno, yaAsignado);

        TurnoBackfillService.ResultadoBackfill primera = turnoBackfillService.ejecutar();

        assertTrue(primera.asignados() >= 2);
        assertEquals(haceDosSemanas, fechaDe(turnoDelPedido(dentro).get("turno_fecha")));
        assertEquals(turno, turnoDelPedido(dentro).get("turno_horario_id"));
        assertEquals(haceDosSemanas, fechaDe(turnoDelPedido(fuera).get("turno_fecha")));
        assertEquals(turno, turnoDelPedido(fuera).get("turno_horario_id"));
        assertNull(turnoDelPedido(sinFechaDePago).get("turno_fecha"));
        assertEquals(fechaPrevia, fechaDe(turnoDelPedido(yaAsignado).get("turno_fecha")));
        Map<String, Object> dentroAntes = turnoDelPedido(dentro);

        TurnoBackfillService.ResultadoBackfill segunda = turnoBackfillService.ejecutar();

        assertEquals(0, segunda.asignados());
        assertEquals(dentroAntes, turnoDelPedido(dentro));
        assertEquals(fechaPrevia, fechaDe(turnoDelPedido(yaAsignado).get("turno_fecha")));
    }

    @Test
    void laEscrituraNoPisaUnTurnoQueSeAsignoDespuesDeLeerElLote() {
        Dueno dueno = comercioSinHorarios();
        int turno = horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        int estampadoEnElMedio = pedidoPagadoSinTurno(dueno, hoy().atTime(13, 0));
        int sinTurno = pedidoPagadoSinTurno(dueno, hoy().atTime(13, 0));
        LocalDate otraFecha = hoy().minusDays(3);
        jdbcTemplate.update("UPDATE pedido SET turno_fecha = ?, turno_horario_id = ? WHERE id = ?", otraFecha, turno, estampadoEnElMedio);

        int escritos = turnoBackfillService.escribir(List.of(
                new Object[] {java.sql.Date.valueOf(hoy()), turno, estampadoEnElMedio},
                new Object[] {java.sql.Date.valueOf(hoy()), turno, sinTurno}));

        assertEquals(1, escritos);
        assertEquals(otraFecha, fechaDe(turnoDelPedido(estampadoEnElMedio).get("turno_fecha")));
        assertEquals(hoy(), fechaDe(turnoDelPedido(sinTurno).get("turno_fecha")));
    }

    @Test
    void unComercioSinFranjasDejaSusPedidosSinTurnoYLosCuentaAparte() {
        Dueno dueno = comercioSinHorarios();
        int pedidoId = pedidoPagadoSinTurno(dueno, hoy().minusDays(3).atTime(13, 0));

        TurnoBackfillService.ResultadoBackfill resultado = turnoBackfillService.ejecutar();

        assertTrue(resultado.sinTurno() >= 1);
        assertNull(turnoDelPedido(pedidoId).get("turno_fecha"));
        assertNull(turnoDelPedido(pedidoId).get("turno_horario_id"));
    }

    @Test
    void usaLaVersionDelHorarioQueRegiaCadaDia() {
        Dueno dueno = comercioSinHorarios();
        LocalDate lunesViejo = hoy().minusDays(21);
        int versionVieja = horario(dueno.comercioId(), lunesViejo, "12:00", "15:00");
        jdbcTemplate.update("UPDATE horario SET vigente_hasta = ? WHERE id = ?", hoy().minusDays(10), versionVieja);
        int versionNueva = horario(dueno.comercioId(), lunesViejo, "13:00", "16:00");
        jdbcTemplate.update("UPDATE horario SET vigente_desde = ? WHERE id = ?", hoy().minusDays(9), versionNueva);
        int deLaVersionVieja = pedidoPagadoSinTurno(dueno, lunesViejo.atTime(13, 30));
        int deLaVersionNueva = pedidoPagadoSinTurno(dueno, lunesViejo.plusDays(14).atTime(13, 30));

        turnoBackfillService.ejecutar();

        assertEquals(versionVieja, turnoDelPedido(deLaVersionVieja).get("turno_horario_id"));
        assertEquals(versionNueva, turnoDelPedido(deLaVersionNueva).get("turno_horario_id"));
    }

    @Test
    void laMigracionRellenaLaFechaDelPagoConLaPrimeraEntradaAPendienteDeConfirmacion() throws IOException {
        Dueno dueno = comercioSinHorarios();
        int conHistorial = pedidoPendiente(dueno);
        int sinHistorial = pedidoPendiente(dueno);
        LocalDateTime primera = hoy().minusDays(2).atTime(10, 0);
        for (LocalDateTime cuando : new LocalDateTime[] {primera.plusHours(5), primera}) {
            jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, fecha_hora) "
                    + "VALUES (?, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', ?)", conHistorial, cuando);
        }
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, fecha_hora) "
                + "VALUES (?, 'EN_PREPARACION', 'DUENO', ?)", sinHistorial, primera.minusHours(1));
        String sql = new String(new ClassPathResource("db/migration/V39__pedido_turno.sql").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);
        String actualizacion = sql.substring(sql.indexOf("UPDATE `pedido`"));

        jdbcTemplate.execute(actualizacion);

        assertEquals(primera, fechaHoraDe(turnoDelPedido(conHistorial).get("fecha_pago_confirmado")));
        assertNull(turnoDelPedido(sinHistorial).get("fecha_pago_confirmado"));
    }

    @Test
    void laClaveForaneaDelTurnoRechazaUnHorarioInexistenteYNoSePuedeBorrarUnHorarioConPedidos() {
        Dueno dueno = comercioSinHorarios();
        int turno = horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        int pedidoId = pedidoPendiente(dueno);

        assertThrows(DataIntegrityViolationException.class,
                () -> jdbcTemplate.update("UPDATE pedido SET turno_horario_id = 2000000000 WHERE id = ?", pedidoId));

        pedidoService.confirmarPagoAprobado(pedidoId, hoy().atTime(13, 0, 0));
        assertNotNull(turnoDelPedido(pedidoId).get("turno_horario_id"));
        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update("DELETE FROM horario WHERE id = ?", turno));
    }

    @Test
    void unInsertDeSqlPuroSinLasColumnasNuevasSigueFuncionando() {
        Dueno dueno = comercioSinHorarios();

        int pedidoId = pedidoPendiente(dueno);

        assertNull(turnoDelPedido(pedidoId).get("turno_fecha"));
        assertNull(turnoDelPedido(pedidoId).get("fecha_pago_confirmado"));
    }
}
