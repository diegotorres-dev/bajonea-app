package com.bajonea.backend.dto.response;

import java.util.List;
import lombok.Getter;

/**
 * Categorías y tags realmente en uso entre los productos visibles del catálogo público
 * (Tramo 16.15, punto 14) — independiente de la paginación de {@code GET /catalogo/productos},
 * para que los chips de filtro no dependan de qué haya en la página actual.
 */
@Getter
public class FiltrosCatalogoResponseDTO {

    private final List<CategoriaFiltroResponseDTO> categorias;
    private final List<TagFiltroResponseDTO> tags;

    public FiltrosCatalogoResponseDTO(List<CategoriaFiltroResponseDTO> categorias, List<TagFiltroResponseDTO> tags) {
        this.categorias = categorias;
        this.tags = tags;
    }
}
