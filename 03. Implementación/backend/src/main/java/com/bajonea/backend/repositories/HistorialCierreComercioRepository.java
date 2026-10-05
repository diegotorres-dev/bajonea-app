package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialCierreComercio;
import com.bajonea.backend.enums.AccionCierre;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistorialCierreComercioRepository extends JpaRepository<HistorialCierreComercio, Integer> {

    /**
     * Última fila de la acción indicada del comercio. Con {@code CERRADO} es el momento del cierre manual
     * vigente. Desempata por id: la columna es {@code datetime} sin fracciones.
     */
    Optional<HistorialCierreComercio> findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc(Integer comercioId, AccionCierre accion);
}
