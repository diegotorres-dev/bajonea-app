package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Notificacion;
import com.bajonea.backend.enums.CanalNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificacionRepository extends JpaRepository<Notificacion, Integer> {

    java.util.Optional<Notificacion> findTopByUsuarioIdAndCanalAndTipoOrderByIdDesc(Integer usuarioId,
            com.bajonea.backend.enums.CanalNotificacion canal, com.bajonea.backend.enums.TipoNotificacion tipo);

    /**
     * Usuarios cuyo último email del tipo dado (el de mayor id) quedó {@code FALLIDO}: la base del
     * "No se envió el email" del listado de Clientes del Administrador, en una sola consulta.
     */
    @Query("""
            SELECT n.usuario.id FROM Notificacion n
            WHERE n.canal = com.bajonea.backend.enums.CanalNotificacion.EMAIL AND n.tipo = :tipo
              AND n.estado = com.bajonea.backend.enums.EstadoEnvioNotificacion.FALLIDO
              AND n.id = (SELECT MAX(m.id) FROM Notificacion m WHERE m.usuario.id = n.usuario.id
                          AND m.canal = com.bajonea.backend.enums.CanalNotificacion.EMAIL AND m.tipo = :tipo)
            """)
    List<Integer> findUsuarioIdsConUltimoEmailFallido(@Param("tipo") TipoNotificacion tipo);

    List<Notificacion> findByUsuarioIdAndCanalOrderByIdAsc(Integer usuarioId, com.bajonea.backend.enums.CanalNotificacion canal);

    /**
     * Notificaciones in-app personales del usuario (campana del Cliente): canal {@code PUSH} y sin comercio. Las
     * filas {@code EMAIL} son el rastro de un correo enviado (por ejemplo los avisos de regularización de
     * invitaciones, que cuentan el tope diario) y las que llevan {@code comercio_id} son avisos del comercio
     * (Dueño o Empleado) que se ven solo con el comercio abierto: ninguna de las dos se muestra acá.
     */
    @Query("""
            SELECT n FROM Notificacion n
            WHERE n.usuario.id = :usuarioId AND n.canal = com.bajonea.backend.enums.CanalNotificacion.PUSH
              AND n.comercioId IS NULL
            ORDER BY n.fechaCreacion DESC, n.id DESC
            """)
    List<Notificacion> findPersonalesPushByUsuarioId(@Param("usuarioId") Integer usuarioId);

    @Query("""
            SELECT COUNT(n) FROM Notificacion n
            WHERE n.usuario.id = :usuarioId AND n.leida = false
              AND n.canal = com.bajonea.backend.enums.CanalNotificacion.PUSH
              AND n.comercioId IS NULL
            """)
    long countPersonalesPushNoLeidasByUsuarioId(@Param("usuarioId") Integer usuarioId);

    long countByUsuarioIdAndTipoAndCanalAndFechaCreacionAfter(Integer usuarioId, TipoNotificacion tipo, CanalNotificacion canal,
            LocalDateTime desde);

    /**
     * Avisos del usuario sobre un comercio (los que el sistema le emitió con {@code comercio_id}): una búsqueda
     * por el índice {@code (usuario_id, comercio_id, leida, fecha_creacion)}, sin deducir nada de la entidad.
     */
    @Query("""
            SELECT n FROM Notificacion n
            WHERE n.usuario.id = :usuarioId AND n.comercioId = :comercioId
              AND n.canal = com.bajonea.backend.enums.CanalNotificacion.PUSH
            ORDER BY n.fechaCreacion DESC, n.id DESC
            """)
    List<Notificacion> findByUsuarioIdAndComercioId(@Param("usuarioId") Integer usuarioId,
            @Param("comercioId") Integer comercioId);

    @Query("""
            SELECT COUNT(n) FROM Notificacion n
            WHERE n.usuario.id = :usuarioId AND n.comercioId = :comercioId AND n.leida = false
              AND n.canal = com.bajonea.backend.enums.CanalNotificacion.PUSH
            """)
    long countNoLeidasByUsuarioIdAndComercioId(@Param("usuarioId") Integer usuarioId,
            @Param("comercioId") Integer comercioId);

    @Query("""
            SELECT n.id FROM Notificacion n
            WHERE n.usuario.id = :usuarioId AND n.comercioId = :comercioId AND n.leida = false
              AND n.canal = com.bajonea.backend.enums.CanalNotificacion.PUSH
            ORDER BY n.id
            """)
    List<Integer> findIdsNoLeidasByUsuarioIdAndComercioId(@Param("usuarioId") Integer usuarioId,
            @Param("comercioId") Integer comercioId);

    @Query("SELECT n.id FROM Notificacion n WHERE n.usuario.id = :usuarioId AND n.comercioId = :comercioId ORDER BY n.id")
    List<Integer> findIdsByUsuarioIdAndComercioId(@Param("usuarioId") Integer usuarioId, @Param("comercioId") Integer comercioId);

    /**
     * Marca como leídas las notificaciones dadas por clave primaria (solo registros, sin bloqueos de hueco sobre
     * el rango de un usuario). El {@code AND leida = false} hace que el conteo devuelto sea el de las que de
     * verdad cambiaron aunque otra request las haya marcado entre la lectura de los ids y este {@code UPDATE}.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Notificacion n SET n.leida = true WHERE n.id IN :ids AND n.leida = false")
    int marcarLeidasPorIds(@Param("ids") Collection<Integer> ids);

    /**
     * Una sola consulta agrupada con los avisos del comercio no leídos del usuario, por comercio (sin N+1). Los
     * comercios sin avisos no aparecen. Sirve para el Dueño (todos sus comercios) y para el Empleado (los suyos).
     */
    @Query("""
            SELECT n.comercioId AS comercioId, COUNT(n) AS cantidad FROM Notificacion n
            WHERE n.usuario.id = :usuarioId AND n.leida = false AND n.comercioId IS NOT NULL
              AND n.canal = com.bajonea.backend.enums.CanalNotificacion.PUSH
            GROUP BY n.comercioId
            """)
    List<ContadorNoLeidasPorComercio> contarNoLeidasPorComercio(@Param("usuarioId") Integer usuarioId);

    interface ContadorNoLeidasPorComercio {

        Integer getComercioId();

        Long getCantidad();
    }
}
