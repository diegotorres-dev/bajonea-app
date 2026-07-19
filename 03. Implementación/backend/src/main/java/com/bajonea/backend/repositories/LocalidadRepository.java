package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Localidad;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocalidadRepository extends JpaRepository<Localidad, String> {

    List<Localidad> findByProvinciaId(String provinciaId);
}
