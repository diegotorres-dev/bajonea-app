package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Administrador;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdministradorRepository extends JpaRepository<Administrador, Integer> {
}
