package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoResumenTurno;
import java.math.BigDecimal;
import lombok.Getter;

/**
 * Resumen del turno para el Dueño ({@code GET /api/v1/pedidos/comercio/resumen-turno}). {@code vendido} es la suma del
 * subtotal de los pedidos facturables del turno, {@code comision} la suma del cargo de servicio del comercio y
 * {@code neto} la diferencia. {@code cantidadPendientes} cuenta todos los pendientes del comercio, no solo los del turno.
 * Sin turno ({@code SIN_TURNO}) los montos y la cantidad de pedidos van en cero y {@code turno} en {@code null}.
 */
@Getter
public class ResumenTurnoResponseDTO {

    private final EstadoResumenTurno estado;
    private final TurnoResumenResponseDTO turno;
    private final BigDecimal vendido;
    private final BigDecimal comision;
    private final BigDecimal neto;
    private final int cantidadPedidos;
    private final int cantidadPendientes;

    public ResumenTurnoResponseDTO(EstadoResumenTurno estado, TurnoResumenResponseDTO turno, BigDecimal vendido,
            BigDecimal comision, BigDecimal neto, int cantidadPedidos, int cantidadPendientes) {
        this.estado = estado;
        this.turno = turno;
        this.vendido = vendido;
        this.comision = comision;
        this.neto = neto;
        this.cantidadPedidos = cantidadPedidos;
        this.cantidadPendientes = cantidadPendientes;
    }
}
