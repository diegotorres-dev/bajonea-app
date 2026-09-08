package com.bajonea.backend.dto.response;

import java.math.BigDecimal;
import lombok.Getter;

/**
 * {@code totalFacturadoHoy} cuenta solo pedidos en estado {@code EN_PREPARACION} creados hoy
 * (único estado que representa "se está cumpliendo de verdad" mientras el MVP no tenga
 * {@code ENTREGADO} — ver docs/DECISIONES.md, deuda técnica a revisar cuando ese estado
 * exista). {@code cantidadPedidosHoy} cuenta **todos** los pedidos creados hoy sin importar su
 * estado (Tramo 16.20, ver docs/DECISIONES.md). {@code cantidadPendientes} cuenta los
 * {@code PENDIENTE} de hoy por separado.
 */
@Getter
public class ResumenPedidosHoyResponseDTO {

    private final BigDecimal totalFacturadoHoy;
    private final int cantidadPedidosHoy;
    private final int cantidadPendientes;

    public ResumenPedidosHoyResponseDTO(BigDecimal totalFacturadoHoy, int cantidadPedidosHoy, int cantidadPendientes) {
        this.totalFacturadoHoy = totalFacturadoHoy;
        this.cantidadPedidosHoy = cantidadPedidosHoy;
        this.cantidadPendientes = cantidadPendientes;
    }
}
