package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEmpleadoComercio;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistorialEmpleadoComercioRepository extends JpaRepository<HistorialEmpleadoComercio, Integer> {

    List<HistorialEmpleadoComercio> findByComercioIdOrderByFechaHoraDescIdDesc(Integer comercioId);
}
