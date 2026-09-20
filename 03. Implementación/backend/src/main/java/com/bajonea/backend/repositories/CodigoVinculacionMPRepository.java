package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.CodigoVinculacionMP;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface CodigoVinculacionMPRepository extends JpaRepository<CodigoVinculacionMP, Integer> {

    Optional<CodigoVinculacionMP> findByIdentificadorIntentoAndUsadoFalse(String identificadorIntento);

    @Modifying
    @Query("DELETE FROM CodigoVinculacionMP c WHERE c.dueno.id = :duenoId AND c.usado = false")
    void eliminarIntentosPendientesDelDueno(Integer duenoId);
}
