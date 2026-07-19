package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.DetallePedido;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DetallePedidoRepository extends JpaRepository<DetallePedido, Integer> {

    List<DetallePedido> findByPedidoId(Integer pedidoId);
}
