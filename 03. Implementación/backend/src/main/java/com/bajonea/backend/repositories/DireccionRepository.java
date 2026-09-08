package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Direccion;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
