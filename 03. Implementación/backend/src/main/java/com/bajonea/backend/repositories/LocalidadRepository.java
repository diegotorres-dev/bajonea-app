package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Localidad;
import java.util.List;
import java.util.Collection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface LocalidadRepository extends JpaRepository<Localidad, String> {

    List<Localidad> findByProvinciaId(String provinciaId);

    List<Localidad> findByProvinciaIdAndIdInOrderByNombreAsc(String provinciaId, Collection<String> ids);

    @Query("SELECT DISTINCT l.provincia.id FROM Localidad l WHERE l.id IN :ids")
    List<String> findProvinciaIdsByIdIn(Collection<String> ids);
}
