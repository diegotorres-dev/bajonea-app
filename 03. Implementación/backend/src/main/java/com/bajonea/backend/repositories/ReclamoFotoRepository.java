package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.ReclamoFoto;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReclamoFotoRepository extends JpaRepository<ReclamoFoto, Integer> {

    List<ReclamoFoto> findByReclamoIdOrderByOrdenAsc(Integer reclamoId);

    Optional<ReclamoFoto> findByIdAndReclamoId(Integer id, Integer reclamoId);

    interface CantidadPorReclamo {

        Integer getReclamoId();

        Long getCantidad();
    }

    @Query("select f.reclamoId as reclamoId, count(f) as cantidad from ReclamoFoto f where f.reclamoId in :ids group by f.reclamoId")
    List<CantidadPorReclamo> contarPorReclamo(@Param("ids") Collection<Integer> ids);
}
