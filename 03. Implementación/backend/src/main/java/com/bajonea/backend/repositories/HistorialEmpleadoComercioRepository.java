package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEmpleadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HistorialEmpleadoComercioRepository extends JpaRepository<HistorialEmpleadoComercio, Integer> {

    List<HistorialEmpleadoComercio> findByComercioIdOrderByFechaHoraDescIdDesc(Integer comercioId);

    /**
     * Motivo de la última baja de cada relación dada: la fila de mayor id cuyo destino es {@code INACTIVO} (el id
     * crece en el orden en que se escribe, y toda escritura de una relación va con su fila bloqueada). Las
     * relaciones que quedaron inactivas sin ninguna fila de baja (las del atajo de test sin motivo o cargadas a
     * mano) no aparecen. Una sola consulta para todas las relaciones, nunca una por fila.
     * <p>
     * Es una lectura sin bloqueo: quien decide con ella si se puede reactivar tiene que llamarla con la relación
     * ya bloqueada {@code FOR UPDATE} y sin haber hecho antes ninguna otra lectura simple en la transacción
     * (la primera lectura simple fija la foto de la transacción, y una foto anterior al bloqueo puede no ver
     * una baja o una renuncia que se confirmó mientras se esperaba).
     */
    @Query("""
            SELECT h.empleadoComercio.id AS relacionId, h.motivo AS motivo FROM HistorialEmpleadoComercio h
            WHERE h.empleadoComercio.id IN :relacionIds AND h.estadoDestino = :inactivo
              AND h.id = (SELECT MAX(h2.id) FROM HistorialEmpleadoComercio h2
                          WHERE h2.empleadoComercio.id = h.empleadoComercio.id AND h2.estadoDestino = :inactivo)
            """)
    List<UltimaBaja> findUltimaBajaPorRelacion(@Param("relacionIds") Collection<Integer> relacionIds,
            @Param("inactivo") EstadoEmpleadoComercio inactivo);

    /**
     * Filas del equipo para la actividad del comercio, de la más nueva a la más vieja desde el cursor
     * ({@code fecha < F} o {@code fecha = F} con {@code id <= M}). Trae en la misma consulta el nombre de quien
     * actuó, el Dueño del comercio (para saber si el actor lo es), el nombre del Empleado de la relación y el email
     * de la invitación. No trae las {@code REACTIVACION} que escribe la aceptación de una invitación (llevan
     * {@code invitacion_id}): ese cambio ya figura como la {@code ACEPTACION} de la misma hora, y mostrar las dos
     * sería dos líneas para una sola acción.
     */
    @Query("""
            SELECT new com.bajonea.backend.repositories.FilaActividadEquipo(h.id, h.fechaHora, h.motivo, h.actorUsuarioId,
                   pa.nombre, pa.apellido, c.dueno.id, ec.empleado.id, pe.nombre, pe.apellido, i.id, i.email)
            FROM HistorialEmpleadoComercio h JOIN h.comercio c
                 LEFT JOIN PersonaFisica pa ON pa.id = h.actorUsuarioId
                 LEFT JOIN h.empleadoComercio ec
                 LEFT JOIN PersonaFisica pe ON pe.id = ec.empleado.id
                 LEFT JOIN h.invitacion i
            WHERE h.comercio.id = :comercioId
              AND NOT (h.motivo = :reactivacion AND h.invitacion IS NOT NULL)
              AND (h.fechaHora < :fecha OR (h.fechaHora = :fecha AND h.id <= :idMaximo))
            ORDER BY h.fechaHora DESC, h.id DESC
            """)
    List<FilaActividadEquipo> actividadDelComercioConReactivacion(@Param("comercioId") Integer comercioId,
            @Param("reactivacion") MotivoHistorialEmpleado reactivacion, @Param("fecha") LocalDateTime fecha,
            @Param("idMaximo") Integer idMaximo, Pageable pagina);

    default List<FilaActividadEquipo> actividadDelComercio(Integer comercioId, LocalDateTime fecha, Integer idMaximo, Pageable pagina) {
        return actividadDelComercioConReactivacion(comercioId, MotivoHistorialEmpleado.REACTIVACION, fecha, idMaximo, pagina);
    }

    default List<UltimaBaja> findUltimaBaja(Collection<Integer> relacionIds) {
        return findUltimaBajaPorRelacion(relacionIds, EstadoEmpleadoComercio.INACTIVO);
    }

    interface UltimaBaja {

        Integer getRelacionId();

        MotivoHistorialEmpleado getMotivo();
    }
}
