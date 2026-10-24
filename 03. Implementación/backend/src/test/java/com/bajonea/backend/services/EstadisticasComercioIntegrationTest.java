package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.response.EstadisticasComercioResponseDTO;
import com.bajonea.backend.dto.response.PeriodoEstadisticasResponseDTO;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.CategoriaResultadoPedido;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.Query;

/**
 * Las estadísticas del Dueño contra {@code bajonea_test}: pedidos armados por el flujo real del pago o insertados por SQL
 * con el estado, el turno y la fecha de pago que cada prueba necesita.
 */
class EstadisticasComercioIntegrationTest extends CierreTurnoIntegrationBase {

    @Autowired
    private EstadisticasComercioService estadisticasService;

    @Autowired
    private HorarioRepository horarioRepository;

    private int clienteId;

    private int insertar(int comercioId, String estado, LocalDate turnoFecha, Integer horarioId, LocalDateTime fechaPago) {
        if (clienteId == 0) {
            clienteId = datos.registrarCliente();
        }
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion, fecha_pago_confirmado, turno_fecha, "
                + "turno_horario_id) VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 1500, 200, 100, 1700, ?, ?, ?, ?)",
                clienteId, comercioId, estado, Timestamp.valueOf(fechaPago == null ? LocalDateTime.now() : fechaPago),
                fechaPago == null ? null : Timestamp.valueOf(fechaPago), turnoFecha == null ? null : java.sql.Date.valueOf(turnoFecha),
                horarioId);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private EstadisticasComercioResponseDTO dia(int comercioId, LocalDate desde, LocalDate hasta) {
        return estadisticasService.obtener(comercioId, desde.toString(), hasta.toString(), "DIA");
    }

    private EstadisticasComercioResponseDTO turno(int comercioId, LocalDate desde, LocalDate hasta) {
        return estadisticasService.obtener(comercioId, desde.toString(), hasta.toString(), "TURNO");
    }

    @Test
    void lasCifrasDeUnTurnoCoincidenConElPanelYConElCierreDeTurno() {
        Dueno dueno = comercioConAlmuerzo();
        int entregado = pagar(dueno, hoy().atTime(12, 30));
        int enPreparacion = pagar(dueno, hoy().atTime(13, 0));
        int rechazado = pagar(dueno, hoy().atTime(13, 30));
        pagar(dueno, hoy().atTime(14, 0));
        estado(entregado, "ENTREGADO");
        estado(enPreparacion, "EN_PREPARACION");
        estado(rechazado, "RECHAZADO");

        Horario horario = horarioRepository.findVigentesDesde(dueno.comercioId(), hoy().minusDays(1)).get(0);
        DisponibilidadComercioService.Turno turno = disponibilidadComercioService
                .turnosTerminadosEntre(List.of(horario), hoy().atTime(14, 0), almuerzoTerminado()).get(0);
        ResumenTurnoService.CifrasTurno panel = resumenTurnoService.cifras(dueno.comercioId(), turno);
        job.abrirYCerrarTurnos(almuerzoTerminado());
        Map<String, Object> cierre = unicoCierre(dueno.comercioId());

        PeriodoEstadisticasResponseDTO periodo = turno(dueno.comercioId(), hoy(), hoy()).getPeriodos().get(0);

        assertEquals(panel.cantidadPedidos(), periodo.getPedidos());
        assertEquals(0, panel.vendido().compareTo(periodo.getVendido()));
        assertEquals(0, panel.comision().compareTo(periodo.getComision()));
        assertEquals(0, panel.neto().compareTo(periodo.getNeto()));
        assertEquals(cierre.get("cantidad_pedidos"), periodo.getPedidos());
        assertEquals(0, ((BigDecimal) cierre.get("vendido")).compareTo(periodo.getVendido()));
        assertEquals(0, ((BigDecimal) cierre.get("comision")).compareTo(periodo.getComision()));
        assertEquals(0, ((BigDecimal) cierre.get("neto")).compareTo(periodo.getNeto()));
        assertEquals(4, periodo.getPedidos());
        assertEquals(2, periodo.getFacturados());
        assertEquals(0, new BigDecimal("3000.00").compareTo(periodo.getVendido()));
        assertEquals(0, new BigDecimal("1500.00").compareTo(periodo.getTicketPromedio()));
        assertEquals(1, periodo.getResultados().get(CategoriaResultadoPedido.ENTREGADO));
        assertEquals(1, periodo.getResultados().get(CategoriaResultadoPedido.RECHAZADO));
        assertEquals(2, periodo.getResultados().get(CategoriaResultadoPedido.EN_CURSO));
    }

