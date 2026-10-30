package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.response.DuenoAdminResponseDTO;
import com.bajonea.backend.dto.response.SuspensionDuenoPreviaResponseDTO;
import com.bajonea.backend.dto.response.SuspensionDuenoPreviaResponseDTO.AtencionDePedidos;
import com.bajonea.backend.dto.response.SuspensionDuenoPreviaResponseDTO.Efecto;
import com.bajonea.backend.dto.response.SuspensionDuenoResponseDTO;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CuentaSuspendidaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Suspensión y levantamiento de la cuenta de un Dueño (Fase 5, tramo S3): el cambio de estado y la cascada a sus comercios,
 * los pedidos de cada estado con y sin Empleados activos, el bloqueo de las aprobaciones, los emails y avisos, la vista
 * previa y el listado del Administrador.
 */
class SuspensionDuenoIntegrationTest extends SuspensionDuenoTestBase {

    private static final String TEXTO_AVISO = "Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero.";

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private DocumentacionComercioProperties documentacionProperties;

    @Autowired
    private jakarta.persistence.EntityManagerFactory entityManagerFactory;

    private LoginRequestDTO login(Dueno dueno, String clave) {
        LoginRequestDTO request = new LoginRequestDTO();
        request.setNombreUsuario(dueno.nombreUsuario());
        request.setPassword(clave);
        return request;
    }

    // ---------------------------------------------------------------- la cuenta

    @Test
    void suspenderCambiaElEstadoCierraLaSesionYDejaElHistorialConElAdministrador() {
        Dueno dueno = duenoActivo();
        authService.login(login(dueno, dueno.clave()), "127.0.0.1", "test");
        assertEquals(1, sesionesActivas(dueno.id()));

        SuspensionDuenoResponseDTO respuesta = suspender(dueno);

        assertEquals("SUSPENDIDO", estadoUsuario(dueno.id()));
        assertEquals(MOTIVO, jdbcTemplate.queryForObject("SELECT motivo_suspension FROM usuario WHERE id = ?", String.class, dueno.id()));
        assertNotNull(jdbcTemplate.queryForObject("SELECT suspendido_desde FROM usuario WHERE id = ?", Object.class, dueno.id()));
        assertEquals(0, sesionesActivas(dueno.id()));
        assertEquals("SUSPENSION", jdbcTemplate.queryForObject("SELECT tipo_cierre FROM sesion WHERE usuario_id = ? ORDER BY id DESC LIMIT 1",
                String.class, dueno.id()));
        Map<String, Object> historial = jdbcTemplate.queryForMap("SELECT estado_origen, estado_destino, motivo, administrador_id "
                + "FROM historial_estado_usuario WHERE usuario_id = ?", dueno.id());
        assertEquals("ACTIVO", historial.get("estado_origen"));
        assertEquals("SUSPENDIDO", historial.get("estado_destino"));
        assertEquals(MOTIVO, historial.get("motivo"));
        assertEquals(administradorId, ((Number) historial.get("administrador_id")).intValue());
        assertEquals(List.of(dueno.comercioId()), respuesta.getComerciosSuspendidos());
    }

    @Test
    void elLoginDeUnDuenoSuspendidoRevelaLaSuspensionConElMotivoSoloConLaContrasenaCorrecta() {
        Dueno dueno = duenoActivo();
        suspender(dueno);

        CuentaSuspendidaException ex = assertThrows(CuentaSuspendidaException.class,
                () -> authService.login(login(dueno, dueno.clave()), "127.0.0.1", "test"));
        assertEquals(MOTIVO, ex.getData().get("motivo"));
        assertThrows(com.bajonea.backend.exceptions.CredencialesInvalidasException.class,
                () -> authService.login(login(dueno, "Incorrecta1"), "127.0.0.1", "test"));
        assertEquals("SUSPENDIDO", estadoUsuario(dueno.id()));
    }

    @Test
    void recuperarLaContrasenaNoLevantaLaSuspensionDeUnDueno() {
        Dueno dueno = duenoActivo();
        suspender(dueno);
        Usuario usuario = usuarioRepository.findById(dueno.id()).orElseThrow();
        Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, LocalDateTime.now().plusMinutes(30));

        authService.confirmarRecuperacionPassword(new ConfirmarRecuperacionPasswordRequestDTO(dueno.email(), token.getToken(), "NuevaClave1"));

