package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoPedido;
import java.time.LocalDateTime;
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
}
