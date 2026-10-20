package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.exceptions.ValidacionException;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class ValidadorHorariosTest {

    private static HorarioRequestDTO franja(DiaSemana dia, String apertura, String cierre) {
        return new HorarioRequestDTO(dia, LocalTime.parse(apertura), LocalTime.parse(cierre));
    }

    private static String mensaje(List<HorarioRequestDTO> horarios) {
        return assertThrows(ValidacionException.class, () -> ValidadorHorarios.validar(horarios)).getMessage();
    }

    @Test
    void unaFranjaSimpleEsValida() {
        assertDoesNotThrow(() -> ValidadorHorarios.validar(List.of(franja(DiaSemana.LUNES, "09:00", "18:00"))));
    }

    @Test
    void elCierreIgualALaAperturaSeRechazaConElMensajeDeLas24Horas() {
        String mensaje = mensaje(List.of(franja(DiaSemana.LUNES, "09:00", "09:00")));

        assertEquals(ValidadorHorarios.MENSAJE_CIERRE_IGUAL, mensaje);
        assertTrue(mensaje.contains("00:00 a 23:59"));
    }

    @Test
    void lasVeinticuatroHorasSeCarganDeMedianocheAlas2359() {
        assertDoesNotThrow(() -> ValidadorHorarios.validar(List.of(franja(DiaSemana.MARTES, "00:00", "23:59"))));
    }

    @Test
    void unCierreAnteriorALaAperturaEsUnTurnoQueCruzaLaMedianoche() {
        assertDoesNotThrow(() -> ValidadorHorarios.validar(List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"))));
    }

    @Test
    void dosFranjasDelMismoDiaQueSeSuperponenUsanElMensajeDeSiempre() {
        String mensaje = mensaje(List.of(franja(DiaSemana.LUNES, "09:00", "13:00"), franja(DiaSemana.LUNES, "12:00", "15:00")));

        assertEquals("Ya tenés un horario cargado el Lunes de 12:00 a 15:00, que se superpone con este", mensaje);
    }

    @Test
    void laColaDeUnTurnoQueCruzaChocaConLaFranjaDelDiaSiguienteYElMensajeNombraLosDosTurnos() {
        String mensaje = mensaje(List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"), franja(DiaSemana.SABADO, "01:00", "05:00")));

        assertEquals("El turno del viernes de 20:00 a 02:00 se superpone con el del sábado de 01:00 a 05:00", mensaje);
    }

    @Test
    void elOrdenDeLasFranjasNoCambiaElResultado() {
        assertThrows(ValidacionException.class,
                () -> ValidadorHorarios.validar(List.of(franja(DiaSemana.SABADO, "01:00", "05:00"), franja(DiaSemana.VIERNES, "20:00", "02:00"))));
    }

    @Test
    void elTurnoDelDomingoQueCruzaChocaConLaFranjaDelLunesPorLaVueltaDeLaSemana() {
        String mensaje = mensaje(List.of(franja(DiaSemana.DOMINGO, "22:00", "03:00"), franja(DiaSemana.LUNES, "02:00", "10:00")));

        assertEquals("El turno del domingo de 22:00 a 03:00 se superpone con el del lunes de 02:00 a 10:00", mensaje);
    }

    @Test
    void lasFranjasAdyacentesSinSolaparSonDosTurnosValidos() {
        assertDoesNotThrow(() -> ValidadorHorarios.validar(List.of(
                franja(DiaSemana.VIERNES, "20:00", "23:59"), franja(DiaSemana.SABADO, "00:00", "02:00"))));
        assertDoesNotThrow(() -> ValidadorHorarios.validar(List.of(
                franja(DiaSemana.VIERNES, "20:00", "02:00"), franja(DiaSemana.SABADO, "02:00", "05:00"))));
    }

    @Test
    void elCierreA2359DeUnaFranjaQueNoCruzaValeHastaLaMedianocheYChocaConLaApertura00() {
        assertThrows(ValidacionException.class, () -> ValidadorHorarios.validar(List.of(
                franja(DiaSemana.LUNES, "09:00", "23:59"), franja(DiaSemana.LUNES, "23:59", "23:58"))));
    }

    @Test
    void unTurnoQueCierraA0000TerminaEnLaMedianocheSinColaEnElDiaSiguiente() {
        assertDoesNotThrow(() -> ValidadorHorarios.validar(List.of(
                franja(DiaSemana.MIERCOLES, "20:00", "00:00"), franja(DiaSemana.JUEVES, "00:00", "06:00"))));
    }

    @Test
    void unTurnoQueCruzaNoPuedeSuperponerseConOtroDeSuMismoDia() {
        String mensaje = mensaje(List.of(franja(DiaSemana.VIERNES, "20:00", "02:00"), franja(DiaSemana.VIERNES, "23:00", "23:30")));

        assertTrue(mensaje.startsWith("Ya tenés un horario cargado el Viernes"));
    }
}
