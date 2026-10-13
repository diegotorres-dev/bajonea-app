package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * Transiciones de estado del pedido contra {@code bajonea_test} con datos confirmados de verdad y varios hilos
 * (bloque A0 de E3): la anulación genera su nota de crédito en la misma transacción, y las acciones del comercio,
 * las del Cliente y los procesos automáticos se serializan por el bloqueo del pedido. Cada ronda crea sus propios
 * Dueño, Cliente y pedidos con datos únicos. Los cruces con el login y el bloqueo de cuenta del Dueño (HTTP real) se
 * miden en {@code stress-locks-tramoE3-A0.mjs}.
 */
@SpringBootTest
@ActiveProfiles("test")
class PedidoTransicionesIntegrationTest {

    private static final BigDecimalHolder TOTAL = new BigDecimalHolder();

    @Autowired
    private PedidoService pedidoService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private CuentaMercadoPagoService cuentaService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    @MockitoSpyBean
    private NotaCreditoService notaCreditoService;

    private DatosPruebaEmpleado datos;

    private static final class BigDecimalHolder {
        final java.math.BigDecimal valor = new java.math.BigDecimal("10200.00");
    }

    private record Escenario(Dueno dueno, int clienteId) {

        ComercioActivo comercio() {
            return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APTO_VENTA);
        }
    }

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        reset(reembolsoClient);
        when(reembolsoClient.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(ResultadoReembolsoMp.exito("refund-it"));
    }

    private Escenario escenario(boolean conCuentaMercadoPago) {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoComercio(dueno.comercioId(), "APTO_VENTA");
        int clienteId = datos.registrarCliente();
        if (conCuentaMercadoPago) {
            cuentaService.vincular(dueno.id(), "MP-IT-" + DatosPruebaEmpleado.sufijo(), "token", "refresh", "pub", true,
                    LocalDateTime.now().plusDays(1));
        }
        return new Escenario(dueno, clienteId);
    }

    private int pedido(Escenario e, String estado, boolean conPagoAprobado, int minutosEnEstado) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 10000, 200, 100, 10200, ?)",
                e.clienteId(), e.dueno().comercioId(), estado, LocalDateTime.now().minusHours(5));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, minutosEnEstado + 200);
        if (!estado.equals("PENDIENTE_CONFIRMACION_COMERCIO")) {
            historial(id, "EN_PREPARACION", "DUENO", e.dueno().id(), minutosEnEstado + 100);
        }
        if (estado.equals("EN_CAMINO") || estado.equals("LISTO_PARA_RETIRAR")) {
            historial(id, estado, "DUENO", e.dueno().id(), minutosEnEstado);
        }
        if (conPagoAprobado) {
            jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                    + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "it-" + id);
        }
        return id;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
    }

    private String estado(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    private int notas(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ?",
                Integer.class, pedidoId);
    }

    private int filasDeHistorial(int pedidoId, String estado) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = ?",
                Integer.class, pedidoId, estado);
    }

    private String ultimoDelHistorial(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1",
                String.class, pedidoId);
    }

    private int notificaciones(int pedidoId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ? AND tipo = ?",
                Integer.class, pedidoId, tipo);
    }

    private int totalDeNotificaciones(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE entidad_tipo = 'PEDIDO' AND entidad_id = ?",
                Integer.class, pedidoId);
    }

    private List<Object> correrAlMismoTiempo(List<Callable<Object>> tareas) {
        ExecutorService pool = Executors.newFixedThreadPool(tareas.size());
        CountDownLatch salida = new CountDownLatch(1);
        try {
            List<Future<Object>> futuros = new ArrayList<>();
            for (Callable<Object> tarea : tareas) {
                futuros.add(pool.submit(() -> {
                    salida.await();
                    try {
                        return tarea.call();
                    } catch (Exception e) {
                        return e;
                    }
                }));
            }
            salida.countDown();
            List<Object> resultados = new ArrayList<>();
            for (Future<Object> futuro : futuros) {
                resultados.add(futuro.get(60, TimeUnit.SECONDS));
            }
            return resultados;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        } finally {
            pool.shutdownNow();
        }
    }

    private static boolean esConflicto(Object resultado) {
        return resultado instanceof ConflictoDeNegocioException;
    }

    private static void sinErroresInesperados(List<Object> resultados) {
        for (Object resultado : resultados) {
            if (resultado instanceof Exception && !esConflicto(resultado)) {
                fail("Error inesperado (no es un 409): " + resultado);
            }
        }
    }

    private static long exitos(List<Object> resultados) {
        return resultados.stream().filter(r -> !(r instanceof Exception)).count();
    }

    @Test
    void anularGeneraLaNotaDeCreditoPorElTotalYElReembolsoSeSolicitaDespuesDelCommit() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);

        pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(com.bajonea.backend.enums.MotivoRechazo.OTRO, "Se rompio el horno"));

        assertEquals("ANULADO", estado(pedidoId));
        assertEquals(1, notas(pedidoId));
        Map<String, Object> nota = jdbcTemplate.queryForMap("SELECT n.* FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ?", pedidoId);
        assertEquals("ANULACION_COMERCIO", nota.get("motivo"));
        assertEquals("PROCESADO", nota.get("estado"));
        assertEquals(0, TOTAL.valor.compareTo((java.math.BigDecimal) nota.get("monto")));
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(eq("it-" + pedidoId), anyString(), anyString());
        assertEquals(1, filasDeHistorial(pedidoId, "ANULADO"));
        assertEquals(1, notificaciones(pedidoId, "PEDIDO_ANULADO_COMERCIO"));
        String mensaje = jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE entidad_id = ? AND tipo = 'PEDIDO_ANULADO_COMERCIO'",
                String.class, pedidoId);
        assertTrue(mensaje.contains("gestionando la devolución de tu pago"));
        assertTrue(mensaje.contains("Se rompio el horno"));
    }

    @Test
    void anularConLaCuentaDeMercadoPagoDesvinculadaDejaLaNotaEnRevisionManual() {
        Escenario e = escenario(false);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);

        pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(com.bajonea.backend.enums.MotivoRechazo.OTRO, "Sin gas"));

        assertEquals("ANULADO", estado(pedidoId));
        assertEquals(1, notas(pedidoId));
        assertEquals("PENDIENTE_REVISION_MANUAL", jdbcTemplate.queryForObject(
                "SELECT n.estado FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ?", String.class, pedidoId));
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }

    @Test
    void siMercadoPagoFallaLaAnulacionQuedaYLaNotaFallidaConSuError() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);
        when(reembolsoClient.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(ResultadoReembolsoMp.fallido("Mercado Pago respondio 400: sin fondos"));

        pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(com.bajonea.backend.enums.MotivoRechazo.OTRO, "Cierre imprevisto"));

        assertEquals("ANULADO", estado(pedidoId));
        assertEquals(1, notas(pedidoId));
        Map<String, Object> nota = jdbcTemplate.queryForMap("SELECT n.* FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ?", pedidoId);
        assertEquals("FALLIDO", nota.get("estado"));
        assertEquals(1, ((Number) nota.get("intentos")).intValue());
    }

    @Test
    void anularUnPedidoSinPagoAprobadoNoCreaNotaNiPrometeUnaDevolucion() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", false, 5);

        pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(com.bajonea.backend.enums.MotivoRechazo.OTRO, "Sin insumos"));

        assertEquals("ANULADO", estado(pedidoId));
        assertEquals(0, notas(pedidoId));
        String mensaje = jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE entidad_id = ? AND tipo = 'PEDIDO_ANULADO_COMERCIO'",
                String.class, pedidoId);
        assertFalse(mensaje.contains("devolución"));
    }

    @Test
    void siNoSePuedeEscribirLaNotaElPedidoNoQuedaAnuladoNiHayHistorialNiAviso() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);
        doThrow(new IllegalStateException("falla simulada al escribir la nota")).when(notaCreditoService)
                .crear(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        try {
            pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(com.bajonea.backend.enums.MotivoRechazo.OTRO, "x"));
            fail("Tenía que fallar");
        } catch (IllegalStateException esperado) {
            assertEquals("falla simulada al escribir la nota", esperado.getMessage());
        } finally {
            reset(notaCreditoService);
        }

        assertEquals("EN_PREPARACION", estado(pedidoId));
        assertEquals(0, filasDeHistorial(pedidoId, "ANULADO"));
        assertEquals(0, notas(pedidoId));
        assertEquals(0, totalDeNotificaciones(pedidoId));
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }

    @Test
    void seisAnulacionesSimultaneasDejanUnaSolaNotaUnSoloHistorialUnSoloAvisoYUnSoloReembolso() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);

        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            tareas.add(() -> pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(com.bajonea.backend.enums.MotivoRechazo.OTRO, "Cierre")));
        }
        List<Object> resultados = correrAlMismoTiempo(tareas);

        sinErroresInesperados(resultados);
        assertEquals(1, exitos(resultados));
        assertEquals("ANULADO", estado(pedidoId));
        assertEquals(1, notas(pedidoId));
        assertEquals(1, filasDeHistorial(pedidoId, "ANULADO"));
        assertEquals(1, notificaciones(pedidoId, "PEDIDO_ANULADO_COMERCIO"));
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }

    @Test
    void aceptarContraRechazarSimultaneosDejanUnSoloGanadorConHistorialAvisoYNotaCoherentes() {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escenario e = escenario(true);
            int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 5);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.aceptarPedido(e.comercio(), pedidoId),
                    () -> pedidoService.rechazarPedido(e.comercio(), pedidoId, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null))));

            sinErroresInesperados(resultados);
            assertEquals(1, exitos(resultados), "ronda " + ronda);
            String finalEstado = estado(pedidoId);
            assertEquals(finalEstado, ultimoDelHistorial(pedidoId));
            assertEquals(1, totalDeNotificaciones(pedidoId), "una sola notificación coherente con el estado final");
            if (finalEstado.equals("EN_PREPARACION")) {
                assertEquals(1, notificaciones(pedidoId, "PEDIDO_ACEPTADO"));
                assertEquals(0, notas(pedidoId));
                assertEquals(0, filasDeHistorial(pedidoId, "RECHAZADO"));
            } else {
                assertEquals("RECHAZADO", finalEstado);
                assertEquals(1, notificaciones(pedidoId, "PEDIDO_RECHAZADO"));
                assertEquals(1, notas(pedidoId));
                assertEquals(1, filasDeHistorial(pedidoId, "RECHAZADO"));
            }
        }
    }

    @Test
    void anularContraDespacharSimultaneosDejanUnSoloGanador() {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escenario e = escenario(true);
            int pedidoId = pedido(e, "EN_PREPARACION", true, 5);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(com.bajonea.backend.enums.MotivoRechazo.OTRO, "Cierre")),
                    () -> pedidoService.avanzarAEntregaEnCurso(e.comercio(), pedidoId)));

            sinErroresInesperados(resultados);
            assertEquals(1, exitos(resultados), "ronda " + ronda);
            String finalEstado = estado(pedidoId);
            assertEquals(finalEstado, ultimoDelHistorial(pedidoId));
            assertEquals(1, totalDeNotificaciones(pedidoId));
            if (finalEstado.equals("ANULADO")) {
                assertEquals(1, notas(pedidoId));
                assertEquals(0, filasDeHistorial(pedidoId, "LISTO_PARA_RETIRAR"));
            } else {
                assertEquals("LISTO_PARA_RETIRAR", finalEstado);
                assertEquals(0, notas(pedidoId));
                assertEquals(0, filasDeHistorial(pedidoId, "ANULADO"));
            }
        }
    }

    @Test
    void cancelarDelClienteContraAceptarDelComercioTerminaSiempreCanceladoConHistorialYAvisosCoherentes() {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escenario e = escenario(true);
            int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 5);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.cancelarPedido(e.clienteId(), pedidoId),
                    () -> pedidoService.aceptarPedido(e.comercio(), pedidoId)));

            sinErroresInesperados(resultados);
            assertEquals("CANCELADO", estado(pedidoId), "cancelar siempre prospera: se puede desde PENDIENTE_CONFIRMACION y desde EN_PREPARACION");
            assertEquals("CANCELADO", ultimoDelHistorial(pedidoId));
            assertEquals(1, filasDeHistorial(pedidoId, "CANCELADO"));
            assertEquals(1, notificaciones(pedidoId, "PEDIDO_CANCELADO_CLIENTE"));
            int aceptaciones = filasDeHistorial(pedidoId, "EN_PREPARACION");
            assertEquals(aceptaciones, notificaciones(pedidoId, "PEDIDO_ACEPTADO"), "un aviso de aceptación por cada aceptación que quedó en el historial");
            assertEquals(1 + aceptaciones, exitos(resultados) + 0, "aceptar prospera solo si ganó antes de la cancelación");
        }
    }

    @Test
    void elProcesoDeExpiracionContraAceptarDejaUnSoloGanadorYElReembolsoSoloSiExpiro() {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escenario e = escenario(true);
            int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 45);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> {
                        pedidoService.expirarPedidosSinRespuestaComercio(LocalDateTime.now());
                        return "job";
                    },
                    () -> pedidoService.aceptarPedido(e.comercio(), pedidoId)));

            sinErroresInesperados(resultados);
            String finalEstado = estado(pedidoId);
            assertEquals(finalEstado, ultimoDelHistorial(pedidoId));
            if (finalEstado.equals("EXPIRADO")) {
                assertEquals(1, filasDeHistorial(pedidoId, "EXPIRADO"));
                assertEquals(1, notas(pedidoId));
                assertEquals(1, notificaciones(pedidoId, "PEDIDO_EXPIRADO_CLIENTE"));
                assertEquals(1, notificaciones(pedidoId, "PEDIDO_EXPIRADO_COMERCIO"));
                assertEquals(0, filasDeHistorial(pedidoId, "EN_PREPARACION"));
                assertEquals(0, notificaciones(pedidoId, "PEDIDO_ACEPTADO"));
            } else {
                assertEquals("EN_PREPARACION", finalEstado);
                assertEquals(0, filasDeHistorial(pedidoId, "EXPIRADO"));
                assertEquals(0, notas(pedidoId));
                assertEquals(1, notificaciones(pedidoId, "PEDIDO_ACEPTADO"));
                assertEquals(0, notificaciones(pedidoId, "PEDIDO_EXPIRADO_CLIENTE"));
            }
        }
    }

    @Test
    void laAutoconfirmacionContraLaConfirmacionDelClienteEntregaUnaSolaVez() {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escenario e = escenario(true);
            int pedidoId = pedido(e, "EN_CAMINO", true, 100);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> {
                        pedidoService.avisar75MinYAutoconfirmar(LocalDateTime.now());
                        return "job";
                    },
                    () -> pedidoService.confirmarEntregaCliente(e.clienteId(), pedidoId)));

            sinErroresInesperados(resultados);
            assertEquals("ENTREGADO", estado(pedidoId));
            assertEquals(1, filasDeHistorial(pedidoId, "ENTREGADO"), "una sola fila de ENTREGADO, ronda " + ronda);
            String fuente = jdbcTemplate.queryForObject("SELECT fuente_entrega FROM pedido WHERE id = ?", String.class, pedidoId);
            if (fuente.equals("SISTEMA")) {
                assertEquals(1, notificaciones(pedidoId, "PEDIDO_AUTOCONFIRMADO"));
                assertEquals(1, resultados.stream().filter(PedidoTransicionesIntegrationTest::esConflicto).count());
            } else {
                assertEquals("CLIENTE", fuente);
                assertEquals(0, notificaciones(pedidoId, "PEDIDO_AUTOCONFIRMADO"));
            }
        }
    }

    @Test
    void dosNotificacionesDelMismoPagoAprobadoConfirmanUnaVezYAvisanUnaVez() {
        Escenario e = escenario(true);
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', 'PENDIENTE_PAGO', 'PENDIENTE', 10000, 200, 100, 10200, NOW())",
                e.clienteId(), e.dueno().comercioId());
        int pedidoId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);

        List<Object> resultados = correrAlMismoTiempo(List.of(
                () -> {
                    pedidoService.confirmarPagoAprobado(pedidoId);
                    return "a";
                },
                () -> {
                    pedidoService.confirmarPagoAprobado(pedidoId);
                    return "b";
                }));

        sinErroresInesperados(resultados);
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estado(pedidoId));
        assertEquals(1, filasDeHistorial(pedidoId, "PENDIENTE_CONFIRMACION_COMERCIO"));
        assertEquals(1, notificaciones(pedidoId, "NUEVO_PEDIDO"));
    }

    @Test
    void laExpiracionDePagoNoCancelaUnPedidoQueYaPaso() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);

        pedidoService.expirarPagosVencidos(LocalDateTime.now().plusDays(1));

        assertEquals("EN_PREPARACION", estado(pedidoId));
        assertEquals(0, filasDeHistorial(pedidoId, "CANCELADO_POR_SISTEMA"));
    }

    private void fallarAlEscribirLaNota() {
        doThrow(new IllegalStateException("falla simulada al escribir la nota")).when(notaCreditoService)
                .crear(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    private Map<String, Object> notaDe(int pedidoId) {
        return jdbcTemplate.queryForMap("SELECT n.* FROM nota_credito n JOIN pago p ON p.id = n.pago_id WHERE p.pedido_id = ?", pedidoId);
    }

    @Test
    void rechazarCreaLaNotaEnLaMismaTransaccionYLaRespuestaTraeElEstadoDelReembolso() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 5);

        var respuesta = pedidoService.rechazarPedido(e.comercio(), pedidoId, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));

        assertEquals("RECHAZADO", estado(pedidoId));
        assertEquals(1, notas(pedidoId));
        assertEquals("RECHAZO_COMERCIO", notaDe(pedidoId).get("motivo"));
        assertEquals("PROCESADO", notaDe(pedidoId).get("estado"));
        assertTrue(respuesta.getReembolsoEstado() != null, "la respuesta de rechazar trae el estado del reembolso");
        assertEquals(0, TOTAL.valor.compareTo(respuesta.getReembolsoMonto()));
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(eq("it-" + pedidoId), anyString(), anyString());
        String mensaje = jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE entidad_id = ? AND tipo = 'PEDIDO_RECHAZADO'",
                String.class, pedidoId);
        assertTrue(mensaje.contains("gestionando la devolución de tu pago"));
    }

    @Test
    void siNoSePuedeEscribirLaNotaElRechazoNoCambiaNadaNiAvisa() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 5);
        fallarAlEscribirLaNota();
        try {
            pedidoService.rechazarPedido(e.comercio(), pedidoId, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));
            fail("Tenía que fallar");
        } catch (IllegalStateException esperado) {
            assertEquals("falla simulada al escribir la nota", esperado.getMessage());
        } finally {
            reset(notaCreditoService);
        }

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estado(pedidoId));
        assertEquals(0, filasDeHistorial(pedidoId, "RECHAZADO"));
        assertEquals(0, notas(pedidoId));
        assertEquals(0, totalDeNotificaciones(pedidoId));
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }

    @Test
    void rechazarConLaCuentaDesvinculadaDejaLaNotaEnRevisionManual() {
        Escenario e = escenario(false);
        int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 5);

        pedidoService.rechazarPedido(e.comercio(), pedidoId, new RechazoPedidoRequestDTO(MotivoRechazo.CERRADO, null));

        assertEquals("RECHAZADO", estado(pedidoId));
        assertEquals("PENDIENTE_REVISION_MANUAL", notaDe(pedidoId).get("estado"));
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }

    @Test
    void laExpiracionCreaLaNotaEnLaTransaccionDelPedido() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 45);

        pedidoService.expirarPedidosSinRespuestaComercio(LocalDateTime.now());

        assertEquals("EXPIRADO", estado(pedidoId));
        assertEquals(1, notas(pedidoId));
        assertEquals("EXPIRACION_SIN_RESPUESTA", notaDe(pedidoId).get("motivo"));
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(eq("it-" + pedidoId), anyString(), anyString());
    }

    @Test
    void siFallaLaNotaDeLaExpiracionElPedidoQuedaComoEstabaYLaCorridaSiguienteLoReintenta() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 45);
        fallarAlEscribirLaNota();
        try {
            pedidoService.expirarPedidosSinRespuestaComercio(LocalDateTime.now());
        } finally {
            reset(notaCreditoService);
        }

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estado(pedidoId));
        assertEquals(0, filasDeHistorial(pedidoId, "EXPIRADO"));
        assertEquals(0, notas(pedidoId));
        assertEquals(0, totalDeNotificaciones(pedidoId));

        pedidoService.expirarPedidosSinRespuestaComercio(LocalDateTime.now());

        assertEquals("EXPIRADO", estado(pedidoId));
        assertEquals(1, notas(pedidoId));
    }

    @Test
    void laSuspensionDelComercioCreaLaNotaDeLosPedidosPagados() {
        Escenario e = escenario(true);
        int enPreparacion = pedido(e, "EN_PREPARACION", true, 5);
        int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 5);

        pedidoService.cancelarPedidosPorSuspensionComercio(e.dueno().comercioId());

        assertEquals("CANCELADO_POR_SISTEMA", estado(enPreparacion));
        assertEquals("CANCELADO_POR_SISTEMA", estado(pendiente));
        assertEquals(1, notas(enPreparacion));
        assertEquals(1, notas(pendiente));
        assertEquals("SUSPENSION_COMERCIO", notaDe(enPreparacion).get("motivo"));
    }

    @Test
    void siFallaLaNotaDeLaSuspensionNingunPedidoCambiaDeEstado() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);
        fallarAlEscribirLaNota();
        try {
            pedidoService.cancelarPedidosPorSuspensionComercio(e.dueno().comercioId());
            fail("Tenía que fallar");
        } catch (IllegalStateException esperado) {
            assertEquals("falla simulada al escribir la nota", esperado.getMessage());
        } finally {
            reset(notaCreditoService);
        }

        assertEquals("EN_PREPARACION", estado(pedidoId));
        assertEquals(0, filasDeHistorial(pedidoId, "CANCELADO_POR_SISTEMA"));
        assertEquals(0, notas(pedidoId));
    }

    @Test
    void cancelarDelClienteConPagoCreaLaNotaEnLaMismaTransaccionYLaRespuestaTraeElReembolso() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);

        var respuesta = pedidoService.cancelarPedido(e.clienteId(), pedidoId);

        assertEquals("CANCELADO", estado(pedidoId));
        assertEquals(1, notas(pedidoId));
        assertEquals("CANCELACION_CLIENTE", notaDe(pedidoId).get("motivo"));
        assertTrue(respuesta.getReembolsoEstado() != null);
        assertEquals(1, notificaciones(pedidoId, "PEDIDO_CANCELADO_CLIENTE"));
        verify(reembolsoClient, times(1)).solicitarReembolsoTotal(eq("it-" + pedidoId), anyString(), anyString());
    }

    @Test
    void cancelarDelClienteSinPagoAprobadoNoCreaNota() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", false, 5);

        pedidoService.cancelarPedido(e.clienteId(), pedidoId);

        assertEquals("CANCELADO", estado(pedidoId));
        assertEquals(0, notas(pedidoId));
        verify(reembolsoClient, never()).solicitarReembolsoTotal(anyString(), anyString(), anyString());
    }

    @Test
    void siNoSePuedeEscribirLaNotaLaCancelacionDelClienteNoCambiaNada() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);
        fallarAlEscribirLaNota();
        try {
            pedidoService.cancelarPedido(e.clienteId(), pedidoId);
            fail("Tenía que fallar");
        } catch (IllegalStateException esperado) {
            assertEquals("falla simulada al escribir la nota", esperado.getMessage());
        } finally {
            reset(notaCreditoService);
        }

        assertEquals("EN_PREPARACION", estado(pedidoId));
        assertEquals(0, filasDeHistorial(pedidoId, "CANCELADO"));
        assertEquals(0, notas(pedidoId));
        assertEquals(0, notificaciones(pedidoId, "PEDIDO_CANCELADO_CLIENTE"));
    }

    @Test
    void cancelarDelClienteContraRechazarDelComercioDejaUnaSolaNota() {
        for (int ronda = 0; ronda < 6; ronda++) {
            Escenario e = escenario(true);
            int pedidoId = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO", true, 5);

            List<Object> resultados = correrAlMismoTiempo(List.of(
                    () -> pedidoService.cancelarPedido(e.clienteId(), pedidoId),
                    () -> pedidoService.rechazarPedido(e.comercio(), pedidoId, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null))));

            sinErroresInesperados(resultados);
            assertEquals(1, exitos(resultados), "ronda " + ronda);
            assertEquals(1, notas(pedidoId), "una sola nota, ronda " + ronda);
            assertEquals(estado(pedidoId), ultimoDelHistorial(pedidoId));
        }
    }

    @Test
    void anularConMotivoDeLaListaGuardaElEnumElComentarioYElTextoLegible() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);

        pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(MotivoRechazo.PROBLEMA_TECNICO, "Se cortó la luz"));

        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT motivo, motivo_rechazo, comentario_rechazo FROM pedido WHERE id = ?", pedidoId);
        assertEquals("PROBLEMA_TECNICO", fila.get("motivo_rechazo"));
        assertEquals("Se cortó la luz", fila.get("comentario_rechazo"));
        assertEquals("Problema técnico. Se cortó la luz", fila.get("motivo"));
    }

    @Test
    void anularConMotivoOtroSinComentarioNoCambiaNada() {
        Escenario e = escenario(true);
        int pedidoId = pedido(e, "EN_PREPARACION", true, 5);

        try {
            pedidoService.anularPedido(e.comercio(), pedidoId, new AnulacionPedidoRequestDTO(MotivoRechazo.OTRO, null));
            fail("Tenía que fallar");
        } catch (com.bajonea.backend.exceptions.ValidacionException esperado) {
            assertTrue(esperado.getMessage().contains("comentario"));
        }

        assertEquals("EN_PREPARACION", estado(pedidoId));
        assertEquals(0, notas(pedidoId));
    }
}
