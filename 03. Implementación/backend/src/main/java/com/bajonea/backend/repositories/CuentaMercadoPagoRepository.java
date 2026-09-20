package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.CuentaMercadoPago;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CuentaMercadoPagoRepository extends JpaRepository<CuentaMercadoPago, Integer> {

    Optional<CuentaMercadoPago> findByDuenoId(Integer duenoId);

    Optional<CuentaMercadoPago> findByDuenoIdAndActivaTrue(Integer duenoId);
}
