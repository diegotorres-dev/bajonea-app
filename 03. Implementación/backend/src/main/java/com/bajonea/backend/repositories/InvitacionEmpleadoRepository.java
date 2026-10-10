package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.InvitacionEmpleado;
import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvitacionEmpleadoRepository extends JpaRepository<InvitacionEmpleado, Integer> {

    /**
     * Vista de solo lectura de una invitación pendiente, sin cargar la entidad: la lectura previa de aceptar y
     * validar no tiene que dejar entidades en el contexto de persistencia, porque la lectura posterior con
     * bloqueo ({@link #findByIdInConBloqueo}) devolvería esa foto en vez del estado confirmado.
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

    /**
     * La invitación más reciente de cada email del comercio, si está en alguno de los estados indicados: es lo
     * que lista la pestaña Solicitudes de "Ver equipo", una línea por email. Si la última de un email es
     * {@code CANCELADA}, {@code REEMPLAZADA} o {@code ACEPTADA} ese email no aparece en la lista.
     */
    @Query("""
            SELECT i FROM InvitacionEmpleado i
            WHERE i.comercio.id = :comercioId AND i.estado IN :estados
              AND i.id = (SELECT MAX(j.id) FROM InvitacionEmpleado j WHERE j.comercio.id = :comercioId AND j.email = i.email)
            ORDER BY i.fechaCreacion DESC, i.id DESC
            """)
    List<InvitacionEmpleado> findUltimaPorEmailEnEstados(@Param("comercioId") Integer comercioId,
            @Param("estados") Collection<EstadoInvitacionEmpleado> estados);

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

    @Query("SELECT i.id FROM InvitacionEmpleado i WHERE i.comercio.id = :comercioId AND i.email = :email AND i.estado = :estado ORDER BY i.id ASC")
    List<Integer> findIdsByComercioIdAndEmailAndEstado(@Param("comercioId") Integer comercioId, @Param("email") String email,
            @Param("estado") EstadoInvitacionEmpleado estado);

    /**
     * Invitaciones del par comercio y email en el estado indicado, con bloqueo de escritura: sirven para
     * materializar las vencidas y detectar una vigente sin carrera contra otra invitación o reenvío del par.
     * Se leen primero los ids sin bloqueo y se bloquea por clave primaria ({@link #findByIdInConBloqueo}), igual
     * que {@code validar} y {@code aceptar}: un {@code SELECT ... FOR UPDATE} por el rango del índice único
     * toma el índice antes que la clave primaria y se interbloquea con el {@code UPDATE} de un código erróneo
     * que invalida la invitación (clave primaria primero, índice después). El estado se vuelve a comprobar con la
     * fila ya bloqueada. No hay riesgo de fila nueva en el medio: solo invitar y reenviar crean invitaciones del
     * par y ambos arrancan bloqueando la fila del Dueño.
     */
    default List<InvitacionEmpleado> findByComercioIdAndEmailAndEstadoConBloqueo(Integer comercioId, String email,
            EstadoInvitacionEmpleado estado) {
        List<Integer> ids = findIdsByComercioIdAndEmailAndEstado(comercioId, email, estado);
        if (ids.isEmpty()) {
            return List.of();
        }
        return findByIdInConBloqueo(ids).stream().filter(invitacion -> invitacion.getEstado() == estado).toList();
    }

    /**
     * Bloquea por clave primaria, en id ascendente, las invitaciones indicadas. Es la lectura con bloqueo de
     * {@code validar} y {@code aceptar}: se bloquea por clave y no por el rango (email, estado) porque ese
     * {@code SELECT ... FOR UPDATE} toma bloqueos de siguiente clave y de hueco sobre los índices únicos
     * parciales de {@code V30}, y el {@code UPDATE} que pasa una invitación a {@code INVALIDADA} o
     * {@code ACEPTADA} mueve su entrada en esos mismos índices (la columna generada {@code pendiente_clave}
     * pasa a {@code NULL}): dos transacciones sobre el mismo email se interbloqueaban. Con bloqueos de
     * registro por clave primaria la segunda transacción solo espera, sin retener ningún hueco.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM InvitacionEmpleado i WHERE i.id IN :ids ORDER BY i.id ASC")
    List<InvitacionEmpleado> findByIdInConBloqueo(@Param("ids") Collection<Integer> ids);

    /**
     * Ids, en orden ascendente, de las invitaciones en el estado indicado cuya fecha de vencimiento ya pasó
     * ({@code fecha_vencimiento <= ahora}, el complemento exacto de "vigente" en el servicio). Lectura sin
     * bloqueo: el proceso de vencimiento no toma el índice por rango, solo después fija las filas por clave
     * primaria en {@link #marcarVencidas}.
     */
    @Query("""
            SELECT i.id FROM InvitacionEmpleado i
            WHERE i.estado = :estado AND i.fechaVencimiento <= :ahora
            ORDER BY i.id ASC
            """)
    List<Integer> findIdsVencidasByEstado(@Param("estado") EstadoInvitacionEmpleado estado,
            @Param("ahora") LocalDateTime ahora, Pageable pageable);

    /**
     * Un único {@code UPDATE} por lote: pasa a {@code destino} las invitaciones de {@code ids} que siguen en
     * {@code origen} y siguen vencidas, con {@code fecha_resolucion = fecha_vencimiento}. Los filtros de estado y
     * de fecha se repiten en el {@code UPDATE} (que es una lectura actual): si otra transacción aceptó, canceló,
     * reemplazó o invalidó una fila en el medio, el {@code UPDATE} la salta. Es idempotente: una segunda
     * corrida, o la de otra instancia, no encuentra nada que cambiar.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE InvitacionEmpleado i
            SET i.estado = :destino, i.fechaResolucion = i.fechaVencimiento
            WHERE i.id IN :ids AND i.estado = :origen AND i.fechaVencimiento <= :ahora
            """)
    int marcarVencidas(@Param("ids") Collection<Integer> ids, @Param("origen") EstadoInvitacionEmpleado origen,
            @Param("destino") EstadoInvitacionEmpleado destino, @Param("ahora") LocalDateTime ahora);
}
