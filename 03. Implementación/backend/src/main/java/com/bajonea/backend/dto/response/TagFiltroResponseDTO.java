package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Variante liviana de {@code TagResponseDTO} para el catálogo público de filtros (Tramo
 * 16.16, punto 9) — mismo criterio que {@code CategoriaFiltroResponseDTO}: solo lo que un
 * chip necesita (id + nombre). Reemplaza al {@code List<String>} anterior de
 * {@code FiltrosCatalogoResponseDTO.tags}, que no permitía enviar el filtro de vuelta al
 * backend sin ambigüedad (el nombre de un tag no es un identificador válido de consulta).
 */
@Getter
public class TagFiltroResponseDTO {

    private final Integer id;
    private final String nombre;

    public TagFiltroResponseDTO(Integer id, String nombre) {
        this.id = id;
        this.nombre = nombre;
    }
}
