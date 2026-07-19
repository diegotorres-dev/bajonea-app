package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class LocalidadResponseDTO {

    private final String id;
    private final String nombre;
    private final String provinciaId;

    public LocalidadResponseDTO(String id, String nombre, String provinciaId) {
        this.id = id;
        this.nombre = nombre;
        this.provinciaId = provinciaId;
    }
}
