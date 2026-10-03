package com.bajonea.backend.services;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.ReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.RecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.ReenviarVerificacionRequestDTO;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HistorialCambioNombreUsuarioRepository;
import com.bajonea.backend.repositories.SesionRepository;
import com.bajonea.backend.repositories.TokenInsercionRepository;
import com.bajonea.backend.repositories.TokenRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.config.security.JwtService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Recuperación de contraseña, reactivación de cuenta y reenvío de verificación ante una colisión
 * del código: el usuario no debe notar nada y el email debe salir con el código de reemplazo.
 */
class AuthServiceColisionCodigoTest {

    private static final String EMAIL = "colision@bajonea.test";

    private TokenInsercionRepository insercion;
    private CodigoTokenGenerador generador;
    private EmailService emailService;
    private AuthService authService;

    @BeforeEach
    void preparar() {
        insercion = mock(TokenInsercionRepository.class);
        generador = mock(CodigoTokenGenerador.class);
        emailService = mock(EmailService.class);

        Usuario usuario = mock(Usuario.class);
        when(usuario.getId()).thenReturn(42);
        when(usuario.getEmail()).thenReturn(EMAIL);
        when(usuario.getEstado()).thenReturn(EstadoUsuario.PENDIENTE);

        UsuarioRepository usuarioRepository = mock(UsuarioRepository.class);
        when(usuarioRepository.findByEmail(EMAIL)).thenReturn(Optional.of(usuario));

        TokenRepository tokenRepository = mock(TokenRepository.class);
        when(tokenRepository.findByUsuarioIdAndTipoAndEstado(anyInt(), any(), any())).thenReturn(List.of());

        authService = new AuthService(
                usuarioRepository,
                tokenRepository,
                new TokenService(insercion, generador, 5),
                mock(SesionRepository.class),
                mock(ComercioRepository.class),
                mock(HistorialCambioNombreUsuarioRepository.class),
                mock(CuentaMercadoPagoService.class),
                mock(ComercioService.class),
                mock(PasswordEncoder.class),
                mock(JwtService.class),
                emailService);
    }

    @Test
    void reenviarVerificacionConCodigoYaExistenteEnviaElCodigoDeReemplazo() {
        existentePreviamente("111111", "222222");

        authService.reenviarVerificacion(new ReenviarVerificacionRequestDTO(EMAIL));

        verify(emailService).enviarVerificacion(EMAIL, "222222");
    }

    @Test
    void reenviarVerificacionConCarreraEnElInsertEnviaElCodigoDeReemplazo() {
        carreraEnElInsert("111111", "222222");

        authService.reenviarVerificacion(new ReenviarVerificacionRequestDTO(EMAIL));

        verify(emailService).enviarVerificacion(EMAIL, "222222");
        verify(insercion).insertarPendiente(eq(42), eq(TipoToken.VERIFICACION_EMAIL), eq("222222"), any(), any());
    }

    @Test
    void recuperacionDePasswordConCodigoYaExistenteEnviaElCodigoDeReemplazo() {
        existentePreviamente("111111", "222222");

        authService.solicitarRecuperacionPassword(new RecuperacionPasswordRequestDTO(EMAIL));

        verify(emailService).enviarRecuperacionPassword(EMAIL, "222222");
    }

    @Test
    void recuperacionDePasswordConCarreraEnElInsertEnviaElCodigoDeReemplazo() {
        carreraEnElInsert("111111", "222222");

        authService.solicitarRecuperacionPassword(new RecuperacionPasswordRequestDTO(EMAIL));

        verify(emailService).enviarRecuperacionPassword(EMAIL, "222222");
        verify(insercion).insertarPendiente(eq(42), eq(TipoToken.RECUPERACION_PASSWORD), eq("222222"), any(), any());
    }

    @Test
    void reactivacionDeCuentaConCodigoYaExistenteEnviaElCodigoDeReemplazo() {
        existentePreviamente("111111", "222222");

        authService.solicitarReactivacionCuenta(new ReactivacionCuentaRequestDTO(EMAIL));

        verify(emailService).enviarReactivacionCuenta(EMAIL, "222222");
    }

    @Test
    void reactivacionDeCuentaConCarreraEnElInsertEnviaElCodigoDeReemplazo() {
        carreraEnElInsert("111111", "222222");

        authService.solicitarReactivacionCuenta(new ReactivacionCuentaRequestDTO(EMAIL));

        verify(emailService).enviarReactivacionCuenta(EMAIL, "222222");
        verify(insercion).insertarPendiente(eq(42), eq(TipoToken.REACTIVACION_CUENTA), eq("222222"), any(), any());
    }

    private void existentePreviamente(String repetido, String libre) {
        when(generador.generar()).thenReturn(repetido, libre);
        when(insercion.existeValor(repetido)).thenReturn(true);
        when(insercion.existeValor(libre)).thenReturn(false);
        when(insercion.insertarPendiente(anyInt(), any(), eq(libre), any(), any())).thenReturn(1);
    }

    private void carreraEnElInsert(String conCarrera, String libre) {
        when(generador.generar()).thenReturn(conCarrera, libre);
        when(insercion.existeValor(anyString())).thenReturn(false);
        when(insercion.insertarPendiente(anyInt(), any(), eq(conCarrera), any(), any()))
                .thenThrow(new DuplicateKeyException("Duplicate entry '" + conCarrera + "' for key 'uq_token_valor'"));
        when(insercion.insertarPendiente(anyInt(), any(), eq(libre), any(), any())).thenReturn(1);
    }
}
