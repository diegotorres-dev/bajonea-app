package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.PersonaFisica;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PersonaFisicaRepository extends JpaRepository<PersonaFisica, Integer> {

    boolean existsByDni(String dni);
}
