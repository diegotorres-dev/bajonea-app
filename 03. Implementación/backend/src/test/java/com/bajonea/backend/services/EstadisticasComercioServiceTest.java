package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.EstadisticasComercioResponseDTO;
import com.bajonea.backend.dto.response.PeriodoEstadisticasResponseDTO;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AgrupacionEstadisticas;
import com.bajonea.backend.enums.CategoriaResultadoPedido;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.PedidoRepository.FilaEstadisticaSinTurno;
import com.bajonea.backend.repositories.PedidoRepository.FilaEstadisticaTurno;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EstadisticasComercioServiceTest {

    private static final int COMERCIO = 40;
    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);
    private static final LocalDate MARTES = LUNES.plusDays(1);

    private PedidoRepository pedidoRepository;
    private HorarioRepository horarioRepository;
    private EstadisticasComercioService service;

    private static final class FilaTurno implements FilaEstadisticaTurno {

        private final LocalDate fecha;
        private final Integer horarioId;
        private final String estado;
        private final long cantidad;
        private final String subtotal;
        private final String comision;

        private FilaTurno(LocalDate fecha, Integer horarioId, String estado, long cantidad, String subtotal, String comision) {
            this.fecha = fecha;
            this.horarioId = horarioId;
            this.estado = estado;
            this.cantidad = cantidad;
            this.subtotal = subtotal;
            this.comision = comision;
        }

        @Override
        public java.sql.Date getTurnoFecha() {
            return java.sql.Date.valueOf(fecha);
        }

        @Override
        public Integer getTurnoHorarioId() {
            return horarioId;
        }

        @Override
        public String getEstado() {
            return estado;
        }

        @Override
        public Long getCantidad() {
            return cantidad;
        }

        @Override
        public BigDecimal getSubtotal() {
            return new BigDecimal(subtotal);
        }

        @Override
        public BigDecimal getComision() {
            return new BigDecimal(comision);
        }
    }

    private static final class FilaSinTurno implements FilaEstadisticaSinTurno {

        private final LocalDate dia;
        private final String estado;
        private final long cantidad;
        private final String subtotal;
        private final String comision;

        private FilaSinTurno(LocalDate dia, String estado, long cantidad, String subtotal, String comision) {
            this.dia = dia;
            this.estado = estado;
            this.cantidad = cantidad;
            this.subtotal = subtotal;
            this.comision = comision;
        }

        @Override
        public java.sql.Date getDia() {
            return java.sql.Date.valueOf(dia);
        }

        @Override
        public String getEstado() {
            return estado;
        }

        @Override
        public Long getCantidad() {
            return cantidad;
        }

        @Override
        public BigDecimal getSubtotal() {
            return new BigDecimal(subtotal);
        }

        @Override
        public BigDecimal getComision() {
            return new BigDecimal(comision);
        }
    }

    private static Horario horario(int id, String apertura, String cierre) {
        return Horario.builder().id(id).diaSemana(DiaSemana.LUNES).horaApertura(LocalTime.parse(apertura))
                .horaCierre(LocalTime.parse(cierre)).build();
    }

    @BeforeEach
    void preparar() {
        pedidoRepository = mock(PedidoRepository.class);
        horarioRepository = mock(HorarioRepository.class);
        service = new EstadisticasComercioService(pedidoRepository, horarioRepository);
        when(pedidoRepository.estadisticasPorTurno(anyInt(), any(), any())).thenReturn(List.of());
        when(pedidoRepository.estadisticasSinTurno(anyInt(), any(), any())).thenReturn(List.of());
    }

    private void filas(List<FilaEstadisticaTurno> conTurno, List<FilaEstadisticaSinTurno> sinTurno) {
        when(pedidoRepository.estadisticasPorTurno(anyInt(), any(), any())).thenReturn(conTurno);
        when(pedidoRepository.estadisticasSinTurno(anyInt(), any(), any())).thenReturn(sinTurno);
    }

    private static String texto(LocalDate fecha) {
        return fecha.toString();
    }

    private ValidacionException rechazo(String desde, String hasta, String agrupar) {
        ValidacionException e = assertThrows(ValidacionException.class, () -> service.obtener(COMERCIO, desde, hasta, agrupar));
        verifyNoInteractions(pedidoRepository);
        return e;
    }

    @Test
    void faltanLasFechas() {
        assertEquals("Indicá las fechas desde y hasta", rechazo(null, "2026-10-05", null).getMessage());
        assertEquals("Indicá las fechas desde y hasta", rechazo("2026-10-05", " ", null).getMessage());
    }

    @Test
    void elFormatoDeLasFechasEsAnioMesDia() {
        assertEquals("La fecha desde tiene que tener el formato AAAA-MM-DD", rechazo("05/10/2026", "2026-10-05", null).getMessage());
        assertEquals("La fecha hasta tiene que tener el formato AAAA-MM-DD", rechazo("2026-10-05", "ayer", null).getMessage());
    }

    @Test
    void desdePosteriorAHastaEsError() {
        assertEquals("La fecha desde no puede ser posterior a la fecha hasta", rechazo("2026-10-06", "2026-10-05", null).getMessage());
    }

    @Test
    void elRangoDe92DiasPasaContandoAmbosExtremos() {
        LocalDate desde = LocalDate.of(2026, 7, 1);

        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(desde), texto(desde.plusDays(91)), "DIA");

        assertEquals(92, respuesta.getPeriodos().size());
    }

    @Test
    void elRangoDe93DiasSeRechaza() {
        LocalDate desde = LocalDate.of(2026, 7, 1);

        assertEquals("El rango no puede superar los 92 días", rechazo(texto(desde), texto(desde.plusDays(92)), "DIA").getMessage());
    }

    @Test
    void laAgrupacionTieneQueSerDiaOTurno() {
        assertEquals("La agrupación tiene que ser DIA o TURNO", rechazo("2026-10-05", "2026-10-05", "SEMANA").getMessage());
        assertEquals("La agrupación tiene que ser DIA o TURNO", rechazo("2026-10-05", "2026-10-05", "dia").getMessage());
    }

    @Test
    void sinAgruparSeAgrupaPorDia() {
        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(LUNES), texto(LUNES), null);

        assertEquals(AgrupacionEstadisticas.DIA, respuesta.getAgrupar());
        verify(pedidoRepository).estadisticasPorTurno(COMERCIO, LUNES, LUNES);
        verify(pedidoRepository).estadisticasSinTurno(COMERCIO, LUNES.atStartOfDay(), MARTES.atStartOfDay());
    }

    @Test
    void porDiaSeRellenanLosDiasSinPedidosYSeSumanLosTurnosDelMismoDia() {
        filas(List.of(
                new FilaTurno(LUNES, 1, "ENTREGADO", 2, "3000.00", "200.00"),
                new FilaTurno(LUNES, 2, "EN_PREPARACION", 1, "1500.00", "100.00"),
                new FilaTurno(LUNES.plusDays(2), 1, "ENTREGADO", 1, "1500.00", "100.00")), List.of());

        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(LUNES), texto(LUNES.plusDays(3)), "DIA");

        assertEquals(4, respuesta.getPeriodos().size());
        PeriodoEstadisticasResponseDTO lunes = respuesta.getPeriodos().get(0);
        assertEquals(LUNES, lunes.getFecha());
        assertNull(lunes.getTurno());
        assertEquals(3, lunes.getPedidos());
        assertEquals(3, lunes.getFacturados());
        assertEquals(new BigDecimal("4500.00"), lunes.getVendido());
        assertEquals(new BigDecimal("300.00"), lunes.getComision());
        assertEquals(new BigDecimal("4200.00"), lunes.getNeto());
        assertEquals(new BigDecimal("1500.00"), lunes.getTicketPromedio());
        PeriodoEstadisticasResponseDTO martes = respuesta.getPeriodos().get(1);
        assertEquals(MARTES, martes.getFecha());
        assertEquals(0, martes.getPedidos());
        assertEquals(new BigDecimal("0.00"), martes.getVendido());
        assertNull(martes.getTicketPromedio());
        assertEquals(1, respuesta.getPeriodos().get(2).getPedidos());
        assertEquals(0, respuesta.getPeriodos().get(3).getPedidos());
    }

    @Test
    void porDiaLosPagadosSinTurnoSeSumanAlDiaDelPago() {
        filas(List.of(new FilaTurno(LUNES, 1, "ENTREGADO", 1, "1500.00", "100.00")),
                List.of(new FilaSinTurno(LUNES, "ENTREGADO", 2, "3000.00", "200.00"),
                        new FilaSinTurno(MARTES, "RECHAZADO", 1, "1500.00", "100.00")));

        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(LUNES), texto(MARTES), "DIA");

        PeriodoEstadisticasResponseDTO lunes = respuesta.getPeriodos().get(0);
        assertEquals(3, lunes.getPedidos());
        assertEquals(new BigDecimal("4500.00"), lunes.getVendido());
        PeriodoEstadisticasResponseDTO martes = respuesta.getPeriodos().get(1);
        assertEquals(1, martes.getPedidos());
        assertEquals(0, martes.getFacturados());
        assertEquals(new BigDecimal("0.00"), martes.getVendido());
        assertEquals(1, martes.getResultados().get(CategoriaResultadoPedido.RECHAZADO));
    }

    @Test
    void porTurnoSoloAparecenLosTurnosConPedidosOrdenadosYElSinTurnoVaAlFinalDelDia() {
        when(horarioRepository.findAllById(any())).thenReturn(List.of(horario(1, "12:00", "15:00"), horario(2, "20:00", "02:00")));
        filas(List.of(
                new FilaTurno(MARTES, 1, "ENTREGADO", 1, "1500.00", "100.00"),
                new FilaTurno(LUNES, 2, "ENTREGADO", 1, "1500.00", "100.00"),
                new FilaTurno(LUNES, 1, "ENTREGADO", 1, "1500.00", "100.00")),
                List.of(new FilaSinTurno(LUNES, "ENTREGADO", 1, "1500.00", "100.00")));

        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(LUNES), texto(MARTES), "TURNO");

        List<PeriodoEstadisticasResponseDTO> periodos = respuesta.getPeriodos();
        assertEquals(4, periodos.size());
        assertEquals(1, periodos.get(0).getTurno().getHorarioId());
        assertEquals(LUNES.atTime(12, 0), periodos.get(0).getTurno().getInicio());
        assertEquals(LUNES.atTime(15, 0), periodos.get(0).getTurno().getFin());
        assertEquals(2, periodos.get(1).getTurno().getHorarioId());
        assertTrue(periodos.get(1).getTurno().isCruzaMedianoche());
        assertEquals(MARTES.atTime(2, 0), periodos.get(1).getTurno().getFin());
        assertNull(periodos.get(2).getTurno());
        assertEquals(LUNES, periodos.get(2).getFecha());
        assertEquals(MARTES, periodos.get(3).getFecha());
        assertEquals(1, periodos.get(3).getTurno().getHorarioId());
    }

    @Test
    void elTicketPromedioRedondeaHalfUpADosDecimales() {
        filas(List.of(
                new FilaTurno(LUNES, 1, "ENTREGADO", 2, "13.00", "0.00"),
                new FilaTurno(LUNES, 1, "EN_CAMINO", 1, "7.00", "0.00")), List.of());

        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(LUNES), texto(LUNES), "DIA");

        assertEquals(new BigDecimal("6.67"), respuesta.getTotales().getTicketPromedio());
    }

    @Test
    void elTicketEsNuloSinPedidosFacturadosAunqueHayaPedidos() {
        filas(List.of(new FilaTurno(LUNES, 1, "RECHAZADO", 3, "4500.00", "300.00")), List.of());

        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(LUNES), texto(LUNES), "DIA");

        assertEquals(3, respuesta.getTotales().getPedidos());
        assertEquals(0, respuesta.getTotales().getFacturados());
        assertNull(respuesta.getTotales().getTicketPromedio());
        assertEquals(new BigDecimal("0.00"), respuesta.getTotales().getVendido());
    }

    @Test
    void lasSieteCategoriasVanSiempreYElLiteralViejoPendienteCuentaEnCurso() {
        filas(List.of(
                new FilaTurno(LUNES, 1, "PENDIENTE", 2, "3000.00", "200.00"),
                new FilaTurno(LUNES, 1, "CANCELADO", 1, "1500.00", "100.00"),
                new FilaTurno(LUNES, 1, "CANCELADO_POR_SISTEMA", 1, "1500.00", "100.00")), List.of());

        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(LUNES), texto(LUNES), "DIA");

        var resultados = respuesta.getTotales().getResultados();
        assertEquals(CategoriaResultadoPedido.values().length, resultados.size());
        assertEquals(2, resultados.get(CategoriaResultadoPedido.EN_CURSO));
        assertEquals(2, resultados.get(CategoriaResultadoPedido.CANCELADO));
        assertEquals(0, resultados.get(CategoriaResultadoPedido.ENTREGADO));
        assertEquals(0, respuesta.getTotales().getFacturados());
    }

    @Test
    void losTotalesSonLaSumaDeLosPeriodos() {
        filas(List.of(
                new FilaTurno(LUNES, 1, "ENTREGADO", 2, "3000.00", "200.00"),
                new FilaTurno(MARTES, 1, "NO_RETIRADO", 1, "1500.00", "100.00"),
                new FilaTurno(MARTES, 1, "ANULADO", 1, "1500.00", "100.00")),
                List.of(new FilaSinTurno(MARTES, "EXPIRADO", 1, "1500.00", "100.00")));

        EstadisticasComercioResponseDTO respuesta = service.obtener(COMERCIO, texto(LUNES), texto(MARTES), "DIA");

        assertEquals(5, respuesta.getTotales().getPedidos());
        assertEquals(3, respuesta.getTotales().getFacturados());
        assertEquals(new BigDecimal("4500.00"), respuesta.getTotales().getVendido());
        assertEquals(new BigDecimal("300.00"), respuesta.getTotales().getComision());
        assertEquals(new BigDecimal("4200.00"), respuesta.getTotales().getNeto());
        assertEquals(new BigDecimal("1500.00"), respuesta.getTotales().getTicketPromedio());
        int suma = respuesta.getPeriodos().stream().mapToInt(PeriodoEstadisticasResponseDTO::getPedidos).sum();
        assertEquals(respuesta.getTotales().getPedidos(), suma);
    }
}
