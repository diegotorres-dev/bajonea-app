package com.bajonea.backend.dto.response;

import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Cuerpo de {@code data} del {@code 409} de {@code DELETE /api/v1/oauth/mercadopago/desvincular} cuando hay
 * pedidos esperando el pago: cuántos son y desde cuándo (aproximado) se puede reintentar.
 */
@Getter
public class DesvinculacionBloqueadaResponseDTO {

    private final int cantidadPagosPendientes;
    private final LocalDateTime puedeReintentarDesde;

    public DesvinculacionBloqueadaResponseDTO(int cantidadPagosPendientes, LocalDateTime puedeReintentarDesde) {
        this.cantidadPagosPendientes = cantidadPagosPendientes;
        this.puedeReintentarDesde = puedeReintentarDesde;
    }
}
