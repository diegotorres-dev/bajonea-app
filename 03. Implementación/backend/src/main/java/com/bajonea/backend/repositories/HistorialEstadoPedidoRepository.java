package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.EstadoPedido;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HistorialEstadoPedidoRepository extends JpaRepository<HistorialEstadoPedido, Integer> {

    Optional<HistorialEstadoPedido> findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(Integer pedidoId, EstadoPedido estado);

    List<HistorialEstadoPedido> findByPedidoIdOrderByFechaHoraAsc(Integer pedidoId);

    @Query("select h.pedido.id, min(h.fechaHora) from HistorialEstadoPedido h "
            + "where h.pedido.id in :pedidoIds and h.estado = :estado group by h.pedido.id")
    List<Object[]> findPrimeraEntradaAEstadoPorPedido(@Param("pedidoIds") List<Integer> pedidoIds, @Param("estado") EstadoPedido estado);

    /**
     * Transiciones de los pedidos del comercio hechas por sus actores ({@code roles}: Dueño y Empleado), para la
     * actividad, de la más nueva a la más vieja desde el cursor ({@code fecha < F} o {@code fecha = F} con
     * {@code id <= M}). Se llega por {@code pedido.comercio_id} (índice {@code idx_pedido_comercio}) y de ahí a
     * {@code idx_hep_pedido_fecha}; el nombre del actor sale de {@code persona_fisica} en la misma consulta.
     */
    @Query("""
            SELECT new com.bajonea.backend.repositories.FilaActividadPedido(h.id, h.fechaHora, h.actorUsuario.id, h.actorRol,
                   pf.nombre, pf.apellido, p.id, h.estado)
            FROM HistorialEstadoPedido h JOIN h.pedido p LEFT JOIN PersonaFisica pf ON pf.id = h.actorUsuario.id
            WHERE p.comercio.id = :comercioId AND h.actorRol IN :roles
              AND (h.fechaHora < :fecha OR (h.fechaHora = :fecha AND h.id <= :idMaximo))
            ORDER BY h.fechaHora DESC, h.id DESC
            """)
    List<FilaActividadPedido> actividadDelComercio(@Param("comercioId") Integer comercioId, @Param("roles") List<ActorPedido> roles,
            @Param("fecha") LocalDateTime fecha, @Param("idMaximo") Integer idMaximo, Pageable pagina);
}
