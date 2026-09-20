package com.bajonea.backend.services;

import com.bajonea.backend.config.MercadoPagoConfig;
import com.bajonea.backend.dto.response.CuentaMercadoPagoResponseDTO;
import com.bajonea.backend.entities.CodigoVinculacionMP;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CodigoVinculacionMPRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Flujo OAuth {@code authorization_code} + PKCE de vinculación de la cuenta de MercadoPago de un
 * Dueño (ver docs/MERCADOPAGO-BAJONEA-FINAL.md, "Create and refresh token" y "Paso previo al
 * POST /oauth/token"). Este Service resuelve el intercambio real contra la API de MercadoPago
 * que {@code CuentaMercadoPagoService} dejó explícitamente para una sesión futura — ese Service
 * sigue siendo la única fuente de verdad para persistir la cuenta vinculada; este orquesta el
 * viaje de ida y vuelta con MP y la transición automática de {@code Comercio.estado}.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class MercadoPagoOAuthService {

    private static final String URL_AUTORIZACION_MP = "https://auth.mercadopago.com.ar/authorization";
    private static final String URL_TOKEN_MP = "https://api.mercadopago.com/oauth/token";
    private static final int CODE_VERIFIER_BYTES = 32;
    private static final int STATE_BYTES = 24;

    private final CodigoVinculacionMPRepository codigoVinculacionMPRepository;
    private final DuenoRepository duenoRepository;
    private final CuentaMercadoPagoService cuentaMercadoPagoService;
    private final ComercioService comercioService;
    private final MercadoPagoConfig mercadoPagoConfig;

    private final RestClient restClient = RestClient.create();
    private final SecureRandom secureRandom = new SecureRandom();

    public String iniciarVinculacion(Integer duenoId) {
        Dueno dueno = duenoRepository.findById(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Dueño no encontrado"));

        codigoVinculacionMPRepository.eliminarIntentosPendientesDelDueno(duenoId);

        String codeVerifier = generarStringAleatorio(CODE_VERIFIER_BYTES);
        String state = generarStringAleatorio(STATE_BYTES);

        CodigoVinculacionMP intento = CodigoVinculacionMP.builder()
                .dueno(dueno)
                .identificadorIntento(state)
                .codigoVerificacion(codeVerifier)
                .fechaCreacion(LocalDateTime.now())
                .usado(false)
                .build();
        codigoVinculacionMPRepository.save(intento);

        return UriComponentsBuilder.fromUriString(URL_AUTORIZACION_MP)
                .queryParam("client_id", mercadoPagoConfig.getClientId())
                .queryParam("response_type", "code")
                .queryParam("platform_id", "mp")
                .queryParam("redirect_uri", mercadoPagoConfig.getRedirectUri())
                .queryParam("state", state)
                .queryParam("code_challenge", generarCodeChallenge(codeVerifier))
                .queryParam("code_challenge_method", "S256")
                .encode()
                .build()
                .toUriString();
    }

    public void procesarCallback(String code, String state) {
        CodigoVinculacionMP intento = codigoVinculacionMPRepository.findByIdentificadorIntentoAndUsadoFalse(state)
                .orElseThrow(() -> new ConflictoDeNegocioException(
                        "El intento de vinculación con Mercado Pago no es válido o ya fue usado"));

        intento.setUsado(true);
        codigoVinculacionMPRepository.save(intento);

        TokenResponse respuesta = intercambiarCodigoPorToken(code, intento.getCodigoVerificacion());

        Integer duenoId = intento.getDueno().getId();
        cuentaMercadoPagoService.vincular(
                duenoId,
                String.valueOf(respuesta.userId()),
                respuesta.accessToken(),
                respuesta.refreshToken(),
                respuesta.publicKey(),
                mercadoPagoConfig.isTestToken(),
                LocalDateTime.now().plusSeconds(respuesta.expiresIn() != null ? respuesta.expiresIn() : 0));

        comercioService.activarAptoVenta(duenoId);
    }

    public void desvincular(Integer duenoId) {
        cuentaMercadoPagoService.desvincular(duenoId);
        comercioService.desactivarAptoVenta(duenoId);
    }

    public CuentaMercadoPagoResponseDTO consultarEstado(Integer duenoId) {
        return cuentaMercadoPagoService.buscarActivaPorDueno(duenoId)
                .map(cuenta -> new CuentaMercadoPagoResponseDTO(true, cuenta.getMpUserId(), cuenta.getFechaVinculacion()))
                .orElse(new CuentaMercadoPagoResponseDTO(false, null, null));
    }

    private TokenResponse intercambiarCodigoPorToken(String code, String codeVerifier) {
        TokenRequest request = new TokenRequest(
                mercadoPagoConfig.getClientSecret(),
                mercadoPagoConfig.getClientId(),
                "authorization_code",
                code,
                codeVerifier,
                mercadoPagoConfig.getRedirectUri(),
                String.valueOf(mercadoPagoConfig.isTestToken()));

        try {
            TokenResponse respuesta = restClient.post()
                    .uri(URL_TOKEN_MP)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(TokenResponse.class);

            if (respuesta == null || respuesta.accessToken() == null) {
                throw new ConflictoDeNegocioException("Mercado Pago no devolvió un access_token válido");
            }
            return respuesta;
        } catch (RestClientResponseException ex) {
            throw new ConflictoDeNegocioException(
                    "No se pudo completar la vinculación con Mercado Pago: " + ex.getStatusText());
        }
    }

    private String generarStringAleatorio(int cantidadBytes) {
        byte[] bytes = new byte[cantidadBytes];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String generarCodeChallenge(String codeVerifier) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(codeVerifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no disponible en esta JVM", ex);
        }
    }

    private record TokenRequest(
            @JsonProperty("client_secret") String clientSecret,
            @JsonProperty("client_id") String clientId,
            @JsonProperty("grant_type") String grantType,
            String code,
            @JsonProperty("code_verifier") String codeVerifier,
            @JsonProperty("redirect_uri") String redirectUri,
            @JsonProperty("test_token") String testToken) {
    }

    private record TokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("token_type") String tokenType,
            @JsonProperty("expires_in") Long expiresIn,
            String scope,
            @JsonProperty("user_id") Long userId,
            @JsonProperty("refresh_token") String refreshToken,
            @JsonProperty("public_key") String publicKey,
            @JsonProperty("live_mode") Boolean liveMode) {
    }
}
