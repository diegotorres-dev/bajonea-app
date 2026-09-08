package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Token;
import com.bajonea.backend.enums.EstadoToken;
import com.bajonea.backend.enums.TipoToken;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TokenRepository extends JpaRepository<Token, Integer> {

    Optional<Token> findByTokenAndEstado(String token, EstadoToken estado);

    List<Token> findByUsuarioIdAndTipoAndEstado(Integer usuarioId, TipoToken tipo, EstadoToken estado);

    /**
     * Usado únicamente por {@code TestSupportService} (perfil {@code test}, Fase 14) para
     * exponer el token pendiente más reciente sin depender de leer un email real.
     */
    Optional<Token> findFirstByUsuarioIdAndTipoAndEstadoOrderByFechaCreacionDesc(
            Integer usuarioId, TipoToken tipo, EstadoToken estado);
}
