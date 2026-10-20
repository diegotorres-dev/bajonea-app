package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoResumenTurno;
import java.math.BigDecimal;
import lombok.Getter;

/**
 * Resumen del turno para el Empleado: lo mismo que ve el Dueño sin {@code comision} ni {@code neto}, para que la
 * comisión del comercio no se pueda deducir. {@code vendido} es el subtotal bruto de los pedidos facturables.
 */
@Getter
public class ResumenTurnoEmpleadoResponseDTO {

    private final EstadoResumenTurno estado;
    private final TurnoResumenResponseDTO turno;
    private final BigDecimal vendido;
    private final int cantidadPedidos;
    private final int cantidadPendientes;

    public ResumenTurnoEmpleadoResponseDTO(EstadoResumenTurno estado, TurnoResumenResponseDTO turno, BigDecimal vendido,
            int cantidadPedidos, int cantidadPendientes) {
        this.estado = estado;
        this.turno = turno;
        this.vendido = vendido;
        this.cantidadPedidos = cantidadPedidos;
        this.cantidadPendientes = cantidadPendientes;
    }
}
