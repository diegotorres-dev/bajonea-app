package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Categoria;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoriaRepository extends JpaRepository<Categoria, Integer> {

    boolean existsByNombre(String nombre);
}
