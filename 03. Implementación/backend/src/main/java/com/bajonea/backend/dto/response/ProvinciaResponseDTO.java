package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class ProvinciaResponseDTO {

    private final String id;
    private final String nombre;

    public ProvinciaResponseDTO(String id, String nombre) {
        this.id = id;
        this.nombre = nombre;
    }
}
