package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.util.ComercioTextoLegible;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Reglas de las franjas horarias de un comercio, comunes al registro, el alta adicional, la corrección de un
 * rechazado y la edición de un comercio aprobado. Cada franja es un turno cuyo día es el de apertura; cruza la
 * medianoche cuando el cierre es menor que la apertura y se rechaza la que cierra a la misma hora que abre
 * (las 24 horas se cargan de 00:00 a 23:59). Las superposiciones se miden sobre una semana circular, de modo que
 * un turno del domingo que cruza choca con una franja del lunes.
 */
public final class ValidadorHorarios {

    public static final int SEGUNDOS_POR_DIA = 24 * 60 * 60;
    public static final int SEGUNDOS_POR_SEMANA = 7 * SEGUNDOS_POR_DIA;
    static final String MENSAJE_CIERRE_IGUAL = "La hora de cierre no puede ser igual a la de apertura. "
            + "Si atendés las 24 horas, cargá de 00:00 a 23:59.";
    private static final DateTimeFormatter FORMATO_HORA = DateTimeFormatter.ofPattern("HH:mm");

    private ValidadorHorarios() {
    }

    public record Intervalo(long inicio, long fin) {

        public boolean seSuperpone(Intervalo otro) {
            for (int vuelta = -1; vuelta <= 1; vuelta++) {
                long desplazamiento = (long) vuelta * SEGUNDOS_POR_SEMANA;
                if (inicio < otro.fin() + desplazamiento && otro.inicio() + desplazamiento < fin) {
                    return true;
                }
            }
            return false;
        }
    }

    public static boolean cruza(LocalTime apertura, LocalTime cierre) {
        return DisponibilidadComercioService.cruzaMedianoche(apertura, cierre);
    }

    public static Intervalo intervalo(DiaSemana dia, LocalTime apertura, LocalTime cierre) {
        long inicio = (long) dia.ordinal() * SEGUNDOS_POR_DIA + apertura.toSecondOfDay();
        long duracion;
        if (cruza(apertura, cierre)) {
            duracion = SEGUNDOS_POR_DIA - apertura.toSecondOfDay() + cierre.toSecondOfDay();
        } else {
            int fin = cierre.getHour() == 23 && cierre.getMinute() == 59 ? SEGUNDOS_POR_DIA : cierre.toSecondOfDay();
            duracion = fin - apertura.toSecondOfDay();
        }
        return new Intervalo(inicio, inicio + duracion);
    }

    public static void validar(List<HorarioRequestDTO> horarios) {
        for (HorarioRequestDTO horario : horarios) {
            if (horario.getHoraCierre().equals(horario.getHoraApertura())) {
                throw new ValidacionException(MENSAJE_CIERRE_IGUAL);
            }
        }
        for (int i = 0; i < horarios.size(); i++) {
            HorarioRequestDTO actual = horarios.get(i);
            Intervalo intervaloActual = intervalo(actual.getDiaSemana(), actual.getHoraApertura(), actual.getHoraCierre());
            for (int j = i + 1; j < horarios.size(); j++) {
                HorarioRequestDTO otro = horarios.get(j);
                Intervalo intervaloOtro = intervalo(otro.getDiaSemana(), otro.getHoraApertura(), otro.getHoraCierre());
                if (!intervaloActual.seSuperpone(intervaloOtro)) {
                    continue;
                }
                if (actual.getDiaSemana() == otro.getDiaSemana()) {
                    throw new ValidacionException(String.format(
                            "Ya tenés un horario cargado el %s de %s a %s, que se superpone con este",
                            ComercioTextoLegible.etiquetaDia(otro.getDiaSemana()), otro.getHoraApertura(),
                            otro.getHoraCierre()));
                }
                throw new ValidacionException(String.format("El turno del %s de %s a %s se superpone con el del %s de %s a %s",
                        nombreDia(actual.getDiaSemana()), hora(actual.getHoraApertura()), hora(actual.getHoraCierre()),
                        nombreDia(otro.getDiaSemana()), hora(otro.getHoraApertura()), hora(otro.getHoraCierre())));
            }
        }
    }

    public static String nombreDia(DiaSemana dia) {
        return ComercioTextoLegible.etiquetaDia(dia).toLowerCase();
    }

    public static String hora(LocalTime hora) {
        return FORMATO_HORA.format(hora);
    }
}
