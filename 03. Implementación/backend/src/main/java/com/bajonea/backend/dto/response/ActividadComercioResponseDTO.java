package com.bajonea.backend.dto.response;

import java.util.List;
import lombok.Getter;

/**
 * Página de la actividad del comercio, de la más nueva a la más vieja. {@code siguienteCursor} es el valor que se
 * manda como {@code cursor} para pedir la página que sigue; es nulo cuando no hay más.
 */
@Getter
public class ActividadComercioResponseDTO {

    private final List<ActividadComercioItemResponseDTO> items;
    private final String siguienteCursor;
    private final boolean hayMas;

    public ActividadComercioResponseDTO(List<ActividadComercioItemResponseDTO> items, String siguienteCursor, boolean hayMas) {
        this.items = items;
        this.siguienteCursor = siguienteCursor;
        this.hayMas = hayMas;
    }
}
