package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Qué pasa con un pago aprobado cuando el comercio se suspende (Fase 5, tramo S2), por el camino real del webhook con
 * Mercado Pago simulado por un servidor local que responde siempre {@code approved} (id del pago = 100000 + id del
 * pedido): el pago que llega con el comercio suspendido se devuelve entero con una sola nota {@code SUSPENSION_COMERCIO},
 * el que llega antes sigue su curso, y un pago tardío sobre un pedido ya cancelado termina siempre en reembolso
 * ({@code PAGO_TARDIO}, o el motivo de la suspensión si es el caso). Incluye la carrera suspender contra pago.
 */
class SuspensionComercioPagoIntegrationTest extends CarritoIntegrationBase {

    private static final int BASE_ID_PAGO = 100000;
    private static final HttpServer MERCADO_PAGO = iniciarServidor();

    @Autowired
    private MercadoPagoPagoService mercadoPagoPagoService;

    @Autowired
    private SuspensionComercioService suspensionService;

    @Autowired
    private MercadoPagoOAuthService oauthService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private int administradorId;

    @DynamicPropertySource
    static void apuntarAlServidorLocal(DynamicPropertyRegistry registry) {
        registry.add("MERCADOPAGO_API_BASE_URL", () -> "http://localhost:" + MERCADO_PAGO.getAddress().getPort());
    }

    @AfterAll
    static void detenerServidor() {
        MERCADO_PAGO.stop(0);
    }

