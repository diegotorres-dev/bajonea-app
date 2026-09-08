package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Dueno;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DuenoRepository extends JpaRepository<Dueno, Integer> {
}
