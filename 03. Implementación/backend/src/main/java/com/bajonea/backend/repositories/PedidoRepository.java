package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoPedido;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
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

    @Query("select p from Pedido p where p.comercio.id = :comercioId and exists ("
            + "select 1 from HistorialEstadoPedido h where h.pedido = p and h.estado = "
            + "com.bajonea.backend.enums.EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)")
    List<Pedido> findLlegadosPagadosByComercioId(@Param("comercioId") Integer comercioId);

    @Query("select case when count(p) > 0 then true else false end from Pedido p where p.id = :pedidoId and exists ("
            + "select 1 from HistorialEstadoPedido h where h.pedido = p and h.estado = "
            + "com.bajonea.backend.enums.EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)")
    boolean llegoPagado(@Param("pedidoId") Integer pedidoId);

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
}
