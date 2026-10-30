package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ConfirmarReactivacionCuentaRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.request.VerificarCodigoRequestDTO;
import com.bajonea.backend.dto.response.LoginResponseDTO;
import com.bajonea.backend.dto.response.SuspensionUsuarioResponseDTO;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CredencialesInvalidasException;
import com.bajonea.backend.exceptions.CuentaSuspendidaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Suspensión y levantamiento de la cuenta de un Cliente (Fase 5, tramo S1) contra {@code bajonea_test}, con datos
 * confirmados de verdad (sin transacción de prueba): las dos fases de la suspensión corren como en producción.
 * Cubre el servicio, el login, el filtro JWT, el checkout, el historial de todos los cambios de estado y los
 * endpoints del Administrador.
 */
@AutoConfigureMockMvc
class SuspensionClienteIntegrationTest extends CarritoIntegrationBase {

    private static final String MOTIVO = "Reiteradas quejas de comercios por pedidos falsos";

    @Autowired
    private SuspensionUsuarioService suspensionService;

    @Autowired
    private AuthService authService;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private jakarta.persistence.EntityManager entityManager;

    @Autowired
    private com.bajonea.backend.config.security.JwtService jwtService;

    @Autowired
    private MockMvc mockMvc;

    private int administradorId;

    @BeforeEach
    void prepararAdministrador() {
        administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarSuspensionLevantada(anyString(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    private Token tokenNuevo(int usuarioId, TipoToken tipo) {
        jdbcTemplate.update("UPDATE token SET estado = 'UTILIZADO' WHERE usuario_id = ? AND tipo = ?", usuarioId, tipo.name());
        return tokenService.crear(usuarioRepository.findById(usuarioId).orElseThrow(), tipo, LocalDateTime.now().plusHours(24));
    }

    private SuspensionUsuarioRequestDTO motivo() {
        return new SuspensionUsuarioRequestDTO(MOTIVO);
    }

    private SuspensionUsuarioResponseDTO suspender(int clienteId) {
        return suspensionService.suspender(clienteId, administradorId, motivo());
    }

    private String estado(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, usuarioId);
    }

    private int filasDeHistorial(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ?", Integer.class, usuarioId);
    }

    private LoginRequestDTO login(Cuenta cuenta, String clave) {
        LoginRequestDTO request = new LoginRequestDTO();
        request.setNombreUsuario(cuenta.nombreUsuario());
        request.setPassword(clave);
        return request;
    }

    private LoginResponseDTO iniciarSesion(Cuenta cuenta) {
        return authService.login(login(cuenta, cuenta.clave()), "127.0.0.1", "test");
    }

    private int sesionesActivas(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sesion WHERE usuario_id = ? AND activa = 1", Integer.class, usuarioId);
    }

    private int emailsDeAviso(int usuarioId, String tipo, String estado) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND tipo = ? AND estado = ?",
                Integer.class, usuarioId, tipo, estado);
    }

