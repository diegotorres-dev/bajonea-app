package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MercadoPagoReembolsoClientTest {

    private static final String URL = "https://api.mercadopago.com/v1/payments/1234567/refunds";

    private MockRestServiceServer server;
    private MercadoPagoReembolsoClient client;

    @BeforeEach
    void preparar() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new MercadoPagoReembolsoClient(builder.build());
    }

    @Test
    void reembolsoAprobadoEnviaTokenDelComercioEIdempotencyKey() {
        server.expect(requestTo(URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer APP_USR-abc"))
                .andExpect(header("X-Idempotency-Key", "nc-9-1"))
                .andRespond(withSuccess("{\"id\":4455,\"payment_id\":1234567,\"amount\":10200.0,\"status\":\"approved\"}", MediaType.APPLICATION_JSON));

        ResultadoReembolsoMp resultado = client.solicitarReembolsoTotal("1234567", "APP_USR-abc", "nc-9-1");

        assertTrue(resultado.exitoso());
        assertEquals("4455", resultado.refundId());
        assertNull(resultado.error());
        server.verify();
    }

    @Test
    void reembolsoEnProcesoTambienEsExito() {
        server.expect(requestTo(URL))
                .andRespond(withSuccess("{\"id\":4456,\"status\":\"in_process\"}", MediaType.APPLICATION_JSON));

        ResultadoReembolsoMp resultado = client.solicitarReembolsoTotal("1234567", "t", "k");

        assertTrue(resultado.exitoso());
        assertEquals("4456", resultado.refundId());
    }

    @Test
    void errorDeMercadoPagoVuelveComoFalloConElCuerpoRealSinLanzar() {
        server.expect(requestTo(URL))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"message\":\"insufficient money\",\"error\":\"bad_request\"}"));

        ResultadoReembolsoMp resultado = client.solicitarReembolsoTotal("1234567", "t", "k");

        assertFalse(resultado.exitoso());
        assertNull(resultado.refundId());
        assertTrue(resultado.error().contains("400"));
        assertTrue(resultado.error().contains("insufficient money"));
    }

    @Test
    void errorDelServidorDeMercadoPagoVuelveComoFallo() {
        server.expect(requestTo(URL)).andRespond(withServerError());

        ResultadoReembolsoMp resultado = client.solicitarReembolsoTotal("1234567", "t", "k");

        assertFalse(resultado.exitoso());
        assertTrue(resultado.error().contains("500"));
    }

    @Test
    void respuestaSinIdDeReembolsoEsFallo() {
        server.expect(requestTo(URL)).andRespond(withSuccess("{\"status\":\"approved\"}", MediaType.APPLICATION_JSON));

        assertFalse(client.solicitarReembolsoTotal("1234567", "t", "k").exitoso());
    }

    @Test
    void statusDistintoDeAprobadoOEnProcesoEsFallo() {
        server.expect(requestTo(URL)).andRespond(withSuccess("{\"id\":1,\"status\":\"cancelled\"}", MediaType.APPLICATION_JSON));

        ResultadoReembolsoMp resultado = client.solicitarReembolsoTotal("1234567", "t", "k");

        assertFalse(resultado.exitoso());
        assertTrue(resultado.error().contains("cancelled"));
    }
}
