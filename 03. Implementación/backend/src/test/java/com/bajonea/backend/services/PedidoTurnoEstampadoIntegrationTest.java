package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Asignación del turno al confirmarse el pago (Fase 2, T2) contra {@code bajonea_test}: dentro de un turno, fuera de
 * toda franja, madrugada de un turno que cruza, sin franjas, idempotencia y que editar los horarios después no cambia
 * el turno de un pedido ya pagado.
 */
class PedidoTurnoEstampadoIntegrationTest extends TurnoIntegrationBase {

    @Test
    void unPagoDentroDeUnTurnoQuedaEstampadoConLaMismaHoraEnElPedidoYEnElHistorial() {
        Dueno dueno = comercioSinHorarios();
        int turno = horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        horario(dueno.comercioId(), hoy(), "20:00", "23:00");
        int pedidoId = pedidoPendiente(dueno);

        pedidoService.confirmarPagoAprobado(pedidoId, hoy().atTime(13, 0, 0));

        Map<String, Object> fila = turnoDelPedido(pedidoId);
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", fila.get("estado"));
        assertEquals(hoy(), fechaDe(fila.get("turno_fecha")));
        assertEquals(turno, fila.get("turno_horario_id"));
        assertEquals(hoy().atTime(13, 0), fechaHoraDe(fila.get("fecha_pago_confirmado")));
        assertEquals(fechaHoraDe(fila.get("fecha_pago_confirmado")), fechaDelHistorialDePago(pedidoId));
    }

    @Test
    void unPagoFueraDeTodaFranjaVaAlUltimoTurnoTerminado() {
        Dueno dueno = comercioSinHorarios();
        int almuerzo = horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        horario(dueno.comercioId(), hoy(), "20:00", "23:00");
        int pedidoId = pedidoPendiente(dueno);

        pedidoService.confirmarPagoAprobado(pedidoId, hoy().atTime(18, 0, 0));

        Map<String, Object> fila = turnoDelPedido(pedidoId);
        assertEquals(hoy(), fechaDe(fila.get("turno_fecha")));
        assertEquals(almuerzo, fila.get("turno_horario_id"));
    }

    @Test
    void unPagoDeMadrugadaEnUnTurnoQueCruzaPerteneceAlTurnoDelDiaAnterior() {
        Dueno dueno = comercioSinHorarios();
        int cena = horario(dueno.comercioId(), hoy(), "20:00", "02:00");
        int pedidoId = pedidoPendiente(dueno);

        pedidoService.confirmarPagoAprobado(pedidoId, hoy().plusDays(1).atTime(1, 30, 0));

        Map<String, Object> fila = turnoDelPedido(pedidoId);
        assertEquals(hoy(), fechaDe(fila.get("turno_fecha")));
        assertEquals(cena, fila.get("turno_horario_id"));
        assertEquals(hoy().plusDays(1).atTime(1, 30), fechaHoraDe(fila.get("fecha_pago_confirmado")));
    }

    @Test
    void unComercioSinFranjasDejaElPedidoSinTurnoPeroConLaFechaDelPago() {
        Dueno dueno = comercioSinHorarios();
        int pedidoId = pedidoPendiente(dueno);

        pedidoService.confirmarPagoAprobado(pedidoId, hoy().atTime(13, 0, 0));

        Map<String, Object> fila = turnoDelPedido(pedidoId);
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", fila.get("estado"));
        assertNull(fila.get("turno_fecha"));
        assertNull(fila.get("turno_horario_id"));
        assertEquals(hoy().atTime(13, 0), fechaHoraDe(fila.get("fecha_pago_confirmado")));
    }

    @Test
    void confirmarDosVecesElMismoPagoNoCambiaNadaNiDuplicaElHistorial() {
        Dueno dueno = comercioSinHorarios();
        horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        int pedidoId = pedidoPendiente(dueno);
        pedidoService.confirmarPagoAprobado(pedidoId, hoy().atTime(13, 0, 0));
        Map<String, Object> antes = turnoDelPedido(pedidoId);

        pedidoService.confirmarPagoAprobado(pedidoId, hoy().atTime(14, 0, 0));
        pedidoService.confirmarPagoAprobado(pedidoId);

        assertEquals(antes, turnoDelPedido(pedidoId));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? "
                + "AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO'", Integer.class, pedidoId));
    }

    @Test
    void sinInstanteElegidoUsaLaHoraDelRelojYLaMismaEnTodasPartes() {
        Dueno dueno = comercioSinHorarios();
        horariosTodosLosDias(dueno.comercioId(), "00:00", "23:59");
        int pedidoId = pedidoPendiente(dueno);

        pedidoService.confirmarPagoAprobado(pedidoId);

        Map<String, Object> fila = turnoDelPedido(pedidoId);
        assertEquals(fechaHoraDe(fila.get("fecha_pago_confirmado")), fechaDelHistorialDePago(pedidoId));
        assertEquals(fechaHoraDe(fila.get("fecha_pago_confirmado")).toLocalDate(), fechaDe(fila.get("turno_fecha")));
    }

    @Test
    void editarLosHorariosDespuesNoCambiaElTurnoDeUnPedidoYaPagado() {
        Dueno dueno = comercioSinHorarios();
        int turno = horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        int pedidoId = pedidoPendiente(dueno);
        pedidoService.confirmarPagoAprobado(pedidoId, hoy().atTime(13, 0, 0));
        Map<String, Object> antes = turnoDelPedido(pedidoId);
        LocalDate otroDia = hoy().plusDays(2);

        horarioEdicionService.editarHorarios(ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA),
                List.of(new HorarioRequestDTO(DiaSemana.values()[otroDia.getDayOfWeek().getValue() - 1],
                        LocalTime.of(10, 0), LocalTime.of(18, 0))));

        assertEquals(antes, turnoDelPedido(pedidoId));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM horario WHERE id = ?", Integer.class, turno));
    }

    @Test
    void todoPedidoPagadoTieneLaFechaDelPagoIgualALaDelHistorial() {
        Dueno dueno = comercioSinHorarios();
        horario(dueno.comercioId(), hoy(), "12:00", "15:00");
        int primero = pedidoPendiente(dueno);
        int segundo = pedidoPendiente(dueno);

        pedidoService.confirmarPagoAprobado(primero, hoy().atTime(12, 30, 5));
        pedidoService.confirmarPagoAprobado(segundo);

        for (int pedidoId : new int[] {primero, segundo}) {
            assertEquals(fechaHoraDe(turnoDelPedido(pedidoId).get("fecha_pago_confirmado")), fechaDelHistorialDePago(pedidoId));
        }
    }
}