    private int avisosEnLaApp(int usuarioId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'PUSH' AND tipo = ?",
                Integer.class, usuarioId, tipo);
    }

    @Test
    void suspenderCambiaElEstadoGuardaMotivoYFechaYEscribeElHistorial() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();

        SuspensionUsuarioResponseDTO respuesta = suspender(cuenta.id());

        assertEquals(EstadoUsuario.SUSPENDIDO, respuesta.getEstado());
        assertEquals("SUSPENDIDO", estado(cuenta.id()));
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT motivo_suspension, suspendido_desde FROM usuario WHERE id = ?", cuenta.id());
        assertEquals(MOTIVO, fila.get("motivo_suspension"));
        assertNotNull(fila.get("suspendido_desde"));
        Map<String, Object> historial = jdbcTemplate.queryForMap(
                "SELECT estado_origen, estado_destino, motivo, administrador_id FROM historial_estado_usuario WHERE usuario_id = ?", cuenta.id());
        assertEquals("ACTIVO", historial.get("estado_origen"));
        assertEquals("SUSPENDIDO", historial.get("estado_destino"));
        assertEquals(MOTIVO, historial.get("motivo"));
        assertEquals(administradorId, ((Number) historial.get("administrador_id")).intValue());
    }

    @Test
    void suspenderCierraLaSesionConTipoSuspensionYDejaAvisoYEmail() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        iniciarSesion(cuenta);
        assertEquals(1, sesionesActivas(cuenta.id()));

        suspender(cuenta.id());

        assertEquals(0, sesionesActivas(cuenta.id()));
        assertEquals("SUSPENSION", jdbcTemplate.queryForObject(
                "SELECT tipo_cierre FROM sesion WHERE usuario_id = ? ORDER BY id DESC LIMIT 1", String.class, cuenta.id()));
        assertEquals(1, avisosEnLaApp(cuenta.id(), "CLIENTE_SUSPENDIDO"));
        assertEquals(1, emailsDeAviso(cuenta.id(), "CLIENTE_SUSPENDIDO", "ENVIADO"));
    }

    @Test
    void siElEmailFallaQuedaMarcadoComoFalladoYSePuedeReenviarUnaSolaVezPorIntento() {
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(503, "caído"));
        Cuenta cuenta = datos.registrarClienteConCredenciales();

        suspender(cuenta.id());

        assertEquals(1, emailsDeAviso(cuenta.id(), "CLIENTE_SUSPENDIDO", "FALLIDO"));
        org.mockito.Mockito.verify(emailService, org.mockito.Mockito.times(1)).enviarCuentaSuspendida(anyString(), anyString());

        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("ok"));
        assertEquals(EstadoEnvioNotificacion.ENVIADO, suspensionService.reenviarEmail(cuenta.id(), administradorId));
        assertEquals(1, emailsDeAviso(cuenta.id(), "CLIENTE_SUSPENDIDO", "ENVIADO"));
        assertEquals(0, emailsDeAviso(cuenta.id(), "CLIENTE_SUSPENDIDO", "FALLIDO"));
        assertThrows(ConflictoDeNegocioException.class, () -> suspensionService.reenviarEmail(cuenta.id(), administradorId));
    }

    @Test
    void suspenderCancelaLosPedidosSinPagarYNoTocaLosPagados() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int sinPagar1 = pedidoPendientePago(cliente, dueno);
        int sinPagar2 = pedidoPendientePago(cliente, dueno);
        int pagado = pedidoPendientePago(cliente, dueno);
        jdbcTemplate.update("UPDATE pedido SET estado = 'EN_PREPARACION', pago_estado = 'PAGADO' WHERE id = ?", pagado);

        SuspensionUsuarioResponseDTO respuesta = suspender(cliente);

        assertEquals(2, respuesta.getPedidosSinPagarCancelados());
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(sinPagar1));
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(sinPagar2));
        assertEquals("EN_PREPARACION", estadoDelPedido(pagado));
        assertEquals("SUSPENSION_CLIENTE", jdbcTemplate.queryForObject(
                "SELECT motivo_timeout FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'CANCELADO_POR_SISTEMA'",
                String.class, sinPagar1));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'CANCELADO_POR_SISTEMA'",
                Integer.class, pagado));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id "
                + "WHERE pg.pedido_id IN (?, ?, ?)", Integer.class, sinPagar1, sinPagar2, pagado));
    }

    @Test
    void suspenderConservaElCarritoYBloqueaElCheckout() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        assertEquals(1, items(cliente));

        suspender(cliente);

        assertEquals(1, items(cliente));
        PedidoRequestDTO pedido = new PedidoRequestDTO();
        pedido.setTipoEntrega(TipoEntrega.RETIRO);
        CuentaSuspendidaException ex = assertThrows(CuentaSuspendidaException.class, () -> pedidoService.confirmarPedido(cliente, pedido));
        assertEquals(CuentaSuspendidaException.CODIGO, ex.getData().get("codigo"));
        assertEquals(MOTIVO, ex.getData().get("motivo"));
    }

    @Test
    void irAPagarQuedaBloqueadoMientrasLaCuentaEstaSuspendida() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        suspender(cliente);

        assertThrows(CuentaSuspendidaException.class, () -> mercadoPagoPagoService.iniciarOReusarPago(cliente, pedido));
    }

    @Autowired
    private MercadoPagoPagoService mercadoPagoPagoService;

    @Test
    void noSePuedeSuspenderDosVecesNiUnAdministradorNiUnDuenoNiUnoMismoNiUnInexistente() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        suspender(cuenta.id());
        ConflictoDeNegocioException yaSuspendida = assertThrows(ConflictoDeNegocioException.class, () -> suspender(cuenta.id()));
        assertEquals("La cuenta ya está suspendida", yaSuspendida.getMessage());
        assertEquals(1, filasDeHistorial(cuenta.id()));

        int otro = datos.registrarCliente();
        assertEquals("No se puede suspender a un Administrador", assertThrows(ConflictoDeNegocioException.class,
                () -> suspensionService.suspender(administradorId, otro, motivo())).getMessage());
        assertEquals("No podés suspender tu propia cuenta", assertThrows(ConflictoDeNegocioException.class,
                () -> suspensionService.suspender(administradorId, administradorId, motivo())).getMessage());
        Dueno dueno = datos.registrarDuenoAprobado();
        assertEquals("Un Dueño se suspende desde la lista de Dueños", assertThrows(ConflictoDeNegocioException.class,
                () -> suspender(dueno.id())).getMessage());
        assertEquals(0, filasDeHistorial(dueno.id()));
        assertThrows(RecursoNoEncontradoException.class, () -> suspender(2_000_000_000));
    }

    @Test
    void levantarDejaActivaUnaCuentaQueEstabaBloqueadaConIntentosEnCero() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET estado = 'BLOQUEADO', intentos_fallidos = 3 WHERE id = ?", cuenta.id());
        suspender(cuenta.id());
        assertEquals("BLOQUEADO", jdbcTemplate.queryForObject(
                "SELECT estado_origen FROM historial_estado_usuario WHERE usuario_id = ? AND estado_destino = 'SUSPENDIDO'", String.class, cuenta.id()));

        suspensionService.levantar(cuenta.id(), administradorId, new LevantamientoSuspensionRequestDTO("Revisamos el caso"));

        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT estado, intentos_fallidos, motivo_suspension, suspendido_desde FROM usuario WHERE id = ?", cuenta.id());
        assertEquals("ACTIVO", fila.get("estado"));
        assertEquals(0, ((Number) fila.get("intentos_fallidos")).intValue());
        assertNull(fila.get("motivo_suspension"));
        assertNull(fila.get("suspendido_desde"));
        assertEquals("Revisamos el caso", jdbcTemplate.queryForObject(
                "SELECT motivo FROM historial_estado_usuario WHERE usuario_id = ? AND estado_origen = 'SUSPENDIDO'", String.class, cuenta.id()));
        assertEquals(1, avisosEnLaApp(cuenta.id(), "SUSPENSION_LEVANTADA"));
        assertEquals(1, emailsDeAviso(cuenta.id(), "SUSPENSION_LEVANTADA", "ENVIADO"));
        assertEquals(2, filasDeHistorial(cuenta.id()));
        iniciarSesion(cuenta);
    }

    @Test
    void levantarUnaCuentaQueEstabaPendienteLaDejaPendienteYNoSeLevantaDosVeces() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET estado = 'PENDIENTE' WHERE id = ?", cuenta.id());
        suspender(cuenta.id());

        suspensionService.levantar(cuenta.id(), administradorId, null);

        assertEquals("PENDIENTE", estado(cuenta.id()));
        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> suspensionService.levantar(cuenta.id(), administradorId, null));
        assertEquals("La cuenta no está suspendida", ex.getMessage());
    }

    @Test
    void levantarUnaCuentaNoSuspendidaDa409() {
        int cliente = datos.registrarCliente();
        assertThrows(ConflictoDeNegocioException.class, () -> suspensionService.levantar(cliente, administradorId, null));
        assertEquals(0, filasDeHistorial(cliente));
    }

    @Test
    void conLaContrasenaIncorrectaUnaCuentaSuspendidaDaElMensajeGenericoYNoSumaIntentos() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        suspender(cuenta.id());

        for (int i = 0; i < 5; i++) {
            CredencialesInvalidasException ex = assertThrows(CredencialesInvalidasException.class,
                    () -> authService.login(login(cuenta, "Incorrecta1"), "127.0.0.1", "test"));
            assertEquals("Usuario o contraseña incorrectos", ex.getMessage());
            assertNull(ex.getData());
        }

        assertEquals("SUSPENDIDO", estado(cuenta.id()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT intentos_fallidos FROM usuario WHERE id = ?", Integer.class, cuenta.id()));
    }

    @Test
    void conLaContrasenaCorrectaUnaCuentaSuspendidaMuestraElMotivoYSigueSuspendidaSinSesion() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        suspender(cuenta.id());
        int sesionesAntes = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sesion WHERE usuario_id = ?", Integer.class, cuenta.id());

        CuentaSuspendidaException ex = assertThrows(CuentaSuspendidaException.class, () -> iniciarSesion(cuenta));

        assertEquals("CUENTA_SUSPENDIDA", ex.getData().get("codigo"));
        assertEquals(MOTIVO, ex.getData().get("motivo"));
        assertEquals("SUSPENDIDO", estado(cuenta.id()));
        assertEquals(sesionesAntes, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sesion WHERE usuario_id = ?", Integer.class, cuenta.id()));
    }

    @Test
    void recuperarLaContrasenaCambiaLaContrasenaPeroNoLevantaLaSuspension() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        suspender(cuenta.id());
        Usuario usuario = usuarioRepository.findById(cuenta.id()).orElseThrow();
        Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, LocalDateTime.now().plusMinutes(30));
        String hashAntes = jdbcTemplate.queryForObject("SELECT password_hash FROM usuario WHERE id = ?", String.class, cuenta.id());

        authService.confirmarRecuperacionPassword(
                new ConfirmarRecuperacionPasswordRequestDTO(cuenta.email(), token.getToken(), "NuevaClave1"));

        assertEquals("SUSPENDIDO", estado(cuenta.id()));
        assertFalse(hashAntes.equals(jdbcTemplate.queryForObject("SELECT password_hash FROM usuario WHERE id = ?", String.class, cuenta.id())));
        assertEquals(1, filasDeHistorial(cuenta.id()));
    }

    @Test
    void recuperarLaContrasenaDesbloqueaUnaCuentaBloqueadaYQuedaEnElHistorial() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        for (int i = 0; i < 3; i++) {
            assertThrows(CredencialesInvalidasException.class, () -> authService.login(login(cuenta, "Incorrecta1"), "127.0.0.1", "test"));
        }
        assertEquals("BLOQUEADO", estado(cuenta.id()));
        assertEquals(1, filasDeHistorial(cuenta.id()));
        Usuario usuario = usuarioRepository.findById(cuenta.id()).orElseThrow();
        Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, LocalDateTime.now().plusMinutes(30));

        authService.confirmarRecuperacionPassword(
                new ConfirmarRecuperacionPasswordRequestDTO(cuenta.email(), token.getToken(), "NuevaClave1"));

        assertEquals("ACTIVO", estado(cuenta.id()));
        assertEquals(List.of("BLOQUEADO", "ACTIVO"), jdbcTemplate.queryForList(
                "SELECT estado_destino FROM historial_estado_usuario WHERE usuario_id = ? ORDER BY id", String.class, cuenta.id()));
        assertNull(jdbcTemplate.queryForObject("SELECT administrador_id FROM historial_estado_usuario WHERE usuario_id = ? ORDER BY id LIMIT 1",
                Integer.class, cuenta.id()));
    }

    @Test
    void laVerificacionDelEmailSoloActivaCuentasPendientesYDejaHistorial() {
        Cuenta pendiente = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET estado = 'PENDIENTE' WHERE id = ?", pendiente.id());
        Token tokenPendiente = tokenNuevo(pendiente.id(), TipoToken.VERIFICACION_EMAIL);
        authService.verificarEmailConCodigo(new VerificarCodigoRequestDTO(pendiente.email(), tokenPendiente.getToken()));
        assertEquals("ACTIVO", estado(pendiente.id()));
        assertEquals(List.of("ACTIVO"), jdbcTemplate.queryForList(
                "SELECT estado_destino FROM historial_estado_usuario WHERE usuario_id = ?", String.class, pendiente.id()));

        Cuenta suspendida = datos.registrarClienteConCredenciales();
        Token tokenSuspendida = tokenNuevo(suspendida.id(), TipoToken.VERIFICACION_EMAIL);
        suspender(suspendida.id());
        authService.verificarEmailConCodigo(new VerificarCodigoRequestDTO(suspendida.email(), tokenSuspendida.getToken()));
        assertEquals("SUSPENDIDO", estado(suspendida.id()));

        Cuenta porEnlace = datos.registrarClienteConCredenciales();
        Token tokenEnlace = tokenNuevo(porEnlace.id(), TipoToken.VERIFICACION_EMAIL);
        suspender(porEnlace.id());
        authService.verificarEmail(tokenEnlace.getToken());
        assertEquals("SUSPENDIDO", estado(porEnlace.id()));
    }

    @Test
    void laReactivacionDeUnaCuentaInactivaDejaHistorialYNoLevantaUnaSuspension() {
        Cuenta inactiva = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET estado = 'INACTIVO' WHERE id = ?", inactiva.id());
        Token token = tokenService.crear(usuarioRepository.findById(inactiva.id()).orElseThrow(),
                TipoToken.REACTIVACION_CUENTA, LocalDateTime.now().plusHours(24));
        authService.confirmarReactivacionCuenta(new ConfirmarReactivacionCuentaRequestDTO(inactiva.email(), token.getToken()));
        assertEquals("ACTIVO", estado(inactiva.id()));
        assertEquals(List.of("ACTIVO"), jdbcTemplate.queryForList(
                "SELECT estado_destino FROM historial_estado_usuario WHERE usuario_id = ?", String.class, inactiva.id()));

        Cuenta suspendida = datos.registrarClienteConCredenciales();
        Token tokenSuspendida = tokenService.crear(usuarioRepository.findById(suspendida.id()).orElseThrow(),
                TipoToken.REACTIVACION_CUENTA, LocalDateTime.now().plusHours(24));
        suspender(suspendida.id());
        authService.confirmarReactivacionCuenta(new ConfirmarReactivacionCuentaRequestDTO(suspendida.email(), tokenSuspendida.getToken()));
        assertEquals("SUSPENDIDO", estado(suspendida.id()));
    }

    @Autowired
    private CierreComercioService cierreComercioService;

    @Test
    void unaRequestQueYaPasoElFiltroNoPuedeActuarSiLaCuentaFueSuspendidaEnElMedio() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        jdbcTemplate.update("UPDATE pedido SET estado = 'PENDIENTE_CONFIRMACION_COMERCIO', pago_estado = 'PAGADO' WHERE id = ?", pedido);
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, fecha_hora) VALUES (?, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', NOW())",
                pedido);
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        int productoId = producto(dueno);
        com.bajonea.backend.config.security.ComercioActivo comoEmpleado = new com.bajonea.backend.config.security.ComercioActivo(
                dueno.comercioId(), dueno.id(), empleado.id(), com.bajonea.backend.enums.RolActorComercio.EMPLEADO,
                com.bajonea.backend.enums.EstadoComercio.APTO_VENTA);

        datos.cambiarEstadoUsuario(cliente, "SUSPENDIDO");
        datos.cambiarEstadoUsuario(empleado.id(), "SUSPENDIDO");

        assertThrows(CuentaSuspendidaException.class, () -> pedidoService.cancelarPedido(cliente, pedido));
        assertThrows(CuentaSuspendidaException.class, () -> pedidoService.aceptarPedido(comoEmpleado, pedido));
        assertThrows(CuentaSuspendidaException.class,
                () -> productoService.cambiarEstado(comoEmpleado, productoId, com.bajonea.backend.enums.EstadoProducto.AGOTADO));
        assertThrows(CuentaSuspendidaException.class,
                () -> cierreComercioService.cerrar(dueno.comercioId(), empleado.id(), com.bajonea.backend.enums.ActorCierre.EMPLEADO));
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        assertEquals("DISPONIBLE", jdbcTemplate.queryForObject("SELECT estado FROM producto WHERE id = ?", String.class, productoId));
    }

    @Test
    void laBaseRechazaUnaSuspensionSinMotivoYUnMotivoSinSuspension() {
        int cliente = datos.registrarCliente();
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbcTemplate.update("UPDATE usuario SET estado = 'SUSPENDIDO' WHERE id = ?", cliente));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbcTemplate.update("UPDATE usuario SET motivo_suspension = 'x', suspendido_desde = NOW() WHERE id = ?", cliente));
        assertEquals("ACTIVO", estado(cliente));
    }

    private MockHttpServletRequestBuilder como(MockHttpServletRequestBuilder request, RolUsuario rol, int usuarioId) {
        AuthenticatedUser principal = new AuthenticatedUser(usuarioId, 1, rol);
        return request.with(authentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + rol.name())))));
    }

    @Test
    void elFiltroJwtResponde401ConCodigoYMotivoConLaSesionCerradaPorLaSuspension() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        String token = iniciarSesion(cuenta).getToken();
        mockMvc.perform(get("/api/v1/clientes/perfil").header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        suspender(cuenta.id());

        mockMvc.perform(get("/api/v1/clientes/perfil").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data.codigo").value("CUENTA_SUSPENDIDA"))
                .andExpect(jsonPath("$.data.motivo").value(MOTIVO));
    }

    @Test
    void elFiltroJwtNiegaElPasoAUnaCuentaSuspendidaAunConUnaSesionTodaviaActiva() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        String token = iniciarSesion(cuenta).getToken();
        jdbcTemplate.update("UPDATE usuario SET estado = 'SUSPENDIDO', motivo_suspension = 'Motivo cargado a mano', suspendido_desde = NOW() WHERE id = ?",
                cuenta.id());
        assertEquals(1, sesionesActivas(cuenta.id()));

        mockMvc.perform(get("/api/v1/clientes/perfil").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data.codigo").value("CUENTA_SUSPENDIDA"))
                .andExpect(jsonPath("$.data.motivo").value("Motivo cargado a mano"));
    }

    @Test
    void despuesDeLevantarLaSuspensionUnTokenViejoDaElErrorGenericoSinCodigo() throws Exception {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        String token = iniciarSesion(cuenta).getToken();
        suspender(cuenta.id());
        suspensionService.levantar(cuenta.id(), administradorId, null);

        mockMvc.perform(get("/api/v1/clientes/perfil").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void losEndpointsDelAdministradorSuspendenLevantanYValidanElMotivo() throws Exception {
        int cliente = datos.registrarCliente();
        String base = "/api/v1/administrador/clientes/" + cliente;

        mockMvc.perform(como(put(base + "/suspender"), RolUsuario.ADMINISTRADOR, administradorId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"corto\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(como(put(base + "/suspender"), RolUsuario.ADMINISTRADOR, administradorId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"          \"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(como(put(base + "/suspender"), RolUsuario.ADMINISTRADOR, administradorId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"" + "a".repeat(501) + "\"}"))
                .andExpect(status().isBadRequest());
        assertEquals("ACTIVO", estado(cliente));

        mockMvc.perform(como(get(base + "/suspension/previa"), RolUsuario.ADMINISTRADOR, administradorId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estadoActual").value("ACTIVO"))
                .andExpect(jsonPath("$.data.pedidosSinPagar").value(0));

        mockMvc.perform(como(put(base + "/suspender"), RolUsuario.ADMINISTRADOR, administradorId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"" + MOTIVO + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estado").value("SUSPENDIDO"));
        mockMvc.perform(como(put(base + "/suspender"), RolUsuario.ADMINISTRADOR, administradorId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"" + MOTIVO + "\"}"))
                .andExpect(status().isConflict());

        mockMvc.perform(como(put(base + "/levantar-suspension"), RolUsuario.ADMINISTRADOR, administradorId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estado").value("ACTIVO"));
        mockMvc.perform(como(put(base + "/levantar-suspension"), RolUsuario.ADMINISTRADOR, administradorId))
                .andExpect(status().isConflict());
    }

    @Test
    void lasRutasDeSuspensionSonExclusivasDelAdministrador() throws Exception {
        int cliente = datos.registrarCliente();
        String base = "/api/v1/administrador/clientes/" + cliente;
        for (MockHttpServletRequestBuilder ruta : List.of(put(base + "/suspender").contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"" + MOTIVO + "\"}"),
                put(base + "/levantar-suspension"), get(base + "/suspension/previa"), post(base + "/suspension/reenviar-email"))) {
            mockMvc.perform(como(ruta, RolUsuario.CLIENTE, cliente)).andExpect(status().isForbidden());
        }
        mockMvc.perform(put(base + "/suspender").contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"" + MOTIVO + "\"}"))
                .andExpect(status().isUnauthorized());
        assertEquals("ACTIVO", estado(cliente));
    }

    @Test
    void laVistaPreviaCuentaLosPedidosPagadosEnCursoYLosSinPagar() throws Exception {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        pedidoPendientePago(cliente, dueno);
        int pagado = pedidoPendientePago(cliente, dueno);
        jdbcTemplate.update("UPDATE pedido SET estado = 'EN_CAMINO' WHERE id = ?", pagado);
        int terminado = pedidoPendientePago(cliente, dueno);
        jdbcTemplate.update("UPDATE pedido SET estado = 'ENTREGADO' WHERE id = ?", terminado);

        mockMvc.perform(como(get("/api/v1/administrador/clientes/" + cliente + "/suspension/previa"), RolUsuario.ADMINISTRADOR, administradorId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pedidosPagadosEnCurso").value(1))
                .andExpect(jsonPath("$.data.pedidosSinPagar").value(1));
    }

    private void fijarUltimoAcceso(int usuarioId, String fecha) {
        jdbcTemplate.update("UPDATE usuario SET fecha_ultimo_acceso = ? WHERE id = ?", fecha, usuarioId);
    }

    private boolean ultimoAccesoReciente(int usuarioId) {
        Integer segundos = jdbcTemplate.queryForObject(
                "SELECT TIMESTAMPDIFF(SECOND, fecha_ultimo_acceso, NOW()) FROM usuario WHERE id = ?", Integer.class, usuarioId);
        return segundos != null && Math.abs(segundos) < 600;
    }

    @Test
    void levantarUnaCuentaQueEstabaInactivaLaDejaInactivaYNoTocaLaUltimaActividad() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET estado = 'INACTIVO' WHERE id = ?", cuenta.id());
        fijarUltimoAcceso(cuenta.id(), "2020-01-01 10:00:00");
        suspender(cuenta.id());

        SuspensionUsuarioResponseDTO respuesta = suspensionService.levantar(cuenta.id(), administradorId, null);

        assertEquals(EstadoUsuario.INACTIVO, respuesta.getEstado());
        assertEquals("INACTIVO", estado(cuenta.id()));
        assertFalse(ultimoAccesoReciente(cuenta.id()));
        assertEquals("INACTIVO", jdbcTemplate.queryForObject(
                "SELECT estado_destino FROM historial_estado_usuario WHERE usuario_id = ? AND estado_origen = 'SUSPENDIDO'", String.class, cuenta.id()));
    }

    @Test
    void levantarUnaCuentaQueEstabaActivaLaDejaActivaYActualizaLaUltimaActividad() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        fijarUltimoAcceso(cuenta.id(), "2020-01-01 10:00:00");
        suspender(cuenta.id());
        assertFalse(ultimoAccesoReciente(cuenta.id()));

        SuspensionUsuarioResponseDTO respuesta = suspensionService.levantar(cuenta.id(), administradorId, null);

        assertEquals(EstadoUsuario.ACTIVO, respuesta.getEstado());
        assertEquals("ACTIVO", estado(cuenta.id()));
        assertTrue(ultimoAccesoReciente(cuenta.id()));
    }

    @Test
    void levantarUnaCuentaQueEstabaBloqueadaTambienActualizaLaUltimaActividad() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET estado = 'BLOQUEADO', intentos_fallidos = 3 WHERE id = ?", cuenta.id());
        fijarUltimoAcceso(cuenta.id(), "2020-01-01 10:00:00");
        suspender(cuenta.id());

        suspensionService.levantar(cuenta.id(), administradorId, null);

        assertEquals("ACTIVO", estado(cuenta.id()));
        assertTrue(ultimoAccesoReciente(cuenta.id()));
    }

    @Test
    void levantarUnaCuentaPendienteNoTocaLaUltimaActividad() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET estado = 'PENDIENTE' WHERE id = ?", cuenta.id());
        fijarUltimoAcceso(cuenta.id(), "2020-01-01 10:00:00");
        suspender(cuenta.id());

        suspensionService.levantar(cuenta.id(), administradorId, null);

        assertEquals("PENDIENTE", estado(cuenta.id()));
        assertFalse(ultimoAccesoReciente(cuenta.id()));
    }

    @Test
    void levantarUnaCuentaSinHistorialDeLaSuspensionLaDejaActiva() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        jdbcTemplate.update("UPDATE usuario SET estado = 'SUSPENDIDO', motivo_suspension = ?, suspendido_desde = NOW() WHERE id = ?",
                MOTIVO, cuenta.id());
        assertEquals(0, filasDeHistorial(cuenta.id()));

        SuspensionUsuarioResponseDTO respuesta = suspensionService.levantar(cuenta.id(), administradorId, null);

        assertEquals(EstadoUsuario.ACTIVO, respuesta.getEstado());
        assertEquals("ACTIVO", estado(cuenta.id()));
    }

    @Test
    void elListadoDeClientesMarcaElUltimoEmailDeAvisoFallidoSegunElEstadoDeLaCuenta() throws Exception {
        int sinAviso = datos.registrarCliente();
        int suspendidaSinEmail = datos.registrarCliente();
        int suspendidaConEmail = datos.registrarCliente();
        int levantadaSinEmail = datos.registrarCliente();
        int levantadaConEmail = datos.registrarCliente();
        jdbcTemplate.update("UPDATE usuario SET estado = 'BLOQUEADO' WHERE id = ?", suspendidaConEmail);

        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(503, "caído"));
        suspender(suspendidaSinEmail);
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("ok"));
        suspender(suspendidaConEmail);
        suspender(levantadaSinEmail);
        suspender(levantadaConEmail);
        when(emailService.enviarSuspensionLevantada(anyString(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(ResultadoEnvioEmail.fallido(503, "caído"));
        suspensionService.levantar(levantadaSinEmail, administradorId, null);
        when(emailService.enviarSuspensionLevantada(anyString(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(ResultadoEnvioEmail.enviado("ok"));
        suspensionService.levantar(levantadaConEmail, administradorId, null);

        com.fasterxml.jackson.databind.JsonNode listado = listadoDeClientes();

        assertTrue(fallido(listado, suspendidaSinEmail));
        assertFalse(fallido(listado, suspendidaConEmail));
        assertTrue(fallido(listado, levantadaSinEmail));
        assertFalse(fallido(listado, levantadaConEmail));
        assertFalse(fallido(listado, sinAviso));
        assertEquals("ACTIVO", campo(listado, suspendidaSinEmail, "estadoPrevioSuspension"));
        assertEquals("BLOQUEADO", campo(listado, suspendidaConEmail, "estadoPrevioSuspension"));
        assertEquals("null", campo(listado, levantadaSinEmail, "estadoPrevioSuspension"));
        assertEquals("null", campo(listado, sinAviso, "estadoPrevioSuspension"));

        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("ok"));
        suspensionService.reenviarEmail(suspendidaSinEmail, administradorId);
        assertFalse(fallido(listadoDeClientes(), suspendidaSinEmail));
    }

    private com.fasterxml.jackson.databind.JsonNode listadoDeClientes() throws Exception {
        String respuesta = mockMvc.perform(como(get("/api/v1/administrador/clientes"), RolUsuario.ADMINISTRADOR, administradorId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new com.fasterxml.jackson.databind.ObjectMapper().readTree(respuesta).get("data");
    }

    private static String campo(com.fasterxml.jackson.databind.JsonNode listado, int clienteId, String nombre) {
        for (com.fasterxml.jackson.databind.JsonNode fila : listado) {
            if (fila.get("id").asInt() == clienteId) {
                return fila.get(nombre).isNull() ? "null" : fila.get(nombre).asText();
            }
        }
        throw new AssertionError("El cliente " + clienteId + " no está en el listado");
    }

    private static boolean fallido(com.fasterxml.jackson.databind.JsonNode listado, int clienteId) {
        for (com.fasterxml.jackson.databind.JsonNode fila : listado) {
            if (fila.get("id").asInt() == clienteId) {
                return fila.get("ultimoEmailAvisoFallido").asBoolean();
            }
        }
        throw new AssertionError("El cliente " + clienteId + " no está en el listado");
    }
}
