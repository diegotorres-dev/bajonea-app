package com.bajonea.backend.services;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Duration;
import java.util.Map;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.util.Timeout;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Cliente HTTP puro de {@code POST /v1/payments/{id}/refunds} (reembolso total: body vacío). No
 * toca la base ni decide si corresponde reembolsar — eso es {@link ReembolsoService}. Nunca
 * lanza: cualquier falla (respuesta de error de MercadoPago, red, timeout) vuelve como un
 * {@link ResultadoReembolsoMp} con {@code exitoso = false} y el error real, para que el
 * orquestador lo registre sin romper el flujo que lo invocó. Mismos timeouts (5 s) y estilo de
 * {@code MercadoPagoPagoService}.
 */
@Component
public class MercadoPagoReembolsoClient {

    private static final Logger log = LoggerFactory.getLogger(MercadoPagoReembolsoClient.class);

    private static final String URL_REEMBOLSOS = "https://api.mercadopago.com/v1/payments/{paymentId}/refunds";
    private static final int TIMEOUT_MP_MS = 5000;
    private static final int LARGO_MAXIMO_CUERPO_ERROR = 300;

    private final RestClient restClient;

    @Autowired
    public MercadoPagoReembolsoClient() {
        this(crearRestClient());
    }

    MercadoPagoReembolsoClient(RestClient restClient) {
        this.restClient = restClient;
    }

    private static RestClient crearRestClient() {
        RequestConfig requestConfig = RequestConfig.custom()
                .setConnectTimeout(Timeout.of(Duration.ofMillis(TIMEOUT_MP_MS)))
                .setResponseTimeout(Timeout.of(Duration.ofMillis(TIMEOUT_MP_MS)))
                .build();
        CloseableHttpClient httpClient = HttpClients.custom()
                .setDefaultRequestConfig(requestConfig)
                .build();
        HttpComponentsClientHttpRequestFactory factory = new HttpComponentsClientHttpRequestFactory(httpClient);
        return RestClient.builder().requestFactory(factory).build();
    }

    public ResultadoReembolsoMp solicitarReembolsoTotal(String paymentId, String accessToken, String idempotencyKey) {
        try {
            ReembolsoMpResponse respuesta = restClient.post()
                    .uri(URL_REEMBOLSOS, paymentId)
                    .header("Authorization", "Bearer " + accessToken)
                    .header("X-Idempotency-Key", idempotencyKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of())
                    .retrieve()
                    .body(ReembolsoMpResponse.class);

            if (respuesta == null || respuesta.id() == null) {
                log.error("MercadoPago: reembolso del pago {} sin id en la respuesta", paymentId);
                return ResultadoReembolsoMp.fallido("Mercado Pago no devolvió un id de reembolso");
            }
            if (!"approved".equals(respuesta.status()) && !"in_process".equals(respuesta.status())) {
                log.error("MercadoPago: reembolso {} del pago {} con status inesperado {}", respuesta.id(), paymentId, respuesta.status());
                return ResultadoReembolsoMp.fallido("Mercado Pago devolvió el reembolso " + respuesta.id() + " con status " + respuesta.status());
            }
            log.info("MercadoPago: reembolso total {} del pago {} — status={}", respuesta.id(), paymentId, respuesta.status());
            return ResultadoReembolsoMp.exito(String.valueOf(respuesta.id()));
        } catch (RestClientResponseException ex) {
            String cuerpo = ex.getResponseBodyAsString();
            if (cuerpo.length() > LARGO_MAXIMO_CUERPO_ERROR) {
                cuerpo = cuerpo.substring(0, LARGO_MAXIMO_CUERPO_ERROR);
            }
            log.error("Error solicitando reembolso del pago {} en Mercado Pago: {} {}", paymentId, ex.getStatusCode(), cuerpo);
            return ResultadoReembolsoMp.fallido("Mercado Pago respondió " + ex.getStatusCode().value() + ": " + cuerpo);
        } catch (RestClientException ex) {
            log.error("No se pudo contactar a Mercado Pago para reembolsar el pago {}: {}", paymentId, ex.getMessage());
            return ResultadoReembolsoMp.fallido("No se pudo contactar a Mercado Pago: " + ex.getMessage());
        }
    }

    public record ResultadoReembolsoMp(boolean exitoso, String refundId, String error) {

        static ResultadoReembolsoMp exito(String refundId) {
            return new ResultadoReembolsoMp(true, refundId, null);
        }

        public static ResultadoReembolsoMp fallido(String error) {
            return new ResultadoReembolsoMp(false, null, error);
        }
    }

    private record ReembolsoMpResponse(
            Long id,
            @JsonProperty("payment_id") Long paymentId,
            String status) {
    }
}
