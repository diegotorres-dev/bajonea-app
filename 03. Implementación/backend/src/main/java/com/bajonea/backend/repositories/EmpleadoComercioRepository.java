package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.EmpleadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import jakarta.persistence.LockModeType;
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
}
