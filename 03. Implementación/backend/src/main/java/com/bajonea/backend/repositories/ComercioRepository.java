package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ComercioRepository extends JpaRepository<Comercio, Integer> {

    List<Comercio> findByEstado(EstadoComercio estado);

    Optional<Comercio> findByDuenoId(Integer duenoId);
}
