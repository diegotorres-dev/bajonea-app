package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DisponibilidadComercioServiceTurnosTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);
    private static final LocalDate VIERNES = LUNES.plusDays(4);

    private DisponibilidadComercioService service;

    @BeforeEach
    void preparar() {
        service = new DisponibilidadComercioService(mock(HorarioRepository.class), mock(HistorialCierreComercioRepository.class),
                Clock.fixed(Instant.parse("2026-10-05T15:00:00Z"), ZoneId.of("America/Argentina/Ushuaia")));
    }

    private static Horario franja(DiaSemana dia, String apertura, String cierre) {
        return Horario.builder().diaSemana(dia).horaApertura(LocalTime.parse(apertura)).horaCierre(LocalTime.parse(cierre)).build();
    }

    private static Horario franja(DiaSemana dia, String apertura, String cierre, LocalDate desde, LocalDate hasta) {
        Horario horario = franja(dia, apertura, cierre);
        horario.setVigenteDesde(desde);
        horario.setVigenteHasta(hasta);
        return horario;
    }

    @Test
    void unTurnoQueCruzaEstaAbiertoAntesYDespuesDeLaMedianoche() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"));

        assertFalse(service.dentroDeFranja(horarios, VIERNES.atTime(19, 59)));
        assertTrue(service.dentroDeFranja(horarios, VIERNES.atTime(20, 0)));
        assertTrue(service.dentroDeFranja(horarios, VIERNES.atTime(23, 59, 30)));
        assertTrue(service.dentroDeFranja(horarios, VIERNES.plusDays(1).atTime(0, 0)));
        assertTrue(service.dentroDeFranja(horarios, VIERNES.plusDays(1).atTime(1, 59, 59)));
        assertFalse(service.dentroDeFranja(horarios, VIERNES.plusDays(1).atTime(2, 0)));
    }

    @Test
    void laColaDeUnTurnoSoloAbreElDiaSiguienteDeSuApertura() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"));

        assertFalse(service.dentroDeFranja(horarios, VIERNES.atTime(1, 0)));
        assertTrue(service.dentroDeFranja(horarios, VIERNES.plusDays(1).atTime(1, 0)));
        assertFalse(service.dentroDeFranja(horarios, VIERNES.plusDays(2).atTime(1, 0)));
    }

    @Test
    void unaFranjaQueNoCruzaConCierre2359ValeHastaLaMedianoche() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "09:00", "23:59"));

        assertTrue(service.dentroDeFranja(horarios, LUNES.atTime(23, 59, 30)));
        assertFalse(service.dentroDeFranja(horarios, LUNES.plusDays(1).atTime(0, 0)));
    }

    @Test
    void elCierre0000DeUnTurnoQueCruzaEsLaMedianocheYNoDejaCola() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "20:00", "00:00"));

        assertTrue(service.dentroDeFranja(horarios, LUNES.atTime(23, 59, 59)));
        assertFalse(service.dentroDeFranja(horarios, LUNES.plusDays(1).atTime(0, 0)));
    }

    @Test
    void lasVeinticuatroHorasSeguidasNoAbrenDeMas() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "00:00", "23:59"), franja(DiaSemana.MARTES, "00:00", "23:59"));

        assertTrue(service.dentroDeFranja(horarios, LUNES.atTime(23, 59, 59)));
        assertTrue(service.dentroDeFranja(horarios, LUNES.plusDays(1).atTime(0, 0)));
        assertFalse(service.dentroDeFranja(horarios, LUNES.plusDays(2).atTime(0, 0)));
    }

    @Test
    void laVigenciaSeEvaluaPorLaFechaDeApertura() {
        List<Horario> horarios = List.of(
                franja(DiaSemana.LUNES, "10:00", "14:00", LocalDate.of(2000, 1, 1), LUNES),
                franja(DiaSemana.LUNES, "16:00", "20:00", LUNES.plusDays(1), null));

        assertTrue(service.dentroDeFranja(horarios, LUNES.atTime(11, 0)));
        assertFalse(service.dentroDeFranja(horarios, LUNES.atTime(17, 0)));
        assertFalse(service.dentroDeFranja(horarios, LUNES.plusDays(7).atTime(11, 0)));
        assertTrue(service.dentroDeFranja(horarios, LUNES.plusDays(7).atTime(17, 0)));
    }

    @Test
    void laColaDeUnTurnoDeAyerSigueBajoLaVersionDeAyerAunqueHoyRijaLaNueva() {
        List<Horario> horarios = List.of(
                franja(DiaSemana.VIERNES, "20:00", "02:00", LocalDate.of(2000, 1, 1), VIERNES),
                franja(DiaSemana.VIERNES, "18:00", "22:00", VIERNES.plusDays(1), null));

        assertTrue(service.dentroDeFranja(horarios, VIERNES.plusDays(1).atTime(1, 0)));
    }

    private static boolean contiene(List<Horario> horarios, Horario buscado) {
        return horarios.stream().anyMatch(horario -> horario == buscado);
    }

    @Test
    void vigentesEnDevuelveSoloLasFilasQueRigenEnLaFecha() {
        Horario vieja = franja(DiaSemana.LUNES, "09:00", "10:00", LocalDate.of(2000, 1, 1), LUNES.minusDays(1));
        Horario actual = franja(DiaSemana.LUNES, "10:00", "11:00", LUNES.minusDays(10), null);
        Horario pendiente = franja(DiaSemana.LUNES, "12:00", "13:00", LUNES.plusDays(1), null);
        List<Horario> todas = List.of(vieja, actual, pendiente);

        List<Horario> hoy = DisponibilidadComercioService.vigentesEn(todas, LUNES);
        assertEquals(1, hoy.size());
        assertTrue(contiene(hoy, actual));
        assertTrue(contiene(DisponibilidadComercioService.vigentesEn(todas, LUNES.minusDays(1)), vieja));
        assertTrue(contiene(DisponibilidadComercioService.vigentesEn(todas, LUNES.plusDays(1)), pendiente));
        assertFalse(contiene(DisponibilidadComercioService.vigentesEn(todas, LUNES.plusDays(1)), vieja));
    }

    @Test
    void unaVersionPendienteYaCuentaParaElProximoInicioDeFranja() {
        List<Horario> horarios = List.of(
                franja(DiaSemana.LUNES, "10:00", "14:00", LocalDate.of(2000, 1, 1), LUNES),
                franja(DiaSemana.MARTES, "08:00", "12:00", LUNES.plusDays(1), null));

        assertEquals(LUNES.plusDays(1).atTime(8, 0), service.proximoInicioDeFranja(horarios, LUNES.atTime(15, 0)).orElseThrow());
    }

    @Test
    void elProximoInicioDeUnTurnoQueCruzaEsSuAperturaYNoSuCola() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"));

        assertEquals(VIERNES.atTime(20, 0), service.proximoInicioDeFranja(horarios, VIERNES.atTime(12, 0)).orElseThrow());
        assertEquals(VIERNES.plusDays(7).atTime(20, 0), service.proximoInicioDeFranja(horarios, VIERNES.plusDays(1).atTime(0, 30)).orElseThrow());
    }

    @Test
    void turnoDeDevuelveElTurnoEnCursoConSuInicioYSuFinEnLaCola() {
        Horario viernes = franja(DiaSemana.VIERNES, "20:00", "02:00");

        var turno = service.turnoDe(List.of(viernes), VIERNES.plusDays(1).atTime(1, 0)).orElseThrow();

        assertEquals(viernes, turno.horario());
        assertEquals(VIERNES.atTime(20, 0), turno.inicio());
        assertEquals(VIERNES.plusDays(1).atTime(2, 0), turno.fin());
        assertTrue(service.turnoDe(List.of(viernes), VIERNES.atTime(12, 0)).isEmpty());
    }

    @Test
    void finDelTurnoDeUnaFranjaQueNoCruzaCon2359EsLaMedianoche() {
        assertEquals(LUNES.plusDays(1).atStartOfDay(), DisponibilidadComercioService.finDelTurno(franja(DiaSemana.LUNES, "09:00", "23:59"), LUNES));
        assertEquals(LUNES.atTime(14, 0), DisponibilidadComercioService.finDelTurno(franja(DiaSemana.LUNES, "09:00", "14:00"), LUNES));
        assertEquals(LUNES.plusDays(1).atTime(2, 0), DisponibilidadComercioService.finDelTurno(franja(DiaSemana.LUNES, "20:00", "02:00"), LUNES));
    }

    @Test
    void ultimoTurnoTerminadoBuscaHaciaAtrasHastaElLimiteDeDias() {
        List<Horario> horarios = List.of(franja(DiaSemana.LUNES, "10:00", "14:00"), franja(DiaSemana.VIERNES, "20:00", "02:00"));

        var turno = service.ultimoTurnoTerminado(horarios, LUNES.atTime(12, 0), 7).orElseThrow();
        assertEquals(VIERNES.minusDays(7).atTime(20, 0), turno.inicio());
        assertEquals(LUNES.minusDays(2).atTime(2, 0), turno.fin());

        var hoyTerminado = service.ultimoTurnoTerminado(horarios, LUNES.atTime(15, 0), 7).orElseThrow();
        assertEquals(LUNES.atTime(14, 0), hoyTerminado.fin());

        assertTrue(service.ultimoTurnoTerminado(horarios, LUNES.atTime(12, 0), 1).isEmpty());
    }

    @Test
    void ultimoTurnoTerminadoNoCuentaUnTurnoQueTodaviaNoTermino() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"));

        assertTrue(service.ultimoTurnoTerminado(horarios, VIERNES.plusDays(1).atTime(1, 0), 0).isEmpty());
        assertEquals(VIERNES.plusDays(1).atTime(2, 0),
                service.ultimoTurnoTerminado(horarios, VIERNES.plusDays(1).atTime(2, 0), 2).orElseThrow().fin());
    }

    @Test
    void cruzaMedianocheSoloCuandoElCierreEsMenorQueLaApertura() {
        assertTrue(DisponibilidadComercioService.cruzaMedianoche(franja(DiaSemana.LUNES, "20:00", "02:00")));
        assertTrue(DisponibilidadComercioService.cruzaMedianoche(franja(DiaSemana.LUNES, "20:00", "00:00")));
        assertFalse(DisponibilidadComercioService.cruzaMedianoche(franja(DiaSemana.LUNES, "00:00", "23:59")));
        assertFalse(DisponibilidadComercioService.cruzaMedianoche(franja(DiaSemana.LUNES, "09:00", "14:00")));
    }

    @Test
    void elTextoDeReaperturaDeUnTurnoQueCruzaApuntaALaApertura() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"));
        LocalDateTime jueves = VIERNES.minusDays(1).atTime(12, 0);

        String texto = DisponibilidadComercioService.textoReapertura(service.proximoInicioDeFranja(horarios, jueves).orElseThrow(), jueves);

        assertEquals("Reabre mañana a las 20:00", texto);
    }

    @Test
    void losTurnosTerminadosEntreIncluyenElFinExactoDeLaVentanaYExcluyenElInicio() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "12:00", "15:00"));

        assertEquals(1, service.turnosTerminadosEntre(horarios, VIERNES.atTime(14, 0), VIERNES.atTime(15, 0)).size());
        assertEquals(0, service.turnosTerminadosEntre(horarios, VIERNES.atTime(15, 0), VIERNES.atTime(16, 0)).size());
        assertEquals(0, service.turnosTerminadosEntre(horarios, VIERNES.atTime(14, 0), VIERNES.atTime(14, 59, 59)).size());
    }

    @Test
    void unTurnoQueCruzaLaMedianocheTerminaElDiaSiguienteYSeBuscaDesdeElDiaAnterior() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"));
        LocalDateTime sabado3 = VIERNES.plusDays(1).atTime(3, 0);

        List<DisponibilidadComercioService.Turno> turnos = service.turnosTerminadosEntre(horarios, sabado3.minusHours(2), sabado3);

        assertEquals(1, turnos.size());
        assertEquals(VIERNES.atTime(20, 0), turnos.get(0).inicio());
        assertEquals(VIERNES.plusDays(1).atTime(2, 0), turnos.get(0).fin());
        assertEquals(0, service.turnosTerminadosEntre(horarios, VIERNES.atTime(23, 0), VIERNES.plusDays(1).atTime(1, 59)).size());
    }

    @Test
    void losTurnosTerminadosEntreSeDevuelvenDeLosMasViejosALosMasNuevosEnVariosDias() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "12:00", "15:00"), franja(DiaSemana.SABADO, "12:00", "15:00"),
                franja(DiaSemana.VIERNES, "20:00", "23:59"));

        List<DisponibilidadComercioService.Turno> turnos = service.turnosTerminadosEntre(horarios, VIERNES.atStartOfDay(),
                VIERNES.plusDays(2).atStartOfDay());

        assertEquals(List.of(VIERNES.atTime(15, 0), VIERNES.plusDays(1).atStartOfDay(), VIERNES.plusDays(1).atTime(15, 0)),
                turnos.stream().map(DisponibilidadComercioService.Turno::fin).toList());
    }

    @Test
    void unaVersionDeHorarioCerradaPorUnaEdicionSigueDandoLosTurnosDeLosDiasEnQueRigio() {
        Horario vieja = franja(DiaSemana.VIERNES, "12:00", "15:00", LUNES.minusDays(30), VIERNES);
        Horario nueva = franja(DiaSemana.VIERNES, "13:00", "16:00", VIERNES.plusDays(1), null);
        List<Horario> horarios = List.of(vieja, nueva);

        List<DisponibilidadComercioService.Turno> hoy = service.turnosTerminadosEntre(horarios, VIERNES.atStartOfDay(),
                VIERNES.plusDays(1).atStartOfDay());
        List<DisponibilidadComercioService.Turno> proximo = service.turnosTerminadosEntre(horarios,
                VIERNES.plusDays(6).atStartOfDay(), VIERNES.plusDays(8).atStartOfDay());

        assertEquals(1, hoy.size());
        assertEquals(VIERNES.atTime(15, 0), hoy.get(0).fin());
        assertEquals(1, proximo.size());
        assertEquals(VIERNES.plusDays(7).atTime(16, 0), proximo.get(0).fin());
    }

    @Test
    void unaFranjaQueCierraA2359TerminaALaMedianocheDelMismoDia() {
        List<Horario> horarios = List.of(franja(DiaSemana.VIERNES, "09:00", "23:59"));

        List<DisponibilidadComercioService.Turno> turnos = service.turnosTerminadosEntre(horarios, VIERNES.atTime(23, 59, 59),
                VIERNES.plusDays(1).atStartOfDay());

        assertEquals(1, turnos.size());
        assertEquals(VIERNES.plusDays(1).atStartOfDay(), turnos.get(0).fin());
    }
}
