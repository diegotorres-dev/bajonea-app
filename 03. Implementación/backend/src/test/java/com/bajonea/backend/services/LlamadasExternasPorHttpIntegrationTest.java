package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

/**
 * Lo mismo que {@link LlamadasExternasFueraDeTransaccionIntegrationTest} pero por el camino HTTP real, con el filtro de
 * Spring que mantiene abierto el {@code EntityManager} durante todo el pedido (open-in-view) cuando está activo: con un pool de
 * tres conexiones, cuatro pedidos HTTP simultáneos cuya llamada externa tarda dos segundos y medio no pueden dejar sin
 * conexión a una lectura que se hace mientras tanto. Si una conexión quedara retenida durante la llamada externa
 * (porque el contexto de persistencia del pedido la sostiene entre una transacción y otra) esta prueba falla con
 * {@code Connection is not available}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "spring.datasource.hikari.maximum-pool-size=3",
        "spring.datasource.hikari.minimum-idle=3",
        "spring.datasource.hikari.connection-timeout=1500"
})
class LlamadasExternasPorHttpIntegrationTest extends SuspensionDuenoTestBase {

    private static final long DEMORA_EXTERNA_MS = 2500;
    private static final int OPERACIONES = 4;
    private static final MercadoPagoSimulado MERCADO_PAGO = new MercadoPagoSimulado();
    private static final HttpClient CLIENTE = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @LocalServerPort
    private int puerto;

    @DynamicPropertySource
    static void apuntarAlServidorLocal(DynamicPropertyRegistry registry) {
        registry.add("MERCADOPAGO_API_BASE_URL", MERCADO_PAGO::urlBase);
    }

    @AfterAll
    static void detenerServidor() {
        MERCADO_PAGO.detener();
    }

    private static void pausa(long milisegundos) {
        try {
            Thread.sleep(milisegundos);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private CompletableFuture<HttpResponse<String>> enviar(String metodo, String ruta, String cuerpo, String token) {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + "/api/v1" + ruta))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json");
        if (token != null) {
            pedido.header("Authorization", "Bearer " + token);
        }
        pedido.method(metodo, cuerpo == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(cuerpo));
        return CLIENTE.sendAsync(pedido.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String iniciarSesion(Cuenta cuenta) throws Exception {
        HttpResponse<String> respuesta = enviar("POST", "/auth/login",
                "{\"nombreUsuario\":\"" + cuenta.nombreUsuario() + "\",\"password\":\"" + cuenta.clave() + "\"}", null).get();
        assertEquals(200, respuesta.statusCode(), respuesta.body());
        return objectMapper.readTree(respuesta.body()).path("data").path("token").asText();
    }

    private void conLlamadaExternaEnCurso(List<CompletableFuture<HttpResponse<String>>> pedidos, java.util.function.IntSupplier enVuelo)
            throws Exception {
        pausa(900);
        assertTrue(enVuelo.getAsInt() >= 3, "las llamadas externas tienen que estar en vuelo: " + enVuelo.getAsInt());
        for (int i = 0; i < 3; i++) {
            long inicio = System.nanoTime();
            assertEquals(1, jdbcTemplate.queryForObject("SELECT 1", Integer.class));
            long ms = (System.nanoTime() - inicio) / 1_000_000;
            assertTrue(ms < 1000, "obtener una conexión mientras la llamada externa está en curso tardó " + ms + " ms");
        }
        HttpResponse<String> lectura = enviar("GET", "/catalogo/comercios", null, null).get();
        assertEquals(200, lectura.statusCode(), "una lectura por HTTP mientras la llamada externa está en curso: " + lectura.body());
        for (CompletableFuture<HttpResponse<String>> pedido : pedidos) {
            HttpResponse<String> respuesta = pedido.get();
            if (respuesta.statusCode() >= 500) {
                fail("Error del servidor: " + respuesta.statusCode() + " " + respuesta.body());
            }
        }
    }

    @Test
    void elWebhookPorHttpNoRetieneLaConexionMientrasConsultaAMercadoPago() throws Exception {
        Dueno dueno = comercioApto(true);
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < OPERACIONES; i++) {
            int pedido = pedidoPendientePago(datos.registrarCliente(), dueno);
            filaDePago(pedido);
            pedidos.add(pedido);
        }
        MERCADO_PAGO.demora(DEMORA_EXTERNA_MS);
        try {
            List<CompletableFuture<HttpResponse<String>>> enCurso = new ArrayList<>();
            for (int pedido : pedidos) {
                enCurso.add(enviar("POST", "/webhooks/mercadopago?pedidoId=" + pedido + "&data.id=" + MercadoPagoSimulado.idDePago(pedido)
                        + "&type=payment", null, null));
            }
            conLlamadaExternaEnCurso(enCurso, MERCADO_PAGO::llamadasEnCurso);
            for (CompletableFuture<HttpResponse<String>> respuesta : enCurso) {
                assertEquals(200, respuesta.get().statusCode(), respuesta.get().body());
            }
        } finally {
            MERCADO_PAGO.demora(0);
        }
        for (int pedido : pedidos) {
            assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        }
    }

    @Test
    void laCreacionDeLaPreferenciaPorHttpNoRetieneLaConexionMientrasLlamaAMercadoPago() throws Exception {
        Dueno dueno = comercioApto(true);
        List<Integer> pedidos = new ArrayList<>();
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < OPERACIONES; i++) {
            Cuenta cuenta = datos.registrarClienteConCredenciales();
            pedidos.add(pedidoPendientePago(cuenta.id(), dueno));
            tokens.add(iniciarSesion(cuenta));
        }
        MERCADO_PAGO.demora(DEMORA_EXTERNA_MS);
        try {
            List<CompletableFuture<HttpResponse<String>>> enCurso = new ArrayList<>();
            for (int i = 0; i < OPERACIONES; i++) {
                enCurso.add(enviar("POST", "/pedidos/cliente/" + pedidos.get(i) + "/pago", null, tokens.get(i)));
            }
            conLlamadaExternaEnCurso(enCurso, MERCADO_PAGO::llamadasEnCurso);
            for (CompletableFuture<HttpResponse<String>> respuesta : enCurso) {
                assertEquals(200, respuesta.get().statusCode(), respuesta.get().body());
            }
        } finally {
            MERCADO_PAGO.demora(0);
        }
    }

    @Test
    void laRecuperacionDeContrasenaPorHttpNoRetieneLaConexionMientrasSeEnviaElEmail() throws Exception {
        List<String> emails = new ArrayList<>();
        for (int i = 0; i < OPERACIONES; i++) {
            emails.add(datos.registrarClienteConCredenciales().email());
        }
        AtomicInteger enVuelo = new AtomicInteger();
        doAnswer(invocacion -> {
            enVuelo.incrementAndGet();
            try {
                pausa(DEMORA_EXTERNA_MS);
            } finally {
                enVuelo.decrementAndGet();
            }
            return null;
        }).when(emailService).enviarRecuperacionPassword(anyString(), anyString());

        List<CompletableFuture<HttpResponse<String>>> enCurso = new ArrayList<>();
        for (String email : emails) {
            enCurso.add(enviar("POST", "/auth/recuperar-password", "{\"email\":\"" + email + "\"}", null));
        }
        conLlamadaExternaEnCurso(enCurso, enVuelo::get);
        for (CompletableFuture<HttpResponse<String>> respuesta : enCurso) {
            assertEquals(200, respuesta.get().statusCode(), respuesta.get().body());
        }
    }
}
