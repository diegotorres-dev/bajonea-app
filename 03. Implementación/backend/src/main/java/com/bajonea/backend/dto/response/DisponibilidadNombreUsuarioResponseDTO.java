package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class DisponibilidadNombreUsuarioResponseDTO {

    private final boolean disponible;

    public DisponibilidadNombreUsuarioResponseDTO(boolean disponible) {
        this.disponible = disponible;
    }
}
