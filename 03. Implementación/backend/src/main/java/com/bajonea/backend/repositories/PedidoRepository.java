package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoRechazo;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PedidoRepository extends JpaRepository<Pedido, Integer> {

    List<Pedido> findByComercioIdAndEstado(Integer comercioId, EstadoPedido estado);

    List<Pedido> findByClienteId(Integer clienteId);

    List<Pedido> findByComercioId(Integer comercioId);

    List<Pedido> findByComercioIdAndFechaCreacionBetween(Integer comercioId, LocalDateTime inicio, LocalDateTime fin);

    List<Pedido> findByEstado(EstadoPedido estado);

    List<Pedido> findByEstadoAndFechaCreacionBefore(EstadoPedido estado, LocalDateTime corte);

    List<Pedido> findByEstadoAndPrimerAvisoEmitidoFalse(EstadoPedido estado);


    List<Pedido> findByComercioIdAndEstadoIn(Integer comercioId, List<EstadoPedido> estados);

    @Query("select p.cliente.id as clienteId, p.comercio.dueno.id as duenoId, p.comercio.id as comercioId from Pedido p where p.id = :pedidoId")
    Optional<ParticipantesPedido> findParticipantesById(@Param("pedidoId") Integer pedidoId);

    interface ParticipantesPedido {

        Integer getClienteId();

        Integer getDuenoId();

        Integer getComercioId();
    }

    @Query("select p.id from Pedido p where p.estado = :estado order by p.id")
    List<Integer> findIdsByEstado(@Param("estado") EstadoPedido estado);

    @Query("select p.id from Pedido p where p.estado = :estado and p.fechaCreacion < :corte order by p.id")
    List<Integer> findIdsByEstadoAndFechaCreacionBefore(@Param("estado") EstadoPedido estado, @Param("corte") LocalDateTime corte);

    /**
     * Ids de los pedidos en el estado dado cuyo comercio está {@code SUSPENDIDO} desde antes de {@code corte}: la
     * base de los dos topes de la suspensión. Es solo el filtro grueso (sin bloqueo); cada pedido se vuelve a validar
     * con el comercio y el pedido bloqueados.
     */
    @Query("select p.id from Pedido p where p.estado = :estado and p.comercio.estado = "
            + "com.bajonea.backend.enums.EstadoComercio.SUSPENDIDO and p.comercio.suspendidoDesde <= :corte order by p.id")
    List<Integer> findIdsDeComerciosSuspendidosDesde(@Param("estado") EstadoPedido estado, @Param("corte") LocalDateTime corte);

    /** Filtro grueso del barrido de la suspensión: cada pedido se vuelve a validar con el comercio y el pedido bloqueados. */
    @Query("select p.id from Pedido p where p.estado = :estado and p.comercio.estado = "
            + "com.bajonea.backend.enums.EstadoComercio.SUSPENDIDO order by p.id")
    List<Integer> findIdsDeComerciosSuspendidos(@Param("estado") EstadoPedido estado);

    /**
     * Filtro grueso del barrido de "sin atención": pedidos en los estados dados de comercios {@code SUSPENDIDO} cuyo
     * Dueño tiene la cuenta {@code SUSPENDIDO}. Cada pedido se vuelve a validar con todo bloqueado.
     */
    @Query("select p.id from Pedido p where p.estado in :estados and p.comercio.estado = "
            + "com.bajonea.backend.enums.EstadoComercio.SUSPENDIDO and exists (select u.id from Usuario u "
            + "where u.id = p.comercio.dueno.id and u.estado = com.bajonea.backend.enums.EstadoUsuario.SUSPENDIDO) order by p.id")
    List<Integer> findIdsDeComerciosSuspendidosConDuenoSuspendido(@Param("estados") Collection<EstadoPedido> estados);

    /** Cantidad de pedidos por comercio y estado: cada fila es {@code [comercioId, estado, cantidad]}. */
    @Query("select p.comercio.id, p.estado, count(p) from Pedido p where p.comercio.id in :comercioIds "
            + "and p.estado in :estados group by p.comercio.id, p.estado")
    List<Object[]> contarPorComercioYEstado(@Param("comercioIds") Collection<Integer> comercioIds,
            @Param("estados") Collection<EstadoPedido> estados);

    long countByComercioIdAndEstadoIn(Integer comercioId, Collection<EstadoPedido> estados);

    @Query("select p.id from Pedido p where p.comercio.id = :comercioId and p.estado in :estados order by p.id")
    List<Integer> findIdsByComercioIdAndEstadoIn(@Param("comercioId") Integer comercioId,
            @Param("estados") Collection<EstadoPedido> estados);


    @Query("select p from Pedido p where p.comercio.id = :comercioId and exists ("
            + "select 1 from HistorialEstadoPedido h where h.pedido = p and h.estado = "
            + "com.bajonea.backend.enums.EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)")
    List<Pedido> findLlegadosPagadosByComercioId(@Param("comercioId") Integer comercioId);

    @Query("select case when count(p) > 0 then true else false end from Pedido p where p.id = :pedidoId and exists ("
            + "select 1 from HistorialEstadoPedido h where h.pedido = p and h.estado = "
            + "com.bajonea.backend.enums.EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)")
    boolean llegoPagado(@Param("pedidoId") Integer pedidoId);

    /**
     * Datos del pedido que necesita la trazabilidad, en una sola lectura que además valida que el pedido sea del
     * comercio y que haya llegado pagado (si no, vacío). Proyección: no carga la entidad.
     */
    @Query("select p.id as id, p.cliente.id as clienteId, p.motivoRechazo as motivoRechazo, "
            + "p.comentarioRechazo as comentarioRechazo, p.motivo as motivo from Pedido p "
            + "where p.id = :pedidoId and p.comercio.id = :comercioId and exists ("
            + "select 1 from HistorialEstadoPedido h where h.pedido = p and h.estado = "
            + "com.bajonea.backend.enums.EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)")
    Optional<DatosTrazabilidadPedido> findDatosTrazabilidad(@Param("pedidoId") Integer pedidoId,
            @Param("comercioId") Integer comercioId);

    interface DatosTrazabilidadPedido {

        Integer getId();

        Integer getClienteId();

        MotivoRechazo getMotivoRechazo();

        String getComentarioRechazo();

        String getMotivo();
    }

    /**
     * Los pedidos {@code PENDIENTE_PAGO} de los comercios indicados, leídos con bloqueo compartido: trae las
     * filas (no un conteo) porque un {@code COUNT} común vería la foto vieja de {@code REPEATABLE READ}, y las
     * bloquea para que ningún webhook ni vencimiento las cambie mientras la desvinculación decide. Tercer
     * paso del orden de bloqueo de la desvinculación (cuenta, comercios, pedidos).
     *
     * <p>Consulta nativa con {@code LOCK IN SHARE MODE} y no {@code @Lock(PESSIMISTIC_READ)}: Hibernate
     * genera {@code FOR SHARE}, que MariaDB 10.4 (el motor local) no entiende, y {@code LOCK IN SHARE MODE}
     * lo aceptan MariaDB y MySQL.
     */
    @Query(value = "SELECT id AS id, fecha_creacion AS fechaCreacion FROM pedido "
            + "WHERE comercio_id IN (:comercioIds) AND estado = 'PENDIENTE_PAGO' LOCK IN SHARE MODE", nativeQuery = true)
    List<PagoPendienteBloqueado> findPendientesPagoDeComerciosConBloqueoCompartido(
            @Param("comercioIds") Collection<Integer> comercioIds);

    interface PagoPendienteBloqueado {

        Integer getId();

        LocalDateTime getFechaCreacion();
    }

    /**
     * Cantidad de pedidos por comercio y estado, y la fecha de creación más reciente, de todos los comercios de
     * un Dueño, solo para los estados indicados. Una sola consulta agrupada: cada fila es
     * {@code [comercioId, estado, cantidad, fechaCreacionMasReciente]}.
     */
    @Query("select p.comercio.id, p.estado, count(p), max(p.fechaCreacion) from Pedido p "
            + "where p.comercio.dueno.id = :duenoId and p.estado in :estados group by p.comercio.id, p.estado")
    List<Object[]> contarPorComercioYEstadoDeDueno(@Param("duenoId") Integer duenoId,
            @Param("estados") Collection<EstadoPedido> estados);

    interface AgregadoDeTurno {
        Long getCantidad();

        BigDecimal getVendido();

        BigDecimal getComision();
    }

    @Query("select count(p) as cantidad, "
            + "sum(case when p.estado in :facturables then p.subtotal end) as vendido, "
            + "sum(case when p.estado in :facturables then p.cargoServicioComercio end) as comision "
            + "from Pedido p where p.comercio.id = :comercioId and p.turnoFecha = :turnoFecha "
            + "and p.turnoHorarioId = :turnoHorarioId")
    AgregadoDeTurno agregarTurno(@Param("comercioId") Integer comercioId, @Param("turnoFecha") LocalDate turnoFecha,
            @Param("turnoHorarioId") Integer turnoHorarioId, @Param("facturables") Collection<EstadoPedido> facturables);

    interface FilaEstadisticaTurno {
        java.sql.Date getTurnoFecha();

        Integer getTurnoHorarioId();

        String getEstado();

        Long getCantidad();

        BigDecimal getSubtotal();

        BigDecimal getComision();
    }

    interface FilaEstadisticaSinTurno {
        java.sql.Date getDia();

        String getEstado();

        Long getCantidad();

        BigDecimal getSubtotal();

        BigDecimal getComision();
    }

    @Query(value = "SELECT turno_fecha AS turnoFecha, turno_horario_id AS turnoHorarioId, estado AS estado, "
            + "COUNT(*) AS cantidad, SUM(subtotal) AS subtotal, SUM(cargo_servicio_comercio) AS comision "
            + "FROM pedido WHERE comercio_id = :comercioId AND turno_fecha BETWEEN :desde AND :hasta "
            + "GROUP BY turno_fecha, turno_horario_id, estado", nativeQuery = true)
    List<FilaEstadisticaTurno> estadisticasPorTurno(@Param("comercioId") Integer comercioId, @Param("desde") LocalDate desde,
            @Param("hasta") LocalDate hasta);

    @Query(value = "SELECT DATE(fecha_pago_confirmado) AS dia, estado AS estado, "
            + "COUNT(*) AS cantidad, SUM(subtotal) AS subtotal, SUM(cargo_servicio_comercio) AS comision "
            + "FROM pedido WHERE comercio_id = :comercioId AND turno_fecha IS NULL "
            + "AND fecha_pago_confirmado >= :desde AND fecha_pago_confirmado < :hastaExclusivo "
            + "GROUP BY DATE(fecha_pago_confirmado), estado", nativeQuery = true)
    List<FilaEstadisticaSinTurno> estadisticasSinTurno(@Param("comercioId") Integer comercioId,
            @Param("desde") LocalDateTime desde, @Param("hastaExclusivo") LocalDateTime hastaExclusivo);

    long countByComercioIdAndEstado(Integer comercioId, EstadoPedido estado);

    @Query("select p.id from Pedido p where p.cliente.id = :clienteId and p.estado = :estado order by p.id")
    List<Integer> findIdsByClienteIdAndEstado(@Param("clienteId") Integer clienteId, @Param("estado") EstadoPedido estado);

    long countByClienteIdAndEstadoIn(Integer clienteId, Collection<EstadoPedido> estados);

    @Query("select count(p) > 0 from Pedido p where p.comercio.id = :comercioId and p.estado = :estado "
            + "and p.fechaCreacion < :antesDe")
    boolean existsByComercioIdAndEstadoCreadoAntesDe(@Param("comercioId") Integer comercioId,
            @Param("estado") EstadoPedido estado, @Param("antesDe") LocalDateTime antesDe);
}
