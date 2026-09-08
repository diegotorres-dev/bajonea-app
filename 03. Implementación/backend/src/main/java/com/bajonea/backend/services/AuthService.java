package com.bajonea.backend.services;

import com.bajonea.backend.config.security.JwtService;
import com.bajonea.backend.dto.request.CambioPasswordPerfilRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.ReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.RecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.ReenviarVerificacionRequestDTO;
import com.bajonea.backend.dto.request.ValidarCodigoRecuperacionRequestDTO;
import com.bajonea.backend.dto.request.VerificarCodigoRequestDTO;
import com.bajonea.backend.dto.response.LoginResponseDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Sesion;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoToken;
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
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
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
 * <p>
 * {@code ConflictoDeNegocioException.class} sumado en el Tramo 16.11, punto 2, por el mismo
 * motivo: {@code registrarIntentoFallidoToken} persiste el contador de intentos del código de
 * verificación (y, al 5to intento, invalida el token con {@code estado = UTILIZADO}) antes de que
 * {@code verificarEmailConCodigo} lance esa excepción al superar el máximo — bug real
 * encontrado probando este mismo tramo (el token nunca quedaba invalidado, permitiendo
 * intentos infinitos, porque el rollback por defecto deshacía el propio {@code save} que
 * lo marcaba utilizado).
 */
@Service
@RequiredArgsConstructor
@Transactional(noRollbackFor = { CredencialesInvalidasException.class, ConflictoDeNegocioException.class })
public class AuthService {

    private static final int MAX_INTENTOS_FALLIDOS = 3;
    private static final long EXPIRACION_RECUPERACION_PASSWORD_MIN = 30;
    private static final long EXPIRACION_REACTIVACION_CUENTA_HORAS = 24;
    private static final long EXPIRACION_VERIFICACION_EMAIL_HORAS = 24;
    private static final int MAX_INTENTOS_TOKEN_VERIFICACION = 5;
    private static final int MAX_INTENTOS_GENERACION_TOKEN = 5;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

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
            int intentosRestantes = registrarIntentoFallido(usuario);
            throw new CredencialesInvalidasException(
                    "Email o contraseña incorrectos", Map.of("intentosRestantes", intentosRestantes));
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

    /**
     * Flujo primario de la pantalla de verificación manual (Tramo 16.11, punto 1): a
     * diferencia de {@link #verificarEmail(String)} (que resuelve el token directo por
     * su valor, sin saber a qué usuario pertenece), acá el código de 6 dígitos se valida
     * contra el token pendiente de un email puntual — necesario para poder limitar
     * intentos fallidos por código (punto 2), algo que no es posible cuando el único dato
     * de entrada es el propio valor a adivinar.
     */
    public void verificarEmailConCodigo(VerificarCodigoRequestDTO request) {
        Token tokenEntity = obtenerTokenValidoPorCodigo(
                request.getEmail(), request.getCodigo(), TipoToken.VERIFICACION_EMAIL);
        consumirToken(tokenEntity);

        Usuario usuario = tokenEntity.getUsuario();
        usuario.setEstado(EstadoUsuario.ACTIVO);
        usuarioRepository.save(usuario);
    }

    public void reenviarVerificacion(ReenviarVerificacionRequestDTO request) {
        Usuario usuario = usuarioRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RecursoNoEncontradoException("No existe una cuenta con ese email"));

        if (usuario.getEstado() != EstadoUsuario.PENDIENTE) {
            throw new ConflictoDeNegocioException("Esta cuenta ya está verificada");
        }

        Token token = generarToken(usuario, TipoToken.VERIFICACION_EMAIL,
                LocalDateTime.now().plusHours(EXPIRACION_VERIFICACION_EMAIL_HORAS));