    @BeforeEach
    void prepararAdministrador() {
        administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        when(reembolsoClient.solicitarReembolsoTotal(any(), any(), anyString())).thenReturn(new ResultadoReembolsoMp(true, "refund", null));
        when(emailService.enviarComercioSuspendido(anyString(), anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    private static HttpServer iniciarServidor() {
        try {
            HttpServer servidor = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            servidor.createContext("/v1/payments/", SuspensionComercioPagoIntegrationTest::responder);
            servidor.setExecutor(Executors.newCachedThreadPool());
            servidor.start();
            return servidor;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void responder(HttpExchange intercambio) throws IOException {
        try {
            String ruta = intercambio.getRequestURI().getPath();
            String consulta = intercambio.getRequestURI().getQuery();
            String cuerpo;
            if (ruta.equals("/v1/payments/search") && consulta != null && consulta.contains("external_reference=")) {
                String pedido = consulta.replaceAll(".*external_reference=(\\d+).*", "$1");
                cuerpo = "{\"results\":[" + pago(Integer.parseInt(pedido)) + "]}";
            } else if (ruta.matches("/v1/payments/\\d+")) {
                cuerpo = pago(Integer.parseInt(ruta.substring("/v1/payments/".length())) - BASE_ID_PAGO);
            } else {
                intercambio.sendResponseHeaders(404, -1);
                return;
            }
            byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
            intercambio.getResponseHeaders().add("Content-Type", "application/json");
            intercambio.sendResponseHeaders(200, bytes.length);
            intercambio.getResponseBody().write(bytes);
        } finally {
            intercambio.close();
        }
    }

    private static String pago(int pedidoId) {
        return "{\"id\":" + (BASE_ID_PAGO + pedidoId) + ",\"status\":\"approved\",\"external_reference\":\"" + pedidoId
                + "\",\"payment_type_id\":\"account_money\",\"date_created\":\"2026-01-01T00:00:00.000-03:00\","
                + "\"fee_details\":[{\"type\":\"application_fee\",\"fee_payer\":\"collector\",\"amount\":300}]}";
    }

    private static String idDePago(int pedidoId) {
        return String.valueOf(BASE_ID_PAGO + pedidoId);
    }

    private void suspender(Dueno dueno) {
        suspensionService.suspender(dueno.comercioId(), administradorId, new SuspensionComercioRequestDTO("Documentacion vencida y quejas"));
    }

    private int notas(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                Integer.class, pedidoId);
    }

    private List<String> motivosDeNotas(int pedidoId) {
        return jdbcTemplate.queryForList("SELECT nc.motivo FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ? ORDER BY nc.id",
                String.class, pedidoId);
    }

    @Test
    void unPagoQueLlegaConElComercioSuspendidoSeDevuelveEnteroConUnaSolaNotaYNoCreaPedidoParaElComercio() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);
        suspender(dueno);
        assertEquals("PENDIENTE_PAGO", estadoDelPedido(pedido), "suspender no toca los pedidos sin pagar");

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");

        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(pedido));
        assertEquals("PAGADO", jdbcTemplate.queryForObject("SELECT pago_estado FROM pedido WHERE id = ?", String.class, pedido));
        assertEquals(List.of("SUSPENSION_COMERCIO"), motivosDeNotas(pedido));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO'",
                Integer.class, pedido));
        assertNull(jdbcTemplate.queryForObject("SELECT motivo_timeout FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'CANCELADO_POR_SISTEMA'",
                String.class, pedido));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'PEDIDO_CANCELADO_SISTEMA'",
                Integer.class, cliente));
    }

    @Test
    void unPagoQueLlegaAntesDeLaSuspensionConfirmaElPedidoYLaSuspensionLoRechazaConReembolso() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        suspender(dueno);

        assertEquals("RECHAZADO", estadoDelPedido(pedido));
        assertEquals(List.of("SUSPENSION_COMERCIO"), motivosDeNotas(pedido));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO'",
                Integer.class, pedido));
    }

    @Test
    void unPagoTardioSobreUnPedidoVencidoSinSuspensionSeReembolsaConPagoTardioYNoSeDuplica() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = DATE_SUB(NOW(), INTERVAL 3 HOUR) WHERE id = ?", pedido);
        pedidoService.expirarPagosVencidos();
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(pedido));

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");

        assertEquals(List.of("PAGO_TARDIO"), motivosDeNotas(pedido));
    }

    @Test
    void unPagoTardioSobreUnPedidoCanceladoConElComercioSuspendidoUsaElMotivoDeLaSuspension() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = DATE_SUB(NOW(), INTERVAL 3 HOUR) WHERE id = ?", pedido);
        pedidoService.expirarPagosVencidos();
        suspender(dueno);

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");

        assertEquals(List.of("SUSPENSION_COMERCIO"), motivosDeNotas(pedido));
    }

    @RepeatedTest(8)
    void suspenderContraUnPagoDejaOElPedidoRechazadoOCanceladoConUnaSolaNota() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(dueno);
            return null;
        });
        tareas.add(() -> {
            mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
            return null;
        });
        tareas.add(() -> {
            mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
            return null;
        });
        sinErrores(correrAlMismoTiempo(tareas));

        String estado = estadoDelPedido(pedido);
        assertTrue(estado.equals("RECHAZADO") || estado.equals("CANCELADO_POR_SISTEMA"), estado);
        assertEquals(List.of("SUSPENSION_COMERCIO"), motivosDeNotas(pedido));
        assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, dueno.comercioId()));
    }

    @Test
    void elWebhookEsperaAlComercioAntesDeTomarElPedidoYNoInterbloqueaAQuienTieneElComercioYPideElPedido() throws Exception {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);
        java.util.concurrent.ExecutorService hilos = Executors.newFixedThreadPool(2);
        java.util.concurrent.CountDownLatch comercioTomado = new java.util.concurrent.CountDownLatch(1);
        try {
            java.util.concurrent.Future<Object> quienTieneElComercio = hilos.submit(() -> {
                new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(estado -> {
                    jdbcTemplate.queryForList("SELECT id FROM comercio WHERE id = ? FOR UPDATE", dueno.comercioId());
                    comercioTomado.countDown();
                    long limite = System.currentTimeMillis() + 15000;
                    while (System.currentTimeMillis() < limite
                            && jdbcTemplate.queryForObject("SELECT COUNT(*) FROM information_schema.INNODB_LOCK_WAITS", Integer.class) == 0) {
                        try {
                            Thread.sleep(50);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                    }
                    jdbcTemplate.queryForList("SELECT id FROM pedido WHERE id = ? FOR UPDATE", pedido);
                });
                return null;
            });
            comercioTomado.await();
            java.util.concurrent.Future<Object> webhook = hilos.submit(() -> {
                mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
                return null;
            });
            quienTieneElComercio.get(30, java.util.concurrent.TimeUnit.SECONDS);
            try {
                webhook.get(30, java.util.concurrent.TimeUnit.SECONDS);
            } catch (java.util.concurrent.ExecutionException e) {
                assertTrue(e.getCause() instanceof com.bajonea.backend.exceptions.ConflictoDeNegocioException, "Fallo inesperado del webhook: " + e.getCause());
            }
        } finally {
            hilos.shutdownNow();
        }
    }

    @RepeatedTest(8)
    void desvincularMercadoPagoContraUnPagoNoSeInterbloqueaPorElOrdenDeLosBloqueos() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            oauthService.desvincular(dueno.id());
            return null;
        });
        tareas.add(() -> {
            mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
            return null;
        });
        for (Object resultado : correrAlMismoTiempo(tareas)) {
            assertTrue(!(resultado instanceof Exception) || resultado instanceof com.bajonea.backend.exceptions.ConflictoDeNegocioException,
                    "Fallo inesperado: " + resultado);
        }
    }
}
