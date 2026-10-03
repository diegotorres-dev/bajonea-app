package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoToken;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.repositories.TokenRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.LocalDateTime;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demuestra, contra {@code bajonea_test}, por qué el reintento original de
 * {@code AuthService.generarToken} (capturar {@link DataIntegrityViolationException} alrededor de
 * {@code tokenRepository.save} y volver a intentar) no funciona dentro de una transacción
 * existente: el {@code save} fallido marca la transacción como rollback-only aunque la excepción
 * se capture, así que el reintento "exitoso" termina revertido.
 */
@SpringBootTest
@ActiveProfiles("test")
class TokenRollbackOnlyIntegrationTest {

    private static final String CODIGO_COLISION = "990001";
    private static final String CODIGO_REINTENTO = "990002";

    @Autowired
    private TokenRepository tokenRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void limpiar() {
        jdbcTemplate.update("DELETE FROM token WHERE token IN (?, ?)", CODIGO_COLISION, CODIGO_REINTENTO);
    }

    @Test
    void reintentoConSaveDeJpaNoSobreviveALaColisionDentroDeUnaTransaccion() {
        Integer usuarioId = jdbcTemplate.queryForObject("SELECT MIN(id) FROM usuario", Integer.class);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        assertThrows(UnexpectedRollbackException.class, () -> tx.executeWithoutResult(status -> {
            Usuario usuario = usuarioRepository.getReferenceById(usuarioId);
            tokenRepository.save(nuevoToken(usuario, CODIGO_COLISION));
            try {
                tokenRepository.save(nuevoToken(usuario, CODIGO_COLISION));
            } catch (DataIntegrityViolationException ex) {
                // mismo manejo que AuthService.generarToken: se captura y se reintenta con otro valor
            }
            tokenRepository.save(nuevoToken(usuario, CODIGO_REINTENTO));
        }));

        Integer persistidos = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM token WHERE token IN (?, ?)", Integer.class, CODIGO_COLISION, CODIGO_REINTENTO);
        assertEquals(0, persistidos, "ni el token original ni el del reintento quedaron guardados");
    }

    private Token nuevoToken(Usuario usuario, String valor) {
        return Token.builder()
                .usuario(usuario)
                .tipo(TipoToken.RECUPERACION_PASSWORD)
                .token(valor)
                .fechaCreacion(LocalDateTime.now())
                .fechaVencimiento(LocalDateTime.now().plusMinutes(30))
                .estado(EstadoToken.PENDIENTE)
                .intentosFallidos(0)
                .build();
    }
}
