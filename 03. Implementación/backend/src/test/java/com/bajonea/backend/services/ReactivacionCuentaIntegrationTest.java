package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.ConfirmarReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.response.LoginResponseDTO;
import com.bajonea.backend.dto.response.ReactivacionCuentaResponseDTO;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CredencialesInvalidasException;
import com.bajonea.backend.exceptions.CuentaInactivaException;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Cómo se sale de la inactividad (Fase 5, tramo S6): el login con la contraseña correcta avisa con un código estable, la
 * reactivación con usuario y contraseña tiene los mismos límites de intentos que el login y la misma respuesta
 * uniforme, y las demás vías (código por email, recuperación de contraseña, Administrador) devuelven la cuenta y los
 * comercios a su estado anterior.
 */
class ReactivacionCuentaIntegrationTest extends InactividadTestBase {

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private TokenService tokenService;

    private Cuenta clienteInactivo() {
        Cuenta cuenta = cliente();
        vencida(cuenta.id());
        correr();
        assertTrue(inactivada(cuenta.id()));
        return cuenta;
    }

    private Dueno duenoInactivo() {
        Dueno dueno = duenoActivo();
        vencida(dueno.id());
        correr();
        assertTrue(inactivada(dueno.id()));
        return dueno;
    }

    // ---------------------------------------------------------------- login

    @Test
    void elLoginConLaContrasenaCorrectaDeUnaCuentaInactivaResponde409ConUnCodigoEstableYNoIniciaSesion() {
        Cuenta cuenta = clienteInactivo();

        CuentaInactivaException ex = assertThrows(CuentaInactivaException.class,
                () -> authService.login(login(cuenta), "127.0.0.1", "test"));

        assertEquals("CUENTA_INACTIVA", ex.getData().get("codigo"));
        assertEquals("Cuenta inactiva. Solicitá la reactivación de tu cuenta", ex.getMessage());
        assertEquals(0, sesionesActivas(cuenta.id()));
        assertEquals("INACTIVO", estadoUsuario(cuenta.id()));
    }

    @Test
    void elLoginConUnaContrasenaIncorrectaDeUnaCuentaInactivaNoRevelaElEstadoYCuentaElIntento() {
        Cuenta cuenta = clienteInactivo();

        CredencialesInvalidasException ex = assertThrows(CredencialesInvalidasException.class,
                () -> authService.login(login(cuenta.nombreUsuario(), "Incorrecta1"), "127.0.0.1", "test"));

        assertEquals("Usuario o contraseña incorrectos", ex.getMessage());
        assertEquals(2, ((Map<?, ?>) ex.getData()).get("intentosRestantes"));
        assertEquals("INACTIVO", estadoUsuario(cuenta.id()), "los intentos fallidos nunca cambian el estado de una cuenta inactiva");
        assertEquals(1, jdbcTemplate.queryForObject("SELECT intentos_fallidos FROM usuario WHERE id = ?", Integer.class, cuenta.id()));
    }

