package com.bajonea.backend.services;

import com.bajonea.backend.config.security.JwtService;
import com.bajonea.backend.dto.request.CambioPasswordPerfilRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.ReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.RecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.response.LoginResponseDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Sesion;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoCierreSesion;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CredencialesInvalidasException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.SesionRepository;
import com.bajonea.backend.repositories.TokenRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Login, recuperación/cambio de contraseña, bloqueo tras 3 intentos fallidos, reactivación de
 * cuenta y verificación de email. No incluye métodos de registro — eso sigue siendo
 * responsabilidad de {@code RegistroService} (Fase 8), invocado directo desde
 * {@code AuthController}. Alcance ampliado en la Fase 7 mediante enmienda formal — ver
 * docs/DECISIONES.md, 2026-07-17.
 * <p>
 * {@code noRollbackFor = CredencialesInvalidasException.class}: {@code registrarIntentoFallido}
 * persiste el contador (y, al tercer intento, el bloqueo) antes de que {@code login}/
 * {@code cambiarPasswordDesdePerfil} lancen esa excepción para señalar el fallo al llamador.
 * Sin este ajuste, el rollback por defecto de Spring ante toda {@code RuntimeException}
 * deshace también el incremento del contador — el bloqueo nunca llegaría a persistirse.
 */
@Service
@RequiredArgsConstructor
@Transactional(noRollbackFor = CredencialesInvalidasException.class)
public class AuthService {

    private static final int MAX_INTENTOS_FALLIDOS = 3;
    private static final long EXPIRACION_RECUPERACION_PASSWORD_MIN = 30;
    private static final long EXPIRACION_REACTIVACION_CUENTA_HORAS = 24;

    private final UsuarioRepository usuarioRepository;
    private final TokenRepository tokenRepository;
    private final SesionRepository sesionRepository;
    private final ComercioRepository comercioRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailService emailService;

    public LoginResponseDTO login(LoginRequestDTO request, String ipOrigen, String userAgent) {
        // findByEmailConBloqueo (SELECT ... FOR UPDATE): serializa requests concurrentes contra
        // el mismo usuario — ver docs/CONCURRENCIA-Y-TRANSACCIONES.md, sección 1.
        Usuario usuario = usuarioRepository.findByEmailConBloqueo(request.getEmail())
                .orElseThrow(() -> new CredencialesInvalidasException("Email o contraseña incorrectos"));

        validarEstadoParaLogin(usuario);

        if (!passwordEncoder.matches(request.getPassword(), usuario.getPasswordHash())) {
            registrarIntentoFallido(usuario);
            throw new CredencialesInvalidasException("Email o contraseña incorrectos");
        }

        usuario.setIntentosFallidos(0);
        usuario.setFechaUltimoAcceso(LocalDateTime.now());
        usuarioRepository.save(usuario);

        cerrarSesionActivaSiExiste(usuario, TipoCierreSesion.FORZADO);

        Sesion sesion = Sesion.builder()
                .usuario(usuario)
                .activa(true)
                .fechaInicio(LocalDateTime.now())
                .ipOrigen(ipOrigen)
                .navegador(userAgent)
                .build();
        sesionRepository.save(sesion);

        String token = jwtService.generarToken(usuario, sesion.getId());
        return new LoginResponseDTO(token, aResponseDTO(usuario));
    }

    public void verificarEmail(String token) {
        Token tokenEntity = obtenerTokenValido(token, TipoToken.VERIFICACION_EMAIL);
        consumirToken(tokenEntity);

        Usuario usuario = tokenEntity.getUsuario();
        usuario.setEstado(EstadoUsuario.ACTIVO);
        usuarioRepository.save(usuario);
    }

    public void solicitarRecuperacionPassword(RecuperacionPasswordRequestDTO request) {
        Usuario usuario = usuarioRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RecursoNoEncontradoException("No existe un usuario con ese email"));

