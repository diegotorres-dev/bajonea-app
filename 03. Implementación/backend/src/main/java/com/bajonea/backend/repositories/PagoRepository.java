package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Pago;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PagoRepository extends JpaRepository<Pago, Integer> {

    Optional<Pago> findByPedidoId(Integer pedidoId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Pago p where p.pedido.id = :pedidoId")
    Optional<Pago> findByPedidoIdParaActualizar(@Param("pedidoId") Integer pedidoId);
}
