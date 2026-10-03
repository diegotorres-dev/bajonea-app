package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialCambioComercio;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface HistorialCambioComercioRepository extends JpaRepository<HistorialCambioComercio, Integer> {

    List<HistorialCambioComercio> findByHistorialEstadoComercioIdOrderByIdAsc(Integer historialEstadoComercioId);

    /**
     * Los cambios de varias re-solicitudes en una sola consulta (bandeja del Administrador), sin una
     * consulta por comercio.
     */
    @Query("SELECT c FROM HistorialCambioComercio c WHERE c.historialEstadoComercio.id IN :historialIds ORDER BY c.id ASC")
    List<HistorialCambioComercio> findByHistorialEstadoComercioIdIn(Collection<Integer> historialIds);
}
