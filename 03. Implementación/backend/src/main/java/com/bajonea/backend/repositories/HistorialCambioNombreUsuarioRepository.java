package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.HistorialCambioNombreUsuario;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HistorialCambioNombreUsuarioRepository extends JpaRepository<HistorialCambioNombreUsuario, Integer> {

    long countByUsuarioIdAndFechaCambioAfter(Integer usuarioId, LocalDateTime desde);

    List<HistorialCambioNombreUsuario> findByUsuarioIdAndFechaCambioAfterOrderByFechaCambioAsc(Integer usuarioId, LocalDateTime desde);
}
