package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoPedido;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PedidoRepository extends JpaRepository<Pedido, Integer> {

    List<Pedido> findByComercioIdAndEstado(Integer comercioId, EstadoPedido estado);

    List<Pedido> findByClienteId(Integer clienteId);

    List<Pedido> findByComercioId(Integer comercioId);
}
