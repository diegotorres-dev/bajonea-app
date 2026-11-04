package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Reclamo;
import com.bajonea.backend.enums.EstadoReclamo;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReclamoRepository extends JpaRepository<Reclamo, Integer> {

    List<Reclamo> findByPedidoIdIn(Collection<Integer> pedidoIds);

    Optional<Reclamo> findByPedidoId(Integer pedidoId);

    long countByEstado(EstadoReclamo estado);

    @Query(value = "SELECT pedido_id FROM reclamo WHERE id = :id", nativeQuery = true)
    Optional<Integer> findPedidoIdById(@Param("id") Integer id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Reclamo r where r.id = :id")
    Optional<Reclamo> findByIdParaActualizar(@Param("id") Integer id);

    interface FilaBandeja {

        Integer getId();

        Integer getPedidoId();

        String getMotivo();

        String getEstado();

        LocalDateTime getFechaCreacion();

        LocalDateTime getFechaResolucion();

        String getTipoResolucion();

        BigDecimal getMontoAprobado();

        Integer getComercioId();

        String getComercioNombre();

        BigDecimal getTotal();

        String getEstadoNota();
    }

    String BANDEJA_BASE = "SELECT r.id AS id, r.pedido_id AS pedidoId, r.motivo AS motivo, r.estado AS estado, "
            + "r.fecha_creacion AS fechaCreacion, r.fecha_resolucion AS fechaResolucion, r.tipo_resolucion AS tipoResolucion, "
            + "r.monto_aprobado AS montoAprobado, c.id AS comercioId, c.nombre AS comercioNombre, p.total AS total, "
            + "n.estado AS estadoNota "
            + "FROM reclamo r JOIN pedido p ON p.id = r.pedido_id JOIN comercio c ON c.id = p.comercio_id "
            + "LEFT JOIN nota_credito n ON n.reclamo_id = r.id ";

    @Query(value = BANDEJA_BASE + "WHERE r.estado = 'PENDIENTE' ORDER BY r.fecha_creacion ASC, r.id ASC", nativeQuery = true)
    List<FilaBandeja> bandejaPendientes(Pageable pageable);

    @Query(value = BANDEJA_BASE + "WHERE r.estado = 'APROBADO' AND COALESCE(n.estado, '') <> 'PROCESADO' "
            + "ORDER BY r.fecha_resolucion ASC, r.id ASC", nativeQuery = true)
    List<FilaBandeja> bandejaReembolsoEnProceso(Pageable pageable);

    @Query(value = BANDEJA_BASE + "WHERE r.estado = 'RECHAZADO' OR (r.estado = 'APROBADO' AND n.estado = 'PROCESADO') "
            + "ORDER BY r.fecha_resolucion DESC, r.id DESC", nativeQuery = true)
    List<FilaBandeja> bandejaResueltos(Pageable pageable);

    interface Contadores {

        Long getPendientes();

        Long getEnProceso();

        Long getResueltos();
    }

    @Query(value = "SELECT COALESCE(SUM(r.estado = 'PENDIENTE'), 0) AS pendientes, "
            + "COALESCE(SUM(r.estado = 'APROBADO' AND COALESCE(n.estado, '') <> 'PROCESADO'), 0) AS enProceso, "
            + "COALESCE(SUM(r.estado = 'RECHAZADO' OR (r.estado = 'APROBADO' AND n.estado = 'PROCESADO')), 0) AS resueltos "
            + "FROM reclamo r LEFT JOIN nota_credito n ON n.reclamo_id = r.id", nativeQuery = true)
    Contadores contarPorFiltro();
}
