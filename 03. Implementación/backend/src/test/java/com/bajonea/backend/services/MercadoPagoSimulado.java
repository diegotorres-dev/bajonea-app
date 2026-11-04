package com.bajonea.backend.services;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Mercado Pago simulado por un servidor local, con una demora configurable en cada respuesta y contadores de lo que está
 * en vuelo. Responde: {@code GET /v1/payments/{id}} y {@code GET /v1/payments/search} (el pago de un pedido tiene el id
 * {@code BASE_ID_PAGO + pedidoId} y está {@code approved} salvo que la prueba diga otra cosa), {@code POST /checkout/preferences},
 * {@code POST /v1/payments/{id}/refunds} y {@code POST /oauth/token} (el {@code user_id} sale del código recibido,
 * {@code c<dígitos>}). Las pruebas lo conectan con {@code MERCADOPAGO_API_BASE_URL}.
 */
final class MercadoPagoSimulado {

    static final int BASE_ID_PAGO = 300000;

    private static final Pattern MONTO = Pattern.compile("\"amount\"\\s*:\\s*([0-9.]+)");
    private static final Pattern CODIGO_OAUTH = Pattern.compile("\"code\"\\s*:\\s*\"c(\\d+)\"");

    private final HttpServer servidor;
    private final AtomicLong demoraMs = new AtomicLong();
    private final AtomicInteger enCurso = new AtomicInteger();
    private final AtomicInteger consultasDePagos = new AtomicInteger();
    private final AtomicInteger preferencias = new AtomicInteger();
    private final AtomicInteger reembolsos = new AtomicInteger();
    private final AtomicInteger tokens = new AtomicInteger();
    private final Map<Integer, String> estadosPorPedido = new ConcurrentHashMap<>();
    private final List<String> cuerposDeReembolsos = new CopyOnWriteArrayList<>();
    private final List<String> clavesDeReembolsos = new CopyOnWriteArrayList<>();
    private final AtomicReference<String> fallaDeReembolsos = new AtomicReference<>();

    MercadoPagoSimulado() {
        try {
            servidor = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            servidor.createContext("/", this::responder);
            servidor.setExecutor(Executors.newCachedThreadPool());
            servidor.start();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    String urlBase() {
        return "http://localhost:" + servidor.getAddress().getPort();
    }

    void detener() {
        servidor.stop(0);
    }

    void demora(long milisegundos) {
        demoraMs.set(milisegundos);
    }

    void estadoDelPago(int pedidoId, String estado) {
        estadosPorPedido.put(pedidoId, estado);
    }

    int llamadasEnCurso() {
        return enCurso.get();
    }

    int consultasDePagos() {
        return consultasDePagos.get();
    }

    int preferenciasCreadas() {
        return preferencias.get();
    }

    int reembolsosPedidos() {
        return reembolsos.get();
    }

    List<String> cuerposDeReembolsos() {
        return List.copyOf(cuerposDeReembolsos);
    }

    List<String> clavesDeReembolsos() {
        return List.copyOf(clavesDeReembolsos);
    }

    void reembolsosFallanCon(String cuerpoDelError) {
        fallaDeReembolsos.set(cuerpoDelError);
    }

    int tokensEmitidos() {
        return tokens.get();
    }

    static String idDePago(int pedidoId) {
        return String.valueOf(BASE_ID_PAGO + pedidoId);
    }

    private void responder(HttpExchange intercambio) throws IOException {
        enCurso.incrementAndGet();
        try {
            byte[] pedido = intercambio.getRequestBody().readAllBytes();
            pausa(demoraMs.get());
            String ruta = intercambio.getRequestURI().getPath();
            String consulta = intercambio.getRequestURI().getQuery();
            String metodo = intercambio.getRequestMethod();
            String cuerpo;
            if (metodo.equals("GET") && ruta.equals("/v1/payments/search") && consulta != null && consulta.contains("external_reference=")) {
                consultasDePagos.incrementAndGet();
                int pedidoId = Integer.parseInt(consulta.replaceAll(".*external_reference=(\\d+).*", "$1"));
                cuerpo = "{\"results\":[" + pago(pedidoId) + "]}";
            } else if (metodo.equals("GET") && ruta.matches("/v1/payments/\\d+")) {
                consultasDePagos.incrementAndGet();
                cuerpo = pago(Integer.parseInt(ruta.substring("/v1/payments/".length())) - BASE_ID_PAGO);
            } else if (metodo.equals("POST") && ruta.equals("/checkout/preferences")) {
                int n = preferencias.incrementAndGet();
                cuerpo = "{\"id\":\"pref-sim-" + n + "\",\"init_point\":\"https://mp.test/pagar/" + n
                        + "\",\"sandbox_init_point\":\"https://mp.test/sandbox/" + n + "\"}";
            } else if (metodo.equals("POST") && ruta.matches("/v1/payments/\\d+/refunds")) {
                int n = reembolsos.incrementAndGet();
                String cuerpoPedido = new String(pedido, StandardCharsets.UTF_8);
                cuerposDeReembolsos.add(cuerpoPedido);
                clavesDeReembolsos.add(String.valueOf(intercambio.getRequestHeaders().getFirst("X-Idempotency-Key")));
                String falla = fallaDeReembolsos.get();
                if (falla != null) {
                    byte[] error = falla.getBytes(StandardCharsets.UTF_8);
                    intercambio.getResponseHeaders().add("Content-Type", "application/json");
                    intercambio.sendResponseHeaders(400, error.length);
                    intercambio.getResponseBody().write(error);
                    return;
                }
                Matcher monto = MONTO.matcher(cuerpoPedido);
                cuerpo = "{\"id\":" + (900000 + n) + ",\"status\":\"approved\""
                        + (monto.find() ? ",\"amount\":" + monto.group(1) : "") + "}";
            } else if (metodo.equals("POST") && ruta.equals("/oauth/token")) {
                Matcher codigo = CODIGO_OAUTH.matcher(new String(pedido, StandardCharsets.UTF_8));
                if (!codigo.find()) {
                    intercambio.sendResponseHeaders(400, -1);
                    return;
                }
                int n = tokens.incrementAndGet();
                cuerpo = "{\"access_token\":\"APP_USR-sim-" + n + "\",\"token_type\":\"bearer\",\"expires_in\":15552000,\"user_id\":"
                        + codigo.group(1) + ",\"refresh_token\":\"TG-sim-" + n + "\",\"public_key\":\"APP_USR-pub-" + n + "\"}";
            } else {
                intercambio.sendResponseHeaders(404, -1);
                return;
            }
            byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
            intercambio.getResponseHeaders().add("Content-Type", "application/json");
            intercambio.sendResponseHeaders(200, bytes.length);
            intercambio.getResponseBody().write(bytes);
        } finally {
            enCurso.decrementAndGet();
            intercambio.close();
        }
    }

    private String pago(int pedidoId) {
        return "{\"id\":" + (BASE_ID_PAGO + pedidoId) + ",\"status\":\"" + estadosPorPedido.getOrDefault(pedidoId, "approved")
                + "\",\"external_reference\":\"" + pedidoId
                + "\",\"payment_type_id\":\"account_money\",\"date_created\":\"2026-01-01T00:00:00.000-03:00\","
                + "\"fee_details\":[{\"type\":\"application_fee\",\"fee_payer\":\"collector\",\"amount\":300}]}";
    }

    private static void pausa(long milisegundos) {
        if (milisegundos <= 0) {
            return;
        }
        try {
            Thread.sleep(milisegundos);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
