package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CampoCambioComercio;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Un dato que el Dueño cambió al corregir su comercio, con el valor anterior y el nuevo como texto legible
 * ({@code null} es un dato vacío).
 */
@Getter
@AllArgsConstructor
public class CambioComercioResponseDTO {

    private final CampoCambioComercio campo;
    private final String valorAnterior;
    private final String valorNuevo;
}
