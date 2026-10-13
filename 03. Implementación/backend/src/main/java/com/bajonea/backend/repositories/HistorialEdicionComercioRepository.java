package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEdicionComercio;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HistorialEdicionComercioRepository extends JpaRepository<HistorialEdicionComercio, Integer> {

    /**
     * Filas de actividad del comercio más recientes que el cursor ({@code fecha < F} o {@code fecha = F} con
     * {@code id <= M}), de la más nueva a la más vieja. El nombre del actor sale de {@code persona_fisica} (misma
     * clave que {@code usuario}) en la misma consulta. Con {@code Pageable} se pide un tamaño de página y nada más.
     */
    @Query("""
            SELECT new com.bajonea.backend.repositories.FilaActividadEdicion(h.id, h.fechaHora, h.usuarioId, h.actorRol,
                   pf.nombre, pf.apellido, h.entidadTipo, h.entidadId, h.entidadNombre, h.accion, h.detalle)
            FROM HistorialEdicionComercio h LEFT JOIN PersonaFisica pf ON pf.id = h.usuarioId
            WHERE h.comercio.id = :comercioId
              AND (h.fechaHora < :fecha OR (h.fechaHora = :fecha AND h.id <= :idMaximo))
            ORDER BY h.fechaHora DESC, h.id DESC
            """)
    List<FilaActividadEdicion> actividadDelComercio(@Param("comercioId") Integer comercioId, @Param("fecha") LocalDateTime fecha,
            @Param("idMaximo") Integer idMaximo, Pageable pagina);
}
