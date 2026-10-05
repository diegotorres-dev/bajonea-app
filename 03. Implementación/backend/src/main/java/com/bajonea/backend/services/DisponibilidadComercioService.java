package com.bajonea.backend.services;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AccionCierre;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoApertura;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Única fuente de la hora de los comercios y de la lectura de sus franjas horarias: abierto o cerrado ahora,
 * si se puede cerrar o abrir a mano, cuándo empieza la próxima franja y el texto de reapertura. Toda hora
 * nueva del cierre manual (franjas, historial, job, texto) sale de acá, en {@code -03:00} explícito.
 * <p>
 * Una franja que cierra a las 23:59 se interpreta como fin del día (24:00), para que no quede un hueco entre
 * 23:59:00 y 23:59:59. Las franjas que cruzan la medianoche se cargan como dos filas y no se unen: un cierre
 * manual hecho en el primer tramo de una franja partida se reabre en la segunda fila (limitación conocida).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DisponibilidadComercioService {

    public static final ZoneOffset ZONA_COMERCIO = ZoneOffset.of("-03:00");

    private static final int SEGUNDOS_POR_DIA = 24 * 60 * 60;
    private static final int DIAS_POR_SEMANA = 7;
    private static final DateTimeFormatter FORMATO_HORA = DateTimeFormatter.ofPattern("HH:mm");
    private static final String[] NOMBRES_DIA = {"lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"};

    private final HorarioRepository horarioRepository;
    private final HistorialCierreComercioRepository historialCierreComercioRepository;

    public record Disponibilidad(boolean cerradoManualmente, boolean abiertoAhora, boolean puedeCambiarCierre,
            String textoReapertura, EstadoApertura estadoApertura) {
    }

    public LocalDateTime ahora() {
        return LocalDateTime.now(ZONA_COMERCIO);
    }

    public boolean dentroDeFranja(List<Horario> horarios, LocalDateTime ahora) {
        DiaSemana hoy = diaDe(ahora);
        int segundoActual = ahora.toLocalTime().toSecondOfDay();
        return horarios.stream()
                .filter(horario -> horario.getDiaSemana() == hoy)
                .anyMatch(horario -> segundoActual >= horario.getHoraApertura().toSecondOfDay()
                        && segundoActual < finDeFranja(horario.getHoraCierre()));
    }

    public boolean abiertoAhora(boolean cerradoManualmente, List<Horario> horarios, LocalDateTime ahora) {
        return !cerradoManualmente && dentroDeFranja(horarios, ahora);
    }

    public boolean puedeCambiarCierre(EstadoComercio estado, List<Horario> horarios, LocalDateTime ahora) {
        return ComercioActivoService.esOperativo(estado) && dentroDeFranja(horarios, ahora);
    }

    /**
     * Momento en que empieza la primera franja posterior (estrictamente) a {@code desde}, buscando hasta una
     * semana adelante. Vacío si el comercio no tiene franjas.
     */
    public Optional<LocalDateTime> proximoInicioDeFranja(List<Horario> horarios, LocalDateTime desde) {
        LocalDateTime mejor = null;
        for (int dias = 0; dias <= DIAS_POR_SEMANA; dias++) {
            var fecha = desde.toLocalDate().plusDays(dias);
            DiaSemana dia = diaDe(fecha.atStartOfDay());
            for (Horario horario : horarios) {
                if (horario.getDiaSemana() != dia) {
                    continue;
                }
                LocalDateTime inicio = fecha.atTime(horario.getHoraApertura());
                if (inicio.isAfter(desde) && (mejor == null || inicio.isBefore(mejor))) {
                    mejor = inicio;
                }
            }
        }
        return Optional.ofNullable(mejor);
    }

    public static String textoReapertura(LocalDateTime inicio, LocalDateTime ahora) {
        String hora = inicio.toLocalTime().format(FORMATO_HORA);
        long dias = ChronoUnit.DAYS.between(ahora.toLocalDate(), inicio.toLocalDate());
        if (dias <= 0) {
            return "Reabre hoy a las " + hora;
        }
        if (dias == 1) {
            return "Reabre mañana a las " + hora;
        }
        return "Reabre el " + NOMBRES_DIA[inicio.getDayOfWeek().getValue() - 1] + " a las " + hora;
    }

    public Disponibilidad calcular(Comercio comercio) {
        return calcular(comercio, horarioRepository.findByComercioId(comercio.getId()), ahora());
    }

    public Disponibilidad calcular(Comercio comercio, List<Horario> horarios, LocalDateTime ahora) {
        boolean dentro = dentroDeFranja(horarios, ahora);
        boolean cerrado = comercio.isCerradoManualmente();
        boolean abierto = !cerrado && dentro;
        String texto = null;
        if (!abierto) {
            texto = momentoDeReferencia(comercio, ahora)
                    .flatMap(desde -> proximoInicioDeFranja(horarios, desde))
                    .map(inicio -> textoReapertura(inicio, ahora))
                    .orElse(null);
        }
        EstadoApertura estadoApertura = cerrado
                ? EstadoApertura.CERRADO_TEMPORALMENTE
                : dentro ? EstadoApertura.ABIERTO : EstadoApertura.CERRADO_HORARIO;
        return new Disponibilidad(cerrado, abierto, puedeCambiarCierre(comercio.getEstado(), horarios, ahora), texto,
                estadoApertura);
    }

    private Optional<LocalDateTime> momentoDeReferencia(Comercio comercio, LocalDateTime ahora) {
        if (!comercio.isCerradoManualmente()) {
            return Optional.of(ahora);
        }
        return historialCierreComercioRepository
                .findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc(comercio.getId(), AccionCierre.CERRADO)
                .map(fila -> fila.getFechaHora())
                .or(() -> Optional.of(ahora));
    }

    private static int finDeFranja(LocalTime cierre) {
        return cierre.getHour() == 23 && cierre.getMinute() == 59 ? SEGUNDOS_POR_DIA : cierre.toSecondOfDay();
    }

    private static DiaSemana diaDe(LocalDateTime momento) {
        return DiaSemana.values()[momento.getDayOfWeek().getValue() - 1];
    }
}
