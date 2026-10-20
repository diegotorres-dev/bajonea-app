package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.services.TurnoPedidoService.AsignacionTurno;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TurnoPedidoServiceTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 10, 5);
    private static final LocalDate VIERNES = LUNES.plusDays(4);

    private HorarioRepository horarioRepository;
    private TurnoPedidoService service;

    @BeforeEach
    void preparar() {
        horarioRepository = mock(HorarioRepository.class);
        DisponibilidadComercioService disponibilidad = new DisponibilidadComercioService(horarioRepository,
                mock(HistorialCierreComercioRepository.class),
                Clock.fixed(Instant.parse("2026-10-05T15:00:00Z"), ZoneId.of("America/Argentina/Ushuaia")));
        service = new TurnoPedidoService(horarioRepository, disponibilidad, 7);
    }

    private static Horario franja(int id, DiaSemana dia, String apertura, String cierre) {
        return Horario.builder().id(id).diaSemana(dia).horaApertura(LocalTime.parse(apertura)).horaCierre(LocalTime.parse(cierre)).build();
    }

    private static Horario franja(int id, DiaSemana dia, String apertura, String cierre, LocalDate desde, LocalDate hasta) {
        Horario horario = franja(id, dia, apertura, cierre);
        horario.setVigenteDesde(desde);
        horario.setVigenteHasta(hasta);
        return horario;
    }

    @Test
    void unPagoDentroDeUnTurnoVaAEseTurno() {
        List<Horario> horarios = List.of(franja(1, DiaSemana.LUNES, "12:00", "15:00"), franja(2, DiaSemana.LUNES, "20:00", "23:00"));

        assertEquals(Optional.of(new AsignacionTurno(LUNES, 2)), service.asignar(horarios, LUNES.atTime(21, 30)));
        assertEquals(Optional.of(new AsignacionTurno(LUNES, 1)), service.asignar(horarios, LUNES.atTime(12, 0)));
    }

    @Test
    void unPagoDeMadrugadaEnUnTurnoQueCruzaPerteneceAlTurnoDelDiaAnterior() {
        List<Horario> horarios = List.of(franja(7, DiaSemana.VIERNES, "20:00", "02:00"));

        assertEquals(Optional.of(new AsignacionTurno(VIERNES, 7)), service.asignar(horarios, VIERNES.plusDays(1).atTime(1, 30)));
        assertEquals(Optional.of(new AsignacionTurno(VIERNES, 7)), service.asignar(horarios, VIERNES.atTime(23, 59, 59)));
    }

    @Test
    void unPagoFueraDeTodaFranjaVaAlUltimoTurnoTerminado() {
        List<Horario> horarios = List.of(franja(1, DiaSemana.LUNES, "12:00", "15:00"), franja(2, DiaSemana.LUNES, "20:00", "23:00"));

        assertEquals(Optional.of(new AsignacionTurno(LUNES, 1)), service.asignar(horarios, LUNES.atTime(18, 0)));
        assertEquals(Optional.of(new AsignacionTurno(LUNES, 2)), service.asignar(horarios, LUNES.plusDays(1).atTime(3, 0)));
        assertEquals(Optional.of(new AsignacionTurno(LUNES, 1)), service.asignar(horarios, LUNES.atTime(15, 0)));
    }

    @Test
    void unPagoAntesDelPrimerTurnoDelDiaVaAlTurnoDeLaSemanaAnterior() {
        List<Horario> horarios = List.of(franja(1, DiaSemana.LUNES, "12:00", "15:00"));

        assertEquals(Optional.of(new AsignacionTurno(LUNES, 1)), service.asignar(horarios, LUNES.plusDays(7).atTime(9, 0)));
    }

    @Test
    void sinTurnoEnLaVentanaElPedidoQuedaSinTurno() {
        List<Horario> franjaQueDejoDeRegir = List.of(
                franja(3, DiaSemana.VIERNES, "12:00", "15:00", LocalDate.of(2000, 1, 1), VIERNES));

        assertEquals(Optional.empty(), service.asignar(franjaQueDejoDeRegir, VIERNES.plusDays(10).atTime(12, 0)));
        assertEquals(Optional.empty(), service.asignar(List.of(), LUNES.atTime(12, 0)));
    }

    @Test
    void unTurnoMasViejoQueLaVentanaDeSieteDiasNoSeAsigna() {
        List<Horario> unaVezLoNoRepite = List.of(franja(3, DiaSemana.LUNES, "12:00", "15:00", LUNES.minusDays(1), LUNES));

        assertEquals(Optional.of(new AsignacionTurno(LUNES, 3)), service.asignar(unaVezLoNoRepite, LUNES.plusDays(7).atTime(16, 0)));
        assertEquals(Optional.empty(), service.asignar(unaVezLoNoRepite, LUNES.plusDays(8).atTime(16, 0)));
    }

    @Test
    void cadaFechaUsaLaVersionDelHorarioQueRegiaEseDia() {
        List<Horario> horarios = List.of(
                franja(1, DiaSemana.LUNES, "12:00", "15:00", LocalDate.of(2000, 1, 1), LUNES),
                franja(2, DiaSemana.LUNES, "13:00", "16:00", LUNES.plusDays(1), null));

        assertEquals(Optional.of(new AsignacionTurno(LUNES, 1)), service.asignar(horarios, LUNES.atTime(13, 30)));
        assertEquals(Optional.of(new AsignacionTurno(LUNES.plusDays(7), 2)), service.asignar(horarios, LUNES.plusDays(7).atTime(13, 30)));
        assertEquals(Optional.of(new AsignacionTurno(LUNES, 1)), service.asignar(horarios, LUNES.plusDays(7).atTime(12, 30)));
    }

    @Test
    void conComercioLeeLasVersionesDesdeLaFechaDeLaVentana() {
        when(horarioRepository.findVigentesDesde(eq(40), any())).thenReturn(List.of(franja(1, DiaSemana.LUNES, "12:00", "15:00")));

        Optional<AsignacionTurno> asignacion = service.asignar(40, LUNES.atTime(13, 0));

        assertTrue(asignacion.isPresent());
        verify(horarioRepository).findVigentesDesde(40, LUNES.minusDays(8));
    }
}
