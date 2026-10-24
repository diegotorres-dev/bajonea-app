package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CategoriaResultadoPedido;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import lombok.Getter;

/**
 * Un período de las estadísticas. Agrupado por día, {@code fecha} es el día de apertura del turno y {@code turno} va
 * en {@code null}. Agrupado por turno, {@code turno} trae la fila de horario del turno; un período con {@code turno}
 * en {@code null} reúne los pedidos pagados de ese día que no tienen turno asignado.
 */
@Getter
public class PeriodoEstadisticasResponseDTO extends CifrasEstadisticasResponseDTO {

    private final LocalDate fecha;
    private final TurnoEstadisticasResponseDTO turno;

    public PeriodoEstadisticasResponseDTO(LocalDate fecha, TurnoEstadisticasResponseDTO turno, int pedidos, int facturados,
            BigDecimal vendido, BigDecimal comision, BigDecimal neto, BigDecimal ticketPromedio,
            Map<CategoriaResultadoPedido, Integer> resultados) {
        super(pedidos, facturados, vendido, comision, neto, ticketPromedio, resultados);
        this.fecha = fecha;
        this.turno = turno;
    }
}
