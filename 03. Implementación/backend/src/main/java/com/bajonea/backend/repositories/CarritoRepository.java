package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Carrito;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CarritoRepository extends JpaRepository<Carrito, Integer> {

    Optional<Carrito> findByClienteId(Integer clienteId);

    /**
     * {@code SELECT ... FOR UPDATE} del carrito de un Cliente. El carrito es la última hoja del orden global de
     * bloqueos (ver docs/CONCURRENCIA-Y-TRANSACCIONES.md): quien lo toma no pide después ningún bloqueo de usuario,
     * comercio, producto ni pedido. Es una lectura actual, no la foto de la transacción; quien tenga la entidad
     * ya cargada tiene que refrescarla con {@code PESSIMISTIC_WRITE} ({@code CarritoService}).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Carrito c WHERE c.cliente.id = :clienteId")
    Optional<Carrito> findByClienteIdConBloqueo(@Param("clienteId") Integer clienteId);

    /**
     * Bloquea el carrito del Cliente y devuelve solo su id y su comercio, sin cargar la entidad: lo usa el pago
     * aprobado, que decide sobre lo último confirmado y no deja una entidad vieja en el contexto de persistencia.
     * Con un carrito inexistente toma un bloqueo de intervalo sobre el índice único de {@code cliente_id}, que solo
     * frena el alta de ese carrito y no puede formar un ciclo (quien lo toma no pide después otro bloqueo).
     */
    @Query(value = "SELECT id AS id, comercio_id AS comercioId FROM carrito WHERE cliente_id = :clienteId FOR UPDATE",
            nativeQuery = true)
    Optional<CarritoBloqueado> bloquearPorClienteId(@Param("clienteId") Integer clienteId);

    /**
     * Bloquea varios carritos de una vez, en id ascendente (el recorrido por clave primaria los toma en ese orden).
     * Lo usa el cambio de estado de un producto, que toca carritos de varios Clientes.
     */
    @Query(value = "SELECT id FROM carrito WHERE id IN (:ids) ORDER BY id FOR UPDATE", nativeQuery = true)
    List<Integer> bloquearPorIds(@Param("ids") Collection<Integer> ids);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE Carrito c SET c.comercio = null WHERE c.id = :id")
    int quitarComercio(@Param("id") Integer id);

    interface CarritoBloqueado {
        Integer getId();

        Integer getComercioId();
    }
}
