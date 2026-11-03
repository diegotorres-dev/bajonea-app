package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

import com.bajonea.backend.dto.request.RecuperacionPasswordRequestDTO;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Ninguna llamada a un servicio externo ocurre dentro de una transacción (Fase 5, tramo S3.2). El pool es de tres
 * conexiones y la espera de una conexión es de un segundo y medio, mientras que la llamada externa tarda dos segundos y
 * medio. Cuatro operaciones iguales arrancan a la vez: si cualquiera retuviera su conexión durante la llamada, tres de
 * ellas dejarían el pool vacío y la lectura que se hace mientras tanto (que tiene que obtener una conexión en menos de un
 * segundo) fallaría con {@code Connection is not available}. Lo mismo con el envío de un email: sale después de que la
 * transacción terminó y soltó su conexión.
 */
@TestPropertySource(properties = {
        "spring.datasource.hikari.maximum-pool-size=3",
        "spring.datasource.hikari.minimum-idle=3",
        "spring.datasource.hikari.connection-timeout=1500"
})
class LlamadasExternasFueraDeTransaccionIntegrationTest extends SuspensionDuenoTestBase {

    private static final long DEMORA_EXTERNA_MS = 2500;
    private static final int OPERACIONES = 4;
    private static final MercadoPagoSimulado MERCADO_PAGO = new MercadoPagoSimulado();

    @Autowired
    private MercadoPagoPagoService mercadoPagoPagoService;

    @Autowired
    private MercadoPagoOAuthService oauthService;

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

    /**
     * Lanza las tareas a la vez y, con la llamada externa ya en vuelo, hace tres lecturas que necesitan una conexión:
     * ninguna puede tardar más de un segundo. {@code enVuelo} dice cuántas llamadas externas hay en curso en ese momento
     * (la prueba exige al menos tres, para no pasar sin haber puesto a prueba nada).
     */
    private void conLlamadaExternaEnCurso(List<Callable<Object>> tareas, java.util.function.IntSupplier enVuelo) {
        ExecutorService pool = Executors.newFixedThreadPool(tareas.size());
        try {
            List<Future<Object>> futuros = new ArrayList<>();
            for (Callable<Object> tarea : tareas) {
                futuros.add(enSegundoPlano(pool, tarea));
            }
            pausa(900);
            assertTrue(enVuelo.getAsInt() >= 3, "las llamadas externas tienen que estar en vuelo: " + enVuelo.getAsInt());
            for (int i = 0; i < 3; i++) {
                long inicio = System.nanoTime();
                assertEquals(1, jdbcTemplate.queryForObject("SELECT 1", Integer.class));
                long ms = (System.nanoTime() - inicio) / 1_000_000;
                assertTrue(ms < 1000, "obtener una conexión mientras la llamada externa está en curso tardó " + ms + " ms");
            }
            for (Future<Object> futuro : futuros) {
                Object resultado = resultado(futuro);
                if (resultado instanceof Exception) {
                    fail("Fallo inesperado: " + resultado);
                }
            }
        } finally {
            pool.shutdownNow();
        }
    }

    private int pedidoConPago(Dueno dueno) {
        int pedido = pedidoPendientePago(datos.registrarCliente(), dueno);
        filaDePago(pedido);
        return pedido;
    }

    private String estadoMp(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT mp_estado FROM pago WHERE pedido_id = ?", String.class, pedidoId);
    }

