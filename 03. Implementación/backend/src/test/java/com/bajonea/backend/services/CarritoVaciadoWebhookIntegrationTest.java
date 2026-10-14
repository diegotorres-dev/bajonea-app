package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.DynamicPropertyRegistry;

/**
 * El vaciado del carrito por el camino real del pago: el webhook ({@code procesarNotificacion}) y la sincronización
 * ({@code sincronizarPago}) de {@code MercadoPagoPagoService}, que empiezan con una lectura común, llaman a Mercado Pago
 * y recién después bloquean el pedido. Mercado Pago es un servidor local ({@code MERCADOPAGO_API_BASE_URL}) que
 * responde siempre {@code approved}, con el pedido recuperado del id del pago (id del pago = 100000 + id del pedido) y
 * una demora que ensancha la ventana entre la lectura inicial y el bloqueo.
 */
class CarritoVaciadoWebhookIntegrationTest extends CarritoIntegrationBase {

    private static final int BASE_ID_PAGO = 100000;
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
            servidor.createContext("/v1/payments/", CarritoVaciadoWebhookIntegrationTest::responder);
            servidor.setExecutor(Executors.newCachedThreadPool());
            servidor.start();
            return servidor;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void responder(HttpExchange intercambio) throws IOException {
        try {
            Thread.sleep(150);
            String ruta = intercambio.getRequestURI().getPath();
            String consulta = intercambio.getRequestURI().getQuery();
            String cuerpo;
            if (ruta.equals("/v1/payments/search") && consulta != null && consulta.contains("external_reference=")) {
                String pedido = consulta.replaceAll(".*external_reference=(\\d+).*", "$1");
                cuerpo = "{\"results\":[" + pago(Integer.parseInt(pedido)) + "]}";
            } else if (ruta.matches("/v1/payments/\\d+")) {
                int idPago = Integer.parseInt(ruta.substring("/v1/payments/".length()));
                cuerpo = pago(idPago - BASE_ID_PAGO);
            } else {
                intercambio.sendResponseHeaders(404, -1);
                return;
            }
            byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
            intercambio.getResponseHeaders().add("Content-Type", "application/json");
            intercambio.sendResponseHeaders(200, bytes.length);
            intercambio.getResponseBody().write(bytes);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
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

    private String estadoMp(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT mp_estado FROM pago WHERE pedido_id = ?", String.class, pedidoId);
    }

    @Test
    void variosPagosDelMismoClientePorWebhookYSincronizacionConfirmanTodosYVacianElCarrito() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        agregar(cliente, producto(dueno));
        agregar(cliente, producto(dueno));
        int p1 = pedidoPendientePago(cliente, dueno);
        int p2 = pedidoPendientePago(cliente, dueno);
        int p3 = pedidoPendientePago(cliente, dueno);
        for (int pedido : List.of(p1, p2, p3)) {
            filaDePago(pedido);
        }

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            mercadoPagoPagoService.procesarNotificacion(p1, idDePago(p1), "127.0.0.1");
            return null;
        });
        tareas.add(() -> {
            mercadoPagoPagoService.procesarNotificacion(p2, idDePago(p2), "127.0.0.1");
            return null;
        });
        tareas.add(() -> mercadoPagoPagoService.sincronizarPago(cliente, p3, null, "127.0.0.1"));
        tareas.add(() -> {
            mercadoPagoPagoService.procesarNotificacion(p1, idDePago(p1), "127.0.0.1");
            return null;
        });

        sinErrores(correrAlMismoTiempo(tareas));

        for (int pedido : List.of(p1, p2, p3)) {
            assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
            assertEquals("approved", estadoMp(pedido));
        }
        assertEquals(0, items(cliente));
        assertNull(comercioDelCarrito(cliente));
    }

    @Test
    void unWebhookConElClienteQuitandoUnItemYElDuenoAgotandoUnProductoNoFalla() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int agotado = producto(dueno);
        agregar(cliente, agotado);
        agregar(cliente, producto(dueno));
        agregar(cliente, producto(dueno));
        int p1 = pedidoPendientePago(cliente, dueno);
        int p2 = pedidoPendientePago(cliente, dueno);
        filaDePago(p1);
        filaDePago(p2);
        int itemId = carritoService.verCarrito(cliente).getItems().get(1).getId();

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            mercadoPagoPagoService.procesarNotificacion(p1, idDePago(p1), "127.0.0.1");
            return null;
        });
        tareas.add(() -> mercadoPagoPagoService.sincronizarPago(cliente, p2, null, "127.0.0.1"));
        tareas.add(() -> carritoService.eliminarItem(cliente, itemId));
        tareas.add(() -> productoService.cambiarEstado(actor(dueno), agotado, EstadoProducto.AGOTADO));

        List<Object> resultados = correrAlMismoTiempo(tareas);

        for (Object resultado : resultados) {
            if (resultado instanceof Exception && !(resultado instanceof com.bajonea.backend.exceptions.RecursoNoEncontradoException)) {
                throw new AssertionError("Fallo inesperado: " + resultado);
            }
        }
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(p1));
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(p2));
        assertEquals(0, items(cliente));
        assertNull(comercioDelCarrito(cliente));
    }
}
