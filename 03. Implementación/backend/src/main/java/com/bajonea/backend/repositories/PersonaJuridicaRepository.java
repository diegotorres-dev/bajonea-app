package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.PersonaJuridica;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PersonaJuridicaRepository extends JpaRepository<PersonaJuridica, Integer> {

    boolean existsByCuit(String cuit);
}
