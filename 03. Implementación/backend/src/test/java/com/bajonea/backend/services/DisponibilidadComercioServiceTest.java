package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialCierreComercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AccionCierre;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoApertura;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.services.DisponibilidadComercioService.Disponibilidad;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DisponibilidadComercioServiceTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);

    private HistorialCierreComercioRepository historialRepository;
    private DisponibilidadComercioService service;

    @BeforeEach
    void preparar() {
        historialRepository = mock(HistorialCierreComercioRepository.class);
        service = new DisponibilidadComercioService(mock(HorarioRepository.class), historialRepository);
    }

    private static Horario franja(DiaSemana dia, String apertura, String cierre) {
        return Horario.builder().diaSemana(dia).horaApertura(LocalTime.parse(apertura)).horaCierre(LocalTime.parse(cierre)).build();
    }

    private static LocalDateTime lunes(String hora) {
        return LUNES.atTime(LocalTime.parse(hora));
    }

    private static Comercio comercio(EstadoComercio estado, boolean cerradoManualmente) {
        Comercio comercio = Comercio.builder().id(1).estado(estado).build();
        comercio.setCerradoManualmente(cerradoManualmente);
        return comercio;
    }

    @Test
    void laZonaHorariaEsMenosTresExplicito() {
        assertEquals("-03:00", DisponibilidadComercioService.ZONA_COMERCIO.getId());
    }

    @Test
    void dentroDeFranjaIncluyeLaAperturaYExcluyeElCierre() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "10:00", "14:00"));

        assertFalse(service.dentroDeFranja(horarios, lunes("09:59:59")));
        assertTrue(service.dentroDeFranja(horarios, lunes("10:00:00")));
        assertTrue(service.dentroDeFranja(horarios, lunes("13:59:59")));
        assertFalse(service.dentroDeFranja(horarios, lunes("14:00:00")));
    }

    @Test
    void unDiaSinFranjaEstaCerradoYSinHorariosSiempreCerrado() {
        List<Horario> soloMartes = List.of(franja(DiaSemana.MARTES, "00:00", "23:59"));

        assertFalse(service.dentroDeFranja(soloMartes, lunes("12:00")));
        assertFalse(service.dentroDeFranja(List.of(), lunes("12:00")));
    }

    @Test
    void unaFranjaQueCierraA2359TerminaAFinDelDiaSinHuecoEn235900A235959() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "18:00", "23:59"));

        assertTrue(service.dentroDeFranja(horarios, lunes("23:58:59")));
        assertTrue(service.dentroDeFranja(horarios, lunes("23:59:00")));
        assertTrue(service.dentroDeFranja(horarios, lunes("23:59:30")));
        assertTrue(service.dentroDeFranja(horarios, lunes("23:59:59")));
        assertFalse(service.dentroDeFranja(horarios, LUNES.plusDays(1).atStartOfDay()));
    }

    @Test
    void unaFranjaQueCierraA2358NoSeTrataComoFinDelDia() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "18:00", "23:58"));

        assertTrue(service.dentroDeFranja(horarios, lunes("23:57:59")));
        assertFalse(service.dentroDeFranja(horarios, lunes("23:58:00")));
        assertFalse(service.dentroDeFranja(horarios, lunes("23:59:30")));
    }

    @Test
    void lasFranjasPartidasSeEvaluanPorSeparado() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "12:00", "15:00"), franja(DiaSemana.LUNES, "19:00", "23:00"));

        assertTrue(service.dentroDeFranja(horarios, lunes("13:00")));
        assertFalse(service.dentroDeFranja(horarios, lunes("17:00")));
        assertTrue(service.dentroDeFranja(horarios, lunes("20:00")));
    }

    @Test
    void abiertoAhoraRequiereHorarioYNoEstarCerradoManualmente() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "10:00", "14:00"));

        assertTrue(service.abiertoAhora(false, horarios, lunes("11:00")));
        assertFalse(service.abiertoAhora(true, horarios, lunes("11:00")));
        assertFalse(service.abiertoAhora(false, horarios, lunes("15:00")));
    }

    @Test
    void puedeCambiarCierreSoloSiEsOperativoYDentroDeFranja() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "10:00", "14:00"));

        assertTrue(service.puedeCambiarCierre(EstadoComercio.APROBADO, horarios, lunes("11:00")));
        assertTrue(service.puedeCambiarCierre(EstadoComercio.APTO_VENTA, horarios, lunes("11:00")));
        assertFalse(service.puedeCambiarCierre(EstadoComercio.APTO_VENTA, horarios, lunes("15:00")));
        for (EstadoComercio estado : EstadoComercio.values()) {
            if (estado != EstadoComercio.APROBADO && estado != EstadoComercio.APTO_VENTA) {
                assertFalse(service.puedeCambiarCierre(estado, horarios, lunes("11:00")), "estado " + estado);
            }
        }
    }

    @Test
    void proximoInicioEsLaPrimeraFranjaEstrictamenteDespuesDelMomento() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "12:00", "15:00"), franja(DiaSemana.LUNES, "19:00", "23:00"));

        assertEquals(Optional.of(lunes("19:00")), service.proximoInicioDeFranja(horarios, lunes("13:00")));
        assertEquals(Optional.of(lunes("19:00")), service.proximoInicioDeFranja(horarios, lunes("12:00")));
        assertEquals(Optional.of(lunes("12:00")), service.proximoInicioDeFranja(horarios, lunes("11:59:59")));
        assertEquals(Optional.of(lunes("12:00").plusDays(7)), service.proximoInicioDeFranja(horarios, lunes("20:00")));
    }

    @Test
    void proximoInicioBuscaEnLosDiasSiguientesYSinFranjasEsVacio() {
        List<Horario> horarios = List.of(franja(DiaSemana.MIERCOLES, "08:30", "12:00"));

        assertEquals(Optional.of(LUNES.plusDays(2).atTime(8, 30)), service.proximoInicioDeFranja(horarios, lunes("23:00")));
        assertEquals(Optional.empty(), service.proximoInicioDeFranja(List.of(), lunes("10:00")));
    }

    @Test
    void textoDeReaperturaHoyMananaYDiaDeLaSemana() {
        LocalDateTime ahora = lunes("10:00");

        assertEquals("Reabre hoy a las 19:00", DisponibilidadComercioService.textoReapertura(lunes("19:00"), ahora));
        assertEquals("Reabre mañana a las 12:00", DisponibilidadComercioService.textoReapertura(lunes("12:00").plusDays(1), ahora));
        assertEquals("Reabre el miércoles a las 08:30", DisponibilidadComercioService.textoReapertura(lunes("08:30").plusDays(2), ahora));
        assertEquals("Reabre el sábado a las 20:00", DisponibilidadComercioService.textoReapertura(lunes("20:00").plusDays(5), ahora));
        assertEquals("Reabre el lunes a las 09:15", DisponibilidadComercioService.textoReapertura(lunes("09:15").plusDays(7), ahora));
    }

    @Test
    void elTextoSeCalculaPorDiaDeCalendarioNoPorHorasTranscurridas() {
        LocalDateTime ahora = lunes("23:30");

        assertEquals("Reabre mañana a las 00:15", DisponibilidadComercioService.textoReapertura(LUNES.plusDays(1).atTime(0, 15), ahora));
    }

    @Test
    void abiertoNoInformaTextoYEstadoAperturaEsAbierto() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "10:00", "14:00"));

        Disponibilidad disponibilidad = service.calcular(comercio(EstadoComercio.APTO_VENTA, false), horarios, lunes("11:00"));

        assertTrue(disponibilidad.abiertoAhora());
        assertNull(disponibilidad.textoReapertura());
        assertEquals(EstadoApertura.ABIERTO, disponibilidad.estadoApertura());
        assertTrue(disponibilidad.puedeCambiarCierre());
    }

    @Test
    void fueraDeHorarioCalculaElTextoDesdeAhora() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "10:00", "14:00"), franja(DiaSemana.LUNES, "19:00", "23:00"));

        Disponibilidad disponibilidad = service.calcular(comercio(EstadoComercio.APTO_VENTA, false), horarios, lunes("16:00"));

        assertFalse(disponibilidad.abiertoAhora());
        assertEquals("Reabre hoy a las 19:00", disponibilidad.textoReapertura());
        assertEquals(EstadoApertura.CERRADO_HORARIO, disponibilidad.estadoApertura());
        assertFalse(disponibilidad.puedeCambiarCierre());
    }

    @Test
    void conCierreManualElTextoSeCalculaDesdeElMomentoDelCierre() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "10:00", "14:00"), franja(DiaSemana.LUNES, "19:00", "23:00"));
        HistorialCierreComercio cierre = HistorialCierreComercio.builder().accion(AccionCierre.CERRADO).fechaHora(lunes("11:00")).build();
        when(historialRepository.findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc(1, AccionCierre.CERRADO))
                .thenReturn(Optional.of(cierre));

        Disponibilidad disponibilidad = service.calcular(comercio(EstadoComercio.APTO_VENTA, true), horarios, lunes("12:00"));

        assertTrue(disponibilidad.cerradoManualmente());
        assertFalse(disponibilidad.abiertoAhora());
        assertEquals("Reabre hoy a las 19:00", disponibilidad.textoReapertura());
        assertEquals(EstadoApertura.CERRADO_TEMPORALMENTE, disponibilidad.estadoApertura());
        assertTrue(disponibilidad.puedeCambiarCierre());
    }

    @Test
    void conCierreManualSinFilaCerradoUsaAhoraComoReferencia() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "10:00", "14:00"), franja(DiaSemana.LUNES, "19:00", "23:00"));
        when(historialRepository.findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc(1, AccionCierre.CERRADO))
                .thenReturn(Optional.empty());

        Disponibilidad disponibilidad = service.calcular(comercio(EstadoComercio.APTO_VENTA, true), horarios, lunes("12:00"));

        assertEquals("Reabre hoy a las 19:00", disponibilidad.textoReapertura());
    }

    @Test
    void sinHorariosNoHayTextoDeReapertura() {
        Disponibilidad disponibilidad = service.calcular(comercio(EstadoComercio.APTO_VENTA, false), List.of(), lunes("12:00"));

        assertFalse(disponibilidad.abiertoAhora());
        assertNull(disponibilidad.textoReapertura());
    }
}
