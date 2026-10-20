package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.ResumenTurnoEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.ResumenTurnoResponseDTO;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoResumenTurno;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.PedidoRepository.AgregadoDeTurno;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * El reloj queda fijo el lunes 2026-10-05 a las 12:00 de Ushuaia.
 */
class ResumenTurnoServiceTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);
    private static final int COMERCIO = 40;

    private PedidoRepository pedidoRepository;
    private HorarioRepository horarioRepository;
    private ResumenTurnoService service;

    @BeforeEach
    void preparar() {
        pedidoRepository = mock(PedidoRepository.class);
        horarioRepository = mock(HorarioRepository.class);
        DisponibilidadComercioService disponibilidad = new DisponibilidadComercioService(horarioRepository,
                mock(HistorialCierreComercioRepository.class),
                Clock.fixed(Instant.parse("2026-10-05T15:00:00Z"), ZoneId.of("America/Argentina/Ushuaia")));
        service = new ResumenTurnoService(pedidoRepository, horarioRepository, disponibilidad,
                new TurnoPedidoService(horarioRepository, disponibilidad, 7));
    }

    private static Horario franja(int id, DiaSemana dia, String apertura, String cierre) {
        return Horario.builder().id(id).diaSemana(dia).horaApertura(LocalTime.parse(apertura)).horaCierre(LocalTime.parse(cierre)).build();
    }

    private void horarios(Horario... franjas) {
        when(horarioRepository.findVigentesDesde(eq(COMERCIO), any())).thenReturn(List.of(franjas));
    }

    private void agregado(Long cantidad, String vendido, String comision) {
        AgregadoDeTurno agregado = mock(AgregadoDeTurno.class);
        when(agregado.getCantidad()).thenReturn(cantidad);
        when(agregado.getVendido()).thenReturn(vendido == null ? null : new BigDecimal(vendido));
        when(agregado.getComision()).thenReturn(comision == null ? null : new BigDecimal(comision));
        when(pedidoRepository.agregarTurno(anyInt(), any(), anyInt(), any())).thenReturn(agregado);
    }

    private void pendientes(long cantidad) {
        when(pedidoRepository.countByComercioIdAndEstado(COMERCIO, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)).thenReturn(cantidad);
    }

    private static Set<String> camposDe(Object dto) {
        return Arrays.stream(dto.getClass().getDeclaredFields()).map(Field::getName).collect(Collectors.toSet());
    }

    @Test
    void conUnTurnoEnCursoElDuenoVeVendidoBrutoComisionYNeto() {
        horarios(franja(1, DiaSemana.LUNES, "09:00", "23:59"));
        agregado(3L, "15000", "150");
        pendientes(2);

        ResumenTurnoResponseDTO resumen = service.obtener(COMERCIO);

        assertEquals(EstadoResumenTurno.EN_CURSO, resumen.getEstado());
        assertEquals(LUNES, resumen.getTurno().getFecha());
        assertEquals(LUNES.atTime(9, 0), resumen.getTurno().getInicio());
        assertEquals(LUNES.plusDays(1).atStartOfDay(), resumen.getTurno().getFin());
        assertFalse(resumen.getTurno().isCruzaMedianoche());
        assertEquals(new BigDecimal("15000"), resumen.getVendido());
        assertEquals(new BigDecimal("150"), resumen.getComision());
        assertEquals(new BigDecimal("14850"), resumen.getNeto());
        assertEquals(3, resumen.getCantidadPedidos());
        assertEquals(2, resumen.getCantidadPendientes());
        verify(pedidoRepository).agregarTurno(eq(COMERCIO), eq(LUNES), eq(1), any());
    }

    @Test
    void elEmpleadoRecibeElMismoVendidoBrutoSinComisionNiNeto() {
        horarios(franja(1, DiaSemana.LUNES, "09:00", "23:59"));
        agregado(3L, "15000", "150");
        pendientes(2);

        ResumenTurnoEmpleadoResponseDTO empleado = service.obtenerParaEmpleado(COMERCIO);
        ResumenTurnoResponseDTO dueno = service.obtener(COMERCIO);

        assertEquals(dueno.getVendido(), empleado.getVendido());
        assertEquals(dueno.getCantidadPedidos(), empleado.getCantidadPedidos());
        assertEquals(dueno.getCantidadPendientes(), empleado.getCantidadPendientes());
        assertEquals(Set.of("estado", "turno", "vendido", "cantidadPedidos", "cantidadPendientes"), camposDe(empleado));
    }

    @Test
    void elEmpleadoNoRecibeComisionNiNetoNiSiSeSerializa() throws Exception {
        horarios(franja(1, DiaSemana.LUNES, "09:00", "23:59"));
        agregado(1L, "10000", "100");
        pendientes(0);
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        String json = objectMapper.writeValueAsString(service.obtenerParaEmpleado(COMERCIO));

        assertFalse(json.contains("comision"));
        assertFalse(json.contains("neto"));
        assertTrue(json.contains("\"vendido\":10000"));
    }

    @Test
    void entreTurnosMuestraElUltimoTurnoTerminadoComoTerminado() {
        horarios(franja(1, DiaSemana.LUNES, "06:00", "10:00"), franja(2, DiaSemana.LUNES, "20:00", "23:00"));
        agregado(4L, "8000", "80");
        pendientes(0);

        ResumenTurnoResponseDTO resumen = service.obtener(COMERCIO);

        assertEquals(EstadoResumenTurno.TERMINADO, resumen.getEstado());
        assertEquals(LUNES.atTime(6, 0), resumen.getTurno().getInicio());
        assertEquals(LUNES.atTime(10, 0), resumen.getTurno().getFin());
        assertEquals(new BigDecimal("8000"), resumen.getVendido());
        verify(pedidoRepository).agregarTurno(eq(COMERCIO), eq(LUNES), eq(1), any());
    }

    @Test
    void elUltimoTurnoTerminadoPuedeSerUnTurnoQueCruzoLaMedianocheDeAyer() {
        horarios(franja(5, DiaSemana.DOMINGO, "20:00", "02:00"));
        agregado(2L, "6000", "60");
        pendientes(1);

        ResumenTurnoResponseDTO resumen = service.obtener(COMERCIO);

        assertEquals(EstadoResumenTurno.TERMINADO, resumen.getEstado());
        assertEquals(LUNES.minusDays(1), resumen.getTurno().getFecha());
        assertTrue(resumen.getTurno().isCruzaMedianoche());
        assertEquals(LUNES.atTime(2, 0), resumen.getTurno().getFin());
    }

    @Test
    void sinNingunTurnoLosMontosVanEnCeroPeroLosPendientesSeInforman() {
        horarios();
        pendientes(3);

        ResumenTurnoResponseDTO resumen = service.obtener(COMERCIO);

        assertEquals(EstadoResumenTurno.SIN_TURNO, resumen.getEstado());
        assertNull(resumen.getTurno());
        assertEquals(BigDecimal.ZERO, resumen.getVendido());
        assertEquals(BigDecimal.ZERO, resumen.getComision());
        assertEquals(BigDecimal.ZERO, resumen.getNeto());
        assertEquals(0, resumen.getCantidadPedidos());
        assertEquals(3, resumen.getCantidadPendientes());
        verify(pedidoRepository, never()).agregarTurno(anyInt(), any(), anyInt(), any());
    }

    @Test
    void losPendientesCuentanTodosLosDelComercioSinFiltrarPorTurno() {
        horarios(franja(1, DiaSemana.LUNES, "09:00", "23:59"));
        agregado(0L, null, null);
        pendientes(7);

        ResumenTurnoResponseDTO resumen = service.obtener(COMERCIO);

        assertEquals(0, resumen.getCantidadPedidos());
        assertEquals(7, resumen.getCantidadPendientes());
        verify(pedidoRepository).countByComercioIdAndEstado(COMERCIO, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
    }

    @Test
    void unTurnoSinPedidosFacturablesDaMontosEnCero() {
        horarios(franja(1, DiaSemana.LUNES, "09:00", "23:59"));
        agregado(2L, null, null);
        pendientes(2);

        ResumenTurnoResponseDTO resumen = service.obtener(COMERCIO);

        assertEquals(BigDecimal.ZERO, resumen.getVendido());
        assertEquals(BigDecimal.ZERO, resumen.getNeto());
        assertEquals(2, resumen.getCantidadPedidos());
    }

    @SuppressWarnings("unchecked")
    @Test
    void losEstadosFacturablesIncluyenNoRetiradoYNoLosPendientesNiLosNegativos() {
        horarios(franja(1, DiaSemana.LUNES, "09:00", "23:59"));
        agregado(0L, null, null);
        pendientes(0);

        service.obtener(COMERCIO);

        ArgumentCaptor<Collection<EstadoPedido>> facturables = ArgumentCaptor.forClass(Collection.class);
        verify(pedidoRepository).agregarTurno(anyInt(), any(), anyInt(), facturables.capture());
        assertEquals(Set.of(EstadoPedido.EN_PREPARACION, EstadoPedido.EN_CAMINO, EstadoPedido.LISTO_PARA_RETIRAR,
                EstadoPedido.ENTREGADO, EstadoPedido.NO_RETIRADO), Set.copyOf(facturables.getValue()));
    }
}