    @Test
    void agotadosLosIntentosHastaLaContrasenaCorrectaRespondeCuentaBloqueadaYLaCuentaSigueInactiva() {
        Cuenta cuenta = clienteInactivo();
        for (int i = 0; i < 3; i++) {
            assertThrows(CredencialesInvalidasException.class, () -> authService.login(login(cuenta.nombreUsuario(), "Incorrecta1"), "127.0.0.1", "t"));
        }

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> authService.login(login(cuenta), "127.0.0.1", "test"));
        assertEquals("Cuenta bloqueada. Recuperá tu contraseña para desbloquearla", ex.getMessage());
        assertThrows(ConflictoDeNegocioException.class, () -> authService.reactivarConCredenciales(login(cuenta), "127.0.0.1", "test"));
        assertEquals("INACTIVO", estadoUsuario(cuenta.id()));
    }

    // ---------------------------------------------------------------- reactivar con usuario y contraseña

    @Test
    void reactivarConUsuarioYContrasenaDejaLaCuentaActivaConSesionHistorialYUltimoAcceso() {
        Cuenta cuenta = clienteInactivo();
        LocalDateTime antes = accesoDe(cuenta.id());

        LoginResponseDTO respuesta = authService.reactivarConCredenciales(login(cuenta), "127.0.0.1", "test");

        assertNotNull(respuesta.getToken());
        assertEquals("ACTIVO", estadoUsuario(cuenta.id()));
        assertEquals(1, sesionesActivas(cuenta.id()));
        assertTrue(accesoDe(cuenta.id()).isAfter(antes));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ? AND estado_origen = 'INACTIVO' AND estado_destino = 'ACTIVO'", Integer.class, cuenta.id()));
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT estado_origen, motivo, administrador_id FROM historial_estado_usuario "
                + "WHERE usuario_id = ? AND estado_destino = 'ACTIVO' ORDER BY id DESC LIMIT 1", cuenta.id());
        assertEquals("INACTIVO", fila.get("estado_origen"));
        assertEquals("Reactivación de cuenta", fila.get("motivo"));
        assertEquals(null, fila.get("administrador_id"));
    }

    @Test
    void reactivarConUnaContrasenaIncorrectaCuentaIntentosYNoReactivaNiRevelaNada() {
        Cuenta cuenta = clienteInactivo();

        CredencialesInvalidasException ex = assertThrows(CredencialesInvalidasException.class,
                () -> authService.reactivarConCredenciales(login(cuenta.nombreUsuario(), "Incorrecta1"), "127.0.0.1", "test"));

        assertEquals("Usuario o contraseña incorrectos", ex.getMessage());
        assertEquals(2, ((Map<?, ?>) ex.getData()).get("intentosRestantes"));
        assertEquals("INACTIVO", estadoUsuario(cuenta.id()));
    }

    @Test
    void reactivarUnaCuentaQueNoEstaInactivaOQueNoExisteDaLaMismaRespuestaUniformeYNoCuentaIntentos() {
        Cuenta activa = cliente();
        CredencialesInvalidasException conClaveCorrecta = assertThrows(CredencialesInvalidasException.class,
                () -> authService.reactivarConCredenciales(login(activa), "127.0.0.1", "test"));
        CredencialesInvalidasException inexistente = assertThrows(CredencialesInvalidasException.class,
                () -> authService.reactivarConCredenciales(login("usuarioquenoexiste1", "Cualquiera1"), "127.0.0.1", "test"));

        assertEquals("Usuario o contraseña incorrectos", conClaveCorrecta.getMessage());
        assertEquals(null, conClaveCorrecta.getData());
        assertEquals(conClaveCorrecta.getMessage(), inexistente.getMessage());
        assertEquals(0, jdbcTemplate.queryForObject("SELECT intentos_fallidos FROM usuario WHERE id = ?", Integer.class, activa.id()));
        assertEquals(0, sesionesActivas(activa.id()));
    }

    @Test
    void reactivarUnaCuentaSuspendidaNoLaLevantaYDaLaRespuestaUniforme() {
        Cuenta suspendida = cliente();
        suspensionUsuario.suspender(suspendida.id(), administradorId, new SuspensionUsuarioRequestDTO(MOTIVO));

        assertThrows(CredencialesInvalidasException.class, () -> authService.reactivarConCredenciales(login(suspendida), "127.0.0.1", "test"));

        assertEquals("SUSPENDIDO", estadoUsuario(suspendida.id()));
    }

    // ---------------------------------------------------------------- comercios

    @Test
    void reactivarAUnDuenoDevuelveSusComerciosAlEstadoQueTeniaYUnoSuspendidoPorSeparadoSigueSuspendido() {
        Dueno dueno = duenoActivo();
        int extra = comercioExtra(dueno, EstadoComercio.APROBADO);
        int suspendido = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        vencida(dueno.id());
        correr();
        assertEquals("INACTIVO", estadoComercio(dueno.comercioId()));

        authService.reactivarConCredenciales(login(dueno), "127.0.0.1", "test");

        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
        assertEquals("APTO_VENTA", estadoComercio(extra));
        assertEquals("SUSPENDIDO", estadoComercio(suspendido));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ? AND estado_origen = 'INACTIVO' AND estado_destino = 'APTO_VENTA'", Integer.class, dueno.comercioId()));
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT estado_origen, motivo FROM historial_estado_comercio "
                + "WHERE comercio_id = ? ORDER BY id DESC LIMIT 1", dueno.comercioId());
        assertEquals("INACTIVO", fila.get("estado_origen"));
        assertEquals("Restauración por reactivación de cuenta", fila.get("motivo"));
    }

    @Test
    void unComercioSinCuentaDeMercadoPagoVuelveComoAprobadoYNoComoAptoParaVender() {
        Dueno dueno = comercioApto(false);
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        vencida(dueno.id());
        correr();
        assertEquals("INACTIVO", estadoComercio(dueno.comercioId()));

        authService.reactivarConCredenciales(login(dueno), "127.0.0.1", "test");

        assertEquals("APROBADO", estadoComercio(dueno.comercioId()));
    }

    @Test
    void reactivarPorElCodigoDelEmailTambienRestauraLaCuentaYLosComercios() {
        Dueno dueno = duenoInactivo();
        Usuario usuario = usuarioRepository.findById(dueno.id()).orElseThrow();
        Token token = tokenService.crear(usuario, TipoToken.REACTIVACION_CUENTA, LocalDateTime.now().plusHours(24));

        authService.confirmarReactivacionCuenta(new ConfirmarReactivacionCuentaRequestDTO(dueno.email(), token.getToken()));

        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
        assertTrue(accesoDe(dueno.id()).isAfter(corte.plusMonths(2)), "el último acceso queda en la fecha de la reactivación");
    }

    @Test
    void recuperarLaContrasenaDeUnaCuentaInactivaLaReactivaConSusComercios() {
        Dueno dueno = duenoInactivo();
        Usuario usuario = usuarioRepository.findById(dueno.id()).orElseThrow();
        Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, LocalDateTime.now().plusMinutes(30));

        authService.confirmarRecuperacionPassword(new ConfirmarRecuperacionPasswordRequestDTO(dueno.email(), token.getToken(), "NuevaClave1"));

        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()), "recuperar la contraseña no puede dejar los comercios inactivos");
    }

    @Test
    void despuesDeReactivarLaCuentaNoVuelveAInactivarseEnLaMismaCorrida() {
        Cuenta cuenta = clienteInactivo();
        authService.reactivarConCredenciales(login(cuenta), "127.0.0.1", "test");

        correr();

        assertEquals("ACTIVO", estadoUsuario(cuenta.id()));
    }

    // ---------------------------------------------------------------- Administrador

    @Test
    void elAdministradorReactivaUnaCuentaInactivaDejandoSuHistorialYSusComercios() {
        Dueno dueno = duenoInactivo();

        ReactivacionCuentaResponseDTO respuesta = reactivacionAdmin.reactivar(dueno.id(), administradorId);

        assertEquals("ACTIVO", respuesta.getEstado().name());
        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT estado_origen, motivo, administrador_id FROM historial_estado_usuario "
                + "WHERE usuario_id = ? ORDER BY id DESC LIMIT 1", dueno.id());
        assertEquals("INACTIVO", fila.get("estado_origen"));
        assertEquals(administradorId, ((Number) fila.get("administrador_id")).intValue());
    }

    @Test
    void elAdministradorNoPuedeReactivarUnaCuentaQueNoEstaInactivaNiLaDeUnAdministradorNiUnaInexistente() {
        Cuenta activa = cliente();
        Cuenta suspendida = cliente();
        suspensionUsuario.suspender(suspendida.id(), administradorId, new SuspensionUsuarioRequestDTO(MOTIVO));

        assertThrows(ConflictoDeNegocioException.class, () -> reactivacionAdmin.reactivar(activa.id(), administradorId));
        assertThrows(ConflictoDeNegocioException.class, () -> reactivacionAdmin.reactivar(suspendida.id(), administradorId));
        assertThrows(ConflictoDeNegocioException.class, () -> reactivacionAdmin.reactivar(administradorId, administradorId));
        assertThrows(com.bajonea.backend.exceptions.RecursoNoEncontradoException.class, () -> reactivacionAdmin.reactivar(2_000_000_000, administradorId));
        assertEquals("SUSPENDIDO", estadoUsuario(suspendida.id()));
    }

    // ---------------------------------------------------------------- suspensión sobre una cuenta inactiva

    @Test
    void suspenderYLevantarLaSuspensionDeUnaCuentaInactivaLaDejaInactivaOtraVez() {
        Cuenta cuenta = clienteInactivo();

        suspensionUsuario.suspender(cuenta.id(), administradorId, new SuspensionUsuarioRequestDTO(MOTIVO));
        assertEquals("SUSPENDIDO", estadoUsuario(cuenta.id()));
        suspensionUsuario.levantar(cuenta.id(), administradorId, new LevantamientoSuspensionRequestDTO("Listo"));

        assertEquals("INACTIVO", estadoUsuario(cuenta.id()));
    }

    @Test
    void laInactivacionIgnoraALasCuentasSuspendidasAunqueFueranInactivasAntes() {
        Cuenta cuenta = clienteInactivo();
        suspensionUsuario.suspender(cuenta.id(), administradorId, new SuspensionUsuarioRequestDTO(MOTIVO));
        vencida(cuenta.id());

        correr();

        assertEquals("SUSPENDIDO", estadoUsuario(cuenta.id()));
    }
}
