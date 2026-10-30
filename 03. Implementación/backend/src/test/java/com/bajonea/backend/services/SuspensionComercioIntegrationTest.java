package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.ComercioDatosOperativosRequestDTO;
import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.dto.response.SuspensionComercioPreviaResponseDTO;
import com.bajonea.backend.dto.response.SuspensionComercioResponseDTO;
import com.bajonea.backend.enums.ActorCierre;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.OrigenSuspensionComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.TipoRedSocial;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Suspensión individual de un comercio y su levantamiento (Fase 5, tramo S2) contra {@code bajonea_test}, con datos
 * confirmados de verdad: el servicio, los avisos al Dueño y al equipo, las restricciones del Dueño y del Empleado con el
 * comercio suspendido, las acciones sobre los pedidos y los dos topes de 90 minutos.
 */
class SuspensionComercioIntegrationTest extends CarritoIntegrationBase {

    private static final String MOTIVO = "Documentacion vencida y quejas reiteradas";

    @Autowired
    private SuspensionComercioService suspensionService;

    @Autowired
    private ComercioService comercioService;

    @Autowired
    private ProductoService productoServiceReal;

    @Autowired
    private HorarioEdicionService horarioEdicionService;

    @Autowired
    private RedSocialService redSocialService;

    @Autowired
    private CierreComercioService cierreComercioService;

    @Autowired
    private InvitacionEmpleadoService invitacionService;

    @Autowired
    private GestionMiembroEquipoService gestionMiembroEquipoService;

    @Autowired
    private MercadoPagoOAuthService oauthService;

    @Autowired
    private AptitudVentaComercioService aptitudService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private int administradorId;

    @BeforeEach
    void prepararAdministrador() {
        administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        when(reembolsoClient.solicitarReembolsoTotal(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyString()))
                .thenReturn(new ResultadoReembolsoMp(true, "refund", null));
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarComercioSuspensionLevantada(anyString(), anyString(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    private SuspensionComercioResponseDTO suspender(Dueno dueno) {
        return suspensionService.suspender(dueno.comercioId(), administradorId, new SuspensionComercioRequestDTO(MOTIVO));
    }

    private SuspensionComercioResponseDTO levantar(Dueno dueno, String motivo) {
        return suspensionService.levantar(dueno.comercioId(), administradorId, new LevantamientoSuspensionRequestDTO(motivo));
    }

    private Map<String, Object> comercio(Dueno dueno) {
        return jdbcTemplate.queryForMap("SELECT estado, suspension_origen, suspendido_desde, motivo_suspension, cerrado_manualmente "
                + "FROM comercio WHERE id = ?", dueno.comercioId());
    }

    private String estado(Dueno dueno) {
        return (String) comercio(dueno).get("estado");
    }

    private void marcarSuspendidoPorElDueno(Dueno dueno, int minutos) {
        jdbcTemplate.update("UPDATE comercio SET estado = 'SUSPENDIDO', suspension_origen = 'DUENO', suspendido_desde = ?, "
                + "motivo_suspension = 'Dueno suspendido' WHERE id = ?", LocalDateTime.now().minusMinutes(minutos), dueno.comercioId());
    }

    private ComercioActivo comoDueno(Dueno dueno) {
        return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.SUSPENDIDO);
    }

    private Cuenta empleado(Dueno dueno) {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(cuenta.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        return cuenta;
    }

    private ComercioActivo comoEmpleado(Dueno dueno, Cuenta cuenta) {
        return new ComercioActivo(dueno.comercioId(), dueno.id(), cuenta.id(), RolActorComercio.EMPLEADO, EstadoComercio.SUSPENDIDO);
    }

    private int filasDeHistorial(Dueno dueno) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ? AND estado_destino = 'SUSPENDIDO'",
                Integer.class, dueno.comercioId());
    }

    private int avisos(int usuarioId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'PUSH' AND tipo = ?",
                Integer.class, usuarioId, tipo);
    }