        Token token = generarToken(usuario, TipoToken.RECUPERACION_PASSWORD,
                LocalDateTime.now().plusMinutes(EXPIRACION_RECUPERACION_PASSWORD_MIN));

        emailService.enviarRecuperacionPassword(usuario.getEmail(), token.getToken());
    }

    public void confirmarRecuperacionPassword(ConfirmarRecuperacionPasswordRequestDTO request) {
        Token tokenEntity = obtenerTokenValido(request.getToken(), TipoToken.RECUPERACION_PASSWORD);
        consumirToken(tokenEntity);

        Usuario usuario = tokenEntity.getUsuario();
        usuario.setPasswordHash(passwordEncoder.encode(request.getNuevaPassword()));
        usuario.setEstado(EstadoUsuario.ACTIVO);
        usuario.setIntentosFallidos(0);
        usuarioRepository.save(usuario);

        cerrarSesionActivaSiExiste(usuario, TipoCierreSesion.FORZADO);
        restaurarComercioSiCorresponde(usuario, EstadoComercio.CERRADO_TEMPORALMENTE);
    }

    public void cambiarPasswordDesdePerfil(Integer usuarioId, CambioPasswordPerfilRequestDTO request) {
        // Mismo lock que login() — ver docs/CONCURRENCIA-Y-TRANSACCIONES.md, sección 1.
        Usuario usuario = usuarioRepository.findByIdConBloqueo(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));

        if (!passwordEncoder.matches(request.getPasswordActual(), usuario.getPasswordHash())) {
            registrarIntentoFallido(usuario);
            throw new CredencialesInvalidasException("La contraseña actual es incorrecta");
        }

        if (passwordEncoder.matches(request.getPasswordNueva(), usuario.getPasswordHash())) {
            throw new ValidacionException("La nueva contraseña debe ser distinta a la actual");
        }

        usuario.setPasswordHash(passwordEncoder.encode(request.getPasswordNueva()));
        usuario.setIntentosFallidos(0);
        usuarioRepository.save(usuario);

        cerrarSesionActivaSiExiste(usuario, TipoCierreSesion.FORZADO);
    }

    public void solicitarReactivacionCuenta(ReactivacionCuentaRequestDTO request) {
        Usuario usuario = usuarioRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RecursoNoEncontradoException("No existe un usuario con ese email"));

        if (usuario.getEstado() != EstadoUsuario.INACTIVO) {
            throw new ConflictoDeNegocioException("La cuenta no está inactiva");
        }

        Token token = generarToken(usuario, TipoToken.REACTIVACION_CUENTA,
                LocalDateTime.now().plusHours(EXPIRACION_REACTIVACION_CUENTA_HORAS));

        emailService.enviarReactivacionCuenta(usuario.getEmail(), token.getToken());
    }

    public void confirmarReactivacionCuenta(String token) {
        Token tokenEntity = obtenerTokenValido(token, TipoToken.REACTIVACION_CUENTA);
        consumirToken(tokenEntity);

        Usuario usuario = tokenEntity.getUsuario();
        usuario.setEstado(EstadoUsuario.ACTIVO);
        usuarioRepository.save(usuario);

        restaurarComercioSiCorresponde(usuario, EstadoComercio.INACTIVO);
    }

    public void logout(Integer sesionId) {
        Sesion sesion = sesionRepository.findById(sesionId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Sesión no encontrada"));

        sesion.setActiva(false);
        sesion.setTipoCierre(TipoCierreSesion.MANUAL);
        sesion.setFechaCierre(LocalDateTime.now());
        sesionRepository.save(sesion);
    }

    private void validarEstadoParaLogin(Usuario usuario) {
        switch (usuario.getEstado()) {
            case ACTIVO -> {
            }
            case PENDIENTE -> throw new ConflictoDeNegocioException("Verificá tu email antes de iniciar sesión");
            case BLOQUEADO ->
                    throw new ConflictoDeNegocioException("Cuenta bloqueada. Recuperá tu contraseña para desbloquearla");
            case INACTIVO ->
                    throw new ConflictoDeNegocioException("Cuenta inactiva. Solicitá la reactivación de tu cuenta");
            case SUSPENDIDO -> throw new ConflictoDeNegocioException("Cuenta suspendida");
        }
    }

    private void registrarIntentoFallido(Usuario usuario) {
        int intentos = usuario.getIntentosFallidos() + 1;
        usuario.setIntentosFallidos(intentos);

        if (intentos >= MAX_INTENTOS_FALLIDOS) {
            usuario.setEstado(EstadoUsuario.BLOQUEADO);
            cerrarSesionActivaSiExiste(usuario, TipoCierreSesion.FORZADO);
            propagarBloqueoAComercio(usuario);
        }

        usuarioRepository.save(usuario);
    }

    private void propagarBloqueoAComercio(Usuario usuario) {
        if (usuario.getRol() != RolUsuario.COMERCIO) {
            return;
        }
        comercioRepository.findByPersonaJuridicaId(usuario.getId()).ifPresent(comercio -> {
            if (comercio.getEstado() == EstadoComercio.APROBADO) {
                comercio.setEstado(EstadoComercio.CERRADO_TEMPORALMENTE);
                comercioRepository.save(comercio);
            }
        });
    }

    private void restaurarComercioSiCorresponde(Usuario usuario, EstadoComercio estadoOrigenEsperado) {
        if (usuario.getRol() != RolUsuario.COMERCIO || estadoOrigenEsperado == null) {
            return;
        }
        comercioRepository.findByPersonaJuridicaId(usuario.getId()).ifPresent(comercio -> {
            if (comercio.getEstado() == estadoOrigenEsperado) {
                comercio.setEstado(EstadoComercio.APROBADO);
                comercioRepository.save(comercio);
            }
        });
    }

    private void cerrarSesionActivaSiExiste(Usuario usuario, TipoCierreSesion motivo) {
        sesionRepository.findByUsuarioIdAndActivaTrue(usuario.getId()).ifPresent(sesion -> {
            sesion.setActiva(false);
            sesion.setTipoCierre(motivo);
            sesion.setFechaCierre(LocalDateTime.now());
            sesionRepository.save(sesion);
        });
    }

    private Token generarToken(Usuario usuario, TipoToken tipo, LocalDateTime vencimiento) {
        List<Token> pendientes = tokenRepository.findByUsuarioIdAndTipoAndUsado(usuario.getId(), tipo, false);
        pendientes.forEach(pendiente -> pendiente.setUsado(true));
        tokenRepository.saveAll(pendientes);

        Token token = Token.builder()
                .usuario(usuario)
                .tipo(tipo)
                .token(UUID.randomUUID().toString())
                .fechaCreacion(LocalDateTime.now())
                .fechaVencimiento(vencimiento)
                .usado(false)
                .build();
        return tokenRepository.save(token);
    }

    private Token obtenerTokenValido(String token, TipoToken tipoEsperado) {
        Token tokenEntity = tokenRepository.findByTokenAndUsado(token, false)
                .orElseThrow(() -> new CredencialesInvalidasException("Token inválido o ya utilizado"));

        if (tokenEntity.getTipo() != tipoEsperado) {
            throw new CredencialesInvalidasException("Token inválido para esta operación");
        }

        if (tokenEntity.getFechaVencimiento().isBefore(LocalDateTime.now())) {
            throw new CredencialesInvalidasException("Token expirado");
        }

        return tokenEntity;
    }

    private void consumirToken(Token token) {
        token.setUsado(true);
        token.setFechaUso(LocalDateTime.now());
        tokenRepository.save(token);
    }

    private UsuarioResponseDTO aResponseDTO(Usuario usuario) {
        return new UsuarioResponseDTO(usuario.getId(), usuario.getEmail(), usuario.getRol(), usuario.getEstado());
    }
}
