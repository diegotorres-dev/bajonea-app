package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Notificacion;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificacionRepository extends JpaRepository<Notificacion, Integer> {

    List<Notificacion> findByUsuarioIdOrderByFechaCreacionDesc(Integer usuarioId);

    List<Notificacion> findByUsuarioIdAndLeidaFalse(Integer usuarioId);

    long countByUsuarioIdAndLeidaFalse(Integer usuarioId);

    /**
     * Notificaciones del usuario que pertenecen al comercio: las del comercio mismo
     * ({@code entidad_tipo = COMERCIO}) y las de sus pedidos ({@code entidad_tipo = PEDIDO} con un pedido
     * de ese comercio). Sin columna de comercio en {@code notificacion}: la pertenencia se deduce de la
     * entidad referenciada. Misma condición en las tres consultas de abajo y en el conteo agrupado.
     */
    @Query("""
            SELECT n FROM Notificacion n
            WHERE n.usuario.id = :usuarioId
              AND ((n.entidadTipo = com.bajonea.backend.enums.TipoEntidadNotificacion.COMERCIO AND n.entidadId = :comercioId)
                OR (n.entidadTipo = com.bajonea.backend.enums.TipoEntidadNotificacion.PEDIDO
                    AND n.entidadId IN (SELECT p.id FROM Pedido p WHERE p.comercio.id = :comercioId)))
            ORDER BY n.fechaCreacion DESC
            """)
    List<Notificacion> findByUsuarioIdAndComercioId(@Param("usuarioId") Integer usuarioId,
            @Param("comercioId") Integer comercioId);

    @Query("""
            SELECT COUNT(n) FROM Notificacion n
            WHERE n.usuario.id = :usuarioId AND n.leida = false
              AND ((n.entidadTipo = com.bajonea.backend.enums.TipoEntidadNotificacion.COMERCIO AND n.entidadId = :comercioId)
                OR (n.entidadTipo = com.bajonea.backend.enums.TipoEntidadNotificacion.PEDIDO
                    AND n.entidadId IN (SELECT p.id FROM Pedido p WHERE p.comercio.id = :comercioId)))
            """)
    long countNoLeidasByUsuarioIdAndComercioId(@Param("usuarioId") Integer usuarioId,
            @Param("comercioId") Integer comercioId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Notificacion n SET n.leida = true
            WHERE n.usuario.id = :usuarioId AND n.leida = false
              AND ((n.entidadTipo = com.bajonea.backend.enums.TipoEntidadNotificacion.COMERCIO AND n.entidadId = :comercioId)
                OR (n.entidadTipo = com.bajonea.backend.enums.TipoEntidadNotificacion.PEDIDO
                    AND n.entidadId IN (SELECT p.id FROM Pedido p WHERE p.comercio.id = :comercioId)))
            """)
    int marcarLeidasByUsuarioIdAndComercioId(@Param("usuarioId") Integer usuarioId,
            @Param("comercioId") Integer comercioId);

    /**
     * Una sola consulta para todos los comercios del Dueño (sin N+1): cada notificación no leída del
     * usuario se atribuye a su comercio, ya sea por referencia directa o a través del pedido. Los
     * comercios sin notificaciones no aparecen en el resultado.
     */
    @Query(nativeQuery = true, value = """
            SELECT t.comercio_id AS comercioId, COUNT(*) AS cantidad FROM (
                SELECT n.entidad_id AS comercio_id FROM notificacion n
                WHERE n.usuario_id = :usuarioId AND n.leida = 0 AND n.entidad_tipo = 'COMERCIO'
                UNION ALL
                SELECT p.comercio_id FROM notificacion n JOIN pedido p ON p.id = n.entidad_id
                WHERE n.usuario_id = :usuarioId AND n.leida = 0 AND n.entidad_tipo = 'PEDIDO'
            ) t GROUP BY t.comercio_id
            """)
    List<ContadorNoLeidasPorComercio> contarNoLeidasPorComercio(@Param("usuarioId") Integer usuarioId);

    interface ContadorNoLeidasPorComercio {

        Integer getComercioId();

        Long getCantidad();
    }
}
