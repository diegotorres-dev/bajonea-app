package com.bajonea.backend.dto.response;

import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Estado de vinculación de la cuenta de MercadoPago del Dueño autenticado, para que
 * {@code comercio-perfil.html} decida qué tarjeta mostrar (pendiente de vincular / vinculada).
 * {@code mpUserId}/{@code fechaVinculacion} son {@code null} cuando {@code vinculada} es
 * {@code false} — nunca se expone {@code accessToken}/{@code refreshToken}.
 */
@Getter
public class CuentaMercadoPagoResponseDTO {

    private final boolean vinculada;
    private final String mpUserId;
    private final LocalDateTime fechaVinculacion;

    public CuentaMercadoPagoResponseDTO(boolean vinculada, String mpUserId, LocalDateTime fechaVinculacion) {
        this.vinculada = vinculada;
        this.mpUserId = mpUserId;
        this.fechaVinculacion = fechaVinculacion;
    }
}
