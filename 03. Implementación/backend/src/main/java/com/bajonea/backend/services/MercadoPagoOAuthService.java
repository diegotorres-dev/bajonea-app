package com.bajonea.backend.services;

import com.bajonea.backend.config.MercadoPagoConfig;
import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.dto.response.CuentaMercadoPagoResponseDTO;
import com.bajonea.backend.dto.response.DesvinculacionPreviaResponseDTO;
import com.bajonea.backend.entities.CodigoVinculacionMP;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.CuentaMercadoPago;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CuentaMercadoPagoYaVinculadaException;
import com.bajonea.backend.exceptions.DesvinculacionBloqueadaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CodigoVinculacionMPRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
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
    private static final List<EstadoPedido> ESTADOS_EN_CURSO = List.of(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO,
            EstadoPedido.EN_PREPARACION, EstadoPedido.EN_CAMINO, EstadoPedido.LISTO_PARA_RETIRAR);
    private static final DateTimeFormatter FORMATO_HORA = DateTimeFormatter.ofPattern("HH:mm");

    private final CodigoVinculacionMPRepository codigoVinculacionMPRepository;
    private final DuenoRepository duenoRepository;
    private final CuentaMercadoPagoService cuentaMercadoPagoService;
    private final ComercioService comercioService;
    private final ComercioRepository comercioRepository;
    private final PedidoRepository pedidoRepository;
    private final PedidoTimeoutProperties timeoutProperties;
    private final MercadoPagoConfig mercadoPagoConfig;

    private final RestClient restClient = RestClient.create();
    private final SecureRandom secureRandom = new SecureRandom();

    public String iniciarVinculacion(Integer duenoId) {
        Dueno dueno = duenoRepository.findById(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Dueño no encontrado"));

        if (cuentaMercadoPagoService.buscarActivaPorDueno(duenoId).isPresent()) {
            throw new CuentaMercadoPagoYaVinculadaException();
        }

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

    /**
     * Desvincula la cuenta de Mercado Pago del Dueño. Orden de bloqueo: cuenta, después todos los comercios del
     * Dueño ({@code FOR UPDATE}), después los pedidos {@code PENDIENTE_PAGO} de esos comercios
     * ({@code FOR SHARE}, filas y no un conteo). Si hay alguno, un cliente podría estar pagando contra esta
     * cuenta: se rechaza con la hora aproximada para reintentar. Si no hay, la cuenta pasa a inactiva y los
     * comercios {@code APTO_VENTA} a {@code APROBADO}; el resto de los pedidos en curso sigue su flujo.
     * Quien crea un pedido lee el comercio con {@code FOR SHARE} y revalida {@code APTO_VENTA}
     * ({@code PedidoService.confirmarPedido}), así que nunca queda un pedido nuevo sobre una cuenta ya
     * desvinculada. Lo que el usuario vio en el modal de confirmación no se compara: solo esta regla se
     * revalida siempre.
     */
    public void desvincular(Integer duenoId) {
        CuentaMercadoPago cuenta = cuentaMercadoPagoService.obtenerActivaConBloqueo(duenoId);

        List<Integer> comercioIds = comercioRepository.findByDuenoIdConBloqueo(duenoId).stream()
                .map(Comercio::getId)
                .toList();
        List<PedidoRepository.PagoPendienteBloqueado> pagosPendientes = comercioIds.isEmpty()
                ? List.of()
                : pedidoRepository.findPendientesPagoDeComerciosConBloqueoCompartido(comercioIds);
        if (!pagosPendientes.isEmpty()) {
            LocalDateTime puedeReintentarDesde = calcularPuedeReintentarDesde(
                    pagosPendientes.stream().map(PedidoRepository.PagoPendienteBloqueado::getFechaCreacion)
                            .max(Comparator.naturalOrder()).orElseThrow());
            int cantidad = pagosPendientes.size();
            String mensaje = (cantidad == 1
                    ? "Hay 1 pedido de un cliente que todavía está pagando. "
                    : "Hay " + cantidad + " pedidos de clientes que todavía están pagando. ")
                    + "Probá de nuevo alrededor de las " + FORMATO_HORA.format(puedeReintentarDesde) + ".";
            throw new DesvinculacionBloqueadaException(mensaje, cantidad, puedeReintentarDesde);
        }

        cuentaMercadoPagoService.desvincular(cuenta);
        comercioService.desactivarAptoVenta(duenoId);
    }

    /**
     * Qué pasaría hoy si el Dueño desvincula: todos sus comercios con los pedidos en curso de cada uno y los
     * pagos pendientes que la bloquearían. Informativa (lecturas comunes, sin bloqueo): la desvinculación
     * revalida la regla de {@code PENDIENTE_PAGO} por su cuenta. Una consulta agrupada para todo el Dueño.
     */
    @Transactional(readOnly = true)
    public DesvinculacionPreviaResponseDTO previaDesvinculacion(Integer duenoId) {
        cuentaMercadoPagoService.obtenerActivaPorDueno(duenoId);

        List<EstadoPedido> estados = new ArrayList<>(ESTADOS_EN_CURSO);
        estados.add(EstadoPedido.PENDIENTE_PAGO);
        Map<Integer, Map<EstadoPedido, Long>> cantidadesPorComercio = new HashMap<>();
        LocalDateTime ultimoPagoPendiente = null;
        for (Object[] fila : pedidoRepository.contarPorComercioYEstadoDeDueno(duenoId, estados)) {
            Integer comercioId = (Integer) fila[0];
            EstadoPedido estado = (EstadoPedido) fila[1];
            cantidadesPorComercio.computeIfAbsent(comercioId, id -> new HashMap<>()).put(estado, (Long) fila[2]);
            if (estado == EstadoPedido.PENDIENTE_PAGO) {
                LocalDateTime creacion = (LocalDateTime) fila[3];
                if (ultimoPagoPendiente == null || creacion.isAfter(ultimoPagoPendiente)) {
                    ultimoPagoPendiente = creacion;
                }
            }
        }

        List<DesvinculacionPreviaResponseDTO.ComercioPrevia> comercios = comercioRepository
                .findByDuenoIdOrderByFechaRegistroAscIdAsc(duenoId).stream()
                .map(comercio -> {
                    Map<EstadoPedido, Long> cantidades = cantidadesPorComercio.getOrDefault(comercio.getId(), Map.of());
                    List<DesvinculacionPreviaResponseDTO.PedidosEnCurso> enCurso = ESTADOS_EN_CURSO.stream()
                            .map(estado -> new DesvinculacionPreviaResponseDTO.PedidosEnCurso(estado.name(),
                                    cantidades.getOrDefault(estado, 0L)))
                            .collect(Collectors.toList());
                    return new DesvinculacionPreviaResponseDTO.ComercioPrevia(comercio.getId(), comercio.getNombre(),
                            enCurso, cantidades.getOrDefault(EstadoPedido.PENDIENTE_PAGO, 0L));
                })
                .toList();

        long totalPagosPendientes = comercios.stream()
                .mapToLong(DesvinculacionPreviaResponseDTO.ComercioPrevia::getCantidadPagosPendientes)
                .sum();
        LocalDateTime puedeReintentarDesde = ultimoPagoPendiente == null
                ? null
                : calcularPuedeReintentarDesde(ultimoPagoPendiente);
        return new DesvinculacionPreviaResponseDTO(totalPagosPendientes == 0, comercios,
                new DesvinculacionPreviaResponseDTO.PagosPendientes(totalPagosPendientes, puedeReintentarDesde));
    }

    /**
     * El pedido más reciente en {@code PENDIENTE_PAGO} vence a los {@code pedido.timeout.pago-minutos} de su
     * creación; el job de vencimiento corre cada 60 segundos, así que es una hora aproximada.
     */
    private LocalDateTime calcularPuedeReintentarDesde(LocalDateTime creacionMasReciente) {
        return creacionMasReciente.plusMinutes(timeoutProperties.getPagoMinutos());
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
