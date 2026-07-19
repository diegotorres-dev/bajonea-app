package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.Token;
import com.bajonea.backend.enums.TipoToken;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TokenRepository extends JpaRepository<Token, Integer> {

    Optional<Token> findByTokenAndUsado(String token, boolean usado);

    List<Token> findByUsuarioIdAndTipoAndUsado(Integer usuarioId, TipoToken tipo, boolean usado);
}
