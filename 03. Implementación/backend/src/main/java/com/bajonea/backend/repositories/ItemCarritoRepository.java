package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.ItemCarrito;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Las bajas de ítems son sentencias {@code DELETE} en bloque y no borrados derivados ni {@code delete(entidad)}:
 * Hibernate carga los ítems con una lectura de la foto de la transacción y emite un {@code DELETE} por id, que
 * responde 0 filas (y lanza {@code StaleObjectStateException}) si otra transacción ya los borró. Una sentencia en
 * bloque es una lectura actual y sobre cero filas devuelve 0. Los métodos no limpian el contexto de persistencia
 * ({@code clearAutomatically}): quien los llama no tiene que seguir usando ítems cargados antes.
 * <p>
 * Cuando exista {@code item_carrito_extra} (bloque de Extras), cada baja en bloque de ítems tendrá que borrar antes
 * sus extras: {@code fk_item_carrito_extra_item} no tiene {@code ON DELETE CASCADE}.
 */
public interface ItemCarritoRepository extends JpaRepository<ItemCarrito, Integer> {

    List<ItemCarrito> findByCarritoId(Integer carritoId);

    /**
     * Usado por {@code CarritoService.prepararQuitarProducto}: al pasar un producto a
     * {@code AGOTADO}/{@code DESCONTINUADO}, busca los carritos (de todos los clientes: no hay concepto de
     * "carrito activo" en el MVP, ver modelo-mvp.md nota 7) que lo contengan, para saber qué carritos bloquear y a
     * qué clientes avisar. Es una lectura común: la hace el Dueño después de bloquear el producto, y desde ese
     * momento nadie puede agregarlo a un carrito.
     */
    @Query("SELECT DISTINCT c.id AS carritoId, c.cliente.id AS clienteId FROM ItemCarrito i JOIN i.carrito c "
            + "WHERE i.producto.id = :productoId ORDER BY c.id")
    List<CarritoAfectado> findCarritosConProducto(@Param("productoId") Integer productoId);

    interface CarritoAfectado {
        Integer getCarritoId();

        Integer getClienteId();
    }

    @Modifying(flushAutomatically = true)
    @Query("UPDATE ItemCarrito i SET i.cantidad = :cantidad WHERE i.id = :itemId AND i.carrito.id = :carritoId")
    int actualizarCantidad(@Param("itemId") Integer itemId, @Param("carritoId") Integer carritoId,
            @Param("cantidad") Integer cantidad);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM ItemCarrito i WHERE i.carrito.id = :carritoId")
    int borrarPorCarritoId(@Param("carritoId") Integer carritoId);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM ItemCarrito i WHERE i.id = :itemId AND i.carrito.id = :carritoId")
    int borrarDelCarrito(@Param("itemId") Integer itemId, @Param("carritoId") Integer carritoId);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM ItemCarrito i WHERE i.carrito.id = :carritoId AND i.producto.id = :productoId")
    int borrarPorCarritoIdYProductoId(@Param("carritoId") Integer carritoId, @Param("productoId") Integer productoId);

    /**
     * Lectura con bloqueo de la existencia de algún ítem en el carrito: una lectura actual, para decidir si el
     * carrito quedó vacío sin depender de la foto de la transacción. Solo la usa quien ya tiene el carrito
     * bloqueado, así que ningún otro escritor de ítems puede estar esperando estas filas.
     */
    @Query(value = "SELECT id FROM item_carrito WHERE carrito_id = :carritoId LIMIT 1 FOR UPDATE", nativeQuery = true)
    Optional<Integer> leerAlgunItemConBloqueo(@Param("carritoId") Integer carritoId);
}
