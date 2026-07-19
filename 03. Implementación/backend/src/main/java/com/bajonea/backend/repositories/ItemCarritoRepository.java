package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.ItemCarrito;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ItemCarritoRepository extends JpaRepository<ItemCarrito, Integer> {

    List<ItemCarrito> findByCarritoId(Integer carritoId);

    void deleteByCarritoId(Integer carritoId);

    /**
     * Usado en {@code ProductoService.limpiarCarritosActivos}: al pasar un producto a
     * {@code AGOTADO}/{@code DESCONTINUADO}, elimina el ítem de todos los carritos que lo
     * contengan (no hay concepto de "carrito activo" en el MVP, ver modelo-mvp.md nota 7 —
     * son todos) y notifica a cada cliente afectado antes de borrar.
     */
    List<ItemCarrito> findByProductoId(Integer productoId);
}
