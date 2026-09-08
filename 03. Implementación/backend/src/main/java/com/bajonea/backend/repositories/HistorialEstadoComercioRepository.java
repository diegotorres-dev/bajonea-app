package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEstadoComercio;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistorialEstadoComercioRepository extends JpaRepository<HistorialEstadoComercio, Integer> {

    Optional<HistorialEstadoComercio> findTopByComercioIdOrderByFechaHoraDesc(Integer comercioId);
}