    private int emails(int usuarioId, String tipo, String estado) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND tipo = ? AND estado = ?",
                Integer.class, usuarioId, tipo, estado);
    }

    private int pedido(Dueno dueno, int clienteId, String estado, int minutosEnEstado, boolean retiro) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, ?, ?, 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, dueno.comercioId(), retiro ? "RETIRO" : "DOMICILIO", estado, LocalDateTime.now().minusHours(6));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, minutosEnEstado + 200);
        if (!estado.equals("PENDIENTE_CONFIRMACION_COMERCIO")) {
            historial(id, "EN_PREPARACION", "DUENO", dueno.id(), minutosEnEstado + 100);
        }
        if (estado.equals("EN_CAMINO") || estado.equals("LISTO_PARA_RETIRAR")) {
            historial(id, estado, "DUENO", dueno.id(), minutosEnEstado);
        }
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "sc-" + id);
        return id;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
    }

    private int notas(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                Integer.class, pedidoId);
    }

    private String motivoTimeout(int pedidoId, String estado) {
        return jdbcTemplate.queryForObject("SELECT motivo_timeout FROM historial_estado_pedido WHERE pedido_id = ? AND estado = ? ORDER BY id DESC LIMIT 1",
                String.class, pedidoId, estado);
    }

    // ------------------------------------------------------------------ suspender

    @Test
    void suspenderDesdeCadaEstadoSuspendibleGuardaOrigenFechaMotivoYElHistorial() {
        for (String origen : List.of("APROBADO", "APTO_VENTA", "CERRADO_TEMPORALMENTE")) {
            Dueno dueno = comercioApto(true);
            datos.cambiarEstadoComercio(dueno.comercioId(), origen);

            SuspensionComercioResponseDTO respuesta = suspender(dueno);

            assertEquals(EstadoComercio.SUSPENDIDO, respuesta.getEstado());
            assertEquals(OrigenSuspensionComercio.INDIVIDUAL, respuesta.getSuspensionOrigen());
            Map<String, Object> fila = comercio(dueno);
            assertEquals("SUSPENDIDO", fila.get("estado"));
            assertEquals("INDIVIDUAL", fila.get("suspension_origen"));
            assertEquals(MOTIVO, fila.get("motivo_suspension"));
            assertNotNull(fila.get("suspendido_desde"));
            Map<String, Object> historial = jdbcTemplate.queryForMap("SELECT estado_origen, estado_destino, motivo, administrador_id, suspension_origen "
                    + "FROM historial_estado_comercio WHERE comercio_id = ? AND estado_destino = 'SUSPENDIDO'", dueno.comercioId());
            assertEquals(origen, historial.get("estado_origen"));
            assertEquals(MOTIVO, historial.get("motivo"));
            assertEquals(administradorId, ((Number) historial.get("administrador_id")).intValue());
            assertEquals("INDIVIDUAL", historial.get("suspension_origen"));
        }
    }

    @Test
    void unComercioEnOtroEstadoNoSeSuspende() {
        for (String estado : List.of("PENDIENTE", "RECHAZADO", "INACTIVO", "RECHAZO_DEFINITIVO")) {
            Dueno dueno = comercioApto(false);
            datos.cambiarEstadoComercio(dueno.comercioId(), estado);

            assertThrows(ConflictoDeNegocioException.class, () -> suspender(dueno), estado);

            assertEquals(estado, estado(dueno));
            assertEquals(0, filasDeHistorial(dueno));
        }
    }

    @Test
    void suspenderDosVecesUnComercioSuspendidoIndividualmenteDa409SinCambiarNada() {
        Dueno dueno = comercioApto(true);
        suspender(dueno);
        Map<String, Object> antes = comercio(dueno);

        assertThrows(ConflictoDeNegocioException.class,
                () -> suspensionService.suspender(dueno.comercioId(), administradorId, new SuspensionComercioRequestDTO("Otro motivo distinto de verdad")));

        assertEquals(antes, comercio(dueno));
        assertEquals(1, filasDeHistorial(dueno));
        assertEquals(1, avisos(dueno.id(), "COMERCIO_SUSPENDIDO"));
    }

    @Test
    void suspenderUnComercioSuspendidoPorElDuenoLoConvierteAIndividualYConservaLaFechaOriginal() {
        Dueno dueno = comercioApto(true);
        marcarSuspendidoPorElDueno(dueno, 200);
        LocalDateTime original = (LocalDateTime) comercio(dueno).get("suspendido_desde");

        SuspensionComercioResponseDTO respuesta = suspensionService.suspender(dueno.comercioId(), administradorId,
                new SuspensionComercioRequestDTO("Ahora es una suspension individual"));

        assertEquals(OrigenSuspensionComercio.INDIVIDUAL, respuesta.getSuspensionOrigen());
        Map<String, Object> fila = comercio(dueno);
        assertEquals("INDIVIDUAL", fila.get("suspension_origen"));
        assertEquals("Ahora es una suspension individual", fila.get("motivo_suspension"));
        assertEquals(original, fila.get("suspendido_desde"), "la fecha original se conserva: de ella dependen los topes de 90 minutos");
        Map<String, Object> historial = jdbcTemplate.queryForMap("SELECT estado_origen, estado_destino, suspension_origen FROM historial_estado_comercio "
                + "WHERE comercio_id = ? AND estado_destino = 'SUSPENDIDO'", dueno.comercioId());
        assertEquals("SUSPENDIDO", historial.get("estado_origen"));
        assertEquals("INDIVIDUAL", historial.get("suspension_origen"));
    }

    @Test
    void suspenderRechazaLosPendientesYNoTocaLosDemasPedidosNiElCierreManual() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", dueno.comercioId());
        int pendiente = pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5, true);
        List<Integer> pedidos = List.of(pedido(dueno, cliente, "EN_PREPARACION", 5, true), pedido(dueno, cliente, "EN_CAMINO", 5, false),
                pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 5, true));
        int sinPagar = pedidoPendientePago(cliente, dueno);

        suspender(dueno);

        assertEquals("RECHAZADO", estadoDelPedido(pendiente));
        assertEquals(1, notas(pendiente));
        List<String> esperados = List.of("EN_PREPARACION", "EN_CAMINO", "LISTO_PARA_RETIRAR");
        for (int i = 0; i < pedidos.size(); i++) {
            assertEquals(esperados.get(i), estadoDelPedido(pedidos.get(i)));
            assertEquals(0, notas(pedidos.get(i)));
        }
        assertEquals("PENDIENTE_PAGO", estadoDelPedido(sinPagar));
        assertTrue((Boolean) comercio(dueno).get("cerrado_manualmente"));
    }

    @Test
    void elAvisoAlDuenoLlevaElMotivoYElDelEquipoNoYNingunEmpleadoRecibeEmail() {
        Dueno dueno = comercioApto(true);
        Cuenta a = empleado(dueno);
        Cuenta b = empleado(dueno);

        suspender(dueno);

        assertEquals(1, avisos(dueno.id(), "COMERCIO_SUSPENDIDO"));
        assertEquals(1, emails(dueno.id(), "COMERCIO_SUSPENDIDO", "ENVIADO"));
        String mensajeDueno = jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = 'COMERCIO_SUSPENDIDO' AND canal = 'PUSH'",
                String.class, dueno.id());
        assertTrue(mensajeDueno.contains(MOTIVO));
        for (Cuenta empleado : List.of(a, b)) {
            assertEquals(1, avisos(empleado.id(), "COMERCIO_SUSPENDIDO_EQUIPO"));
            assertEquals(0, avisos(empleado.id(), "COMERCIO_SUSPENDIDO"));
            String mensaje = jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = 'COMERCIO_SUSPENDIDO_EQUIPO'",
                    String.class, empleado.id());
            assertFalse(mensaje.contains(MOTIVO));
            assertFalse(mensaje.toLowerCase().contains("motivo"), "el aviso del equipo no menciona ningún motivo");
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL'",
                    Integer.class, empleado.id()));
        }
        verify(emailService, times(1)).enviarComercioSuspendido(anyString(), anyString(), anyString());
    }

    @Test
    void unEmpleadoConLaCuentaSuspendidaQuedaFueraDelReparto() {
        Dueno dueno = comercioApto(true);
        Cuenta activo = empleado(dueno);
        Cuenta suspendido = empleado(dueno);
        datos.cambiarEstadoUsuario(suspendido.id(), "SUSPENDIDO");

        suspender(dueno);

        assertEquals(1, avisos(activo.id(), "COMERCIO_SUSPENDIDO_EQUIPO"));
        assertEquals(0, avisos(suspendido.id(), "COMERCIO_SUSPENDIDO_EQUIPO"));
    }

    @Test
    void unEmpleadoDadoDeBajaNoRecibeElAviso() {
        Dueno dueno = comercioApto(true);
        Cuenta baja = empleado(dueno);
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ?", baja.id());

        suspender(dueno);

        assertEquals(0, avisos(baja.id(), "COMERCIO_SUSPENDIDO_EQUIPO"));
    }

    @Test
    void siElEmailFallaQuedaFalladoYSePuedeReenviarUnaSolaVezPorIntento() {
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(503, "caido"));
        Dueno dueno = comercioApto(true);

        suspender(dueno);

        assertEquals(1, emails(dueno.id(), "COMERCIO_SUSPENDIDO", "FALLIDO"));
        verify(emailService, times(1)).enviarComercioSuspendido(anyString(), anyString(), anyString());

        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("ok"));
        assertEquals(EstadoEnvioNotificacion.ENVIADO, suspensionService.reenviarEmail(dueno.comercioId()));
        assertEquals(1, emails(dueno.id(), "COMERCIO_SUSPENDIDO", "ENVIADO"));
        assertEquals(0, emails(dueno.id(), "COMERCIO_SUSPENDIDO", "FALLIDO"));
        assertThrows(ConflictoDeNegocioException.class, () -> suspensionService.reenviarEmail(dueno.comercioId()));
    }

    @Test
    void elEmailDeUnComercioNoSeMezclaConElDeOtroDelMismoDueno() {
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(503, "caido"));
        Dueno dueno = comercioApto(true);
        int otroComercio = testSupportServiceClon(dueno);
        suspender(dueno);
        suspensionService.suspender(otroComercio, administradorId, new SuspensionComercioRequestDTO(MOTIVO));
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("ok"));

        assertEquals(EstadoEnvioNotificacion.ENVIADO, suspensionService.reenviarEmail(otroComercio));

        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND tipo = 'COMERCIO_SUSPENDIDO' "
                + "AND estado = 'FALLIDO' AND comercio_id = ?", Integer.class, dueno.id(), dueno.comercioId()));
    }

    @Autowired
    private AdministradorService administradorService;

    private boolean emailAvisoFallidoEnElListado(Dueno dueno) {
        return administradorService.listarComercios().stream()
                .filter(comercio -> comercio.getId().equals(dueno.comercioId()))
                .findFirst()
                .orElseThrow()
                .isUltimoEmailAvisoFallido();
    }

    @Test
    void elListadoDeComerciosMarcaElEmailDeSuspensionEnviadoFallidoYReenviado() {
        Dueno dueno = comercioApto(true);
        assertFalse(emailAvisoFallidoEnElListado(dueno));

        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("ok"));
        suspender(dueno);
        assertFalse(emailAvisoFallidoEnElListado(dueno));

        Dueno otro = comercioApto(true);
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(503, "caido"));
        suspender(otro);
        assertTrue(emailAvisoFallidoEnElListado(otro));
        assertFalse(emailAvisoFallidoEnElListado(dueno));

        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("ok"));
        suspensionService.reenviarEmail(otro.comercioId());
        assertFalse(emailAvisoFallidoEnElListado(otro));
    }

    @Test
    void elListadoDeComerciosMarcaElEmailDeLevantamientoFallidoYNoArrastraElDeLaSuspension() {
        Dueno dueno = comercioApto(true);
        suspender(dueno);
        when(emailService.enviarComercioSuspensionLevantada(anyString(), anyString(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(ResultadoEnvioEmail.fallido(503, "caido"));

        levantar(dueno, "Todo en orden");

        assertTrue(emailAvisoFallidoEnElListado(dueno));

        when(emailService.enviarComercioSuspensionLevantada(anyString(), anyString(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(ResultadoEnvioEmail.enviado("ok"));
        suspensionService.reenviarEmail(dueno.comercioId());
        assertFalse(emailAvisoFallidoEnElListado(dueno));
    }

    @Autowired
    private TestSupportService testSupportService;

    private int testSupportServiceClon(Dueno dueno) {
        return testSupportService.clonarComercio(dueno.comercioId(), "Segundo " + DatosPruebaEmpleado.sufijo(), EstadoComercio.APTO_VENTA);
    }

    @Test
    void laVistaPreviaCuentaLosPedidosPorEstadoSinEscribirNada() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5, true);
        pedido(dueno, cliente, "EN_PREPARACION", 5, true);
        pedido(dueno, cliente, "EN_PREPARACION", 5, true);
        pedido(dueno, cliente, "EN_CAMINO", 5, false);
        pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 5, true);
        pedidoPendientePago(cliente, dueno);

        SuspensionComercioPreviaResponseDTO previa = suspensionService.vistaPrevia(dueno.comercioId());

        assertEquals(1, previa.getPedidosPendientesDeConfirmacion());
        assertEquals(2, previa.getPedidosEnPreparacion());
        assertEquals(1, previa.getPedidosEnCamino());
        assertEquals(1, previa.getPedidosListosParaRetirar());
        assertEquals(1, previa.getPedidosSinPagar());
        assertEquals(EstadoComercio.APTO_VENTA, previa.getEstadoActual());
        assertEquals("APTO_VENTA", estado(dueno));
    }

    // ------------------------------------------------------------------ levantar

    @Test
    void levantarConCuentaDeMercadoPagoVuelveAAptoVentaYLimpiaLosDatosDeLaSuspension() {
        Dueno dueno = comercioApto(true);
        suspender(dueno);

        SuspensionComercioResponseDTO respuesta = levantar(dueno, "Corrigieron todo");

        assertEquals(EstadoComercio.APTO_VENTA, respuesta.getEstado());
        Map<String, Object> fila = comercio(dueno);
        assertEquals("APTO_VENTA", fila.get("estado"));
        assertNull(fila.get("suspension_origen"));
        assertNull(fila.get("suspendido_desde"));
        assertNull(fila.get("motivo_suspension"));
        Map<String, Object> historial = jdbcTemplate.queryForMap("SELECT estado_origen, estado_destino, motivo, administrador_id, suspension_origen "
                + "FROM historial_estado_comercio WHERE comercio_id = ? AND estado_origen = 'SUSPENDIDO'", dueno.comercioId());
        assertEquals("APTO_VENTA", historial.get("estado_destino"));
        assertEquals("Corrigieron todo", historial.get("motivo"));
        assertEquals(administradorId, ((Number) historial.get("administrador_id")).intValue());
        assertEquals("INDIVIDUAL", historial.get("suspension_origen"));
    }

    @Test
    void levantarSinCuentaDeMercadoPagoVuelveAAprobado() {
        Dueno dueno = comercioApto(false);
        suspender(dueno);

        assertEquals(EstadoComercio.APROBADO, levantar(dueno, null).getEstado());
        assertEquals("APROBADO", estado(dueno));
    }

    @Test
    void levantarNoTocaElCierreManual() {
        Dueno dueno = comercioApto(true);
        jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", dueno.comercioId());
        suspender(dueno);

        levantar(dueno, null);

        assertTrue((Boolean) comercio(dueno).get("cerrado_manualmente"));
    }

    @Test
    void levantarConElDuenoBloqueadoDejaElComercioCerradoTemporalmente() {
        Dueno dueno = comercioApto(true);
        suspender(dueno);
        datos.cambiarEstadoUsuario(dueno.id(), "BLOQUEADO");

        assertEquals(EstadoComercio.CERRADO_TEMPORALMENTE, levantar(dueno, null).getEstado());
    }

    @Test
    void unComercioSuspendidoPorElDuenoNoSeLevantaIndividualmente() {
        Dueno dueno = comercioApto(true);
        marcarSuspendidoPorElDueno(dueno, 10);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class, () -> levantar(dueno, null));

        assertTrue(ex.getMessage().contains("Dueño"));
        assertEquals("SUSPENDIDO", estado(dueno));
        assertEquals("DUENO", comercio(dueno).get("suspension_origen"));
    }

    @Test
    void levantarUnComercioQueNoEstaSuspendidoDa409() {
        Dueno dueno = comercioApto(true);

        assertThrows(ConflictoDeNegocioException.class, () -> levantar(dueno, null));

        assertEquals("APTO_VENTA", estado(dueno));
    }

    @Test
    void levantarAvisaAlDuenoConElMensajeYALosEmpleadosSinEl() {
        Dueno dueno = comercioApto(true);
        Cuenta empleado = empleado(dueno);
        suspender(dueno);

        levantar(dueno, "Todo en orden");

        assertEquals(1, avisos(dueno.id(), "SUSPENSION_LEVANTADA"));
        assertEquals(1, emails(dueno.id(), "SUSPENSION_LEVANTADA", "ENVIADO"));
        assertTrue(jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = 'SUSPENSION_LEVANTADA' AND canal = 'PUSH'",
                String.class, dueno.id()).contains("Todo en orden"));
        assertEquals(1, avisos(empleado.id(), "COMERCIO_SUSPENSION_LEVANTADA_EQUIPO"));
        assertFalse(jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = 'COMERCIO_SUSPENSION_LEVANTADA_EQUIPO'",
                String.class, empleado.id()).contains("Todo en orden"));
    }

    @Test
    void laSuspensionPrevaleceSobreLaVinculacionDeMercadoPagoYElRecalculoDeAptitud() {
        Dueno dueno = comercioApto(false);
        suspender(dueno);
        cuentaService.vincular(dueno.id(), "MP-PREV-" + DatosPruebaEmpleado.sufijo(), "token", "refresh", "pub", true, LocalDateTime.now().plusDays(1));

        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            AptitudVentaComercioService.EntradasDueno entradas = aptitudService.leerDueno(dueno.id());
            aptitudService.recalcularComerciosDelDueno(dueno.id(), entradas, com.bajonea.backend.enums.MotivoRecalculo.MP_VINCULADO);
        });

        assertEquals("SUSPENDIDO", estado(dueno));
        assertEquals("INDIVIDUAL", comercio(dueno).get("suspension_origen"));
    }

    // ------------------------------------------------------------------ restricciones

    @Test
    void elDuenoConElComercioSuspendidoNoEditaProductosPerfilHorariosNiRedes() {
        Dueno dueno = comercioApto(true);
        int productoId = producto(dueno);
        suspender(dueno);
        ComercioActivo actor = comoDueno(dueno);

        ProductoRequestDTO producto = new ProductoRequestDTO("Nuevo", "x", new BigDecimal("100"), categoria(), List.of());
        ComercioPerfilRequestDTO perfil = new ComercioPerfilRequestDTO("Otro nombre " + DatosPruebaEmpleado.sufijo(), "d", "+5492964123456", true, true);
        List<HorarioRequestDTO> horarios = List.of(new HorarioRequestDTO(DiaSemana.LUNES, LocalTime.of(9, 0), LocalTime.of(12, 0)));

        for (org.junit.jupiter.api.function.Executable accion : List.<org.junit.jupiter.api.function.Executable>of(
                () -> productoServiceReal.crearProducto(actor, producto),
                () -> productoServiceReal.editarProducto(actor, productoId, producto),
                () -> comercioService.editarPerfil(actor, perfil),
                () -> comercioService.editarDatosOperativos(actor, new ComercioDatosOperativosRequestDTO("d", "+5492964123456")),
                () -> horarioEdicionService.editarHorarios(actor, horarios),
                () -> redSocialService.agregar(actor, new RedSocialRequestDTO(TipoRedSocial.INSTAGRAM, "https://instagram.com/prueba")))) {
            ConflictoComercioException ex = assertThrows(ConflictoComercioException.class, accion);
            assertEquals(ConflictoComercioException.SUSPENDIDO, ex.getCodigo());
        }
    }

    @Test
    void elEmpleadoConElComercioSuspendidoTampocoEdita() {
        Dueno dueno = comercioApto(true);
        Cuenta cuenta = empleado(dueno);
        suspender(dueno);
        ComercioActivo actor = comoEmpleado(dueno, cuenta);

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                () -> comercioService.editarDatosOperativos(actor, new ComercioDatosOperativosRequestDTO("d", "+5492964123456")));
        assertEquals(ConflictoComercioException.SUSPENDIDO, ex.getCodigo());
        assertThrows(ConflictoComercioException.class, () -> productoServiceReal.crearProducto(actor,
                new ProductoRequestDTO("Nuevo", "x", new BigDecimal("100"), categoria(), List.of())));
    }

    private int categoria() {
        return jdbcTemplate.queryForObject("SELECT id FROM categoria ORDER BY id LIMIT 1", Integer.class);
    }

    @Test
    void abrirYCerrarConElComercioSuspendidoDa409NoOperativo() {
        Dueno dueno = comercioApto(true);
        suspender(dueno);

        for (org.junit.jupiter.api.function.Executable accion : List.<org.junit.jupiter.api.function.Executable>of(
                () -> cierreComercioService.cerrar(dueno.comercioId(), dueno.id(), ActorCierre.DUENO),
                () -> cierreComercioService.abrir(dueno.comercioId(), dueno.id(), ActorCierre.DUENO))) {
            ConflictoComercioException ex = assertThrows(ConflictoComercioException.class, accion);
            assertEquals(ConflictoComercioException.NO_OPERATIVO, ex.getCodigo());
        }
    }

    @Test
    void elEquipoQuedaEnSoloLecturaConElComercioSuspendido() {
        Dueno dueno = comercioApto(true);
        Cuenta miembro = empleado(dueno);
        suspender(dueno);
        ComercioActivo actor = comoDueno(dueno);

        assertThrows(ConflictoDeNegocioException.class, () -> invitacionService.invitar(actor, "nuevo" + DatosPruebaEmpleado.sufijo() + "@prueba.com"));
        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                () -> gestionMiembroEquipoService.desactivar(actor, miembro.id()));
        assertEquals(ConflictoComercioException.SUSPENDIDO, ex.getCodigo());
        assertEquals("ACTIVO", jdbcTemplate.queryForObject("SELECT estado FROM empleado_comercio WHERE empleado_id = ?", String.class, miembro.id()));
    }

    @Test
    void noSeDesvinculaMercadoPagoConUnComercioSuspendido() {
        Dueno dueno = comercioApto(true);
        suspender(dueno);

        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class, () -> oauthService.desvincular(dueno.id()));

        assertEquals(ConflictoComercioException.SUSPENDIDO, ex.getCodigo());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cuenta_mercado_pago WHERE dueno_id = ? AND activa = 1", Integer.class, dueno.id()));
    }

    // ------------------------------------------------------------------ pedidos

    @Test
    void conElComercioSuspendidoNoSeAceptaPeroSiSeRechazaYSeReembolsa() {
        Dueno dueno = comercioApto(true);
        Cuenta cuenta = empleado(dueno);
        int cliente = datos.registrarCliente();
        suspender(dueno);
        int pedidoDueno = pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5, true);
        int pedidoEmpleado = pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5, true);
        int pedidoRechazado = pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5, true);

        ConflictoComercioException delDueno = assertThrows(ConflictoComercioException.class, () -> pedidoService.aceptarPedido(comoDueno(dueno), pedidoDueno));
        ConflictoComercioException delEmpleado = assertThrows(ConflictoComercioException.class,
                () -> pedidoService.aceptarPedido(comoEmpleado(dueno, cuenta), pedidoEmpleado));
        assertEquals(ConflictoComercioException.SIN_OPERACION, delDueno.getCodigo());
        assertEquals(ConflictoComercioException.SIN_OPERACION, delEmpleado.getCodigo());
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedidoDueno));

        pedidoService.rechazarPedido(comoDueno(dueno), pedidoRechazado, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));

        assertEquals("RECHAZADO", estadoDelPedido(pedidoRechazado));
        assertEquals(1, notas(pedidoRechazado));
    }

    @Test
    void conElComercioSuspendidoSeDespachaSeAnulaSeEntregaYSeCierraComoNoRetirado() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int aDespachar = pedido(dueno, cliente, "EN_PREPARACION", 5, false);
        int aAnular = pedido(dueno, cliente, "EN_PREPARACION", 5, true);
        int aEntregar = pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 5, true);
        int aCerrar = pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 65, true);
        suspender(dueno);
        ComercioActivo actor = comoDueno(dueno);

        pedidoService.avanzarAEntregaEnCurso(actor, aDespachar);
        pedidoService.anularPedido(actor, aAnular, new AnulacionPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));
        pedidoService.confirmarEntregaComercio(actor, aEntregar);
        pedidoService.cerrarComoNoRetirado(actor, aCerrar);

        assertEquals("EN_CAMINO", estadoDelPedido(aDespachar));
        assertEquals("ANULADO", estadoDelPedido(aAnular));
        assertEquals(1, notas(aAnular));
        assertEquals("ENTREGADO", estadoDelPedido(aEntregar));
        assertEquals("NO_RETIRADO", estadoDelPedido(aCerrar));
        assertEquals(0, notas(aCerrar));
    }

    @Test
    void elTopeDePreparacionCancelaConReembolsoALos90MinutosDeLaSuspension() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedido(dueno, cliente, "EN_PREPARACION", 5, true);
        suspender(dueno);
        LocalDateTime base = (LocalDateTime) comercio(dueno).get("suspendido_desde");

        pedidoService.cancelarPreparacionPorSuspension(base.plusMinutes(89));
        assertEquals("EN_PREPARACION", estadoDelPedido(pedido));

        pedidoService.cancelarPreparacionPorSuspension(base.plusMinutes(90));
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(pedido));
        assertEquals("TIMEOUT_PREPARACION_SUSPENSION", motivoTimeout(pedido, "CANCELADO_POR_SISTEMA"));
        assertEquals(1, notas(pedido));
        assertEquals("SUSPENSION_COMERCIO", jdbcTemplate.queryForObject(
                "SELECT nc.motivo FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?", String.class, pedido));
        assertEquals(1, avisos(cliente, "PEDIDO_CANCELADO_SISTEMA"));

        pedidoService.cancelarPreparacionPorSuspension(base.plusMinutes(200));
        assertEquals(1, notas(pedido), "el proceso es idempotente");
        assertEquals(1, avisos(cliente, "PEDIDO_CANCELADO_SISTEMA"));
    }

    @Test
    void levantarAntesDeLos90MinutosDetieneElTopeDePreparacionYDelRetiro() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int enPreparacion = pedido(dueno, cliente, "EN_PREPARACION", 500, true);
        int listo = pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 500, true);
        suspender(dueno);
        jdbcTemplate.update("UPDATE comercio SET suspendido_desde = DATE_SUB(suspendido_desde, INTERVAL 60 MINUTE) WHERE id = ?", dueno.comercioId());
        levantar(dueno, null);

        pedidoService.cancelarPreparacionPorSuspension(LocalDateTime.now().plusHours(5));
        pedidoService.autoconfirmarRetirosPorSuspension(LocalDateTime.now().plusHours(5));

        assertEquals("EN_PREPARACION", estadoDelPedido(enPreparacion));
        assertEquals("LISTO_PARA_RETIRAR", estadoDelPedido(listo));
    }

    @Test
    void elTopeDelRetiroCuentaDesdeQueQuedoListoOdesdeLaSuspensionElQueSeaPosterior() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int yaEstabaListo = pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 600, true);
        suspender(dueno);
        LocalDateTime desde = (LocalDateTime) comercio(dueno).get("suspendido_desde");
        int quedoListoDespues = pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 0, true);
        jdbcTemplate.update("UPDATE historial_estado_pedido SET fecha_hora = ? WHERE pedido_id = ? AND estado = 'LISTO_PARA_RETIRAR'",
                desde.plusMinutes(60), quedoListoDespues);

        pedidoService.autoconfirmarRetirosPorSuspension(desde.plusMinutes(91));

        assertEquals("NO_RETIRADO", estadoDelPedido(yaEstabaListo));
        assertEquals("LISTO_PARA_RETIRAR", estadoDelPedido(quedoListoDespues), "listo hace 31 minutos: todavía no cumplió los 90");
        assertEquals("TIMEOUT_RETIRO_SUSPENSION", motivoTimeout(yaEstabaListo, "NO_RETIRADO"));
        assertEquals(0, notas(yaEstabaListo));
        assertEquals(1, avisos(cliente, "PEDIDO_NO_RETIRADO"));

        pedidoService.autoconfirmarRetirosPorSuspension(desde.plusMinutes(150));
        assertEquals("NO_RETIRADO", estadoDelPedido(quedoListoDespues));
    }

    @Test
    void losPedidosEnCaminoNoLosTocaNingunTopeDeLaSuspension() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int enCamino = pedido(dueno, cliente, "EN_CAMINO", 5, false);
        suspender(dueno);

        pedidoService.cancelarPreparacionPorSuspension(LocalDateTime.now().plusDays(2));
        pedidoService.autoconfirmarRetirosPorSuspension(LocalDateTime.now().plusDays(2));

        assertEquals("EN_CAMINO", estadoDelPedido(enCamino));
        assertEquals(0, notas(enCamino));
    }

    @Test
    void unPedidoPendienteDeConfirmacionNoLoTocanLosTopesDeLaSuspension() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        suspender(dueno);
        int pendiente = pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5, true);

        pedidoService.cancelarPreparacionPorSuspension(LocalDateTime.now().plusDays(2));
        pedidoService.autoconfirmarRetirosPorSuspension(LocalDateTime.now().plusDays(2));

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pendiente));
    }

    @Test
    void elPedidoDeUnComercioSuspendidoConservaElNombreYLaFotoDelComercio() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedido(dueno, cliente, "ENTREGADO", 5, true);
        suspender(dueno);

        var respuestas = pedidoService.listarPedidosCliente(cliente);

        assertEquals(1, respuestas.size());
        assertEquals(pedido, respuestas.get(0).getId());
        assertEquals(dueno.nombreComercio(), respuestas.get(0).getComercioNombre());
        assertNotNull(respuestas.get(0).getComercioFotoUrl());
    }

    @Test
    void irAPagarConElComercioSuspendidoDa409() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);
        suspender(dueno);

        ConflictoDeNegocioException ex = assertThrows(ConflictoDeNegocioException.class,
                () -> mercadoPagoPagoService.iniciarOReusarPago(cliente, pedido));
        assertTrue(ex.getMessage().contains("no está disponible"));
    }

    @Autowired
    private MercadoPagoPagoService mercadoPagoPagoService;

    @Test
    void laMigracionDejaElCheckDeLaTablaComercioActivo() {
        Dueno dueno = comercioApto(true);

        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbcTemplate.update("UPDATE comercio SET estado = 'SUSPENDIDO' WHERE id = ?", dueno.comercioId()));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbcTemplate.update("UPDATE comercio SET suspension_origen = 'DUENO' WHERE id = ?", dueno.comercioId()));
    }

    @Test
    void unaInvitacionPendienteNoSeAceptaConElComercioSuspendido() {
        Dueno dueno = comercioApto(true);
        Cuenta invitado = datos.registrarClienteConCredenciales();
        String email = datos.emailDe(invitado.id());
        invitacionService.invitar(ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA), email);
        String codigo = testSupportService.obtenerCodigoInvitacionEmpleado(email, dueno.comercioId());
        suspender(dueno);

        com.bajonea.backend.dto.request.AceptarInvitacionEmpleadoRequestDTO request = new com.bajonea.backend.dto.request.AceptarInvitacionEmpleadoRequestDTO();
        request.setEmail(email);
        request.setCodigo(codigo);

        assertThrows(com.bajonea.backend.exceptions.InvitacionNoAptaException.class, () -> invitacionService.aceptar(request));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ?",
                Integer.class, invitado.id(), dueno.comercioId()));

        levantar(dueno, null);
        assertNotNull(invitacionService.aceptar(request));
    }

    // ------------------------------------------------------------------ datos para las pantallas (entrega B2)

    @Autowired
    private com.bajonea.backend.config.PedidoTimeoutProperties timeoutProperties;

    @Test
    void laVistaPreviaDevuelveLosTopesConfiguradosYNoUnNumeroFijo() {
        Dueno dueno = comercioApto(true);
        long preparacionOriginal = timeoutProperties.getPreparacionSuspensionMinutos();
        long retiroOriginal = timeoutProperties.getRetiroSuspensionMinutos();
        try {
            SuspensionComercioPreviaResponseDTO porDefecto = suspensionService.vistaPrevia(dueno.comercioId());
            assertEquals(90, porDefecto.getTopePreparacionMinutos());
            assertEquals(90, porDefecto.getTopeRetiroMinutos());

            timeoutProperties.setPreparacionSuspensionMinutos(45);
            timeoutProperties.setRetiroSuspensionMinutos(30);
            SuspensionComercioPreviaResponseDTO configurada = suspensionService.vistaPrevia(dueno.comercioId());
            assertEquals(45, configurada.getTopePreparacionMinutos());
            assertEquals(30, configurada.getTopeRetiroMinutos());
        } finally {
            timeoutProperties.setPreparacionSuspensionMinutos(preparacionOriginal);
            timeoutProperties.setRetiroSuspensionMinutos(retiroOriginal);
        }
    }

    private com.bajonea.backend.dto.response.PedidoResponseDTO delDuenoPorId(Dueno dueno, int pedidoId) {
        return pedidoService.listarPedidosComercio(dueno.comercioId()).stream().filter(p -> p.getId() == pedidoId).findFirst().orElseThrow();
    }

    @Test
    void losPedidosDelComercioSuspendidoLlevanLaHoraLimiteSegunSuEstado() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pendiente = pedido(dueno, cliente, "PENDIENTE_CONFIRMACION_COMERCIO", 5, true);
        int enPreparacion = pedido(dueno, cliente, "EN_PREPARACION", 5, true);
        int enCamino = pedido(dueno, cliente, "EN_CAMINO", 5, false);
        int yaListo = pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 600, true);
        suspender(dueno);
        LocalDateTime desde = (LocalDateTime) comercio(dueno).get("suspendido_desde");
        int listoDespues = pedido(dueno, cliente, "LISTO_PARA_RETIRAR", 0, true);
        LocalDateTime quedoListo = desde.plusMinutes(20).withNano(0);
        jdbcTemplate.update("UPDATE historial_estado_pedido SET fecha_hora = ? WHERE pedido_id = ? AND estado = 'LISTO_PARA_RETIRAR'",
                quedoListo, listoDespues);

        assertNull(delDuenoPorId(dueno, pendiente).getLimiteResolucionSuspension());
        assertNull(delDuenoPorId(dueno, enCamino).getLimiteResolucionSuspension());
        assertEquals(desde.plusMinutes(90), delDuenoPorId(dueno, enPreparacion).getLimiteResolucionSuspension());
        assertEquals(desde.plusMinutes(90), delDuenoPorId(dueno, yaListo).getLimiteResolucionSuspension());
        assertEquals(quedoListo.plusMinutes(90), delDuenoPorId(dueno, listoDespues).getLimiteResolucionSuspension());

        Cuenta cuenta = empleado(dueno);
        var delEmpleado = pedidoService.listarPedidosComercioEmpleado(dueno.comercioId(), cuenta.id());
        assertEquals(desde.plusMinutes(90), delEmpleado.stream().filter(p -> p.getId() == enPreparacion).findFirst().orElseThrow()
                .getLimiteResolucionSuspension());
        assertNull(delEmpleado.stream().filter(p -> p.getId() == pendiente).findFirst().orElseThrow().getLimiteResolucionSuspension());
    }

    @Test
    void elLimiteSeCalculaConLosTopesConfiguradosYDesapareceAlLevantar() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int enPreparacion = pedido(dueno, cliente, "EN_PREPARACION", 5, true);
        long original = timeoutProperties.getPreparacionSuspensionMinutos();
        suspender(dueno);
        LocalDateTime desde = (LocalDateTime) comercio(dueno).get("suspendido_desde");
        try {
            timeoutProperties.setPreparacionSuspensionMinutos(45);
            assertEquals(desde.plusMinutes(45), delDuenoPorId(dueno, enPreparacion).getLimiteResolucionSuspension());
        } finally {
            timeoutProperties.setPreparacionSuspensionMinutos(original);
        }

        levantar(dueno, null);

        assertNull(delDuenoPorId(dueno, enPreparacion).getLimiteResolucionSuspension());
    }

    @Test
    void elPedidoSinPagarDelClienteSeMarcaComoComercioNoDisponibleSoloConElComercioSuspendido() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int sinPagar = pedidoPendientePago(cliente, dueno);
        int viejo = pedido(dueno, cliente, "ENTREGADO", 5, true);

        assertFalse(pedidoService.listarPedidosCliente(cliente).stream().filter(p -> p.getId() == sinPagar).findFirst().orElseThrow()
                .isComercioNoDisponible());

        suspender(dueno);
        var lista = pedidoService.listarPedidosCliente(cliente);

        assertTrue(lista.stream().filter(p -> p.getId() == sinPagar).findFirst().orElseThrow().isComercioNoDisponible());
        var pedidoViejo = lista.stream().filter(p -> p.getId() == viejo).findFirst().orElseThrow();
        assertFalse(pedidoViejo.isComercioNoDisponible());
        assertEquals(dueno.nombreComercio(), pedidoViejo.getComercioNombre());

        levantar(dueno, null);
        assertFalse(pedidoService.listarPedidosCliente(cliente).stream().filter(p -> p.getId() == sinPagar).findFirst().orElseThrow()
                .isComercioNoDisponible());
    }

    @Test
    void confirmarUnPedidoConElComercioSuspendidoDaUnErrorClaroConSalidaYCodigoEstable() {
        ConflictoComercioException ex = assertThrows(ConflictoComercioException.class,
                () -> comercioService.validarAceptaPedidos(null, EstadoComercio.SUSPENDIDO, false));

        assertEquals("COMERCIO_SIN_PEDIDOS", ex.getCodigo());
        assertEquals("Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio.", ex.getMessage());
        assertFalse(ex.getMessage().contains("SUSPENDIDO"));
    }

    @Autowired
    private com.bajonea.backend.repositories.HistorialEstadoPedidoRepository historialEstadoPedidoRepository;

    private List<Integer> pedidosEnLaActividad(Dueno dueno) {
        return historialEstadoPedidoRepository.actividadDelComercio(dueno.comercioId(),
                java.util.Arrays.asList(com.bajonea.backend.enums.EstadoPedido.values()), LocalDateTime.now().plusDays(1), Integer.MAX_VALUE,
                org.springframework.data.domain.PageRequest.of(0, 100)).stream().map(f -> f.pedidoId()).toList();
    }

    @Test
    void elClientePuedeCancelarUnPedidoSinPagarDeUnComercioSuspendidoSinNotaNiAvisoNiHuellaEnLaActividad() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int sinPagar = pedidoPendientePago(cliente, dueno);
        suspender(dueno);

        var respuesta = pedidoService.cancelarPedido(cliente, sinPagar);

        assertEquals(com.bajonea.backend.enums.EstadoPedido.CANCELADO, respuesta.getEstado());
        assertEquals("CANCELADO", estadoDelPedido(sinPagar));
        assertEquals(0, notas(sinPagar));
        assertEquals(0, avisos(dueno.id(), "PEDIDO_CANCELADO_CLIENTE"));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'CANCELADO' "
                + "AND actor_rol = 'CLIENTE'", Integer.class, sinPagar));
        assertFalse(pedidosEnLaActividad(dueno).contains(sinPagar), "el comercio nunca vio este pedido");
        assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.cancelarPedido(cliente, sinPagar));
    }

    @Test
    void elPedidoPagadoCanceladoPorLaSuspensionExponeElMotivoDelReembolsoAlCliente() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedido(dueno, cliente, "EN_PREPARACION", 5, true);
        suspender(dueno);
        LocalDateTime base = (LocalDateTime) comercio(dueno).get("suspendido_desde");
        pedidoService.cancelarPreparacionPorSuspension(base.plusMinutes(91));

        var respuesta = pedidoService.listarPedidosCliente(cliente).stream().filter(p -> p.getId() == pedido).findFirst().orElseThrow();

        assertEquals(com.bajonea.backend.enums.EstadoPedido.CANCELADO_POR_SISTEMA, respuesta.getEstado());
        assertEquals(com.bajonea.backend.enums.MotivoNotaCredito.SUSPENSION_COMERCIO, respuesta.getReembolsoMotivo());
        assertEquals(dueno.nombreComercio(), respuesta.getComercioNombre());
    }
}
