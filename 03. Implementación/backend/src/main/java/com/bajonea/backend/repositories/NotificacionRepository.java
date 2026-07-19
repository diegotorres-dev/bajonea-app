package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Notificacion;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificacionRepository extends JpaRepository<Notificacion, Integer> {

    List<Notificacion> findByUsuarioIdOrderByFechaCreacionDesc(Integer usuarioId);

    List<Notificacion> findByUsuarioIdAndLeidaFalse(Integer usuarioId);

    long countByUsuarioIdAndLeidaFalse(Integer usuarioId);
}
