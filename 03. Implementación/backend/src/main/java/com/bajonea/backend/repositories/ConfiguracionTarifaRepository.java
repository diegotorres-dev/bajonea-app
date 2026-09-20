package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.ConfiguracionTarifa;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConfiguracionTarifaRepository extends JpaRepository<ConfiguracionTarifa, Integer> {

    Optional<ConfiguracionTarifa> findTopByOrderByFechaVigenciaDesc();

    List<ConfiguracionTarifa> findAllByOrderByFechaVigenciaDesc();
}
