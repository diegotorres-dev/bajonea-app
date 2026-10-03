package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Respuesta de {@code GET /api/v1/comercios/alta-adicional/elegibilidad}: solo si el Dueño puede
 * agregar otro comercio, sin decir por qué no.
 */
@Getter
public class ElegibilidadAltaAdicionalResponseDTO {

    private final boolean elegible;

    public ElegibilidadAltaAdicionalResponseDTO(boolean elegible) {
        this.elegible = elegible;
    }
}
