package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
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
 * Qué pasa con un pago aprobado cuando la cuenta del Cliente se suspende (Fase 5, tramo S1), por el camino real del
 * webhook y la sincronización con Mercado Pago simulado por un servidor local que responde siempre {@code approved}
 * (id del pago = 100000 + id del pedido): el pago que llega después de la suspensión se devuelve entero con una sola
 * nota de crédito, el que llega antes sigue su curso, y un pago tardío sobre un pedido ya cancelado por cualquier causa
 * (H4) se reembolsa en vez de quedar retenido. Incluye las carreras suspender contra pago.
 */
class SuspensionClientePagoIntegrationTest extends CarritoIntegrationBase {

    private static final int BASE_ID_PAGO = 100000;
    private static final HttpServer MERCADO_PAGO = iniciarServidor();

    @Autowired
    private MercadoPagoPagoService mercadoPagoPagoService;

    @Autowired
    private SuspensionUsuarioService suspensionService;

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
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    private static HttpServer iniciarServidor() {
        try {
            HttpServer servidor = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            servidor.createContext("/v1/payments/", SuspensionClientePagoIntegrationTest::responder);
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

    private void suspender(int clienteId) {
        suspensionService.suspender(clienteId, administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));
    }

    private int notasDelPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                Integer.class, pedidoId);
    }

    private List<String> motivosDeNotas(int pedidoId) {
        return jdbcTemplate.queryForList("SELECT nc.motivo FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ? ORDER BY nc.id",
                String.class, pedidoId);
    }

    private String estadoDelHistorial(int pedidoId) {
        return String.join(",", jdbcTemplate.queryForList("SELECT estado FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id",
                String.class, pedidoId));
    }

    @Test
    void unPagoQueLlegaDespuesDeLaSuspensionSeDevuelveEnteroConUnaSolaNotaYNoCreaPedidoParaElComercio() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);

        suspender(cliente);
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(pedido));

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");

        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(pedido));
        assertEquals(List.of("SUSPENSION_CLIENTE"), motivosDeNotas(pedido));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO'",
                Integer.class, pedido));
    }

    @Test
    void unPagoEnVueloConLaSuspensionYaConfirmadaPeroElPedidoTodaviaSinPagarSeCancelaYSeDevuelve() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);
        jdbcTemplate.update("UPDATE usuario SET estado = 'SUSPENDIDO', motivo_suspension = 'Pedidos falsos reiterados', suspendido_desde = NOW() WHERE id = ?",
                cliente);

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");

        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(pedido));
        assertEquals("PAGADO", jdbcTemplate.queryForObject("SELECT pago_estado FROM pedido WHERE id = ?", String.class, pedido));
        assertEquals(List.of("SUSPENSION_CLIENTE"), motivosDeNotas(pedido));
        assertEquals("SUSPENSION_CLIENTE", jdbcTemplate.queryForObject(
                "SELECT motivo_timeout FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'CANCELADO_POR_SISTEMA'", String.class, pedido));

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
        assertEquals(1, notasDelPedido(pedido));
    }

    @Test
    void unPagoQueLlegaAntesDeLaSuspensionSigueSuCursoNormal() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
        suspender(cliente);

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        assertEquals(0, notasDelPedido(pedido));
    }

    @Test
    void h4ConUnPedidoCanceladoPorElTimeoutElPagoTardioGeneraLaNotaYNoSeDuplicaConUnWebhookRepetido() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = DATE_SUB(NOW(), INTERVAL 3 HOUR) WHERE id = ?", pedido);
        pedidoService.expirarPagosVencidos();
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(pedido));
        assertEquals(0, notasDelPedido(pedido));

        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");
        mercadoPagoPagoService.procesarNotificacion(pedido, idDePago(pedido), "127.0.0.1");

        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(pedido));
        assertEquals(1, notasDelPedido(pedido));
        assertEquals(List.of("PAGO_TARDIO"), motivosDeNotas(pedido));
        assertTrue(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM alerta_webhook_mp WHERE pedido_id = ? AND motivo = 'PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO'",
                Integer.class, pedido) >= 1);
    }

    @RepeatedTest(8)
    void suspenderContraUnPagoAprobadoTerminaSiempreEnUnSoloResultadoCoherente() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(cliente);
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
        assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, cliente));
        if (estado.equals("PENDIENTE_CONFIRMACION_COMERCIO")) {
            assertEquals(0, notasDelPedido(pedido), estadoDelHistorial(pedido));
        } else {
            assertEquals("CANCELADO_POR_SISTEMA", estado);
            assertEquals(1, notasDelPedido(pedido), estadoDelHistorial(pedido));
            assertEquals(0, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ? AND estado = 'PENDIENTE_CONFIRMACION_COMERCIO'", Integer.class, pedido));
        }
    }
}