        assertEquals("SUSPENDIDO", estadoUsuario(dueno.id()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ?", Integer.class, dueno.id()));
    }

    @Test
    void laSuspensionPrevaleceSobreElBloqueoYAlLevantarLaCuentaVuelveActivaConLosIntentosEnCero() {
        Dueno dueno = duenoActivo();
        jdbcTemplate.update("UPDATE usuario SET estado = 'BLOQUEADO', intentos_fallidos = 3 WHERE id = ?", dueno.id());

        suspender(dueno);
        assertEquals("SUSPENDIDO", estadoUsuario(dueno.id()));
        levantar(dueno, null);

        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT intentos_fallidos FROM usuario WHERE id = ?", Integer.class, dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
    }

    @Test
    void alLevantarLaCuentaVuelveAlEstadoQueTeniaAntesDeLaSuspensionSiEraPendienteOInactiva() {
        for (String previo : List.of("PENDIENTE", "INACTIVO")) {
            Dueno dueno = duenoActivo();
            jdbcTemplate.update("UPDATE usuario SET estado = ? WHERE id = ?", previo, dueno.id());
            suspender(dueno);
            levantar(dueno, null);
            assertEquals(previo, estadoUsuario(dueno.id()));
        }
    }

    @Test
    void noSePuedeSuspenderAUnAdministradorAUnoMismoNiAUnClienteYLosInexistentesDanNoEncontrado() {
        int cliente = datos.registrarCliente();
        assertEquals("No se puede suspender a un Administrador", assertThrows(ConflictoDeNegocioException.class,
                () -> suspensionDueno.suspender(administradorId, cliente, new SuspensionUsuarioRequestDTO(MOTIVO))).getMessage());
        assertEquals("No podés suspender tu propia cuenta", assertThrows(ConflictoDeNegocioException.class,
                () -> suspensionDueno.suspender(administradorId, administradorId, new SuspensionUsuarioRequestDTO(MOTIVO))).getMessage());
        assertThrows(RecursoNoEncontradoException.class, () -> suspensionDueno.suspender(cliente, administradorId, new SuspensionUsuarioRequestDTO(MOTIVO)));
        assertThrows(RecursoNoEncontradoException.class, () -> suspensionDueno.suspender(2_000_000_000, administradorId, new SuspensionUsuarioRequestDTO(MOTIVO)));
        assertThrows(RecursoNoEncontradoException.class, () -> suspensionDueno.levantar(2_000_000_000, administradorId, null));
        assertThrows(RecursoNoEncontradoException.class, () -> suspensionDueno.vistaPrevia(2_000_000_000, administradorId));
        assertEquals("ACTIVO", estadoUsuario(cliente));
    }

    @Test
    void suspenderDosVecesOLevantarUnaCuentaQueNoEstaSuspendidaDa409SinEscribirNada() {
        Dueno dueno = duenoActivo();
        assertEquals("La cuenta no está suspendida", assertThrows(ConflictoDeNegocioException.class, () -> levantar(dueno, null)).getMessage());
        suspender(dueno);
        assertEquals("La cuenta ya está suspendida", assertThrows(ConflictoDeNegocioException.class, () -> suspender(dueno)).getMessage());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ?", Integer.class, dueno.id()));
    }

    @Test
    void elEndpointDeClientesRechazaAUnDuenoYElDeDuenosRechazaAUnCliente() {
        Dueno dueno = duenoActivo();
        assertEquals("Un Dueño se suspende desde la lista de Dueños", assertThrows(ConflictoDeNegocioException.class,
                () -> suspensionUsuario.suspender(dueno.id(), administradorId, new SuspensionUsuarioRequestDTO(MOTIVO))).getMessage());
        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
    }

    // ---------------------------------------------------------------- la cascada a los comercios

    @Test
    void laCascadaSuspendeSoloLosComerciosAprobadosAptosYCerradosTemporalmente() {
        Dueno dueno = duenoActivo();
        int aprobado = comercioExtra(dueno, EstadoComercio.APROBADO);
        int cerrado = comercioExtra(dueno, EstadoComercio.CERRADO_TEMPORALMENTE);
        int pendiente = comercioExtra(dueno, EstadoComercio.PENDIENTE);
        int rechazado = comercioExtra(dueno, EstadoComercio.RECHAZADO);
        int definitivo = comercioExtra(dueno, EstadoComercio.RECHAZO_DEFINITIVO);
        int inactivo = comercioExtra(dueno, EstadoComercio.INACTIVO);

        SuspensionDuenoResponseDTO respuesta = suspender(dueno);

        for (int id : List.of(dueno.comercioId(), aprobado, cerrado)) {
            assertEquals("SUSPENDIDO", estadoComercio(id));
            assertEquals("DUENO", origenSuspension(id));
            assertEquals(MOTIVO, jdbcTemplate.queryForObject("SELECT motivo_suspension FROM comercio WHERE id = ?", String.class, id));
            assertNotNull(jdbcTemplate.queryForObject("SELECT suspendido_desde FROM comercio WHERE id = ?", Object.class, id));
            Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT estado_destino, suspension_origen, motivo, administrador_id "
                    + "FROM historial_estado_comercio WHERE comercio_id = ? AND estado_destino = 'SUSPENDIDO'", id);
            assertEquals("DUENO", fila.get("suspension_origen"));
            assertEquals(MOTIVO, fila.get("motivo"));
            assertEquals(administradorId, ((Number) fila.get("administrador_id")).intValue());
        }
        assertEquals("PENDIENTE", estadoComercio(pendiente));
        assertEquals("RECHAZADO", estadoComercio(rechazado));
        assertEquals("RECHAZO_DEFINITIVO", estadoComercio(definitivo));
        assertEquals("INACTIVO", estadoComercio(inactivo));
        for (int id : List.of(pendiente, rechazado, definitivo, inactivo)) {
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ?", Integer.class, id));
        }
        assertEquals(List.of(dueno.comercioId(), aprobado, cerrado).stream().sorted().toList(), respuesta.getComerciosSuspendidos().stream().sorted().toList());
    }

    @Test
    void laCascadaNoTocaElCierreManualDeLosComercios() {
        Dueno dueno = duenoActivo();
        jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", dueno.comercioId());

        suspender(dueno);

        assertEquals(1, jdbcTemplate.queryForObject("SELECT cerrado_manualmente FROM comercio WHERE id = ?", Integer.class, dueno.comercioId()));
        levantar(dueno, null);
        assertEquals(1, jdbcTemplate.queryForObject("SELECT cerrado_manualmente FROM comercio WHERE id = ?", Integer.class, dueno.comercioId()));
    }

