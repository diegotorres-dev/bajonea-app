package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Estado de apertura del comercio devuelto por {@code PUT /api/v1/comercios/cerrar} y
 * {@code PUT /api/v1/comercios/abrir}. {@code textoReapertura} es {@code null} cuando el comercio está abierto.
 */
@Getter
public class CierreComercioResponseDTO {

    private final boolean cerradoManualmente;
    private final boolean abiertoAhora;
    private final boolean puedeCambiarCierre;
    private final String textoReapertura;

    public CierreComercioResponseDTO(boolean cerradoManualmente, boolean abiertoAhora, boolean puedeCambiarCierre,
            String textoReapertura) {
        this.cerradoManualmente = cerradoManualmente;
        this.abiertoAhora = abiertoAhora;
        this.puedeCambiarCierre = puedeCambiarCierre;
        this.textoReapertura = textoReapertura;
    }
}
