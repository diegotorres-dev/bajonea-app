package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Tag;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TagRepository extends JpaRepository<Tag, Integer> {

    boolean existsByNombre(String nombre);

    long countByActivoTrue();
}
