package com.bajonea.backend.dto.response;

import java.util.List;
import lombok.Getter;

/**
 * Catálogo público de productos entre todos los comercios (Tramo 16.15, punto 14) — orden
 * aleatorio recalculado en cada request, no estable entre páginas (comportamiento esperado
 * para una pantalla de descubrimiento, no una grilla paginada tradicional).
 */
@Getter
public class ProductosPaginadosResponseDTO {

    private final List<ProductoResponseDTO> productos;
    private final int paginaActual;
    private final int totalPaginas;
    private final long totalProductos;

    public ProductosPaginadosResponseDTO(
            List<ProductoResponseDTO> productos, int paginaActual, int totalPaginas, long totalProductos) {
        this.productos = productos;
        this.paginaActual = paginaActual;
        this.totalPaginas = totalPaginas;
        this.totalProductos = totalProductos;
    }
}
