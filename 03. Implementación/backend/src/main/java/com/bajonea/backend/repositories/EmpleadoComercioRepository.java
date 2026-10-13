package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.EmpleadoComercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmpleadoComercioRepository extends JpaRepository<EmpleadoComercio, Integer> {

    boolean existsByEmpleadoIdAndComercioIdAndEstado(Integer empleadoId, Integer comercioId, EstadoEmpleadoComercio estado);

    Optional<EmpleadoComercio> findByEmpleadoIdAndComercioId(Integer empleadoId, Integer comercioId);

    /**
     * {@code SELECT ... FOR UPDATE} sobre la relación de un empleado con un comercio. Orden de bloqueo:
     * {@code usuario}, {@code invitacion_empleado}, {@code empleado_comercio}, {@code comercio}.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT ec FROM EmpleadoComercio ec WHERE ec.empleado.id = :empleadoId AND ec.comercio.id = :comercioId")
    Optional<EmpleadoComercio> findByEmpleadoIdAndComercioIdConBloqueo(@Param("empleadoId") Integer empleadoId,
            @Param("comercioId") Integer comercioId);

    /**
     * Estado de la relación leído con {@code LOCK IN SHARE MODE} (lo último confirmado, y la desactivación, que la
     * toma {@code FOR UPDATE}, espera hasta que termine la transacción de quien lee). Consulta nativa porque
     * MariaDB 10.4 no entiende el {@code FOR SHARE} que genera Hibernate. Lo usa la revalidación de cada escritura
     * delegada; en el orden de bloqueo va después de los usuarios y antes del comercio.
     */
    @Query(value = "SELECT estado FROM empleado_comercio WHERE empleado_id = :empleadoId AND comercio_id = :comercioId LOCK IN SHARE MODE",
            nativeQuery = true)
    Optional<String> leerEstadoConBloqueoCompartido(@Param("empleadoId") Integer empleadoId, @Param("comercioId") Integer comercioId);

    /**
     * Equipo de un comercio con los datos de cada empleado en una sola consulta: nombre y apellido salen de su
     * persona física y email y foto de su usuario. Orden estable por fecha de alta.
     */
    @Query("""
            SELECT ec FROM EmpleadoComercio ec
            JOIN FETCH ec.empleado e
            JOIN FETCH e.personaFisica pf
            JOIN FETCH pf.persona p
            JOIN FETCH p.usuario u
            WHERE ec.comercio.id = :comercioId
            ORDER BY ec.fechaAlta ASC, ec.id ASC
            """)
    List<EmpleadoComercio> findEquipoByComercioId(@Param("comercioId") Integer comercioId);

    /**
     * El comercio, solo si el empleado tiene con él una relación en el estado indicado y el comercio está en
     * alguno de los estados dados. Una sola lectura, sin bloqueo: la usa el resolver de comercio activo.
     */
    @Query("""
            SELECT c FROM EmpleadoComercio ec
            JOIN ec.comercio c
            WHERE ec.empleado.id = :empleadoId
              AND c.id = :comercioId
              AND ec.estado = :estadoRelacion
              AND c.estado IN :estadosComercio
            """)
    Optional<Comercio> findComercioAccesible(@Param("empleadoId") Integer empleadoId, @Param("comercioId") Integer comercioId,
            @Param("estadoRelacion") EstadoEmpleadoComercio estadoRelacion,
            @Param("estadosComercio") Collection<EstadoComercio> estadosComercio);

    /**
     * Relaciones activas del empleado con el comercio ya cargado (un solo JOIN, sin N+1), solo con comercios en
     * alguno de los estados dados, por fecha de alta e id.
     */
    @Query("""
            SELECT ec FROM EmpleadoComercio ec
            JOIN FETCH ec.comercio c
            WHERE ec.empleado.id = :empleadoId
              AND ec.estado = :estadoRelacion
              AND c.estado IN :estadosComercio
            ORDER BY ec.fechaAlta ASC, ec.id ASC
            """)
    List<EmpleadoComercio> findAccesiblesDelEmpleado(@Param("empleadoId") Integer empleadoId,
            @Param("estadoRelacion") EstadoEmpleadoComercio estadoRelacion,
            @Param("estadosComercio") Collection<EstadoComercio> estadosComercio);
}
