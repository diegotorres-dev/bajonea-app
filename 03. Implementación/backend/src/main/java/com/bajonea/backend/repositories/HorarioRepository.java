package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Horario;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HorarioRepository extends JpaRepository<Horario, Integer> {

    List<Horario> findByComercioId(Integer comercioId);
}
