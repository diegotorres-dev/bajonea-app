package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.TicketSoporte;
import com.bajonea.backend.enums.EstadoTicketSoporte;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TicketSoporteRepository extends JpaRepository<TicketSoporte, Integer> {

    /**
     * Toma la fila de la consulta con {@code SELECT ... FOR UPDATE}: es la primera lectura de la consulta en toda
     * transacción que la modifica (responder, cerrar, mandar un mensaje), y el estado y el turno se revalidan sobre esta
     * fila bloqueada y no sobre una lectura anterior.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM TicketSoporte t WHERE t.id = :id")
    Optional<TicketSoporte> findByIdConBloqueo(@Param("id") Integer id);

    Optional<TicketSoporte> findByEmailAndCodigo(String email, String codigo);

    /**
     * Solo el id: las escrituras autentican con esta consulta y recién después toman la fila con
     * {@link #findByIdConBloqueo}. Cargar la entidad antes dejaría en la sesión una copia vieja, y la lectura con
     * bloqueo devolvería esa copia en lugar del estado confirmado.
     */
    @Query("SELECT t.id FROM TicketSoporte t WHERE t.email = :email AND t.codigo = :codigo")
    Optional<Integer> findIdByEmailAndCodigo(@Param("email") String email, @Param("codigo") String codigo);

    @Query("SELECT t.id FROM TicketSoporte t WHERE t.id = :id AND (t.usuarioId = :usuarioId OR t.email = :email)")
    Optional<Integer> findIdDelUsuarioPorId(@Param("id") Integer id, @Param("usuarioId") Integer usuarioId,
            @Param("email") String email);

    long countByEmailAndCreadoEnAfter(String email, LocalDateTime desde);

    long countByEmailAndEstadoNot(String email, EstadoTicketSoporte estado);

    long countByIpAndCreadoEnAfter(String ip, LocalDateTime desde);

    long countByEstado(EstadoTicketSoporte estado);

    List<TicketSoporte> findByEmailAndEstadoNotOrderByIdAsc(String email, EstadoTicketSoporte estado);

    @Query("SELECT t FROM TicketSoporte t WHERE t.usuarioId = :usuarioId OR t.email = :email "
            + "ORDER BY t.actualizadoEn DESC, t.id DESC")
    List<TicketSoporte> findDelUsuario(@Param("usuarioId") Integer usuarioId, @Param("email") String email);

    @Query("SELECT t FROM TicketSoporte t WHERE t.id = :id AND (t.usuarioId = :usuarioId OR t.email = :email)")
    Optional<TicketSoporte> findDelUsuarioPorId(@Param("id") Integer id, @Param("usuarioId") Integer usuarioId,
            @Param("email") String email);

    @Query("SELECT COUNT(t) FROM TicketSoporte t WHERE t.estado = :estado AND (t.usuarioId = :usuarioId OR t.email = :email)")
    long contarDelUsuarioPorEstado(@Param("estado") EstadoTicketSoporte estado, @Param("usuarioId") Integer usuarioId,
            @Param("email") String email);

    @Query("SELECT t FROM TicketSoporte t WHERE t.estado = :estado AND (:email IS NULL OR t.email = :email) "
            + "ORDER BY t.actualizadoEn ASC, t.id ASC")
    List<TicketSoporte> bandejaMasViejasPrimero(@Param("estado") EstadoTicketSoporte estado, @Param("email") String email,
            Pageable pageable);

    @Query("SELECT t FROM TicketSoporte t WHERE t.estado = :estado AND (:email IS NULL OR t.email = :email) "
            + "ORDER BY t.actualizadoEn DESC, t.id DESC")
    List<TicketSoporte> bandejaMasNuevasPrimero(@Param("estado") EstadoTicketSoporte estado, @Param("email") String email,
            Pageable pageable);

    interface CuentaPorEmail {

        String getEmail();

        Integer getUsuarioId();

        String getRol();

        String getEstado();

        String getNombre();

        String getApellido();

        Number getEsEmpleado();
    }

    /**
     * Cuentas cuyo email coincide con alguno de los dados, en una sola consulta: el listado y el detalle de la bandeja del
     * Administrador las usan para marcar las cuentas suspendidas y mostrar la cuenta asociada sin una consulta por fila.
     * El nombre es el de la persona de la cuenta (el representante, para un Dueño).
     */
    @Query(value = "SELECT u.email AS email, u.id AS usuarioId, u.rol AS rol, u.estado AS estado, pf.nombre AS nombre, "
            + "pf.apellido AS apellido, (e.id IS NOT NULL) AS esEmpleado FROM usuario u "
            + "LEFT JOIN dueno d ON d.id = u.id "
            + "LEFT JOIN persona_fisica pf ON pf.id = COALESCE(d.persona_fisica_id, u.id) "
            + "LEFT JOIN empleado e ON e.id = u.id WHERE u.email IN (:emails)", nativeQuery = true)
    List<CuentaPorEmail> findCuentasPorEmail(@Param("emails") Collection<String> emails);

    /**
     * Ids de las consultas, entre las dadas, cuyo último mensaje de Soporte no pudo mandarse por email.
     */
    @Query(value = "SELECT m.ticket_id FROM ticket_soporte_mensaje m WHERE m.ticket_id IN (:ids) AND m.autor = 'SOPORTE' "
            + "AND m.email_enviado = 0 AND m.id = (SELECT MAX(m2.id) FROM ticket_soporte_mensaje m2 "
            + "WHERE m2.ticket_id = m.ticket_id AND m2.autor = 'SOPORTE')", nativeQuery = true)
    List<Integer> findIdsConEmailSinEnviar(@Param("ids") Collection<Integer> ids);
}