    @Test
    void unTurnoQueCruzaLaMedianocheCuentaEnElDiaDeApertura() {
        Dueno dueno = comercioSinHorarios();
        LocalDate apertura = hoy().minusDays(3);
        horario(dueno.comercioId(), apertura, "20:00", "02:00");
        int pedido = pagar(dueno, apertura.plusDays(1).atTime(1, 0));
        estado(pedido, "ENTREGADO");

        EstadisticasComercioResponseDTO porDia = dia(dueno.comercioId(), apertura, apertura.plusDays(1));
        EstadisticasComercioResponseDTO porTurno = turno(dueno.comercioId(), apertura, apertura.plusDays(1));

        assertEquals(1, porDia.getPeriodos().get(0).getPedidos());
        assertEquals(0, porDia.getPeriodos().get(1).getPedidos());
        assertEquals(1, porTurno.getPeriodos().size());
        assertEquals(apertura, porTurno.getPeriodos().get(0).getFecha());
        assertTrue(porTurno.getPeriodos().get(0).getTurno().isCruzaMedianoche());
        assertEquals(apertura.atTime(20, 0), porTurno.getPeriodos().get(0).getTurno().getInicio());
        assertEquals(apertura.plusDays(1).atTime(2, 0), porTurno.getPeriodos().get(0).getTurno().getFin());
    }

    @Test
    void dosTurnosDelMismoDiaSonDosPeriodosYUnSoloDia() {
        Dueno dueno = comercioSinHorarios();
        LocalDate fecha = hoy().minusDays(2);
        int almuerzo = horario(dueno.comercioId(), fecha, "12:00", "15:00");
        int cena = horario(dueno.comercioId(), fecha, "20:00", "23:00");
        estado(pagar(dueno, fecha.atTime(13, 0)), "ENTREGADO");
        estado(pagar(dueno, fecha.atTime(21, 0)), "ENTREGADO");
        estado(pagar(dueno, fecha.atTime(21, 30)), "RECHAZADO");

        EstadisticasComercioResponseDTO porTurno = turno(dueno.comercioId(), fecha, fecha);
        EstadisticasComercioResponseDTO porDia = dia(dueno.comercioId(), fecha, fecha);

        assertEquals(2, porTurno.getPeriodos().size());
        assertEquals(almuerzo, porTurno.getPeriodos().get(0).getTurno().getHorarioId());
        assertEquals(1, porTurno.getPeriodos().get(0).getPedidos());
        assertEquals(cena, porTurno.getPeriodos().get(1).getTurno().getHorarioId());
        assertEquals(2, porTurno.getPeriodos().get(1).getPedidos());
        assertEquals(1, porDia.getPeriodos().size());
        assertEquals(3, porDia.getPeriodos().get(0).getPedidos());
        assertEquals(0, new BigDecimal("3000.00").compareTo(porDia.getTotales().getVendido()));
    }

    @Test
    void losPagadosSinTurnoVanPorElDiaDelPagoYNoSeMezclanConLosDeOtroDia() {
        Dueno dueno = comercioSinHorarios();
        LocalDate fecha = hoy().minusDays(4);
        insertar(dueno.comercioId(), "ENTREGADO", null, null, fecha.atTime(23, 30));
        insertar(dueno.comercioId(), "ENTREGADO", null, null, fecha.plusDays(1).atTime(0, 30));

        EstadisticasComercioResponseDTO porDia = dia(dueno.comercioId(), fecha, fecha.plusDays(1));
        EstadisticasComercioResponseDTO porTurno = turno(dueno.comercioId(), fecha, fecha.plusDays(1));

        assertEquals(1, porDia.getPeriodos().get(0).getPedidos());
        assertEquals(1, porDia.getPeriodos().get(1).getPedidos());
        assertEquals(2, porTurno.getPeriodos().size());
        assertNull(porTurno.getPeriodos().get(0).getTurno());
        assertNull(porTurno.getPeriodos().get(1).getTurno());
        assertEquals(fecha, porTurno.getPeriodos().get(0).getFecha());
    }