        emailService.enviarVerificacion(usuario.getEmail(), token.getToken());
    }

    /**
     * No lanza excepción si el email no existe (Tramo 16.12, corrección de user
     * enumeration) — antes {@code RecursoNoEncontradoException} escapaba sin capturar hasta
     * {@code GlobalExceptionHandler}, devolviendo un 404 real que contradecía el mensaje 200
     * "genérico" del controller. Ahora un email inexistente simplemente no genera ningún
     * efecto observable, y el llamador (Cliente/Comercio bloqueado incluido) sigue pudiendo
     * recuperar su contraseña sin cambios de comportamiento.
     */
    public void solicitarRecuperacionPassword(RecuperacionPasswordRequestDTO request) {
        usuarioRepository.findByEmail(request.getEmail()).ifPresent(usuario -> {
            Token token = generarToken(usuario, TipoToken.RECUPERACION_PASSWORD,
                    LocalDateTime.now().plusMinutes(EXPIRACION_RECUPERACION_PASSWORD_MIN));
            emailService.enviarRecuperacionPassword(usuario.getEmail(), token.getToken());
        });
    }

    /**
     * Valida el código de recuperación sin consumirlo (Tramo 16.14, paso 1 del flujo en 2
     * pasos): mismo límite de intentos fallidos que el resto de los flujos de token (vía
     * {@link #obtenerTokenValidoPorCodigo}), y el token sigue venciendo en su horario normal
     * si el usuario nunca completa el paso 2 — solo {@link #confirmarRecuperacionPassword}
     * lo consume de verdad.
     */
    public void validarCodigoRecuperacionPassword(ValidarCodigoRecuperacionRequestDTO request) {
        obtenerTokenValidoPorCodigo(request.getEmail(), request.getCodigo(), TipoToken.RECUPERACION_PASSWORD);
    }

    public void confirmarRecuperacionPassword(ConfirmarRecuperacionPasswordRequestDTO request) {
        Token tokenEntity = obtenerTokenValidoPorCodigo(
                request.getEmail(), request.getCodigo(), TipoToken.RECUPERACION_PASSWORD);
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
            int intentosRestantes = registrarIntentoFallido(usuario);
            throw new CredencialesInvalidasException(
                    "La contraseña actual es incorrecta", Map.of("intentosRestantes", intentosRestantes));
        }

        if (passwordEncoder.matches(request.getPasswordNueva(), usuario.getPasswordHash())) {
            throw new ValidacionException("La nueva contraseña debe ser distinta a la actual");
        }

        usuario.setPasswordHash(passwordEncoder.encode(request.getPasswordNueva()));
        usuario.setIntentosFallidos(0);
        usuarioRepository.save(usuario);

        cerrarSesionActivaSiExiste(usuario, TipoCierreSesion.FORZADO);
    }

    /**
     * Sin excepción por email inexistente ni por estado incorrecto (Tramo 16.12,
     * corrección de user enumeration) — mismo motivo que {@link
     * #solicitarRecuperacionPassword}. Genera un token real y manda el mismo email sin
     * importar el estado real de la cuenta (corrección de la Ronda 2 de UX/UI, ver
     * docs/DECISIONES.md): si antes solo generaba token cuando el estado era
     * {@code INACTIVO}, una cuenta en cualquier otro estado nunca tenía token contra el que
     * contar intentos, y el paso de confirmación fallaba distinto (sin
     * {@code intentosRestantes}, sin bloqueo) — filtrando el estado real de la cuenta.
     * {@link #confirmarReactivacionCuenta} es quien decide si corresponde mutar el estado.
     */
    public void solicitarReactivacionCuenta(ReactivacionCuentaRequestDTO request) {
        usuarioRepository.findByEmail(request.getEmail()).ifPresent(usuario -> {
            Token token = generarToken(usuario, TipoToken.REACTIVACION_CUENTA,
                    LocalDateTime.now().plusHours(EXPIRACION_REACTIVACION_CUENTA_HORAS));
            emailService.enviarReactivacionCuenta(usuario.getEmail(), token.getToken());
        });
    }

    /**
     * Solo muta el estado a {@code ACTIVO} si la cuenta efectivamente estaba
     * {@code INACTIVO} al momento de confirmar — si ya estaba en cualquier otro estado, el
     * código se consume igual (mismo éxito visible) pero sin ningún efecto real, para no
     * revelar el estado real de la cuenta (ver {@link #solicitarReactivacionCuenta}).
     */
    public void confirmarReactivacionCuenta(ConfirmarReactivacionCuentaRequestDTO request) {
        Token tokenEntity = obtenerTokenValidoPorCodigo(
                request.getEmail(), request.getCodigo(), TipoToken.REACTIVACION_CUENTA);
        consumirToken(tokenEntity);

        Usuario usuario = tokenEntity.getUsuario();
        if (usuario.getEstado() == EstadoUsuario.INACTIVO) {
            usuario.setEstado(EstadoUsuario.ACTIVO);
            usuarioRepository.save(usuario);
            restaurarComercioSiCorresponde(usuario, EstadoComercio.INACTIVO);
        }
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

    private int registrarIntentoFallido(Usuario usuario) {
        int intentos = usuario.getIntentosFallidos() + 1;
        usuario.setIntentosFallidos(intentos);

        if (intentos >= MAX_INTENTOS_FALLIDOS) {
            usuario.setEstado(EstadoUsuario.BLOQUEADO);
            cerrarSesionActivaSiExiste(usuario, TipoCierreSesion.FORZADO);
            propagarBloqueoAComercio(usuario);
        }

        usuarioRepository.save(usuario);
        return Math.max(MAX_INTENTOS_FALLIDOS - intentos, 0);
    }

    private void propagarBloqueoAComercio(Usuario usuario) {
        if (usuario.getRol() != RolUsuario.DUENO) {
            return;
        }
        comercioRepository.findByDuenoId(usuario.getId()).ifPresent(comercio -> {
            if (comercio.getEstado() == EstadoComercio.APROBADO) {
                comercio.setEstado(EstadoComercio.CERRADO_TEMPORALMENTE);
                comercioRepository.save(comercio);
            }
        });
    }

    private void restaurarComercioSiCorresponde(Usuario usuario, EstadoComercio estadoOrigenEsperado) {
        if (usuario.getRol() != RolUsuario.DUENO || estadoOrigenEsperado == null) {
            return;
        }
        comercioRepository.findByDuenoId(usuario.getId()).ifPresent(comercio -> {
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

    /**
     * Reintenta ante colisión de código (Tramo 16.12): con solo 1.000.000 de combinaciones
     * de 6 dígitos compartidas por los 3 tipos de token, y un {@code UNIQUE} de por vida
     * sobre toda la tabla (las filas usadas nunca se borran), la probabilidad de choque
     * crece con el tiempo de vida real del sitio en producción — sin reintento, un choque
     * se traducía en un {@code 409} genérico y confuso para el usuario en vez de,
     * simplemente, generar otro código.
     */
    private Token generarToken(Usuario usuario, TipoToken tipo, LocalDateTime vencimiento) {
        List<Token> pendientes = tokenRepository.findByUsuarioIdAndTipoAndEstado(usuario.getId(), tipo, EstadoToken.PENDIENTE);
        pendientes.forEach(pendiente -> pendiente.setEstado(EstadoToken.UTILIZADO));
        tokenRepository.saveAll(pendientes);

        for (int intento = 1; intento <= MAX_INTENTOS_GENERACION_TOKEN; intento++) {
            Token token = Token.builder()
                    .usuario(usuario)
                    .tipo(tipo)
                    .token(generarValorToken())
                    .fechaCreacion(LocalDateTime.now())
                    .fechaVencimiento(vencimiento)
                    .estado(EstadoToken.PENDIENTE)
                    .intentosFallidos(0)
                    .build();
            try {
                return tokenRepository.save(token);
            } catch (DataIntegrityViolationException ex) {
                if (intento == MAX_INTENTOS_GENERACION_TOKEN) {
                    throw ex;
                }
            }
        }
        throw new IllegalStateException("No se pudo generar un token único");
    }

    /**
     * Los 3 tipos de token usan el mismo formato desde el Tramo 16.12: código numérico de
     * 6 dígitos, pensado para tipeo manual (extiende a RECUPERACION_PASSWORD/
     * REACTIVACION_CUENTA la decisión ya tomada para VERIFICACION_EMAIL en el Tramo 16.11).
     * Los 3 pasan a consumirse siempre por email+código, nunca por link — ver
     * docs/DECISIONES.md.
     */
    private String generarValorToken() {
        return String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
    }

    private void registrarIntentoFallidoToken(Token token) {
        token.setIntentosFallidos(token.getIntentosFallidos() + 1);
        if (token.getIntentosFallidos() >= MAX_INTENTOS_TOKEN_VERIFICACION) {
            token.setEstado(EstadoToken.UTILIZADO);
            token.setFechaUso(LocalDateTime.now());
        }
        tokenRepository.save(token);
    }

    /**
     * Válido para {@code VERIFICACION_EMAIL} (flujo original, Tramo 16.11).
     */
    private Token obtenerTokenValido(String token, TipoToken tipoEsperado) {
        Token tokenEntity = tokenRepository.findByTokenAndEstado(token, EstadoToken.PENDIENTE)
                .orElseThrow(() -> new CredencialesInvalidasException("Token inválido o ya utilizado"));

        if (tokenEntity.getTipo() != tipoEsperado) {
            throw new CredencialesInvalidasException("Token inválido para esta operación");
        }

        if (tokenEntity.getFechaVencimiento().isBefore(LocalDateTime.now())) {
            throw new CredencialesInvalidasException("Token expirado");
        }

        return tokenEntity;
    }

    /**
     * Generalización de la lógica de {@code verificarEmailConCodigo} (Tramo 16.11) para los
     * 3 tipos de token (Tramo 16.12): resuelve el token pendiente más reciente del usuario
     * por email (sin revelar si el email existe — mismo mensaje genérico tanto si no existe
     * el usuario como si el código no matchea), valida vencimiento, y limita intentos
     * fallidos reusando {@link #registrarIntentoFallidoToken}.
     */
    private Token obtenerTokenValidoPorCodigo(String email, String codigo, TipoToken tipo) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new CredencialesInvalidasException("Código incorrecto o vencido"));

        Token tokenEntity = tokenRepository
                .findFirstByUsuarioIdAndTipoAndEstadoOrderByFechaCreacionDesc(usuario.getId(), tipo, EstadoToken.PENDIENTE)
                .orElseThrow(() -> new CredencialesInvalidasException("Código incorrecto o vencido"));

        if (tokenEntity.getFechaVencimiento().isBefore(LocalDateTime.now())) {
            throw new ConflictoDeNegocioException("El código venció. Solicitá uno nuevo.");
        }

        if (!tokenEntity.getToken().equals(codigo)) {
            registrarIntentoFallidoToken(tokenEntity);
            int restantes = MAX_INTENTOS_TOKEN_VERIFICACION - tokenEntity.getIntentosFallidos();
            if (restantes <= 0) {
                throw new ConflictoDeNegocioException(
                        "Superaste el máximo de intentos permitidos. Solicitá un nuevo código.");
            }
            throw new CredencialesInvalidasException(
                    "Código incorrecto. Te quedan " + restantes + " intento(s).",
                    Map.of("intentosRestantes", restantes));
        }

        return tokenEntity;
    }

    private void consumirToken(Token token) {
        token.setEstado(EstadoToken.UTILIZADO);
        token.setFechaUso(LocalDateTime.now());
        tokenRepository.save(token);
    }

    private UsuarioResponseDTO aResponseDTO(Usuario usuario) {
        return new UsuarioResponseDTO(
                usuario.getId(), usuario.getEmail(), usuario.getRol(), usuario.getEstado(), usuario.getFotoPerfilUrl());
    }
}
