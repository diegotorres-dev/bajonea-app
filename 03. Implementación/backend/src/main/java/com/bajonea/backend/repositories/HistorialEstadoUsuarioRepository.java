package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEstadoUsuario;
import com.bajonea.backend.enums.EstadoUsuario;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistorialEstadoUsuarioRepository extends JpaRepository<HistorialEstadoUsuario, Integer> {

    Optional<HistorialEstadoUsuario> findTopByUsuarioIdAndEstadoDestinoOrderByIdDesc(Integer usuarioId, EstadoUsuario estadoDestino);

    Optional<HistorialEstadoUsuario> findTopByUsuarioIdAndEstadoOrigenOrderByIdDesc(Integer usuarioId, EstadoUsuario estadoOrigen);

    List<HistorialEstadoUsuario> findByUsuarioIdOrderByIdAsc(Integer usuarioId);
}
