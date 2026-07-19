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
}
