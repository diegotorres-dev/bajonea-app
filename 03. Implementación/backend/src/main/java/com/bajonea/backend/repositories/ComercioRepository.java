package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ComercioRepository extends JpaRepository<Comercio, Integer> {

    List<Comercio> findByEstado(EstadoComercio estado);

    List<Comercio> findByEstadoIn(List<EstadoComercio> estados);

    List<Comercio> findByDuenoIdOrderByFechaRegistroAscIdAsc(Integer duenoId);

    Optional<Comercio> findByIdAndDuenoId(Integer id, Integer duenoId);

    boolean existsByDuenoIdAndEstadoIn(Integer duenoId, Collection<EstadoComercio> estados);

    long countByDuenoId(Integer duenoId);

    long countByDuenoIdAndEstadoNot(Integer duenoId, EstadoComercio estado);

    /**
     * Solicitudes nuevas ({@code cantidadResolicitudes = 0}) o re-solicitudes ({@code > 0}) en el estado
     * indicado: la bandeja del Administrador las muestra por separado.
     */
    List<Comercio> findByEstadoAndCantidadResolicitudes(EstadoComercio estado, int cantidadResolicitudes);

    List<Comercio> findByEstadoAndCantidadResolicitudesGreaterThan(EstadoComercio estado, int cantidadResolicitudes);

    long countByEstadoAndCantidadResolicitudes(EstadoComercio estado, int cantidadResolicitudes);

    long countByEstadoAndCantidadResolicitudesGreaterThan(EstadoComercio estado, int cantidadResolicitudes);

    /**
     * Solo el id del Dueño, con una consulta escalar que no carga la entidad ni toma ningún bloqueo. La
     * resolución del Administrador la usa para llegar al orden de bloqueo {@code cuenta_mercado_pago} y
     * después {@code comercio}, sin haber leído antes (con una lectura común, que en {@code REPEATABLE READ}
     * congela una foto) el comercio que va a bloquear.
     */
    @Query("SELECT c.dueno.id FROM Comercio c WHERE c.id = :id")
    Optional<Integer> findDuenoIdById(Integer id);

    /**
     * {@code SELECT ... FOR UPDATE} sobre un comercio. Orden de bloqueo general: {@code dueno} →
     * {@code cuenta_mercado_pago} → {@code comercio} → tablas hijas (ver docs/APRENDIZAJES-TECNICOS.md).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Comercio c WHERE c.id = :id")
    Optional<Comercio> findByIdConBloqueo(Integer id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Comercio c WHERE c.id = :id AND c.dueno.id = :duenoId")
    Optional<Comercio> findByIdAndDuenoIdConBloqueo(Integer id, Integer duenoId);

    /**
     * Una sola consulta para todos los Dueños de un listado (bandeja de pendientes del Administrador):
     * evita una consulta por comercio pendiente.
     */
    List<Comercio> findByDuenoIdIn(Collection<Integer> duenoIds);

    /**
     * Lectura con {@code SELECT ... FOR UPDATE}: a diferencia de una lectura común, en
     * {@code REPEATABLE READ} ve siempre lo último confirmado y no la foto de la transacción. Usada por
     * las transiciones automáticas de Mercado Pago ({@code activarAptoVenta}/{@code desactivarAptoVenta}),
     * que tienen que ver un comercio que el Administrador acaba de aprobar aunque esa aprobación se haya
     * confirmado después de que la transacción de la vinculación empezara. Mismo orden de bloqueo que la
     * aprobación: primero {@code cuenta_mercado_pago}, después {@code comercio}.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Comercio c WHERE c.dueno.id = :duenoId ORDER BY c.fechaRegistro ASC, c.id ASC")
    List<Comercio> findByDuenoIdConBloqueo(Integer duenoId);

    /**
     * El estado actual del comercio leído con bloqueo compartido: devuelve el último estado confirmado
     * (nunca la foto de {@code REPEATABLE READ}) y mantiene el comercio bloqueado contra escritura hasta el
     * commit. Lo usa la creación de un pedido para revalidar {@code APTO_VENTA} sin carrera con la
     * desvinculación de Mercado Pago. Consulta nativa con {@code LOCK IN SHARE MODE} por la misma razón que
     * {@code PedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido}.
     */
    @Query(value = "SELECT estado FROM comercio WHERE id = :id LOCK IN SHARE MODE", nativeQuery = true)
    Optional<String> leerEstadoConBloqueoCompartido(@Param("id") Integer id);
}
