package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialCierreComercio;
import com.bajonea.backend.enums.AccionCierre;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HistorialCierreComercioRepository extends JpaRepository<HistorialCierreComercio, Integer> {

    /**
     * Última fila de la acción indicada del comercio. Con {@code CERRADO} es el momento del cierre manual
     * vigente. Desempata por id: la columna es {@code datetime} sin fracciones.
     */
    Optional<HistorialCierreComercio> findTopByComercioIdAndAccionOrderByFechaHoraDescIdDesc(Integer comercioId, AccionCierre accion);

    /**
     * Cierres y reaperturas del comercio para la actividad (todas las filas, también las del sistema), de la más
     * nueva a la más vieja desde el cursor ({@code fecha < F} o {@code fecha = F} con {@code id <= M}). El nombre
     * del actor sale de {@code persona_fisica}; en las filas del sistema es nulo.
     */
    @Query("""
            SELECT new com.bajonea.backend.repositories.FilaActividadCierre(h.id, h.fechaHora, h.actorUsuarioId, h.actorRol,
                   pf.nombre, pf.apellido, h.accion)
            FROM HistorialCierreComercio h LEFT JOIN PersonaFisica pf ON pf.id = h.actorUsuarioId
            WHERE h.comercio.id = :comercioId
              AND (h.fechaHora < :fecha OR (h.fechaHora = :fecha AND h.id <= :idMaximo))
            ORDER BY h.fechaHora DESC, h.id DESC
            """)
    List<FilaActividadCierre> actividadDelComercio(@Param("comercioId") Integer comercioId, @Param("fecha") LocalDateTime fecha,
            @Param("idMaximo") Integer idMaximo, Pageable pagina);
}
