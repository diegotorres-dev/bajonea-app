package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Pago;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PagoRepository extends JpaRepository<Pago, Integer> {

    Optional<Pago> findByPedidoId(Integer pedidoId);
}
