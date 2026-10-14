package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Producto;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoProducto;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductoRepository extends JpaRepository<Producto, Integer> {

    List<Producto> findByComercioIdAndEstadoNot(Integer comercioId, EstadoProducto estado);

    /**
     * Catálogo público global (Tramo 16.15, punto 14, {@code CatalogoController}) — productos
     * de todos los comercios {@code APROBADO}, excluidos los {@code DESCONTINUADO}, mismo
     * criterio de visibilidad que {@link #findByComercioIdAndEstadoNot} pero sin acotar a un
     * único comercio.
     */
    List<Producto> findByComercio_EstadoAndEstadoNot(EstadoComercio estadoComercio, EstadoProducto estadoProducto);

    List<Producto> findByComercioIdAndCategoriaId(Integer comercioId, Integer categoriaId);

    /**
     * Sin filtro de estado, a diferencia de {@link #findByComercioIdAndEstadoNot} (pensado
     * para el catálogo público, Fase 9) — usado en {@code ProductoService.listarProductosDelComercio}
     * para que el propio comercio vea todo su catálogo, incluidos {@code AGOTADO}/{@code DESCONTINUADO}.
     */
    List<Producto> findByComercioId(Integer comercioId);

    long countByCategoriaId(Integer categoriaId);

    /**
     * {@code SELECT ... FOR UPDATE} del producto: lo toma el cambio de estado del Dueño antes de buscar los carritos
     * que lo contienen. Mientras lo tiene, nadie puede agregar el producto a un carrito (agregar lo lee con
     * {@link #leerEstadoConBloqueoCompartido}), así que los ítems del producto solo pueden desaparecer. Es una
     * lectura actual: el cambio de estado no hace ninguna lectura común antes, para que la foto de la transacción
     * se fije después de este bloqueo.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Producto p WHERE p.id = :id")
    Optional<Producto> findByIdConBloqueo(@Param("id") Integer id);

    /**
     * Estado y comercio del producto leídos con {@code LOCK IN SHARE MODE} (consulta nativa: MariaDB 10.4 no entiende
     * el {@code FOR SHARE} de Hibernate). Lo toma agregar al carrito antes de bloquear el carrito: o ve el producto
     * como lo dejó el Dueño, o el Dueño espera a que termine y encuentra el ítem recién agregado.
     */
    @Query(value = "SELECT estado AS estado, comercio_id AS comercioId FROM producto WHERE id = :id LOCK IN SHARE MODE",
            nativeQuery = true)
    Optional<EstadoYComercioProducto> leerEstadoConBloqueoCompartido(@Param("id") Integer id);

    interface EstadoYComercioProducto {
        String getEstado();

        Integer getComercioId();
    }
}
