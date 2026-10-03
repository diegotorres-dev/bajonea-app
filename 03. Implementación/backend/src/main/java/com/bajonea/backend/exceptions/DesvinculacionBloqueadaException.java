package com.bajonea.backend.exceptions;

import java.time.LocalDateTime;

/**
 * No se puede desvincular la cuenta de Mercado Pago mientras algún comercio del Dueño tenga pedidos en
 * {@code PENDIENTE_PAGO}: un cliente podría estar pagando contra esa cuenta. Mapea a {@code 409}; el handler
 * global suma a {@code data} la cantidad de pagos pendientes y la hora aproximada para reintentar.
 */
public class DesvinculacionBloqueadaException extends ConflictoDeNegocioException {

    private final int cantidadPagosPendientes;
    private final LocalDateTime puedeReintentarDesde;

    public DesvinculacionBloqueadaException(String mensaje, int cantidadPagosPendientes, LocalDateTime puedeReintentarDesde) {
        super(mensaje);
        this.cantidadPagosPendientes = cantidadPagosPendientes;
        this.puedeReintentarDesde = puedeReintentarDesde;
    }

    public int getCantidadPagosPendientes() {
        return cantidadPagosPendientes;
    }

    public LocalDateTime getPuedeReintentarDesde() {
        return puedeReintentarDesde;
    }
}
