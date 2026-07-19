package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Carrito;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CarritoRepository extends JpaRepository<Carrito, Integer> {

    Optional<Carrito> findByClienteId(Integer clienteId);
}
