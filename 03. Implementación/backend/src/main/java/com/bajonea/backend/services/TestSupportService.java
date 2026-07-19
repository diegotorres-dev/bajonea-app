package com.bajonea.backend.services;

import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.TokenRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Atajo de testing exclusivo del perfil {@code test} (Fase 14, ver docs/DECISIONES.md) —
 * expone el token de verificación pendiente de un usuario sin depender de leer un email
 * real, para que la colección de Postman no dependa de una casilla real mientras Fase 10
 * (SMTP) sigue en pausa. El bean no se crea fuera del perfil {@code test}
 * ({@code @Profile}), así que {@code TestController} no tiene a quién inyectar y la ruta
 * ni siquiera se registra en el perfil normal/producción.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Profile("test")
public class TestSupportService {

    private final UsuarioRepository usuarioRepository;
    private final TokenRepository tokenRepository;

    public String obtenerTokenVerificacionPendiente(String email) {
        return obtenerTokenPendiente(email, TipoToken.VERIFICACION_EMAIL);
    }

    public String obtenerTokenPendiente(String email, TipoToken tipo) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
        Token token = tokenRepository
                .findFirstByUsuarioIdAndTipoAndUsadoOrderByFechaCreacionDesc(
                        usuario.getId(), tipo, false)
                .orElseThrow(() -> new RecursoNoEncontradoException(
                        "No hay token de tipo " + tipo + " pendiente para ese email"));
        return token.getToken();
    }
}
