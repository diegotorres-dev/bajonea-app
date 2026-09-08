package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class CategoriaResponseDTO {

    private final Integer id;
    private final String nombre;
    private final boolean activo;
    private final long cantidadProductos;

    public CategoriaResponseDTO(Integer id, String nombre, boolean activo, long cantidadProductos) {
        this.id = id;
        this.nombre = nombre;
        this.activo = activo;
        this.cantidadProductos = cantidadProductos;
    }
}
