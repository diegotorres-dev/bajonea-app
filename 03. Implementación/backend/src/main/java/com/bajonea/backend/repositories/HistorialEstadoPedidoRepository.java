package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistorialEstadoPedidoRepository extends JpaRepository<HistorialEstadoPedido, Integer> {

    Optional<HistorialEstadoPedido> findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(Integer pedidoId, EstadoPedido estado);

    List<HistorialEstadoPedido> findByPedidoIdOrderByFechaHoraAsc(Integer pedidoId);
}
