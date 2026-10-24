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

    List<Pedido> findByEstadoAndSuspensionRetiroExpiraLessThan(EstadoPedido estado, LocalDateTime ahora);

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

    @Query("select p.id from Pedido p where p.estado = :estado and p.suspensionRetiroExpira < :ahora order by p.id")
    List<Integer> findIdsByEstadoAndSuspensionRetiroExpiraLessThan(@Param("estado") EstadoPedido estado,
            @Param("ahora") LocalDateTime ahora);

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

    long countByComercioIdAndEstado(Integer comercioId, EstadoPedido estado);

    @Query("select count(p) > 0 from Pedido p where p.comercio.id = :comercioId and p.estado = :estado "
            + "and p.fechaCreacion < :antesDe")
    boolean existsByComercioIdAndEstadoCreadoAntesDe(@Param("comercioId") Integer comercioId,
            @Param("estado") EstadoPedido estado, @Param("antesDe") LocalDateTime antesDe);
}
