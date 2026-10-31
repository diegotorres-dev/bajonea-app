package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

/**
 * Ninguna transacción pide una segunda conexión mientras sostiene la primera (Fase 5, tramo S3.1). El pool es de tres
 * conexiones y el tiempo de espera de una conexión es corto: si algún flujo necesitara una conexión más estando una
 * tomada, tres hilos que lo hicieran a la vez se trabarían entre sí hasta el tiempo de espera y la prueba fallaría con
 * {@code Connection is not available}. Los flujos son los que antes lo hacían: varios webhooks del mismo y de distintos
 * pagos que terminan en una nota de crédito con el reembolso diferido, y varias suspensiones que mandan un aviso por email
 * cuyo resultado se registra aparte. Mercado Pago y el email tardan un poco (como en la realidad) para que los hilos se
 * superpongan.
 */
@TestPropertySource(properties = {
        "spring.datasource.hikari.maximum-pool-size=3",
        "spring.datasource.hikari.minimum-idle=3",
        "spring.datasource.hikari.connection-timeout=4000"
})
class ConexionesAnidadasPoolDiminutoIntegrationTest extends SuspensionDuenoTestBase {

    private static final int BASE_ID_PAGO = 200000;
    private static final HttpServer MERCADO_PAGO = iniciarServidor();

    @Autowired
    private MercadoPagoPagoService mercadoPagoPagoService;

    @DynamicPropertySource
    static void apuntarAlServidorLocal(DynamicPropertyRegistry registry) {
        registry.add("MERCADOPAGO_API_BASE_URL", () -> "http://localhost:" + MERCADO_PAGO.getAddress().getPort());
    }

    @AfterAll
    static void detenerServidor() {
        MERCADO_PAGO.stop(0);
    }

    private static HttpServer iniciarServidor() {
        try {
            HttpServer servidor = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            servidor.createContext("/v1/payments/", ConexionesAnidadasPoolDiminutoIntegrationTest::responder);
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
            if (!ruta.matches("/v1/payments/\\d+")) {
                intercambio.sendResponseHeaders(404, -1);
                return;
            }
            pausa(150);
            int pedidoId = Integer.parseInt(ruta.substring("/v1/payments/".length())) - BASE_ID_PAGO;
            String cuerpo = "{\"id\":" + (BASE_ID_PAGO + pedidoId) + ",\"status\":\"approved\",\"external_reference\":\"" + pedidoId
                    + "\",\"payment_type_id\":\"account_money\",\"date_created\":\"2026-01-01T00:00:00.000-03:00\","
                    + "\"fee_details\":[{\"type\":\"application_fee\",\"fee_payer\":\"collector\",\"amount\":300}]}";
            byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
            intercambio.getResponseHeaders().add("Content-Type", "application/json");
            intercambio.sendResponseHeaders(200, bytes.length);
            intercambio.getResponseBody().write(bytes);
        } finally {
            intercambio.close();
        }
    }

    private static void pausa(long milisegundos) {
        try {
            Thread.sleep(milisegundos);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private int pedidoCancelado(Dueno dueno, int cliente) {
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);
        jdbcTemplate.update("UPDATE pedido SET estado = 'EXPIRADO' WHERE id = ?", pedido);
        return pedido;
    }

    private int notasDelPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago pg ON pg.id = nc.pago_id WHERE pg.pedido_id = ?",
                Integer.class, pedidoId);
    }

    @RepeatedTest(3)
    void variosWebhooksDelMismoYDeDistintosPagosNoAgotanElPool() {
        when(reembolsoClient.solicitarReembolsoTotal(any(), any(), anyString())).thenAnswer(invocacion -> {
            pausa(100);
            return new ResultadoReembolsoMp(true, "refund", null);
        });
        Dueno dueno = comercioApto(true);
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            pedidos.add(pedidoCancelado(dueno, datos.registrarCliente()));
        }

        List<Callable<Object>> tareas = new ArrayList<>();
        for (int pedido : pedidos) {
            for (int repeticion = 0; repeticion < 2; repeticion++) {
                tareas.add(() -> {
                    mercadoPagoPagoService.procesarNotificacion(pedido, String.valueOf(BASE_ID_PAGO + pedido), "127.0.0.1");
                    return null;
                });
            }
        }
        sinErrores(correrAlMismoTiempo(tareas));

        for (int pedido : pedidos) {
            assertEquals(1, notasDelPedido(pedido), "pedido " + pedido);
        }
    }

    @RepeatedTest(3)
    void variasSuspensionesConAvisoPorEmailNoAgotanElPool() {
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenAnswer(invocacion -> {
            pausa(100);
            return ResultadoEnvioEmail.enviado("id");
        });
        List<Integer> clientes = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            clientes.add(datos.registrarCliente());
        }

        List<Callable<Object>> tareas = new ArrayList<>();
        for (int cliente : clientes) {
            tareas.add(() -> {
                suspensionUsuario.suspender(cliente, administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));
                return null;
            });
        }
        sinErrores(correrAlMismoTiempo(tareas));

        for (int cliente : clientes) {
            assertEquals(1, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'EMAIL' AND tipo = 'CLIENTE_SUSPENDIDO' AND estado = 'ENVIADO'",
                    Integer.class, cliente), "cliente " + cliente);
        }
    }

    @Test
    void variasSuspensionesDeDuenoNoAgotanElPool() {
        when(emailService.enviarDuenoSuspendido(anyString(), anyString(), org.mockito.ArgumentMatchers.anyList())).thenAnswer(invocacion -> {
            pausa(100);
            return ResultadoEnvioEmail.enviado("id");
        });
        List<Dueno> duenos = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            duenos.add(duenoActivo());
        }

        List<Callable<Object>> tareas = new ArrayList<>();
        for (Dueno dueno : duenos) {
            tareas.add(() -> {
                suspender(dueno);
                return null;
            });
        }
        sinErrores(correrAlMismoTiempo(tareas));

        for (Dueno dueno : duenos) {
            assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, dueno.id()));
        }
    }
}
