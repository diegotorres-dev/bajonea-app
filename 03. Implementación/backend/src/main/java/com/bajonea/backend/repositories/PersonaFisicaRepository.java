package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.PersonaFisica;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PersonaFisicaRepository extends JpaRepository<PersonaFisica, Integer> {

    boolean existsByDni(String dni);

    @Query("select p.nombre from PersonaFisica p where p.id = :usuarioId")
    Optional<String> findNombreByUsuarioId(@Param("usuarioId") Integer usuarioId);
}
