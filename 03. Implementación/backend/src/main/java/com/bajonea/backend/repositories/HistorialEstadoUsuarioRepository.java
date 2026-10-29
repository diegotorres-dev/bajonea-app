package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialEstadoUsuario;
import com.bajonea.backend.enums.EstadoUsuario;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HistorialEstadoUsuarioRepository extends JpaRepository<HistorialEstadoUsuario, Integer> {

    Optional<HistorialEstadoUsuario> findTopByUsuarioIdAndEstadoDestinoOrderByIdDesc(Integer usuarioId, EstadoUsuario estadoDestino);

    Optional<HistorialEstadoUsuario> findTopByUsuarioIdAndEstadoOrigenOrderByIdDesc(Integer usuarioId, EstadoUsuario estadoOrigen);

    List<HistorialEstadoUsuario> findByUsuarioIdOrderByIdAsc(Integer usuarioId);

    @Query("""
            SELECT h.usuario.id, h.estadoOrigen FROM HistorialEstadoUsuario h
            WHERE h.estadoDestino = com.bajonea.backend.enums.EstadoUsuario.SUSPENDIDO AND h.usuario.id IN :usuarioIds
              AND h.id = (SELECT MAX(m.id) FROM HistorialEstadoUsuario m WHERE m.usuario.id = h.usuario.id
                          AND m.estadoDestino = com.bajonea.backend.enums.EstadoUsuario.SUSPENDIDO)
            """)
    List<Object[]> findEstadoPrevioDeLaUltimaSuspension(@Param("usuarioIds") List<Integer> usuarioIds);
}
