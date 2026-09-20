package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.enums.EstadoNotaCredito;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotaCreditoRepository extends JpaRepository<NotaCredito, Integer> {

    Optional<NotaCredito> findByPagoId(Integer pagoId);

    List<NotaCredito> findByEstado(EstadoNotaCredito estado);
}
