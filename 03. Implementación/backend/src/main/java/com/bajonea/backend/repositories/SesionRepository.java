package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Sesion;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SesionRepository extends JpaRepository<Sesion, Integer> {

    Optional<Sesion> findByUsuarioIdAndActivaTrue(Integer usuarioId);

    interface EstadoDeSesion {

        boolean getActiva();

        String getTipoCierre();

        Integer getUsuarioId();

        String getEstadoUsuario();

        String getMotivoSuspension();
    }

    /**
     * Estado de la sesión y de la cuenta a la que pertenece en una sola lectura (sin bloqueo): es lo que el filtro
     * JWT necesita en cada request para negar el paso a una cuenta suspendida aunque el token todavía sea válido, y
     * para distinguir una sesión cerrada por suspensión (que muestra el motivo) de cualquier otro cierre.
     */
    @Query(value = "SELECT s.activa AS activa, s.tipo_cierre AS tipoCierre, s.usuario_id AS usuarioId, "
            + "u.estado AS estadoUsuario, u.motivo_suspension AS motivoSuspension "
            + "FROM sesion s JOIN usuario u ON u.id = s.usuario_id WHERE s.id = :sesionId", nativeQuery = true)
    Optional<EstadoDeSesion> leerEstadoDeSesion(@Param("sesionId") Integer sesionId);

    @Query("SELECT s FROM Sesion s WHERE s.usuario.id = :usuarioId AND s.activa = true")
    List<Sesion> findActivasDelUsuario(@Param("usuarioId") Integer usuarioId);
}
