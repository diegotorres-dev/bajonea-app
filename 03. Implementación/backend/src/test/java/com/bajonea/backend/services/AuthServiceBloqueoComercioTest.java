package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.JwtService;
import com.bajonea.backend.dto.request.ConfirmarReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.CredencialesInvalidasException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.HistorialCambioNombreUsuarioRepository;
import com.bajonea.backend.repositories.SesionRepository;
import com.bajonea.backend.repositories.TokenRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Bloqueo de cuenta por tres intentos fallidos y qué hace con los comercios del Dueño: solo los candidatos
 * {@code APROBADO}/{@code APTO_VENTA} llegan al servicio que decide con el estado real (bloqueo de fila); el resto
 * de los estados nunca se toca. Que un {@code APROBADO} termine sin cambios lo prueba
 * {@code ComercioServiceCatalogoPublicoTest} (servicio) y {@code BloqueoComercioIntegrationTest} (motor real).
 */
class AuthServiceBloqueoComercioTest {

    private static final String MOTIVO = "Bloqueo de cuenta por intentos fallidos";

    private UsuarioRepository usuarioRepository;
    private ComercioRepository comercioRepository;
    private ComercioService comercioService;
    private AuthService authService;

    @BeforeEach
    void preparar() {
        usuarioRepository = mock(UsuarioRepository.class);
        comercioRepository = mock(ComercioRepository.class);
        comercioService = mock(ComercioService.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        when(passwordEncoder.matches(anyString(), any())).thenReturn(false);
        authService = new AuthService(usuarioRepository, mock(TokenRepository.class), mock(TokenService.class),
                mock(SesionRepository.class), comercioRepository, mock(HistorialCambioNombreUsuarioRepository.class),
                mock(CuentaMercadoPagoService.class), comercioService, passwordEncoder, mock(JwtService.class),
                mock(EmailService.class));
    }

    private static Comercio comercio(int id, EstadoComercio estado) {
        return Comercio.builder().id(id).estado(estado).build();
    }

    private Usuario usuarioConIntentos(RolUsuario rol, int intentos) {
        Usuario usuario = Usuario.builder().id(9).nombreUsuario("duenotest1").rol(rol).estado(EstadoUsuario.ACTIVO)
                .passwordHash("hash").intentosFallidos(intentos).build();
        when(usuarioRepository.findByNombreUsuarioConBloqueo("duenotest1")).thenReturn(Optional.of(usuario));
        return usuario;
    }

    private void loginIncorrecto() {
        LoginRequestDTO request = new LoginRequestDTO();
        request.setNombreUsuario("duenotest1");
        request.setPassword("Incorrecta1");
        assertThrows(CredencialesInvalidasException.class, () -> authService.login(request, "127.0.0.1", "test"));
    }

    @Test
    void alTercerIntentoSoloLosCandidatosAprobadoYAptoVentaLlegaAlServicioDeBloqueo() {
        Usuario usuario = usuarioConIntentos(RolUsuario.DUENO, 2);
        Comercio aptoVenta = comercio(1, EstadoComercio.APTO_VENTA);
        Comercio aprobado = comercio(2, EstadoComercio.APROBADO);
        List<Comercio> otros = Arrays.stream(EstadoComercio.values())
                .filter(e -> e != EstadoComercio.APTO_VENTA && e != EstadoComercio.APROBADO)
                .map(e -> comercio(10 + e.ordinal(), e))
                .toList();
        List<Comercio> todos = new java.util.ArrayList<>(List.of(aptoVenta, aprobado));
        todos.addAll(otros);
        when(comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(9)).thenReturn(todos);

        loginIncorrecto();

        assertEquals(EstadoUsuario.BLOQUEADO, usuario.getEstado());
        verify(comercioService).cerrarTemporalmentePorBloqueoDeCuenta(aptoVenta, MOTIVO);
        verify(comercioService).cerrarTemporalmentePorBloqueoDeCuenta(aprobado, MOTIVO);
        for (Comercio otro : otros) {
            verify(comercioService, never()).cerrarTemporalmentePorBloqueoDeCuenta(otro, MOTIVO);
        }
        verify(comercioService, times(2)).cerrarTemporalmentePorBloqueoDeCuenta(any(), anyString());
        verify(comercioService, never()).registrarTransicionAutomatica(any(), any(), any(), anyString());
    }

    @Test
    void antesDelTercerIntentoNoSeTocaNingunComercio() {
        usuarioConIntentos(RolUsuario.DUENO, 1);

        loginIncorrecto();

        verify(comercioRepository, never()).findByDuenoIdOrderByFechaRegistroAscIdAsc(any());
        verify(comercioService, never()).cerrarTemporalmentePorBloqueoDeCuenta(any(), anyString());
    }

    @Test
    void elBloqueoDeUnClienteNoTocaComercios() {
        Usuario usuario = usuarioConIntentos(RolUsuario.CLIENTE, 2);

        loginIncorrecto();

        assertEquals(EstadoUsuario.BLOQUEADO, usuario.getEstado());
        verify(comercioRepository, never()).findByDuenoIdOrderByFechaRegistroAscIdAsc(any());
        verify(comercioService, never()).cerrarTemporalmentePorBloqueoDeCuenta(any(), anyString());
    }

    @Test
    void laConfirmacionDeLaRecuperacionTomaPrimeroLaFilaDelUsuarioYDespuesLeeElCodigo() {
        ConfirmarRecuperacionPasswordRequestDTO request =
                new ConfirmarRecuperacionPasswordRequestDTO("duenotest1@bajonea.test", "123456", "Testing456");

        assertThrows(CredencialesInvalidasException.class, () -> authService.confirmarRecuperacionPassword(request));

        InOrder orden = inOrder(usuarioRepository);
        orden.verify(usuarioRepository).findByEmailConBloqueo("duenotest1@bajonea.test");
        orden.verify(usuarioRepository).findByEmail("duenotest1@bajonea.test");
    }

    @Test
    void laConfirmacionDeLaReactivacionTomaPrimeroLaFilaDelUsuarioYDespuesLeeElCodigo() {
        ConfirmarReactivacionCuentaRequestDTO request =
                new ConfirmarReactivacionCuentaRequestDTO("duenotest1@bajonea.test", "123456");

        assertThrows(CredencialesInvalidasException.class, () -> authService.confirmarReactivacionCuenta(request));

        InOrder orden = inOrder(usuarioRepository);
        orden.verify(usuarioRepository).findByEmailConBloqueo("duenotest1@bajonea.test");
        orden.verify(usuarioRepository).findByEmail("duenotest1@bajonea.test");
    }
}
