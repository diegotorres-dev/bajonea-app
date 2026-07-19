package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.enums.EstadoProducto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductoRepository extends JpaRepository<Producto, Integer> {

    List<Producto> findByComercioIdAndEstadoNot(Integer comercioId, EstadoProducto estado);

    List<Producto> findByComercioIdAndCategoriaId(Integer comercioId, Integer categoriaId);

    /**
     * Sin filtro de estado, a diferencia de {@link #findByComercioIdAndEstadoNot} (pensado
     * para el catálogo público, Fase 9) — usado en {@code ProductoService.listarProductosDelComercio}
     * para que el propio comercio vea todo su catálogo, incluidos {@code AGOTADO}/{@code DESCONTINUADO}.
     */
    List<Producto> findByComercioId(Integer comercioId);
}
