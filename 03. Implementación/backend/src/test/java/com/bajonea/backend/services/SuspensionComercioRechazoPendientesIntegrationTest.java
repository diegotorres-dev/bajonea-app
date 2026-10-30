package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * Rechazo automático de los pedidos pendientes de confirmación al suspender un comercio (Fase 5, tramo S2.1): el
 * rechazo inmediato con reembolso, el aviso solo al Cliente, el aislamiento de los demás pedidos y comercios, el fallo de
 * Mercado Pago en un pedido, el barrido de seguridad idempotente y las carreras contra aceptar, rechazar a mano y
 * suspender dos veces.
 */
class SuspensionComercioRechazoPendientesIntegrationTest extends CarritoIntegrationBase {

    private static final String TEXTO_AVISO = "Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero.";
    private static final String SQL_ESTADO_NOTA = "SELECT nc.estado FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?";

    @Autowired
    private SuspensionComercioService suspensionService;

    @Autowired
    private PedidoSchedulerService schedulerService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    @MockitoSpyBean
    private PedidoRepository pedidoRepository;

    private int administradorId;

    @BeforeEach
    void preparar() {
        administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        when(reembolsoClient.solicitarReembolsoTotal(any(), any(), anyString())).thenReturn(new ResultadoReembolsoMp(true, "refund", null));
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        when(emailService.enviarComercioSuspensionLevantada(anyString(), anyString(), any())).thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    private void suspender(Dueno dueno) {
        suspensionService.suspender(dueno.comercioId(), administradorId, new SuspensionComercioRequestDTO("Documentacion vencida y quejas"));
    }

    private int pedido(Dueno dueno, int clienteId, String estado) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 10000, 200, 100, 10200, ?)",
                clienteId, dueno.comercioId(), estado, LocalDateTime.now().minusHours(6));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, 300);
        if (!estado.equals("PENDIENTE_CONFIRMACION_COMERCIO")) {
            historial(id, "EN_PREPARACION", "DUENO", dueno.id(), 200);
        }
        if (estado.equals("LISTO_PARA_RETIRAR")) {
            historial(id, estado, "DUENO", dueno.id(), 5);
        }
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "rp-" + id);
        return id;
    }

    private int pendiente(Dueno dueno, int clienteId) {
        return pedido(dueno, clienteId, "PENDIENTE_CONFIRMACION_COMERCIO");
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
    }

    private int notas(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                Integer.class, pedidoId);
    }

    private int filas(int pedidoId, String estado) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = ?", Integer.class, pedidoId, estado);
    }

    private int avisosDeRechazo(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'PEDIDO_RECHAZADO' AND canal = 'PUSH'",
                Integer.class, usuarioId);
    }

    private ComercioActivo comoDueno(Dueno dueno) {
        return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.SUSPENDIDO);
    }

    private static void sinFallosInesperados(List<Object> resultados) {
        for (Object resultado : resultados) {
            assertTrue(!(resultado instanceof Exception) || resultado instanceof ConflictoDeNegocioException, "Fallo inesperado: " + resultado);
        }
    }

    @Test
    void suspenderRechazaTodosLosPendientesConNotaPorElMontoPagadoHistorialYAvisoAlCliente() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        List<Integer> pendientes = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            pendientes.add(pendiente(dueno, cliente));
        }

        suspender(dueno);

        for (int id : pendientes) {
            assertEquals("RECHAZADO", estadoDelPedido(id));
            assertEquals("SISTEMA", jdbcTemplate.queryForObject("SELECT cancelado_por FROM pedido WHERE id = ?", String.class, id));
            assertEquals(1, notas(id));
            assertEquals(0, new BigDecimal("10200").compareTo(jdbcTemplate.queryForObject(
                    "SELECT nc.monto FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?", BigDecimal.class, id)));
            assertEquals("PROCESADO", jdbcTemplate.queryForObject(SQL_ESTADO_NOTA, String.class, id));
            assertEquals(1, filas(id, "RECHAZADO"));
            assertEquals("SISTEMA", jdbcTemplate.queryForObject("SELECT actor_rol FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'RECHAZADO'",
                    String.class, id));
            assertEquals("SUSPENSION_COMERCIO", jdbcTemplate.queryForObject(
                    "SELECT motivo_timeout FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'RECHAZADO'", String.class, id));
        }
        assertEquals(5, avisosDeRechazo(cliente));
        assertEquals(5, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND mensaje = ?", Integer.class, cliente, TEXTO_AVISO));
        verify(reembolsoClient, times(5)).solicitarReembolsoTotal(any(), any(), anyString());
    }

    @Test
    void elDuenoYElEquipoNoRecibenUnAvisoPorCadaPedidoRechazado() {
        Dueno dueno = comercioApto(true);
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        int cliente = datos.registrarCliente();
        pendiente(dueno, cliente);
        pendiente(dueno, cliente);

        suspender(dueno);

        assertEquals(0, avisosDeRechazo(dueno.id()));
        assertEquals(0, avisosDeRechazo(empleado.id()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id IN (?, ?) AND tipo = 'NUEVO_PEDIDO'",
                Integer.class, dueno.id(), empleado.id()));
    }

    @Test
    void losPedidosEnOtrosEstadosYLosPendientesDeOtroComercioQuedanIntactos() {
        Dueno dueno = comercioApto(true);
        Dueno otro = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pendiente = pendiente(dueno, cliente);
        int enPreparacion = pedido(dueno, cliente, "EN_PREPARACION");
        int listo = pedido(dueno, cliente, "LISTO_PARA_RETIRAR");
        int ajeno = pendiente(otro, cliente);

        suspender(dueno);

        assertEquals("RECHAZADO", estadoDelPedido(pendiente));
        assertEquals("EN_PREPARACION", estadoDelPedido(enPreparacion));
        assertEquals("LISTO_PARA_RETIRAR", estadoDelPedido(listo));
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(ajeno));
        assertEquals(0, notas(enPreparacion) + notas(listo) + notas(ajeno));
    }

    @Test
    void suspenderSinPendientesNoEscribeNadaDeMasYNoPideReembolsos() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int enPreparacion = pedido(dueno, cliente, "EN_PREPARACION");

        suspender(dueno);

        assertEquals("EN_PREPARACION", estadoDelPedido(enPreparacion));
        assertEquals(0, avisosDeRechazo(cliente));
        verify(reembolsoClient, never()).solicitarReembolsoTotal(any(), any(), anyString());
        assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, dueno.comercioId()));
    }

    @Test
    void siMercadoPagoFallaEnUnPedidoEseQuedaRechazadoConElReembolsoPendienteYLosDemasSeProcesan() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int primero = pendiente(dueno, cliente);
        int fallido = pendiente(dueno, cliente);
        int tercero = pendiente(dueno, cliente);
        when(reembolsoClient.solicitarReembolsoTotal(eq("rp-" + fallido), any(), anyString()))
                .thenReturn(ResultadoReembolsoMp.fallido("Mercado Pago no respondio"));

        suspender(dueno);

        for (int id : List.of(primero, fallido, tercero)) {
            assertEquals("RECHAZADO", estadoDelPedido(id));
            assertEquals(1, notas(id));
        }
        assertNotEquals("PROCESADO", jdbcTemplate.queryForObject(SQL_ESTADO_NOTA, String.class, fallido));
        for (int id : List.of(primero, tercero)) {
            assertEquals("PROCESADO", jdbcTemplate.queryForObject(SQL_ESTADO_NOTA, String.class, id));
        }
    }

    @Test
    void elBarridoRechazaLosPendientesQueQuedaronSinProcesarYEsIdempotente() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        suspender(dueno);
        int a = pendiente(dueno, cliente);
        int b = pendiente(dueno, cliente);

        schedulerService.ejecutar("rechazar-pendientes-suspension", LocalDateTime.now());
        schedulerService.ejecutar("rechazar-pendientes-suspension", LocalDateTime.now());

        for (int id : List.of(a, b)) {
            assertEquals("RECHAZADO", estadoDelPedido(id));
            assertEquals(1, notas(id));
            assertEquals(1, filas(id, "RECHAZADO"));
        }
        assertEquals(2, avisosDeRechazo(cliente));
    }

    @Test
    void elBarridoNoTocaLosPendientesDeUnComercioQueNoEstaSuspendido() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pendiente = pendiente(dueno, cliente);

        schedulerService.ejecutar("rechazar-pendientes-suspension", LocalDateTime.now());

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pendiente));
        assertEquals(0, notas(pendiente));
    }

    @Test
    void elBarridoNoTocaLosPendientesSiSeLevantoLaSuspension() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        suspender(dueno);
        int pendiente = pendiente(dueno, cliente);
        suspensionService.levantar(dueno.comercioId(), administradorId, new LevantamientoSuspensionRequestDTO(null));

        schedulerService.ejecutar("rechazar-pendientes-suspension", LocalDateTime.now());

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pendiente));
    }

    @Test
    void levantarLaSuspensionNoDeshaceLosRechazos() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pendiente = pendiente(dueno, cliente);
        suspender(dueno);

        suspensionService.levantar(dueno.comercioId(), administradorId, new LevantamientoSuspensionRequestDTO(null));

        assertEquals("RECHAZADO", estadoDelPedido(pendiente));
        assertEquals(1, notas(pendiente));
    }

    @Test
    void elRechazoManualSigueFuncionandoMientrasElPedidoSigaPendiente() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        suspender(dueno);
        int pendiente = pendiente(dueno, cliente);

        pedidoService.rechazarPedido(comoDueno(dueno), pendiente, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));
        schedulerService.ejecutar("rechazar-pendientes-suspension", LocalDateTime.now());

        assertEquals("RECHAZADO", estadoDelPedido(pendiente));
        assertEquals(1, notas(pendiente));
        assertEquals("SIN_STOCK", jdbcTemplate.queryForObject("SELECT motivo_rechazo FROM pedido WHERE id = ?", String.class, pendiente));
    }

    @Test
    void rechazarLosPendientesDeUnComercioQueNoEstaSuspendidoNoHaceNada() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pendiente = pendiente(dueno, cliente);

        int rechazados = pedidoService.rechazarPendientesDelComercioSuspendido(dueno.comercioId());

        assertEquals(0, rechazados);
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pendiente));
        assertEquals(0, notas(pendiente));
    }

    @Test
    void unPedidoYaResueltoQueFiguraEnLaListaViejaNoSeRechazaDeNuevo() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        suspender(dueno);
        int resuelto = pendiente(dueno, cliente);
        pedidoService.rechazarPedido(comoDueno(dueno), resuelto, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));
        doReturn(List.of(resuelto)).when(pedidoRepository).findIdsByComercioIdAndEstadoIn(eq(dueno.comercioId()), any());

        int rechazados = pedidoService.rechazarPendientesDelComercioSuspendido(dueno.comercioId());

        assertEquals(0, rechazados);
        assertEquals(1, notas(resuelto));
        assertEquals(1, filas(resuelto, "RECHAZADO"));
        assertEquals(1, avisosDeRechazo(cliente));
    }

    @Test
    void cincuentaPendientesSeRechazanEnUnTiempoRazonable() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        for (int i = 0; i < 50; i++) {
            pendiente(dueno, cliente);
        }

        long inicio = System.nanoTime();
        suspender(dueno);
        long milisegundos = (System.nanoTime() - inicio) / 1_000_000;
        System.out.println("S2.1 tiempo de suspender con 50 pendientes: " + milisegundos + " ms");

        assertEquals(50, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE comercio_id = ? AND estado = 'RECHAZADO'", Integer.class, dueno.comercioId()));
        assertEquals(50, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id JOIN pedido p ON p.id = pg.pedido_id WHERE p.comercio_id = ?",
                Integer.class, dueno.comercioId()));
        assertTrue(milisegundos < 60_000, "tardó " + milisegundos + " ms");
    }

    @RepeatedTest(8)
    void suspenderContraAceptarElMismoPedidoTieneUnSoloGanador() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int id = pendiente(dueno, cliente);
        ComercioActivo actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(dueno);
            return null;
        });
        tareas.add(() -> pedidoService.aceptarPedido(actor, id));
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        String estado = estadoDelPedido(id);
        assertTrue(estado.equals("EN_PREPARACION") || estado.equals("RECHAZADO"), estado);
        assertEquals(estado.equals("EN_PREPARACION") ? 1 : 0, filas(id, "EN_PREPARACION"));
        assertEquals(estado.equals("RECHAZADO") ? 1 : 0, notas(id));
        assertEquals(estado.equals("RECHAZADO") ? 1 : 0, filas(id, "RECHAZADO"));
    }

    @RepeatedTest(8)
    void suspenderContraRechazarAManoDejaUnaSolaNota() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int id = pendiente(dueno, cliente);
        ComercioActivo actor = ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(dueno);
            return null;
        });
        tareas.add(() -> pedidoService.rechazarPedido(actor, id, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("RECHAZADO", estadoDelPedido(id));
        assertEquals(1, notas(id));
        assertEquals(1, filas(id, "RECHAZADO"));
        assertEquals(1, avisosDeRechazo(cliente));
    }

    @RepeatedTest(8)
    void dobleClicEnSuspenderYBarridoSimultaneoNoDuplicanNotas() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        List<Integer> ids = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            ids.add(pendiente(dueno, cliente));
        }

        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            tareas.add(() -> {
                suspender(dueno);
                return null;
            });
            tareas.add(() -> {
                schedulerService.ejecutar("rechazar-pendientes-suspension", LocalDateTime.now());
                return null;
            });
        }
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        for (int id : ids) {
            assertEquals("RECHAZADO", estadoDelPedido(id));
            assertEquals(1, notas(id));
            assertEquals(1, filas(id, "RECHAZADO"));
        }
        assertEquals(4, avisosDeRechazo(cliente));
    }
}
