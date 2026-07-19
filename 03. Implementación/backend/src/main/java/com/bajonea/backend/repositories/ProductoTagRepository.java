package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.ProductoTag;
import com.bajonea.backend.entities.ProductoTagId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductoTagRepository extends JpaRepository<ProductoTag, ProductoTagId> {

    /**
     * Usado en {@code ProductoService.aResponseDTO} para listar los nombres de tag de un
     * producto, y en {@code editarProducto} junto con {@link #deleteByProductoId} para
     * reemplazar la asociación completa en cada edición.
     */
    List<ProductoTag> findByProductoId(Integer productoId);

    /**
     * Usado en {@code ProductoService.listarCatalogoDelComercio} para el filtro opcional por
     * tag del catálogo público (Fase 9) — resuelve qué productos tienen el tag pedido.
     */
    List<ProductoTag> findByTagId(Integer tagId);

    void deleteByProductoId(Integer productoId);
}
