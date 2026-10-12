package com.bajonea.backend.dto.response;

import java.math.BigDecimal;
import lombok.Getter;

/**
 * Resumen del día para un Empleado ({@code GET /api/v1/pedidos/comercio/resumen-hoy} cuando el actor es Empleado).
 * {@code totalFacturadoHoy} es la suma del subtotal de los productos de los pedidos facturados hoy, sin descontar
 * el cargo de servicio del comercio: el Dueño recibe esa misma suma ya neta, y el Empleado no tiene que poder
 * deducir la comisión a partir de la diferencia. Los dos contadores son los mismos que los del Dueño.
 */
@Getter
public class ResumenPedidosHoyEmpleadoResponseDTO {

    private final BigDecimal totalFacturadoHoy;
    private final int cantidadPedidosHoy;
    private final int cantidadPendientes;

    public ResumenPedidosHoyEmpleadoResponseDTO(BigDecimal totalFacturadoHoy, int cantidadPedidosHoy, int cantidadPendientes) {
        this.totalFacturadoHoy = totalFacturadoHoy;
        this.cantidadPedidosHoy = cantidadPedidosHoy;
        this.cantidadPendientes = cantidadPendientes;
    }
}