    @RepeatedTest(2)
    void elWebhookNoRetieneLaConexionMientrasConsultaAMercadoPago() {
        Dueno dueno = comercioApto(true);
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < OPERACIONES; i++) {
            pedidos.add(pedidoConPago(dueno));
        }
        MERCADO_PAGO.demora(DEMORA_EXTERNA_MS);
        try {
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int pedido : pedidos) {
                tareas.add(() -> {
                    mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), "127.0.0.1");
                    return null;
                });
            }
            conLlamadaExternaEnCurso(tareas, MERCADO_PAGO::llamadasEnCurso);
        } finally {
            MERCADO_PAGO.demora(0);
        }
        for (int pedido : pedidos) {
            assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
            assertEquals("approved", estadoMp(pedido));
        }
    }

    @Test
    void laSincronizacionNoRetieneLaConexionMientrasConsultaAMercadoPago() {
        Dueno dueno = comercioApto(true);
        List<Integer> clientes = new ArrayList<>();
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < OPERACIONES; i++) {
            int cliente = datos.registrarCliente();
            int pedido = pedidoPendientePago(cliente, dueno);
            filaDePago(pedido);
            clientes.add(cliente);
            pedidos.add(pedido);
        }
        MERCADO_PAGO.demora(DEMORA_EXTERNA_MS);
        try {
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < OPERACIONES; i++) {
                int cliente = clientes.get(i);
                int pedido = pedidos.get(i);
                tareas.add(() -> mercadoPagoPagoService.sincronizarPago(cliente, pedido, null, "127.0.0.1"));
            }
            conLlamadaExternaEnCurso(tareas, MERCADO_PAGO::llamadasEnCurso);
        } finally {
            MERCADO_PAGO.demora(0);
        }
        for (int pedido : pedidos) {
            assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoDelPedido(pedido));
        }
    }

    @Test
    void laCreacionDeLaPreferenciaNoRetieneLaConexionMientrasLlamaAMercadoPago() {
        Dueno dueno = comercioApto(true);
        List<Integer> clientes = new ArrayList<>();
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < OPERACIONES; i++) {
            int cliente = datos.registrarCliente();
            clientes.add(cliente);
            pedidos.add(pedidoPendientePago(cliente, dueno));
        }
        MERCADO_PAGO.demora(DEMORA_EXTERNA_MS);
        try {
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < OPERACIONES; i++) {
                int cliente = clientes.get(i);
                int pedido = pedidos.get(i);
                tareas.add(() -> mercadoPagoPagoService.iniciarOReusarPago(cliente, pedido));
            }
            conLlamadaExternaEnCurso(tareas, MERCADO_PAGO::llamadasEnCurso);
        } finally {
            MERCADO_PAGO.demora(0);
        }
        for (int pedido : pedidos) {
            assertNotNull(jdbcTemplate.queryForObject("SELECT mp_preferencia_id FROM pago WHERE pedido_id = ?", String.class, pedido));
        }
    }

    @Test
    void laVueltaDeLaVinculacionNoRetieneLaConexionMientrasIntercambiaLosTokens() {
        List<Dueno> duenos = new ArrayList<>();
        List<String> estados = new ArrayList<>();
        for (int i = 0; i < OPERACIONES; i++) {
            Dueno dueno = datos.registrarDuenoAprobado();
            duenos.add(dueno);
            String url = oauthService.iniciarVinculacion(dueno.id());
            estados.add(UriComponentsBuilder.fromUriString(url).build().getQueryParams().getFirst("state"));
        }
        long base = DatosUnicos.siguienteSufijo() * 1000;
        MERCADO_PAGO.demora(DEMORA_EXTERNA_MS);
        try {
            List<Callable<Object>> tareas = new ArrayList<>();
            for (int i = 0; i < OPERACIONES; i++) {
                String codigo = "c" + (base + i);
                String estado = estados.get(i);
                tareas.add(() -> {
                    oauthService.procesarCallback(codigo, estado);
                    return null;
                });
            }
            conLlamadaExternaEnCurso(tareas, MERCADO_PAGO::llamadasEnCurso);
        } finally {
            MERCADO_PAGO.demora(0);
        }
        for (Dueno dueno : duenos) {
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cuenta_mercado_pago WHERE dueno_id = ? AND activa = 1",
                    Integer.class, dueno.id()));
        }
    }

    @Test
    void elRegistroNoRetieneLaConexionMientrasSeEnviaElEmailDeVerificacion() {
        AtomicInteger enVuelo = new AtomicInteger();
        doAnswer(invocacion -> {
            enVuelo.incrementAndGet();
            try {
                pausa(DEMORA_EXTERNA_MS);
            } finally {
                enVuelo.decrementAndGet();
            }
            return null;
        }).when(emailService).enviarVerificacion(anyString(), anyString());

        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < OPERACIONES; i++) {
            tareas.add(() -> datos.registrarClienteConCredenciales());
        }
        conLlamadaExternaEnCurso(tareas, enVuelo::get);
    }

    @Test
    void laRecuperacionDeContrasenaNoRetieneLaConexionMientrasSeEnviaElEmail() {
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

        List<Callable<Object>> tareas = new ArrayList<>();
        for (String email : emails) {
            tareas.add(() -> {
                authService.solicitarRecuperacionPassword(new RecuperacionPasswordRequestDTO(email));
                return null;
            });
        }
        conLlamadaExternaEnCurso(tareas, enVuelo::get);
    }

    @Test
    void unaRespuestaMuyLentaDeMercadoPagoCortaPorElTiempoDeEsperaYNoDejaNadaATrabado() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        int pedido = pedidoConPago(dueno);
        MERCADO_PAGO.demora(7000);
        try {
            long inicio = System.nanoTime();
            org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.client.RestClientException.class,
                    () -> mercadoPagoPagoService.procesarNotificacion(pedido, MercadoPagoSimulado.idDePago(pedido), "127.0.0.1"));
            long ms = (System.nanoTime() - inicio) / 1_000_000;
            assertTrue(ms < 6500, "la consulta a Mercado Pago tiene que cortarse a los 5 segundos y tardó " + ms + " ms");

            int pedidoNuevo = pedidoPendientePago(cliente, dueno);
            inicio = System.nanoTime();
            org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.client.RestClientException.class,
                    () -> mercadoPagoPagoService.iniciarOReusarPago(cliente, pedidoNuevo));
            ms = (System.nanoTime() - inicio) / 1_000_000;
            assertTrue(ms < 6500, "la creación de la preferencia tiene que cortarse a los 5 segundos y tardó " + ms + " ms");
        } finally {
            MERCADO_PAGO.demora(0);
        }
        assertEquals("PENDIENTE_PAGO", estadoDelPedido(pedido));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT 1", Integer.class));
    }

    @Test
    void elIntercambioDeTokensMuyLentoCortaPorElTiempoDeEspera() {
        Dueno dueno = datos.registrarDuenoAprobado();
        String url = oauthService.iniciarVinculacion(dueno.id());
        String estado = UriComponentsBuilder.fromUriString(url).build().getQueryParams().getFirst("state");
        MERCADO_PAGO.demora(12000);
        try {
            long inicio = System.nanoTime();
            org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.client.RestClientException.class,
                    () -> oauthService.procesarCallback("c" + DatosUnicos.siguienteSufijo(), estado));
            long ms = (System.nanoTime() - inicio) / 1_000_000;
            assertTrue(ms < 11500, "el intercambio de tokens tiene que cortarse a los 10 segundos y tardó " + ms + " ms");
        } finally {
            MERCADO_PAGO.demora(0);
        }
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cuenta_mercado_pago WHERE dueno_id = ?", Integer.class, dueno.id()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT usado FROM codigo_vinculacion_mp WHERE identificador_intento = ?", Integer.class, estado),
                "si el intercambio falla el intento queda sin usar");
    }
}
