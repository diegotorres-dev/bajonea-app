package com.bajonea.backend.services;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AccionCierre;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoApertura;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.repositories.HistorialCierreComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Única fuente de la hora de los comercios y de la lectura de sus franjas horarias: abierto o cerrado ahora,
 * si se puede cerrar o abrir a mano, cuándo empieza la próxima franja, qué turno está en curso y el texto de
 * reapertura. Toda hora nueva del cierre manual (franjas, historial, job, texto) sale de acá, con el reloj de
 * la aplicación (zona de {@code app.zona-horaria}, por defecto Ushuaia, UTC-03:00).
 * <p>
 * Una fila de {@code horario} es un turno: su día es el de apertura y cruza la medianoche cuando el cierre es
 * menor que la apertura (el cierre {@code 00:00} de un turno que cruza vale medianoche). Una franja que no cruza
 * y cierra a las 23:59 se interpreta como fin del día (24:00), para que no quede un hueco entre 23:59:00 y
 * 23:59:59. Cada fila rige entre {@code vigente_desde} y {@code vigente_hasta} (inclusivos, este último
 * opcional) según la fecha de su apertura: la cola de un turno de ayer se rige por la versión de ayer. Todas las
 * funciones reciben la lista de filas que trajo el repositorio (vigentes, pendientes y recién cerradas) y
 * filtran por fecha.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DisponibilidadComercioService {

    private static final int SEGUNDOS_POR_DIA = 24 * 60 * 60;
    private static final int DIAS_POR_SEMANA = 7;
    private static final DateTimeFormatter FORMATO_HORA = DateTimeFormatter.ofPattern("HH:mm");
    private static final String[] NOMBRES_DIA = {"lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"};

    private final HorarioRepository horarioRepository;
    private final HistorialCierreComercioRepository historialCierreComercioRepository;
    private final Clock clock;

    public record Disponibilidad(boolean cerradoManualmente, boolean abiertoAhora, boolean puedeCambiarCierre,
            String textoReapertura, EstadoApertura estadoApertura) {
    }

    public record Turno(Horario horario, LocalDateTime inicio, LocalDateTime fin) {
    }

    public LocalDateTime ahora() {
        return LocalDateTime.now(clock);
    }

    public static boolean cruzaMedianoche(Horario horario) {
        return cruzaMedianoche(horario.getHoraApertura(), horario.getHoraCierre());
    }

    public static boolean cruzaMedianoche(LocalTime apertura, LocalTime cierre) {
        return cierre.isBefore(apertura);
    }

    public static List<Horario> vigentesEn(List<Horario> horarios, LocalDate fecha) {
        return horarios.stream().filter(horario -> vigenteEn(horario, fecha)).toList();
    }

    public static boolean vigenteEn(Horario horario, LocalDate fecha) {
        return !horario.getVigenteDesde().isAfter(fecha)
                && (horario.getVigenteHasta() == null || !horario.getVigenteHasta().isBefore(fecha));
    }

    public static LocalDateTime finDelTurno(Horario horario, LocalDate fechaInicio) {
        if (cruzaMedianoche(horario)) {
            return fechaInicio.plusDays(1).atTime(horario.getHoraCierre());
        }
        return fechaInicio.atStartOfDay().plusSeconds(finDeFranja(horario.getHoraCierre()));
    }

    public Optional<Turno> turnoDe(List<Horario> horarios, LocalDateTime ahora) {
        for (int atras = 1; atras >= 0; atras--) {
            LocalDate fecha = ahora.toLocalDate().minusDays(atras);
            DiaSemana dia = diaDe(fecha);
            for (Horario horario : horarios) {
                if (horario.getDiaSemana() != dia || !vigenteEn(horario, fecha)) {
                    continue;
                }
                LocalDateTime inicio = fecha.atTime(horario.getHoraApertura());
                LocalDateTime fin = finDelTurno(horario, fecha);
                if (!ahora.isBefore(inicio) && ahora.isBefore(fin)) {
                    return Optional.of(new Turno(horario, inicio, fin));
                }
            }
        }
        return Optional.empty();
    }

    public Optional<Turno> ultimoTurnoTerminado(List<Horario> horarios, LocalDateTime ahora, int diasAtras) {
        Turno mejor = null;
        for (int atras = 0; atras <= diasAtras; atras++) {
            LocalDate fecha = ahora.toLocalDate().minusDays(atras);
            DiaSemana dia = diaDe(fecha);
            for (Horario horario : horarios) {
                if (horario.getDiaSemana() != dia || !vigenteEn(horario, fecha)) {
                    continue;
                }
                LocalDateTime fin = finDelTurno(horario, fecha);
                if (fin.isAfter(ahora)) {
                    continue;
                }
                if (mejor == null || fin.isAfter(mejor.fin())) {
                    mejor = new Turno(horario, fecha.atTime(horario.getHoraApertura()), fin);
                }
            }
        }
        return Optional.ofNullable(mejor);
    }

    /**
     * Turnos cuyo fin cae en {@code (desde, hasta]}, de los más viejos a los más nuevos. Cada fila rige por la fecha de
     * su apertura, igual que {@link #turnoDe} y {@link #ultimoTurnoTerminado}: un turno que cruza la medianoche se
     * busca desde el día anterior a {@code desde}, y una versión de horario ya cerrada por una edición sigue dando los
     * turnos de los días en que estuvo vigente.
     */
    public List<Turno> turnosTerminadosEntre(List<Horario> horarios, LocalDateTime desde, LocalDateTime hasta) {
        List<Turno> turnos = new ArrayList<>();
        for (LocalDate fecha = desde.toLocalDate().minusDays(1); !fecha.isAfter(hasta.toLocalDate()); fecha = fecha.plusDays(1)) {
            DiaSemana dia = diaDe(fecha);
            for (Horario horario : horarios) {
                if (horario.getDiaSemana() != dia || !vigenteEn(horario, fecha)) {
                    continue;
                }
                LocalDateTime fin = finDelTurno(horario, fecha);
                if (fin.isAfter(desde) && !fin.isAfter(hasta)) {
                    turnos.add(new Turno(horario, fecha.atTime(horario.getHoraApertura()), fin));
                }
            }
        }
        turnos.sort(Comparator.comparing(Turno::fin).thenComparing(turno -> turno.horario().getId()));
        return turnos;
    }

    public boolean dentroDeFranja(List<Horario> horarios, LocalDateTime ahora) {
        return turnoDe(horarios, ahora).isPresent();
    }

    public record FranjaContinua(LocalDateTime fin) {
    }

    public Optional<FranjaContinua> franjaContinuaDe(List<Horario> horarios, LocalDateTime ahora) {
        Optional<Turno> actual = turnoDe(horarios, ahora);
        if (actual.isEmpty()) {
            return Optional.empty();
        }
        LocalDateTime fin = actual.get().fin();
        for (int vuelta = 0; vuelta < DIAS_POR_SEMANA + 1; vuelta++) {
            Optional<Turno> siguiente = turnoDe(horarios, fin);
            if (siguiente.isEmpty()) {
                return Optional.of(new FranjaContinua(fin));
            }
            fin = siguiente.get().fin();
        }
        return Optional.of(new FranjaContinua(null));
    }

    public boolean abiertoAhora(boolean cerradoManualmente, List<Horario> horarios, LocalDateTime ahora) {
        return !cerradoManualmente && dentroDeFranja(horarios, ahora);
    }

    public boolean puedeCambiarCierre(EstadoComercio estado, List<Horario> horarios, LocalDateTime ahora) {
        return ComercioActivoService.esOperativo(estado) && dentroDeFranja(horarios, ahora);
    }

    /**
     * Momento en que empieza la primera franja posterior (estrictamente) a {@code desde}, buscando hasta una
     * semana adelante y con la versión que rige en la fecha de cada apertura (una versión pendiente ya cuenta).
     * Vacío si el comercio no tiene franjas.
     */
    public Optional<LocalDateTime> proximoInicioDeFranja(List<Horario> horarios, LocalDateTime desde) {
        LocalDateTime mejor = null;
        for (int dias = 0; dias <= DIAS_POR_SEMANA; dias++) {
            LocalDate fecha = desde.toLocalDate().plusDays(dias);
            DiaSemana dia = diaDe(fecha);
            for (Horario horario : horarios) {
                if (horario.getDiaSemana() != dia || !vigenteEn(horario, fecha)) {
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

    public List<Horario> horariosParaLeer(Integer comercioId, LocalDateTime ahora) {
        return horarioRepository.findVigentesDesde(comercioId, fechaDesdeParaLeer(ahora));
    }

    public LocalDate fechaDesdeParaLeer(LocalDateTime ahora) {
        return ahora.toLocalDate().minusDays(1);
    }

    public Disponibilidad calcular(Comercio comercio) {
        LocalDateTime ahora = ahora();
        return calcular(comercio, horarioRepository.findVigentesDesde(comercio.getId(), fechaDesdeParaLeer(ahora)),
                ahora);
    }

    public Disponibilidad calcular(Comercio comercio, List<Horario> horarios, LocalDateTime ahora) {
        boolean dentro = dentroDeFranja(horarios, ahora);
        boolean cerrado = comercio.isCerradoManualmente();
        boolean bloqueadoPorCuenta = comercio.getEstado() == EstadoComercio.CERRADO_TEMPORALMENTE;
        boolean abierto = !cerrado && !bloqueadoPorCuenta && dentro;
        String texto = null;
        if (!abierto && !bloqueadoPorCuenta) {
            texto = momentoDeReferencia(comercio, ahora)
                    .flatMap(desde -> proximoInicioDeFranja(horarios, desde))
                    .map(inicio -> textoReapertura(inicio, ahora))
                    .orElse(null);
        }
        EstadoApertura estadoApertura = bloqueadoPorCuenta
                ? EstadoApertura.CERRADO_TEMPORALMENTE
                : cerrado ? EstadoApertura.CERRADO_MANUAL
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

    private static DiaSemana diaDe(LocalDate fecha) {
        return DiaSemana.values()[fecha.getDayOfWeek().getValue() - 1];
    }
}
