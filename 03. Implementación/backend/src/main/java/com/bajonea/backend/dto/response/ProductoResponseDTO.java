package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoProducto;
import java.math.BigDecimal;
import java.util.List;
import lombok.Getter;

/**
 * Incluye {@code categoriaId} + {@code nombreCategoria} y {@code comercioId} +
 * {@code nombreComercio} en vez de anidar los objetos completos. Incluye
 * {@code imagenes} (la galería propia del producto, no una entidad ajena) y
 * {@code tags} como lista de nombres — agregado no solicitado explícitamente en la
 * consigna de esta tanda, pero necesario para que el filtro "por categoría/tag" del
 * catálogo público ({@code CatalogoController}, Fase 9) tenga algo que mostrarle al
 * cliente sobre por qué un producto matcheó un tag.
 */
@Getter
public class ProductoResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String descripcion;
    private final BigDecimal precio;
    private final Integer categoriaId;
    private final String nombreCategoria;
    private final Integer comercioId;
    private final String nombreComercio;
    private final EstadoProducto estado;
    private final List<ImagenProductoResponseDTO> imagenes;
    private final List<String> tags;

    public ProductoResponseDTO(
            Integer id,
            String nombre,
            String descripcion,
            BigDecimal precio,
            Integer categoriaId,
            String nombreCategoria,
            Integer comercioId,
            String nombreComercio,
            EstadoProducto estado,
            List<ImagenProductoResponseDTO> imagenes,
            List<String> tags) {
        this.id = id;
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.precio = precio;
        this.categoriaId = categoriaId;
        this.nombreCategoria = nombreCategoria;
        this.comercioId = comercioId;
        this.nombreComercio = nombreComercio;
        this.estado = estado;
        this.imagenes = imagenes;
        this.tags = tags;
    }
}
