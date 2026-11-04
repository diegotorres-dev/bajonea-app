package com.bajonea.backend.services;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Pattern;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.util.Timeout;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Cliente HTTP puro de {@code POST /v1/payments/{id}/refunds} (reembolso total: body vacío; parcial: body con el monto). No
 * toca la base ni decide si corresponde reembolsar — eso es {@link ReembolsoService}. Nunca
 * lanza: cualquier falla (respuesta de error de MercadoPago, red, timeout) vuelve como un
 * {@link ResultadoReembolsoMp} con {@code exitoso = false} y el error real, para que el
 * orquestador lo registre sin romper el flujo que lo invocó. Mismos timeouts (5 s) y estilo de
 * {@code MercadoPagoPagoService}.
 */
@Component
public class MercadoPagoReembolsoClient {

    private static final Logger log = LoggerFactory.getLogger(MercadoPagoReembolsoClient.class);

    private static final String BASE_POR_DEFECTO = "https://api.mercadopago.com";
    private static final String PATH_REEMBOLSOS = "/v1/payments/{paymentId}/refunds";
    private static final int TIMEOUT_MP_MS = 5000;
    private static final int LARGO_MAXIMO_CUERPO_ERROR = 300;
    private static final Pattern SALDO_INSUFICIENTE = Pattern.compile(
            "insufficient|not enough|enough funds|saldo|fondos|no_funds|not_enough_funds", Pattern.CASE_INSENSITIVE);

    private final RestClient restClient;
    private final String urlReembolsos;

    /**
     * La base de la API solo la cambian las pruebas ({@code MERCADOPAGO_API_BASE_URL}, hacia un servidor local que simula
     * Mercado Pago); en el servidor final no debe estar definida.
     */
    @Autowired
    public MercadoPagoReembolsoClient(@Value("${MERCADOPAGO_API_BASE_URL:" + BASE_POR_DEFECTO + "}") String baseApi) {
        this(crearRestClient(), baseApi);
    }

    MercadoPagoReembolsoClient(RestClient restClient) {
        this(restClient, BASE_POR_DEFECTO);
    }

    private MercadoPagoReembolsoClient(RestClient restClient, String baseApi) {
        this.restClient = restClient;
        this.urlReembolsos = baseApi + PATH_REEMBOLSOS;
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
        return solicitar(paymentId, accessToken, idempotencyKey, Map.of(), null);
    }

    /**
     * Reembolso parcial: el monto va en el cuerpo ({@code {"amount": monto}}); sin cuerpo Mercado Pago reembolsa todo.
     * La respuesta se lee de forma defensiva: lo único imprescindible es el id del reembolso y un estado aceptable;
     * un {@code amount} distinto del pedido solo se registra en el log.
     */
    public ResultadoReembolsoMp solicitarReembolsoParcial(String paymentId, String accessToken, String idempotencyKey,
            BigDecimal monto) {
        return solicitar(paymentId, accessToken, idempotencyKey, Map.of("amount", monto), monto);
    }

    private ResultadoReembolsoMp solicitar(String paymentId, String accessToken, String idempotencyKey, Map<String, Object> cuerpo,
            BigDecimal montoPedido) {
        try {
            ReembolsoMpResponse respuesta = restClient.post()
                    .uri(urlReembolsos, paymentId)
                    .header("Authorization", "Bearer " + accessToken)
                    .header("X-Idempotency-Key", idempotencyKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(cuerpo)
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
            if (montoPedido != null && respuesta.amount() != null && respuesta.amount().compareTo(montoPedido) != 0) {
                log.warn("MercadoPago: el reembolso {} del pago {} salió por {} y se pidieron {}", respuesta.id(), paymentId,
                        respuesta.amount(), montoPedido);
            }
            log.info("MercadoPago: reembolso {} del pago {} — status={}", respuesta.id(), paymentId, respuesta.status());
            return ResultadoReembolsoMp.exito(String.valueOf(respuesta.id()));
        } catch (RestClientResponseException ex) {
            String cuerpoError = ex.getResponseBodyAsString();
            if (cuerpoError.length() > LARGO_MAXIMO_CUERPO_ERROR) {
                cuerpoError = cuerpoError.substring(0, LARGO_MAXIMO_CUERPO_ERROR);
            }
            log.error("Error solicitando reembolso del pago {} en Mercado Pago: {} {}", paymentId, ex.getStatusCode(), cuerpoError);
            String detalle = "Mercado Pago respondió " + ex.getStatusCode().value() + ": " + cuerpoError;
            return ResultadoReembolsoMp.fallido(SALDO_INSUFICIENTE.matcher(cuerpoError).find()
                    ? "El comercio no tiene saldo suficiente en Mercado Pago para este reembolso. " + detalle
                    : detalle);
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
            String status,
            BigDecimal amount) {
    }
}
