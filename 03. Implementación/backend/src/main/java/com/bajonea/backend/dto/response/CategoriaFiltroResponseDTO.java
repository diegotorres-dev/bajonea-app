package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Variante liviana de {@code CategoriaResponseDTO} para el catálogo público de filtros
 * (Tramo 16.15, punto 14) — solo lo que un chip necesita (id + nombre), sin {@code activo}
 * ni {@code cantidadProductos} (ese conteo es admin-only y cuenta productos de cualquier
 * comercio, no solo los visibles públicamente).
 */
@Getter
public class CategoriaFiltroResponseDTO {

    private final Integer id;
    private final String nombre;

    public CategoriaFiltroResponseDTO(Integer id, String nombre) {
        this.id = id;
        this.nombre = nombre;
    }
}
