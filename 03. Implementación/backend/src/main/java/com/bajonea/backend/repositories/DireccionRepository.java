package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Direccion;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DireccionRepository extends JpaRepository<Direccion, Integer> {

    /**
     * Usado en {@code AdministradorService.aResponseDTO} para armar la dirección anidada de
     * {@code ComercioResponseDTO} (relación 1:1 comercio → dirección).
     */
    Optional<Direccion> findByComercioId(Integer comercioId);

    /**
     * Usado en {@code ClienteService.aResponseDTO} para exponer la dirección única del
     * Cliente en {@code ClienteResponseDTO} (Tramo 16.3, ver docs/DECISIONES.md) — mismo
     * patrón que {@code findByComercioId}, necesario para que el checkout de delivery
     * conozca el {@code direccionId} real a mandar en {@code PedidoRequestDTO}.
     */
    Optional<Direccion> findByClienteId(Integer clienteId);

    /**
     * Direcciones de todos los comercios de un Dueño, con el comercio y la localidad ya cargados, en una
     * sola consulta: base del chequeo de comercio duplicado del alta adicional, sin una consulta por
     * comercio.
     */
    @Query("SELECT d FROM Direccion d JOIN FETCH d.comercio c JOIN FETCH d.localidad WHERE c.dueno.id = :duenoId")
    List<Direccion> findByDuenoIdConComercioYLocalidad(Integer duenoId);
}
