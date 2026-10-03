package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.enums.EstadoNotaCredito;
import java.util.Collection;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotaCreditoRepository extends JpaRepository<NotaCredito, Integer> {

    List<NotaCredito> findByPagoId(Integer pagoId);

    List<NotaCredito> findByPagoPedidoIdIn(Collection<Integer> pedidoIds);

    List<NotaCredito> findByEstado(EstadoNotaCredito estado);

    List<NotaCredito> findByEstadoInOrderByFechaEmisionDesc(Collection<EstadoNotaCredito> estados);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select n from NotaCredito n where n.id = :id")
    Optional<NotaCredito> findByIdParaActualizar(@Param("id") Integer id);
}