    @Test
    void unDiaConTurnoYSinTurnoSumaLosDos() {
        Dueno dueno = comercioSinHorarios();
        LocalDate fecha = hoy().minusDays(5);
        int h = horario(dueno.comercioId(), fecha, "12:00", "15:00");
        insertar(dueno.comercioId(), "ENTREGADO", fecha, h, fecha.atTime(13, 0));
        insertar(dueno.comercioId(), "ENTREGADO", null, null, fecha.atTime(18, 0));

        EstadisticasComercioResponseDTO porDia = dia(dueno.comercioId(), fecha, fecha);
        EstadisticasComercioResponseDTO porTurno = turno(dueno.comercioId(), fecha, fecha);

        assertEquals(2, porDia.getPeriodos().get(0).getPedidos());
        assertEquals(2, porTurno.getPeriodos().size());
        assertNotNull(porTurno.getPeriodos().get(0).getTurno());
        assertNull(porTurno.getPeriodos().get(1).getTurno());
        assertEquals(2, porTurno.getTotales().getPedidos());
    }

    @Test
    void losPedidosQueNuncaSePagaronNoEntran() {
        Dueno dueno = comercioSinHorarios();
        int sinPagar = pedidoPendiente(dueno);
        int vencido = pedidoPendiente(dueno);
        estado(vencido, "CANCELADO_POR_SISTEMA");
        LocalDate fecha = hoy().minusDays(1);
        int h = horario(dueno.comercioId(), fecha, "12:00", "15:00");
        insertar(dueno.comercioId(), "ENTREGADO", fecha, h, fecha.atTime(13, 0));

        EstadisticasComercioResponseDTO respuesta = dia(dueno.comercioId(), hoy().minusDays(10), hoy());

        assertEquals(1, respuesta.getTotales().getPedidos());
        assertEquals("PENDIENTE_PAGO", estadoDelPedido(sinPagar));
        assertEquals(0, respuesta.getTotales().getResultados().get(CategoriaResultadoPedido.CANCELADO));
        assertEquals(0, respuesta.getTotales().getResultados().get(CategoriaResultadoPedido.EN_CURSO));
    }

    @Test
    void otroComercioNoSeMezcla() {
        Dueno uno = comercioSinHorarios();
        Dueno otro = comercioSinHorarios();
        LocalDate fecha = hoy().minusDays(2);
        int h1 = horario(uno.comercioId(), fecha, "12:00", "15:00");
        int h2 = horario(otro.comercioId(), fecha, "12:00", "15:00");
        insertar(uno.comercioId(), "ENTREGADO", fecha, h1, fecha.atTime(13, 0));
        insertar(otro.comercioId(), "ENTREGADO", fecha, h2, fecha.atTime(13, 0));
        insertar(otro.comercioId(), "ENTREGADO", null, null, fecha.atTime(18, 0));

        assertEquals(1, dia(uno.comercioId(), fecha, fecha).getTotales().getPedidos());
        assertEquals(2, dia(otro.comercioId(), fecha, fecha).getTotales().getPedidos());
    }

    @Test
    void losBordesDelRangoSonInclusivos() {
        Dueno dueno = comercioSinHorarios();
        LocalDate desde = hoy().minusDays(8);
        LocalDate hasta = hoy().minusDays(6);
        int h = horario(dueno.comercioId(), desde, "12:00", "15:00");
        insertar(dueno.comercioId(), "ENTREGADO", desde, h, desde.atTime(13, 0));
        insertar(dueno.comercioId(), "ENTREGADO", hasta, h, hasta.atTime(13, 0));
        insertar(dueno.comercioId(), "ENTREGADO", desde.minusDays(1), h, desde.minusDays(1).atTime(13, 0));
        insertar(dueno.comercioId(), "ENTREGADO", hasta.plusDays(1), h, hasta.plusDays(1).atTime(13, 0));
        insertar(dueno.comercioId(), "ENTREGADO", null, null, desde.atStartOfDay());
        insertar(dueno.comercioId(), "ENTREGADO", null, null, hasta.atTime(23, 59, 59));
        insertar(dueno.comercioId(), "ENTREGADO", null, null, desde.atStartOfDay().minusSeconds(1));
        insertar(dueno.comercioId(), "ENTREGADO", null, null, hasta.plusDays(1).atStartOfDay());

        EstadisticasComercioResponseDTO respuesta = dia(dueno.comercioId(), desde, hasta);

        assertEquals(4, respuesta.getTotales().getPedidos());
        assertEquals(2, respuesta.getPeriodos().get(0).getPedidos());
        assertEquals(0, respuesta.getPeriodos().get(1).getPedidos());
        assertEquals(2, respuesta.getPeriodos().get(2).getPedidos());
    }