    @Test
    void unComercioYaSuspendidoPorSeparadoNoCambiaAlSuspenderAlDuenoNiAlLevantarlo() {
        Dueno dueno = duenoActivo();
        int separado = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        Object desde = jdbcTemplate.queryForObject("SELECT suspendido_desde FROM comercio WHERE id = ?", Object.class, separado);

        suspender(dueno);

        assertEquals("SUSPENDIDO", estadoComercio(separado));
        assertEquals("INDIVIDUAL", origenSuspension(separado));
        assertEquals(desde, jdbcTemplate.queryForObject("SELECT suspendido_desde FROM comercio WHERE id = ?", Object.class, separado));
        assertEquals("Suspensión de prueba", jdbcTemplate.queryForObject(
                "SELECT motivo_suspension FROM comercio WHERE id = ?", String.class, separado));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ?", Integer.class, separado));

        SuspensionDuenoResponseDTO respuesta = levantar(dueno, null);

        assertEquals("SUSPENDIDO", estadoComercio(separado));
        assertEquals("INDIVIDUAL", origenSuspension(separado));
        assertEquals(List.of(separado), respuesta.getComerciosQueSiguenSuspendidos());
        assertEquals(List.of(dueno.comercioId()), respuesta.getComerciosRestaurados());
    }

    @Test
    void alLevantarSeRestauraSoloLoDeOrigenDuenoYCadaComercioSeRecalculaConLaCuentaDeCobro() {
        Dueno conCuenta = duenoActivo();
        int otroDeLaMisma = comercioExtra(conCuenta, EstadoComercio.APROBADO);
        Dueno sinCuenta = comercioApto(false);
        datos.cambiarEstadoUsuario(sinCuenta.id(), "ACTIVO");

        suspender(conCuenta);
        suspender(sinCuenta);
        levantar(conCuenta, "Ya regularizaste todo");
        levantar(sinCuenta, null);

        assertEquals("APTO_VENTA", estadoComercio(conCuenta.comercioId()));
        assertEquals("APTO_VENTA", estadoComercio(otroDeLaMisma));
        assertEquals("APROBADO", estadoComercio(sinCuenta.comercioId()));
        for (int id : List.of(conCuenta.comercioId(), otroDeLaMisma, sinCuenta.comercioId())) {
            assertEquals(null, origenSuspension(id));
            assertEquals(null, jdbcTemplate.queryForObject("SELECT suspendido_desde FROM comercio WHERE id = ?", Object.class, id));
            assertEquals(null, jdbcTemplate.queryForObject("SELECT motivo_suspension FROM comercio WHERE id = ?", String.class, id));
            Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT estado_origen, suspension_origen, administrador_id FROM historial_estado_comercio "
                    + "WHERE comercio_id = ? AND estado_origen = 'SUSPENDIDO'", id);
            assertEquals("DUENO", fila.get("suspension_origen"));
            assertEquals(administradorId, ((Number) fila.get("administrador_id")).intValue());
        }
    }

    @Test
    void alLevantarConLaDocumentacionRequeridaElDestinoDependeDeLosDocumentosAprobados() {
        boolean antes = documentacionProperties.isRequerida();
        documentacionProperties.setRequerida(true);
        try {
            Dueno sinDocumento = duenoActivo();
            Dueno conDocumento = duenoActivo();
            testSupportService.aprobarDocumentacion(conDocumento.comercioId());
            suspender(sinDocumento);
            suspender(conDocumento);
            levantar(sinDocumento, null);
            levantar(conDocumento, null);

            assertEquals("APROBADO", estadoComercio(sinDocumento.comercioId()));
            assertEquals("APTO_VENTA", estadoComercio(conDocumento.comercioId()));
        } finally {
            documentacionProperties.setRequerida(antes);
        }
    }

    @Test
    void unComercioDelDuenoSuspendidoPorSeparadoDespuesDeLaCuentaPasaAIndividualYNoSeRestauraAlLevantarAlDueno() {
        Dueno dueno = duenoActivo();
        suspender(dueno);

        suspensionComercio.suspender(dueno.comercioId(), administradorId, new SuspensionComercioRequestDTO("Documentacion vencida y quejas"));

        assertEquals("INDIVIDUAL", origenSuspension(dueno.comercioId()));
        levantar(dueno, null);
        assertEquals("SUSPENDIDO", estadoComercio(dueno.comercioId()));
        assertEquals("INDIVIDUAL", origenSuspension(dueno.comercioId()));
    }

    @Test
    void unComercioSuspendidoPorSeparadoNoSePuedeLevantarMientrasElDuenoEstaSuspendido() {
        Dueno dueno = duenoActivo();
        int separado = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        suspender(dueno);

        assertEquals("El Dueño tiene la cuenta suspendida. Levantá la suspensión primero.", assertThrows(ConflictoDeNegocioException.class,
                () -> suspensionComercio.levantar(separado, administradorId, null)).getMessage());
        assertEquals("SUSPENDIDO", estadoComercio(separado));

        levantar(dueno, null);
        suspensionComercio.levantar(separado, administradorId, null);
        assertEquals("APTO_VENTA", estadoComercio(separado));
    }

    // ---------------------------------------------------------------- aprobar y rechazar con el Dueño suspendido

    @Test
    void conElDuenoSuspendidoNoSeApruebaUnComercioPendientePeroSiSeRechaza() {
        Dueno dueno = duenoActivo();
        int pendiente = comercioExtra(dueno, EstadoComercio.PENDIENTE);
        int otro = comercioExtra(dueno, EstadoComercio.PENDIENTE);
        suspender(dueno);

        assertEquals("El Dueño tiene la cuenta suspendida. Levantá la suspensión primero.", assertThrows(ConflictoDeNegocioException.class,
                () -> administradorService.resolverAprobacion(pendiente, administradorId, new AprobacionComercioRequestDTO(true, null))).getMessage());
        assertEquals("PENDIENTE", estadoComercio(pendiente));

        administradorService.resolverAprobacion(otro, administradorId, new AprobacionComercioRequestDTO(false, "No cumple los requisitos"));
        assertEquals("RECHAZADO", estadoComercio(otro));

        levantar(dueno, null);
        administradorService.resolverAprobacion(pendiente, administradorId, new AprobacionComercioRequestDTO(true, null));
        assertEquals("APTO_VENTA", estadoComercio(pendiente));
    }

    // ---------------------------------------------------------------- los pedidos

    @Test
    void conEmpleadosActivosLosPedidosEnPreparacionYListosSiguenSuCursoYLosPendientesSeRechazan() {
        Dueno dueno = duenoActivo();
        empleado(dueno.comercioId());
        int cliente = datos.registrarCliente();
        int pendiente = pedido(dueno.comercioId(), dueno.id(), cliente, "PENDIENTE_CONFIRMACION_COMERCIO");
        int enPreparacion = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        int listo = pedido(dueno.comercioId(), dueno.id(), cliente, "LISTO_PARA_RETIRAR");
        int enCamino = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_CAMINO");
        int sinPagar = pedido(dueno.comercioId(), dueno.id(), cliente, "PENDIENTE_PAGO");

        SuspensionDuenoResponseDTO respuesta = suspender(dueno);

        assertEquals("RECHAZADO", estadoDelPedido(pendiente));
        assertEquals(1, notas(pendiente));
        assertEquals("EN_PREPARACION", estadoDelPedido(enPreparacion));
        assertEquals("LISTO_PARA_RETIRAR", estadoDelPedido(listo));
        assertEquals("EN_CAMINO", estadoDelPedido(enCamino));
        assertEquals("PENDIENTE_PAGO", estadoDelPedido(sinPagar));
        assertEquals(0, notas(enPreparacion) + notas(listo) + notas(enCamino) + notas(sinPagar));
        assertEquals(1, respuesta.getPedidosPendientesRechazados());
        assertEquals(0, respuesta.getPedidosSinAtencionProcesados());
    }

    @Test
    void sinEmpleadosActivosLosPedidosEnPreparacionSeAnulanYLosListosSeCancelanConReembolsoYAviso() {
        Dueno dueno = duenoActivo();
        int cliente = datos.registrarCliente();
        int enPreparacion = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        int listo = pedido(dueno.comercioId(), dueno.id(), cliente, "LISTO_PARA_RETIRAR");
        int enCamino = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_CAMINO");
        int sinPagar = pedido(dueno.comercioId(), dueno.id(), cliente, "PENDIENTE_PAGO");

        SuspensionDuenoResponseDTO respuesta = suspender(dueno);

        assertEquals("ANULADO", estadoDelPedido(enPreparacion));
        assertEquals("SISTEMA", jdbcTemplate.queryForObject("SELECT cancelado_por FROM pedido WHERE id = ?", String.class, enPreparacion));
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(listo));
        assertEquals("SISTEMA", jdbcTemplate.queryForObject("SELECT cancelado_por FROM pedido WHERE id = ?", String.class, listo));
        for (int id : List.of(enPreparacion, listo)) {
            assertEquals(1, notas(id));
            assertEquals("PROCESADO", jdbcTemplate.queryForObject("SELECT nc.estado FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                    String.class, id));
            assertEquals("SUSPENSION_COMERCIO", jdbcTemplate.queryForObject("SELECT nc.motivo FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                    String.class, id));
            assertEquals("SISTEMA", jdbcTemplate.queryForObject("SELECT actor_rol FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1",
                    String.class, id));
            assertEquals("SUSPENSION_DUENO_SIN_ATENCION", jdbcTemplate.queryForObject(
                    "SELECT motivo_timeout FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1", String.class, id));
        }
        assertEquals(1, filasDeHistorialDePedido(enPreparacion, "ANULADO"));
        assertEquals(1, filasDeHistorialDePedido(listo, "CANCELADO_POR_SISTEMA"));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'PEDIDO_ANULADO_COMERCIO' AND mensaje = ?",
                Integer.class, cliente, TEXTO_AVISO));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'PEDIDO_CANCELADO_SISTEMA' AND mensaje = ?",
                Integer.class, cliente, TEXTO_AVISO));
        assertEquals("EN_CAMINO", estadoDelPedido(enCamino));
        assertEquals("PENDIENTE_PAGO", estadoDelPedido(sinPagar));
        assertEquals(2, respuesta.getPedidosSinAtencionProcesados());
        verify(reembolsoClient, times(2)).solicitarReembolsoTotal(any(), any(), anyString());
    }

    @Test
    void unEmpleadoSuspendidoBloqueadoOInactivoOConLaRelacionDadaDeBajaNoCuentaComoActivo() {
        for (String caso : List.of("SUSPENDIDO", "BLOQUEADO", "INACTIVO", "RELACION_INACTIVA")) {
            Dueno dueno = duenoActivo();
            int empleado = empleado(dueno.comercioId());
            if (caso.equals("RELACION_INACTIVA")) {
                jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?",
                        empleado, dueno.comercioId());
            } else if (caso.equals("SUSPENDIDO")) {
                datos.cambiarEstadoUsuario(empleado, "SUSPENDIDO");
            } else {
                jdbcTemplate.update("UPDATE usuario SET estado = ? WHERE id = ?", caso, empleado);
            }
            int cliente = datos.registrarCliente();
            int enPreparacion = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");

            suspender(dueno);

            assertEquals("ANULADO", estadoDelPedido(enPreparacion), caso);
        }
    }

    @Test
    void siElUnicoEmpleadoEsElClienteDelPedidoElPedidoQuedaSinAtencion() {
        Dueno dueno = duenoActivo();
        int empleadoQueCompra = empleado(dueno.comercioId());
        int otroCliente = datos.registrarCliente();
        int propio = pedido(dueno.comercioId(), dueno.id(), empleadoQueCompra, "EN_PREPARACION");
        int ajeno = pedido(dueno.comercioId(), dueno.id(), otroCliente, "EN_PREPARACION");

        suspender(dueno);

        assertEquals("ANULADO", estadoDelPedido(propio));
        assertEquals("EN_PREPARACION", estadoDelPedido(ajeno));
    }

    @Test
    void conElComercioDeOtroDuenoOLosComerciosNoSuspendidosLosPedidosNoSeTocan() {
        Dueno dueno = duenoActivo();
        Dueno ajeno = duenoActivo();
        int cliente = datos.registrarCliente();
        int pedidoAjeno = pedido(ajeno.comercioId(), ajeno.id(), cliente, "EN_PREPARACION");
        int pendienteAjeno = pedido(ajeno.comercioId(), ajeno.id(), cliente, "PENDIENTE_CONFIRMACION_COMERCIO");

        suspender(dueno);
        schedulerService.ejecutar("procesar-sin-atencion-suspension-dueno", LocalDateTime.now());

        assertEquals("EN_PREPARACION", estadoDelPedido(pedidoAjeno));
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pendienteAjeno));
    }

    @Test
    void siMercadoPagoFallaEnUnPedidoEseQuedaAnuladoConElReembolsoPendienteYLosDemasSeProcesan() {
        Dueno dueno = duenoActivo();
        int cliente = datos.registrarCliente();
        int primero = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        int fallido = pedido(dueno.comercioId(), dueno.id(), cliente, "LISTO_PARA_RETIRAR");
        int tercero = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        when(reembolsoClient.solicitarReembolsoTotal(eq("sd-" + fallido), any(), anyString()))
                .thenReturn(MercadoPagoReembolsoClient.ResultadoReembolsoMp.fallido("Mercado Pago no respondio"));

        suspender(dueno);

        assertEquals("ANULADO", estadoDelPedido(primero));
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(fallido));
        assertEquals("ANULADO", estadoDelPedido(tercero));
        for (int id : List.of(primero, fallido, tercero)) {
            assertEquals(1, notas(id));
        }
        assertNotEquals("PROCESADO", jdbcTemplate.queryForObject("SELECT nc.estado FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                String.class, fallido));
    }

    @Test
    void elDuenoYElEmpleadoNoPuedenCancelarUnPedidoListoParaRetirarYElClienteTampoco() {
        Dueno dueno = duenoActivo();
        int empleado = empleado(dueno.comercioId());
        int cliente = datos.registrarCliente();
        int listo = pedido(dueno.comercioId(), dueno.id(), cliente, "LISTO_PARA_RETIRAR");
        var comoDueno = actor(dueno);
        var comoEmpleado = comoEmpleado(dueno, dueno.comercioId(), empleado);

        for (var actor : List.of(comoDueno, comoEmpleado)) {
            assertThrows(ConflictoDeNegocioException.class,
                    () -> pedidoService.anularPedido(actor, listo, new AnulacionPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
            assertThrows(ConflictoDeNegocioException.class,
                    () -> pedidoService.rechazarPedido(actor, listo, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
            assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.aceptarPedido(actor, listo));
            assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.avanzarAEntregaEnCurso(actor, listo));
        }
        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.cancelarPedido(cliente, listo));
        assertEquals("LISTO_PARA_RETIRAR", estadoDelPedido(listo));
        assertEquals(0, notas(listo));
    }

    // ---------------------------------------------------------------- el barrido

    @Test
    void elBarridoProcesaLoQueQuedoSinHacerYEsIdempotente() {
        Dueno dueno = duenoActivo();
        int cliente = datos.registrarCliente();
        suspender(dueno);
        int enPreparacion = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        int listo = pedido(dueno.comercioId(), dueno.id(), cliente, "LISTO_PARA_RETIRAR");

        schedulerService.ejecutar("procesar-sin-atencion-suspension-dueno", LocalDateTime.now());
        schedulerService.ejecutar("procesar-sin-atencion-suspension-dueno", LocalDateTime.now());

        assertEquals("ANULADO", estadoDelPedido(enPreparacion));
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(listo));
        assertEquals(1, notas(enPreparacion));
        assertEquals(1, notas(listo));
        assertEquals(1, filasDeHistorialDePedido(enPreparacion, "ANULADO"));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND mensaje = ?", Integer.class, cliente, TEXTO_AVISO));
        verify(reembolsoClient, times(2)).solicitarReembolsoTotal(any(), any(), anyString());
    }

    @Test
    void elBarridoCubreUnComercioSuspendidoPorSeparadoAntesQueSuDueno() {
        Dueno dueno = duenoActivo();
        int separado = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        int cliente = datos.registrarCliente();
        int enPreparacion = pedido(separado, dueno.id(), cliente, "EN_PREPARACION");
        int pendiente = pedido(separado, dueno.id(), cliente, "PENDIENTE_CONFIRMACION_COMERCIO");

        suspender(dueno);

        assertEquals("ANULADO", estadoDelPedido(enPreparacion));
        assertEquals("RECHAZADO", estadoDelPedido(pendiente));
        assertEquals("INDIVIDUAL", origenSuspension(separado));
    }

    @Test
    void elBarridoVuelveAEvaluarCuandoUnEmpleadoDejaDeEstarActivo() {
        Dueno dueno = duenoActivo();
        int empleado = empleado(dueno.comercioId());
        int cliente = datos.registrarCliente();
        int enPreparacion = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        suspender(dueno);
        assertEquals("EN_PREPARACION", estadoDelPedido(enPreparacion));

        schedulerService.ejecutar("procesar-sin-atencion-suspension-dueno", LocalDateTime.now());
        assertEquals("EN_PREPARACION", estadoDelPedido(enPreparacion));

        suspensionUsuario.suspender(empleado, administradorId, new SuspensionUsuarioRequestDTO(MOTIVO));
        schedulerService.ejecutar("procesar-sin-atencion-suspension-dueno", LocalDateTime.now());

        assertEquals("ANULADO", estadoDelPedido(enPreparacion));
        assertEquals(1, notas(enPreparacion));
    }

    @Test
    void alLevantarAlDuenoElBarridoDejaDeActuarSobreSusComercios() {
        Dueno dueno = duenoActivo();
        int cliente = datos.registrarCliente();
        suspender(dueno);
        levantar(dueno, null);
        int enPreparacion = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");

        schedulerService.ejecutar("procesar-sin-atencion-suspension-dueno", LocalDateTime.now());

        assertEquals("EN_PREPARACION", estadoDelPedido(enPreparacion));
    }

    @Test
    void losPedidosYaAnuladosNoSeRestauranAlLevantarAlDueno() {
        Dueno dueno = duenoActivo();
        int cliente = datos.registrarCliente();
        int enPreparacion = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        suspender(dueno);

        levantar(dueno, null);

        assertEquals("ANULADO", estadoDelPedido(enPreparacion));
    }

    // ---------------------------------------------------------------- emails y avisos

    @Test
    void saleUnSoloEmailPorSuspensionConTodosLosComerciosYOtroPorLevantamiento() {
        Dueno dueno = duenoActivo();
        int segundo = comercioExtra(dueno, EstadoComercio.APROBADO);
        int separado = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        String nombreSegundo = jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class, segundo);
        String nombreSeparado = jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class, separado);

        suspender(dueno);

        verify(emailService, times(1)).enviarDuenoSuspendido(eq(dueno.email()), eq(MOTIVO),
                org.mockito.ArgumentMatchers.argThat(lista -> lista.size() == 2 && lista.contains(dueno.nombreComercio()) && lista.contains(nombreSegundo)));
        verify(emailService, never()).enviarComercioSuspendido(anyString(), anyString(), anyString());
        verify(emailService, never()).enviarCuentaSuspendida(anyString(), anyString());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'DUENO_SUSPENDIDO' AND canal = 'EMAIL' AND estado = 'ENVIADO'",
                Integer.class, dueno.id()));
        assertEquals(2, avisos(dueno.id(), "COMERCIO_SUSPENDIDO"));

        levantar(dueno, "Mensaje para vos");

        verify(emailService, times(1)).enviarDuenoSuspensionLevantada(eq(dueno.email()), eq("Mensaje para vos"),
                org.mockito.ArgumentMatchers.argThat(lista -> lista.size() == 2),
                org.mockito.ArgumentMatchers.argThat(lista -> lista.size() == 1 && lista.contains(nombreSeparado)));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'DUENO_SUSPENSION_LEVANTADA' AND canal = 'EMAIL'",
                Integer.class, dueno.id()));
    }

    @Test
    void elDuenoVeUnAvisoDentroDeLaAppPorCadaComercioAfectadoConSuComercioYSinMandarUnEmailPorComercio() {
        Dueno dueno = duenoActivo();
        int segundo = comercioExtra(dueno, EstadoComercio.APROBADO);

        suspender(dueno);

        for (int id : List.of(dueno.comercioId(), segundo)) {
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND comercio_id = ? AND tipo = 'COMERCIO_SUSPENDIDO' AND canal = 'PUSH'",
                    Integer.class, dueno.id(), id));
        }
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND tipo = 'COMERCIO_SUSPENDIDO'",
                Integer.class, dueno.id()));
    }

    @Test
    void siElEmailFallaQuedaElRastroFallidoYElAdministradorLoPuedeReenviar() {
        Dueno dueno = duenoActivo();
        when(emailService.enviarDuenoSuspendido(anyString(), anyString(), anyList())).thenReturn(ResultadoEnvioEmail.fallido(503, "caido"));

        suspender(dueno);

        assertEquals("FALLIDO", jdbcTemplate.queryForObject("SELECT estado FROM notificacion WHERE usuario_id = ? AND tipo = 'DUENO_SUSPENDIDO' AND canal = 'EMAIL'",
                String.class, dueno.id()));
        DuenoAdminResponseDTO fila = administradorService.listarDuenos().stream().filter(d -> d.getId().equals(dueno.id())).findFirst().orElseThrow();
        assertTrue(fila.isUltimoEmailAvisoFallido());

        when(emailService.enviarDuenoSuspendido(anyString(), anyString(), anyList())).thenReturn(ResultadoEnvioEmail.enviado("ok"));
        assertEquals(EstadoEnvioNotificacion.ENVIADO, suspensionDueno.reenviarEmail(dueno.id(), administradorId));

        assertEquals("ENVIADO", jdbcTemplate.queryForObject("SELECT estado FROM notificacion WHERE usuario_id = ? AND tipo = 'DUENO_SUSPENDIDO' AND canal = 'EMAIL'",
                String.class, dueno.id()));
        fila = administradorService.listarDuenos().stream().filter(d -> d.getId().equals(dueno.id())).findFirst().orElseThrow();
        assertFalse(fila.isUltimoEmailAvisoFallido());
        assertThrows(ConflictoDeNegocioException.class, () -> suspensionDueno.reenviarEmail(dueno.id(), administradorId));
    }

    @Test
    void siElEmailDelLevantamientoFallaSePuedeReenviarConLosComerciosQueVolvieron() {
        Dueno dueno = duenoActivo();
        suspender(dueno);
        when(emailService.enviarDuenoSuspensionLevantada(anyString(), any(), anyList(), anyList())).thenReturn(ResultadoEnvioEmail.fallido(503, "caido"));

        levantar(dueno, "Mensaje");

        assertEquals("FALLIDO", jdbcTemplate.queryForObject("SELECT estado FROM notificacion WHERE usuario_id = ? AND tipo = 'DUENO_SUSPENSION_LEVANTADA' AND canal = 'EMAIL'",
                String.class, dueno.id()));
        when(emailService.enviarDuenoSuspensionLevantada(anyString(), any(), anyList(), anyList())).thenReturn(ResultadoEnvioEmail.enviado("ok"));
        assertEquals(EstadoEnvioNotificacion.ENVIADO, suspensionDueno.reenviarEmail(dueno.id(), administradorId));
        verify(emailService, times(2)).enviarDuenoSuspensionLevantada(eq(dueno.email()), eq("Mensaje"),
                org.mockito.ArgumentMatchers.argThat(lista -> lista.contains(dueno.nombreComercio())), eq(List.of()));
    }

    @Test
    void losEmpleadosRecibenElAvisoDeCadaComercioSinMotivoYSinEmailYLosSuspendidosNoRecibenNada() {
        Dueno dueno = duenoActivo();
        int activo = empleado(dueno.comercioId());
        int suspendido = empleado(dueno.comercioId());
        datos.cambiarEstadoUsuario(suspendido, "SUSPENDIDO");

        suspender(dueno);

        assertEquals(1, avisos(activo, "COMERCIO_SUSPENDIDO_EQUIPO"));
        assertEquals(0, avisos(suspendido, "COMERCIO_SUSPENDIDO_EQUIPO"));
        String mensaje = jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = 'COMERCIO_SUSPENDIDO_EQUIPO'",
                String.class, activo);
        assertFalse(mensaje.contains(MOTIVO));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL'", Integer.class, activo));

        levantar(dueno, null);
        assertEquals(1, avisos(activo, "COMERCIO_SUSPENSION_LEVANTADA_EQUIPO"));
        assertEquals(0, avisos(suspendido, "COMERCIO_SUSPENSION_LEVANTADA_EQUIPO"));
    }

    // ---------------------------------------------------------------- vista previa y listado

    @Test
    void laVistaPreviaDescribeElEfectoEnCadaComercioYLaAtencionDeSusPedidos() {
        Dueno dueno = duenoActivo();
        int empleado = empleado(dueno.comercioId());
        int sinEquipo = comercioExtra(dueno, EstadoComercio.APROBADO);
        int pendiente = comercioExtra(dueno, EstadoComercio.PENDIENTE);
        int separado = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        int cliente = datos.registrarCliente();
        pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        pedido(dueno.comercioId(), dueno.id(), cliente, "PENDIENTE_CONFIRMACION_COMERCIO");
        pedido(sinEquipo, dueno.id(), cliente, "EN_PREPARACION");
        pedido(sinEquipo, dueno.id(), cliente, "LISTO_PARA_RETIRAR");
        pedido(sinEquipo, dueno.id(), cliente, "PENDIENTE_PAGO");

        SuspensionDuenoPreviaResponseDTO previa = suspensionDueno.vistaPrevia(dueno.id(), administradorId);

        assertEquals(4, previa.getComercios().size());
        var conEquipo = previa.getComercios().stream().filter(c -> c.getComercioId() == dueno.comercioId()).findFirst().orElseThrow();
        assertEquals(Efecto.SE_SUSPENDE, conEquipo.getEfecto());
        assertEquals(1, conEquipo.getEmpleadosActivos());
        assertEquals(1, conEquipo.getPedidosEnPreparacion());
        assertEquals(1, conEquipo.getPedidosPendientesDeConfirmacion());
        assertEquals(AtencionDePedidos.ATENDIDOS_POR_EMPLEADOS, conEquipo.getAtencionDePedidos());
        var sinEmpleados = previa.getComercios().stream().filter(c -> c.getComercioId() == sinEquipo).findFirst().orElseThrow();
        assertEquals(0, sinEmpleados.getEmpleadosActivos());
        assertEquals(1, sinEmpleados.getPedidosEnPreparacion());
        assertEquals(1, sinEmpleados.getPedidosListosParaRetirar());
        assertEquals(1, sinEmpleados.getPedidosSinPagar());
        assertEquals(AtencionDePedidos.SE_ANULAN_AL_INSTANTE, sinEmpleados.getAtencionDePedidos());
        var pend = previa.getComercios().stream().filter(c -> c.getComercioId() == pendiente).findFirst().orElseThrow();
        assertEquals(Efecto.QUEDA_COMO_ESTA, pend.getEfecto());
        assertNotNull(pend.getMotivoDelEfecto());
        assertEquals(AtencionDePedidos.SIN_PEDIDOS_EN_PREPARACION, pend.getAtencionDePedidos());
        var sep = previa.getComercios().stream().filter(c -> c.getComercioId() == separado).findFirst().orElseThrow();
        assertEquals(Efecto.QUEDA_COMO_ESTA, sep.getEfecto());
        assertEquals(90, previa.getTopePreparacionMinutos());
        assertEquals(90, previa.getTopeRetiroMinutos());
        assertNotEquals(0, empleado);
    }

    @Test
    void laVistaPreviaYElListadoHacenUnaCantidadFijaDeConsultasSinImportarCuantosDuenosYComerciosHay() {
        Dueno dueno = duenoActivo();
        SessionFactory sessionFactory = entityManagerFactory.unwrap(SessionFactory.class);
        Statistics estadisticas = sessionFactory.getStatistics();
        estadisticas.setStatisticsEnabled(true);

        estadisticas.clear();
        administradorService.listarDuenos();
        long listadoConPocos = estadisticas.getPrepareStatementCount();
        estadisticas.clear();
        suspensionDueno.vistaPrevia(dueno.id(), administradorId);
        long previaConUnComercio = estadisticas.getPrepareStatementCount();

        for (int i = 0; i < 4; i++) {
            Dueno otro = duenoActivo();
            comercioExtra(otro, EstadoComercio.APROBADO);
            empleado(otro.comercioId());
        }
        for (int i = 0; i < 5; i++) {
            comercioExtra(dueno, EstadoComercio.APROBADO);
        }
        suspender(duenoActivo());

        estadisticas.clear();
        administradorService.listarDuenos();
        long listadoConMuchos = estadisticas.getPrepareStatementCount();
        estadisticas.clear();
        suspensionDueno.vistaPrevia(dueno.id(), administradorId);
        long previaConSeisComercios = estadisticas.getPrepareStatementCount();

        assertEquals(listadoConPocos, listadoConMuchos, "El listado de Dueños no puede hacer consultas por fila");
        assertEquals(previaConUnComercio, previaConSeisComercios, "La vista previa no puede hacer consultas por comercio");
        assertTrue(listadoConMuchos <= 8, "Consultas del listado: " + listadoConMuchos);
        assertTrue(previaConSeisComercios <= 10, "Consultas de la vista previa: " + previaConSeisComercios);
    }

    @Test
    void elListadoDeDuenosTraeEstadoMotivoFechaCantidadDeComerciosYElEstadoPrevio() {
        Dueno dueno = duenoActivo();
        comercioExtra(dueno, EstadoComercio.APROBADO);
        suspender(dueno);

        DuenoAdminResponseDTO fila = administradorService.listarDuenos().stream().filter(d -> d.getId().equals(dueno.id())).findFirst().orElseThrow();

        assertEquals("SUSPENDIDO", fila.getEstado().name());
        assertEquals(MOTIVO, fila.getMotivoSuspension());
        assertNotNull(fila.getSuspendidoDesde());
        assertEquals(2, fila.getCantidadComercios());
        assertEquals("ACTIVO", fila.getEstadoPrevioSuspension().name());
        assertEquals(dueno.email(), fila.getEmail());
        assertFalse(fila.isUltimoEmailAvisoFallido());
        assertNotNull(fila.getNombre());
        assertNotNull(fila.getDni());
    }

    @Test
    void suspenderAUnDuenoConTresComerciosYCincuentaPedidosEnCursoTerminaYDejaCadaPedidoResuelto() {
        Dueno dueno = duenoActivo();
        int segundo = comercioExtra(dueno, EstadoComercio.APROBADO);
        int tercero = comercioExtra(dueno, EstadoComercio.APTO_VENTA);
        empleado(tercero);
        int cliente = datos.registrarCliente();
        List<Integer> comercios = List.of(dueno.comercioId(), segundo, tercero);
        String[] estados = {"PENDIENTE_CONFIRMACION_COMERCIO", "EN_PREPARACION", "LISTO_PARA_RETIRAR", "EN_CAMINO", "PENDIENTE_PAGO"};
        for (int i = 0; i < 50; i++) {
            pedido(comercios.get(i % 3), dueno.id(), cliente, estados[i % 5]);
        }

        long inicio = System.nanoTime();
        SuspensionDuenoResponseDTO respuesta = suspender(dueno);
        long milisegundos = (System.nanoTime() - inicio) / 1_000_000;

        System.out.println("S3 rendimiento: suspender un Dueño con 3 comercios y 50 pedidos tardó " + milisegundos + " ms");
        assertTrue(milisegundos < 60_000, "Tardó " + milisegundos + " ms");
        assertEquals(3, respuesta.getComerciosSuspendidos().size());
        Integer sinResolver = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE comercio_id IN (?, ?) AND estado IN "
                + "('PENDIENTE_CONFIRMACION_COMERCIO','EN_PREPARACION','LISTO_PARA_RETIRAR')", Integer.class, dueno.comercioId(), segundo);
        assertEquals(0, sinResolver);
        Integer atendidosPorElEmpleado = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE comercio_id = ? AND estado IN "
                + "('EN_PREPARACION','LISTO_PARA_RETIRAR')", Integer.class, tercero);
        assertTrue(atendidosPorElEmpleado > 0);
    }
}
