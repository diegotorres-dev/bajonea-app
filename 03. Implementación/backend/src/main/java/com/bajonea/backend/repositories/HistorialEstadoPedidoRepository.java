package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HistorialEstadoPedidoRepository extends JpaRepository<HistorialEstadoPedido, Integer> {

    Optional<HistorialEstadoPedido> findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(Integer pedidoId, EstadoPedido estado);

    List<HistorialEstadoPedido> findByPedidoIdOrderByFechaHoraAsc(Integer pedidoId);

    @Query("select h.pedido.id, min(h.fechaHora) from HistorialEstadoPedido h "
            + "where h.pedido.id in :pedidoIds and h.estado = :estado group by h.pedido.id")
    List<Object[]> findPrimeraEntradaAEstadoPorPedido(@Param("pedidoIds") List<Integer> pedidoIds, @Param("estado") EstadoPedido estado);
}
