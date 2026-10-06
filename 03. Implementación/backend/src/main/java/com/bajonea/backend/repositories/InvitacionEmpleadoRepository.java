package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.InvitacionEmpleado;
import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvitacionEmpleadoRepository extends JpaRepository<InvitacionEmpleado, Integer> {

    /**
     * Vista de solo lectura de una invitación pendiente, sin cargar la entidad: la lectura previa de aceptar y
     * validar no tiene que dejar entidades en el contexto de persistencia, porque la lectura posterior con
     * bloqueo ({@link #findByEmailAndEstadoConBloqueo}) devolvería esa foto en vez del estado confirmado.
     */
    interface InvitacionPendienteVista {

        Integer getId();

        String getCodigo();

        Integer getComercioId();

        Integer getDuenoId();
    }

    @Query("""
            SELECT i.id AS id, i.codigo AS codigo, i.comercio.id AS comercioId, i.comercio.dueno.id AS duenoId
            FROM InvitacionEmpleado i
            WHERE i.email = :email AND i.estado = :estado AND i.fechaVencimiento > :ahora
            ORDER BY i.id ASC
            """)
    List<InvitacionPendienteVista> findVistasVigentesByEmailAndEstado(@Param("email") String email,
            @Param("estado") EstadoInvitacionEmpleado estado, @Param("ahora") LocalDateTime ahora);

    List<InvitacionEmpleado> findByComercioIdAndEmailAndEstado(Integer comercioId, String email, EstadoInvitacionEmpleado estado);

    List<InvitacionEmpleado> findByComercioIdAndEstadoInOrderByFechaCreacionDescIdDesc(Integer comercioId,
            Collection<EstadoInvitacionEmpleado> estados);

    /**
     * Cantidad de envíos del comercio posteriores a {@code desde}, en cualquier estado: cada envío es una fila,
     * así que el tope por hora cuenta también los reenvíos y las invitaciones ya reemplazadas o canceladas.
     */
    long countByComercioIdAndFechaCreacionAfter(Integer comercioId, LocalDateTime desde);

    Optional<InvitacionEmpleado> findFirstByComercioIdAndFechaCreacionAfterOrderByFechaCreacionAscIdAsc(Integer comercioId,
            LocalDateTime desde);

    /**
     * {@code SELECT ... FOR UPDATE} de la invitación de un comercio. Para otro comercio o un id inexistente
     * devuelve vacío: el llamador responde el mismo {@code 404} en ambos casos.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM InvitacionEmpleado i WHERE i.id = :id AND i.comercio.id = :comercioId")
    Optional<InvitacionEmpleado> findByIdAndComercioIdConBloqueo(@Param("id") Integer id, @Param("comercioId") Integer comercioId);

    /**
     * Invitaciones del par comercio y email en el estado indicado, con bloqueo de escritura: sirven para
     * materializar las vencidas y detectar una vigente sin carrera contra otra invitación o reenvío del par.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM InvitacionEmpleado i WHERE i.comercio.id = :comercioId AND i.email = :email AND i.estado = :estado")
    List<InvitacionEmpleado> findByComercioIdAndEmailAndEstadoConBloqueo(@Param("comercioId") Integer comercioId,
            @Param("email") String email, @Param("estado") EstadoInvitacionEmpleado estado);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM InvitacionEmpleado i WHERE i.email = :email AND i.estado = :estado ORDER BY i.id ASC")
    List<InvitacionEmpleado> findByEmailAndEstadoConBloqueo(@Param("email") String email, @Param("estado") EstadoInvitacionEmpleado estado);
}
