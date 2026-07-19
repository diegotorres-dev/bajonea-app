package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Sesion;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SesionRepository extends JpaRepository<Sesion, Integer> {

    Optional<Sesion> findByUsuarioIdAndActivaTrue(Integer usuarioId);
}
