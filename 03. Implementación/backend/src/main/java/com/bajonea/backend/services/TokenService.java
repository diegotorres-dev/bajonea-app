package com.bajonea.backend.services;

import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoToken;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.GeneracionTokenException;
import com.bajonea.backend.repositories.TokenInsercionRepository;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

/**
 * Único punto de creación de tokens (verificación de email, recuperación de contraseña y
 * reactivación de cuenta). Genera un código al azar, comprueba que no exista y lo inserta; si el
 * código ya existe, o si el INSERT choca igual por una carrera con otra transacción, vuelve a
 * generar hasta {@code token.generacion.max-intentos} veces.
 * <p>
 * El {@code UNIQUE} {@code uq_token_valor} es global (no por usuario ni por tipo) y las filas
 * usadas o vencidas nunca se borran, así que la probabilidad de choque crece con la cantidad de
 * filas acumuladas: con N filas, cada código nuevo choca con probabilidad N / 1.000.000.
 * <p>
 * La inserción va por {@link TokenInsercionRepository} (JDBC) para que un choque no marque como
 * rollback-only la transacción del llamador; por eso este servicio puede usarse dentro de la
 * transacción de un registro sin riesgo de perderla.
 */
@Service
public class TokenService {

    private static final Logger log = LoggerFactory.getLogger(TokenService.class);

    private final TokenInsercionRepository insercionRepository;
    private final CodigoTokenGenerador generador;
    private final int maxIntentos;

    public TokenService(
            TokenInsercionRepository insercionRepository,
            CodigoTokenGenerador generador,
            @Value("${token.generacion.max-intentos:20}") int maxIntentos) {
        this.insercionRepository = insercionRepository;
        this.generador = generador;
        this.maxIntentos = maxIntentos;
    }

    /**
     * Devuelve un {@link Token} no gestionado por la sesión de JPA (solo con los datos recién
     * insertados): los llamadores únicamente necesitan su valor para enviarlo por email.
     *
     * @throws GeneracionTokenException si se agotan los reintentos sin lograr un código único
     */
    public Token crear(Usuario usuario, TipoToken tipo, LocalDateTime vencimiento) {
        for (int intento = 1; intento <= maxIntentos; intento++) {
            String codigo = generador.generar();

            if (insercionRepository.existeValor(codigo)) {
                log.warn("Colisión de código de token (intento {}/{}): el valor ya existe, se genera otro", intento, maxIntentos);
                continue;
            }

            LocalDateTime ahora = LocalDateTime.now();
            try {
                Integer id = insercionRepository.insertarPendiente(usuario.getId(), tipo, codigo, ahora, vencimiento);
                return Token.builder()
                        .id(id)
                        .usuario(usuario)
                        .tipo(tipo)
                        .token(codigo)
                        .fechaCreacion(ahora)
                        .fechaVencimiento(vencimiento)
                        .estado(EstadoToken.PENDIENTE)
                        .intentosFallidos(0)
                        .build();
            } catch (DuplicateKeyException ex) {
                log.warn("Colisión de código de token en el INSERT (intento {}/{}): carrera con otra transacción, se genera otro", intento, maxIntentos);
            }
        }

        log.error("No se pudo generar un código de token único tras {} intentos (tipo {}, usuario {})",
                maxIntentos, tipo, usuario.getId());
        throw new GeneracionTokenException("No pudimos generar el código de verificación. Intentá nuevamente en unos instantes.");
    }
}
