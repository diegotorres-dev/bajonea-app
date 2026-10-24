package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CategoriaResultadoPedido;
import java.math.BigDecimal;
import java.util.Map;
import lombok.Getter;

/**
 * Cifras de las estadísticas del Dueño: las del rango completo ({@code totales}) o las de un período. {@code pedidos}
 * cuenta todos los que llegaron pagados al comercio, de cualquier estado; {@code facturados}, solo los de estado
 * facturable (los mismos que el panel y el cierre de turno); {@code vendido} y {@code comision} se suman sobre estos
 * últimos, {@code neto} es su diferencia y {@code ticketPromedio} es {@code vendido / facturados} (nulo sin
 * facturados). {@code resultados} trae siempre las siete categorías, en cero cuando no hay.
 */
@Getter
public class CifrasEstadisticasResponseDTO {

    private final int pedidos;
    private final int facturados;
    private final BigDecimal vendido;
    private final BigDecimal comision;
    private final BigDecimal neto;
    private final BigDecimal ticketPromedio;
    private final Map<CategoriaResultadoPedido, Integer> resultados;

    public CifrasEstadisticasResponseDTO(int pedidos, int facturados, BigDecimal vendido, BigDecimal comision, BigDecimal neto,
            BigDecimal ticketPromedio, Map<CategoriaResultadoPedido, Integer> resultados) {
        this.pedidos = pedidos;
        this.facturados = facturados;
        this.vendido = vendido;
        this.comision = comision;
        this.neto = neto;
        this.ticketPromedio = ticketPromedio;
        this.resultados = resultados;
    }
}
