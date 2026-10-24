package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.CifrasEstadisticasResponseDTO;
import com.bajonea.backend.dto.response.EstadisticasComercioResponseDTO;
import com.bajonea.backend.dto.response.PeriodoEstadisticasResponseDTO;
import com.bajonea.backend.dto.response.TurnoEstadisticasResponseDTO;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.AgrupacionEstadisticas;
import com.bajonea.backend.enums.CategoriaResultadoPedido;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Estadísticas del Dueño por comercio: pedidos por resultado, vendido, comisión, neto y ticket promedio, por día o por
 * turno. Solo cuenta pedidos que llegaron pagados: los de turno asignado por su {@code turno_fecha} y los pagados sin
 * turno por el día de {@code fecha_pago_confirmado}. El día es el de apertura del turno, igual que en el panel y en el
 * cierre de turno. La definición de "facturable" es la de {@link ResumenTurnoService#ESTADOS_FACTURADOS}. Las
 * consultas son nativas y leen el estado como texto porque el ENUM físico conserva el literal viejo
 * {@code PENDIENTE}. Es una lectura pura en una transacción de solo lectura, sin bloqueos; no es una foto: refleja el
 * estado actual de los pedidos, así que puede diferir del resumen que se mandó por email al cerrar el turno.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EstadisticasComercioService {

    public static final int MAXIMO_DIAS = 92;

    private static final BigDecimal CERO = new BigDecimal("0.00");
    private static final Set<String> NOMBRES_FACTURADOS = ResumenTurnoService.ESTADOS_FACTURADOS.stream()
            .map(Enum::name).collect(Collectors.toUnmodifiableSet());

    private final PedidoRepository pedidoRepository;
    private final HorarioRepository horarioRepository;

    private record ClaveTurno(LocalDate fecha, Integer horarioId) {
    }

    private static final class Acumulador {

        private int pedidos;
        private int facturados;
        private BigDecimal vendido = CERO;
        private BigDecimal comision = CERO;
        private final Map<CategoriaResultadoPedido, Integer> resultados = new EnumMap<>(CategoriaResultadoPedido.class);

        private Acumulador() {
            for (CategoriaResultadoPedido categoria : CategoriaResultadoPedido.values()) {
                resultados.put(categoria, 0);
            }
        }

        private void sumarFila(String estado, long cantidad, BigDecimal subtotal, BigDecimal comisionFila) {
            pedidos += (int) cantidad;
            resultados.merge(CategoriaResultadoPedido.desde(estado), (int) cantidad, Integer::sum);
            if (NOMBRES_FACTURADOS.contains(estado)) {
                facturados += (int) cantidad;
                vendido = vendido.add(subtotal == null ? CERO : subtotal);
                comision = comision.add(comisionFila == null ? CERO : comisionFila);
            }
        }

        private void sumar(Acumulador otro) {
            pedidos += otro.pedidos;
            facturados += otro.facturados;
            vendido = vendido.add(otro.vendido);
            comision = comision.add(otro.comision);
            otro.resultados.forEach((categoria, cantidad) -> resultados.merge(categoria, cantidad, Integer::sum));
        }
    }

    public EstadisticasComercioResponseDTO obtener(Integer comercioId, String desdeTexto, String hastaTexto,
            String agruparTexto) {
        if (desdeTexto == null || desdeTexto.isBlank() || hastaTexto == null || hastaTexto.isBlank()) {
            throw new ValidacionException("Indicá las fechas desde y hasta");
        }
        LocalDate desde = fecha(desdeTexto, "desde");
        LocalDate hasta = fecha(hastaTexto, "hasta");
        if (desde.isAfter(hasta)) {
            throw new ValidacionException("La fecha desde no puede ser posterior a la fecha hasta");
        }
        if (ChronoUnit.DAYS.between(desde, hasta) + 1 > MAXIMO_DIAS) {
            throw new ValidacionException("El rango no puede superar los " + MAXIMO_DIAS + " días");
        }
        AgrupacionEstadisticas agrupar = agrupacion(agruparTexto);

        List<PedidoRepository.FilaEstadisticaTurno> filasConTurno = pedidoRepository.estadisticasPorTurno(comercioId, desde, hasta);
        List<PedidoRepository.FilaEstadisticaSinTurno> filasSinTurno = pedidoRepository.estadisticasSinTurno(comercioId,
                desde.atStartOfDay(), hasta.plusDays(1).atStartOfDay());

        Map<LocalDate, Acumulador> porDia = new TreeMap<>();
        Map<ClaveTurno, Acumulador> porTurno = new LinkedHashMap<>();
        if (agrupar == AgrupacionEstadisticas.DIA) {
            for (LocalDate dia = desde; !dia.isAfter(hasta); dia = dia.plusDays(1)) {
                porDia.put(dia, new Acumulador());
            }
        }
        Set<Integer> horarioIds = new HashSet<>();
        for (PedidoRepository.FilaEstadisticaTurno fila : filasConTurno) {
            LocalDate dia = fila.getTurnoFecha().toLocalDate();
            Acumulador acumulador = agrupar == AgrupacionEstadisticas.DIA
                    ? porDia.computeIfAbsent(dia, clave -> new Acumulador())
                    : porTurno.computeIfAbsent(new ClaveTurno(dia, fila.getTurnoHorarioId()), clave -> new Acumulador());
            acumulador.sumarFila(fila.getEstado(), fila.getCantidad(), fila.getSubtotal(), fila.getComision());
            if (fila.getTurnoHorarioId() != null) {
                horarioIds.add(fila.getTurnoHorarioId());
            }
        }
        for (PedidoRepository.FilaEstadisticaSinTurno fila : filasSinTurno) {
            LocalDate dia = fila.getDia().toLocalDate();
            Acumulador acumulador = agrupar == AgrupacionEstadisticas.DIA
                    ? porDia.computeIfAbsent(dia, clave -> new Acumulador())
                    : porTurno.computeIfAbsent(new ClaveTurno(dia, null), clave -> new Acumulador());
            acumulador.sumarFila(fila.getEstado(), fila.getCantidad(), fila.getSubtotal(), fila.getComision());
        }

        Acumulador total = new Acumulador();
        List<PeriodoEstadisticasResponseDTO> periodos = new ArrayList<>();
        if (agrupar == AgrupacionEstadisticas.DIA) {
            porDia.forEach((dia, acumulador) -> {
                total.sumar(acumulador);
                periodos.add(periodo(dia, null, acumulador));
            });
        } else {
            Map<Integer, Horario> horarios = horarioRepository.findAllById(horarioIds).stream()
                    .collect(Collectors.toMap(Horario::getId, horario -> horario));
            porTurno.forEach((clave, acumulador) -> {
                total.sumar(acumulador);
                periodos.add(periodo(clave.fecha(), turno(clave, horarios.get(clave.horarioId())), acumulador));
            });
            periodos.sort(Comparator.comparing(PeriodoEstadisticasResponseDTO::getFecha)
                    .thenComparing(p -> p.getTurno() == null ? 1 : 0)
                    .thenComparing(p -> p.getTurno() == null ? null : p.getTurno().getInicio(),
                            Comparator.nullsLast(Comparator.naturalOrder())));
        }
        return new EstadisticasComercioResponseDTO(desde, hasta, agrupar, cifras(total), periodos);
    }

    private static TurnoEstadisticasResponseDTO turno(ClaveTurno clave, Horario horario) {
        if (horario == null) {
            return null;
        }
        return new TurnoEstadisticasResponseDTO(horario.getId(), clave.fecha().atTime(horario.getHoraApertura()),
                DisponibilidadComercioService.finDelTurno(horario, clave.fecha()),
                DisponibilidadComercioService.cruzaMedianoche(horario));
    }

    private static PeriodoEstadisticasResponseDTO periodo(LocalDate fecha, TurnoEstadisticasResponseDTO turno,
            Acumulador acumulador) {
        BigDecimal neto = acumulador.vendido.subtract(acumulador.comision);
        return new PeriodoEstadisticasResponseDTO(fecha, turno, acumulador.pedidos, acumulador.facturados,
                acumulador.vendido, acumulador.comision, neto, ticket(acumulador), acumulador.resultados);
    }

    private static CifrasEstadisticasResponseDTO cifras(Acumulador acumulador) {
        BigDecimal neto = acumulador.vendido.subtract(acumulador.comision);
        return new CifrasEstadisticasResponseDTO(acumulador.pedidos, acumulador.facturados, acumulador.vendido,
                acumulador.comision, neto, ticket(acumulador), acumulador.resultados);
    }

    private static BigDecimal ticket(Acumulador acumulador) {
        if (acumulador.facturados == 0) {
            return null;
        }
        return acumulador.vendido.divide(BigDecimal.valueOf(acumulador.facturados), 2, RoundingMode.HALF_UP);
    }

    private static LocalDate fecha(String texto, String nombre) {
        try {
            return LocalDate.parse(texto.trim());
        } catch (DateTimeParseException e) {
            throw new ValidacionException("La fecha " + nombre + " tiene que tener el formato AAAA-MM-DD");
        }
    }

    private static AgrupacionEstadisticas agrupacion(String texto) {
        if (texto == null || texto.isBlank()) {
            return AgrupacionEstadisticas.DIA;
        }
        try {
            return AgrupacionEstadisticas.valueOf(texto.trim());
        } catch (IllegalArgumentException e) {
            throw new ValidacionException("La agrupación tiene que ser DIA o TURNO");
        }
    }
}