    @Test
    void unPedidoConElLiteralViejoPendienteNoHaceRevientarLasEstadisticas() {
        Dueno dueno = comercioSinHorarios();
        LocalDate fecha = hoy().minusDays(3);
        int h = horario(dueno.comercioId(), fecha, "12:00", "15:00");
        insertar(dueno.comercioId(), "PENDIENTE", fecha, h, fecha.atTime(13, 0));
        insertar(dueno.comercioId(), "PENDIENTE", null, null, fecha.atTime(18, 0));
        insertar(dueno.comercioId(), "ENTREGADO", fecha, h, fecha.atTime(13, 30));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE comercio_id = ? AND estado = 'PENDIENTE'",
                Integer.class, dueno.comercioId()));

        EstadisticasComercioResponseDTO porDia = dia(dueno.comercioId(), fecha, fecha);
        EstadisticasComercioResponseDTO porTurno = turno(dueno.comercioId(), fecha, fecha);

        assertEquals(3, porDia.getTotales().getPedidos());
        assertEquals(2, porDia.getTotales().getResultados().get(CategoriaResultadoPedido.EN_CURSO));
        assertEquals(1, porDia.getTotales().getResultados().get(CategoriaResultadoPedido.ENTREGADO));
        assertEquals(1, porDia.getTotales().getFacturados());
        assertEquals(3, porTurno.getTotales().getPedidos());
    }

    @Test
    void editarLosHorariosDespuesNoCambiaElTurnoDeUnPedidoYaPagado() {
        Dueno dueno = comercioSinHorarios();
        LocalDate fecha = hoy().minusDays(2);
        int version1 = horario(dueno.comercioId(), fecha, "12:00", "15:00");
        estado(pagar(dueno, fecha.atTime(13, 0)), "ENTREGADO");
        jdbcTemplate.update("UPDATE horario SET vigente_hasta = ? WHERE id = ?", java.sql.Date.valueOf(fecha), version1);
        horario(dueno.comercioId(), fecha.plusDays(1), "18:00", "22:00");

        EstadisticasComercioResponseDTO porTurno = turno(dueno.comercioId(), fecha, fecha);

        assertEquals(1, porTurno.getPeriodos().size());
        assertEquals(version1, porTurno.getPeriodos().get(0).getTurno().getHorarioId());
        assertEquals(fecha.atTime(12, 0), porTurno.getPeriodos().get(0).getTurno().getInicio());
        assertEquals(fecha.atTime(15, 0), porTurno.getPeriodos().get(0).getTurno().getFin());
    }

    @Test
    void unComercioSinPedidosDevuelveTodoEnCero() {
        Dueno dueno = comercioSinHorarios();

        EstadisticasComercioResponseDTO respuesta = dia(dueno.comercioId(), hoy().minusDays(6), hoy());

        assertEquals(7, respuesta.getPeriodos().size());
        assertEquals(0, respuesta.getTotales().getPedidos());
        assertNull(respuesta.getTotales().getTicketPromedio());
        assertEquals(0, BigDecimal.ZERO.compareTo(respuesta.getTotales().getNeto()));
        assertEquals(CategoriaResultadoPedido.values().length, respuesta.getTotales().getResultados().size());
        assertFalse(respuesta.getPeriodos().stream().anyMatch(p -> p.getPedidos() != 0));
    }

    @Test
    void lasDosConsultasPuedenUsarElIndiceDeTurno() throws Exception {
        String porTurno = PedidoRepository.class.getMethod("estadisticasPorTurno", Integer.class, LocalDate.class, LocalDate.class)
                .getAnnotation(Query.class).value();
        String sinTurno = PedidoRepository.class.getMethod("estadisticasSinTurno", Integer.class, LocalDateTime.class, LocalDateTime.class)
                .getAnnotation(Query.class).value();
        String primera = porTurno.replace(":comercioId", "1").replace(":desde", "'2026-01-01'").replace(":hasta", "'2026-01-31'");
        String segunda = sinTurno.replace(":comercioId", "1").replace(":desde", "'2026-01-01 00:00:00'")
                .replace(":hastaExclusivo", "'2026-02-01 00:00:00'");

        for (String consulta : List.of(primera, segunda)) {
            Map<String, Object> plan = jdbcTemplate.queryForList("EXPLAIN " + consulta).get(0);
            assertTrue(String.valueOf(plan.get("possible_keys")).contains("idx_pedido_turno"), String.valueOf(plan));
        }
    }
}
