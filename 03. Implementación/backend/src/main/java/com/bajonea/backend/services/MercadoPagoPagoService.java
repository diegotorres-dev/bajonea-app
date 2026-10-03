package com.bajonea.backend.services;

import com.bajonea.backend.config.MercadoPagoConfig;
import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.dto.response.PagoResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.enums.EstadoPagoPedido;
import java.util.Comparator;
import com.bajonea.backend.entities.CuentaMercadoPago;
import com.bajonea.backend.entities.DetallePedido;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ServicioNoDisponibleException;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Checkout Pro vía API de Preferencias (ver docs/MERCADOPAGO-BAJONEA-FINAL.md) — crea/reusa la
 * preferencia de pago de un Pedido con el {@code access_token} del Dueño del comercio (split vía
 * {@code marketplace_fee}) y procesa el webhook que confirma el resultado real. {@code Pago} es
 * 1:1 con {@code Pedido} ({@code PagoService}), así que "reusar" significa simplemente no volver
 * a llamar a MercadoPago si ya existe una fila con {@code mpPreferenciaId} cargado.
 *
 * <p>Problema resuelto para identificar a qué Pedido corresponde una notificación: el payload del
 * webhook de MercadoPago solo trae el id del pago ({@code data.id}), nunca el
 * {@code external_reference} ni el comercio — y para poder pedirle a MercadoPago el estado real
 * de ese pago ({@code GET /v1/payments/{id}}) hace falta el {@code access_token} del Dueño
 * correcto, que a su vez requiere saber primero de qué Pedido se trata. Se resuelve agregando
 * {@code ?pedidoId=} como query param propio en la {@code notification_url} configurada al crear
 * la preferencia — MercadoPago lo reenvía intacto en la URL de cada notificación (documentado:
 * "add query params to your notification_url to identify which resource it's for"). Ese
 * {@code pedidoId} es solo una clave de búsqueda, nunca se confía en él a ciegas:
 * {@link #procesarNotificacion} valida que el {@code external_reference} que devuelve la propia
 * respuesta de MercadoPago coincida con el Pedido antes de tocar ningún estado.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class MercadoPagoPagoService {

    private static final Logger log = LoggerFactory.getLogger(MercadoPagoPagoService.class);

    private static final String URL_CREAR_PREFERENCIA = "https://api.mercadopago.com/checkout/preferences";
    private static final String URL_OBTENER_PAGO = "https://api.mercadopago.com/v1/payments/";
    private static final String URL_BUSCAR_PAGOS = "https://api.mercadopago.com/v1/payments/search";
    private static final String MONEDA = "ARS";
    private static final String ESTADO_APROBADO = "approved";
    private static final List<String> ESTADOS_RECHAZO = List.of("rejected", "cancelled");
    private static final BigDecimal TOLERANCIA_SPLIT = new BigDecimal("0.01");

    private final PedidoService pedidoService;
    private final PagoService pagoService;
    private final CuentaMercadoPagoService cuentaMercadoPagoService;
    private final DetallePedidoRepository detallePedidoRepository;
    private final MercadoPagoConfig mercadoPagoConfig;
    private final AlertaWebhookMpService alertaWebhookMpService;
    private final PedidoTimeoutProperties timeoutProperties;

    private static final ZoneOffset ZONA_PREFERENCIA = ZoneOffset.of("-03:00");
    private static final DateTimeFormatter FORMATO_FECHA_MP = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
    private static final int TIMEOUT_MP_MS = 5000;
    private static final String MENSAJE_VERIFICACION_FALLIDA = "No pudimos verificar el estado de tu pago. Probá de nuevo en unos segundos.";

    private final RestClient restClient = crearRestClient();

    private static RestClient crearRestClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(TIMEOUT_MP_MS);
        factory.setReadTimeout(TIMEOUT_MP_MS);
        return RestClient.builder().requestFactory(factory).build();
    }

    @Value("${app.frontend-base-url}")
    private String frontendBaseUrl;

    @Value("${app.backend-base-url}")
    private String backendBaseUrl;

    public PagoResponseDTO iniciarOReusarPago(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = pedidoService.obtenerPedidoDelCliente(usuarioId, pedidoId);
        Pago pago = pagoService.buscarPorPedido(pedidoId).orElse(null);
        if (pedido.getPagoEstado() == EstadoPagoPedido.PAGADO) {
            return pagoService.aResponseDTOSinLink(pago, pedido, true, false);
        }
        if (pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO) {
            throw new ConflictoDeNegocioException("El pedido no está esperando el pago");
        }

        CuentaMercadoPago cuenta = obtenerCuentaDelComercio(pedido);

        if (pago != null && pago.getMpPreferenciaId() != null) {
            PagoMpResponse mejor = buscarMejorPagoOFallar(pedidoId, cuenta.getAccessToken());
            if (mejor != null && mejor.id() != null) {
                validarYAplicarResultado(pago, String.valueOf(mejor.id()), mejor, null);
                if (pedido.getPagoEstado() == EstadoPagoPedido.PAGADO) {
                    return pagoService.aResponseDTOSinLink(pago, pedido, true, false);
                }
                if (!ESTADO_APROBADO.equals(mejor.status()) && !ESTADOS_RECHAZO.contains(mejor.status())) {
                    return pagoService.aResponseDTOSinLink(pago, pedido, false, true);
                }
            }
            return pagoService.aResponseDTO(pago, pedido, esSandbox(cuenta));
        }

        PreferenciaResponse respuesta = crearPreferenciaEnMercadoPago(pedido, cuenta);
        Pago nuevo = pagoService.crearPreferencia(pedido, respuesta.id(), respuesta.initPoint(), respuesta.sandboxInitPoint());
        return pagoService.aResponseDTO(nuevo, pedido, esSandbox(cuenta));
    }

    public PagoResponseDTO consultarComoCliente(Integer usuarioId, Integer pedidoId) {
        return consultar(pedidoService.obtenerPedidoDelCliente(usuarioId, pedidoId));
    }

    public PagoResponseDTO consultarComoComercio(Integer comercioId, Integer pedidoId) {
        return consultar(pedidoService.obtenerPedidoDelComercio(comercioId, pedidoId));
    }

    private PagoResponseDTO consultar(Pedido pedido) {
        Pago pago = pagoService.obtenerPorPedido(pedido.getId());
        CuentaMercadoPago cuenta = obtenerCuentaDelComercio(pedido);
        return pagoService.aResponseDTO(pago, pedido, esSandbox(cuenta));
    }

    /**
     * Valida el header {@code x-signature} contra el manifest documentado por MercadoPago
     * ({@code id:{data.id};request-id:{x-request-id};ts:{ts};}, HMAC-SHA256 hexadecimal con el
     * secreto de la aplicación). Si {@code mercadopago.webhook-secret} no está configurado (gap
     * pendiente documentado, ver CLAUDE.md Fase 21 — mismo criterio que el resto de credenciales
     * de MP todavía sin valor real en ningún entorno) se omite la validación y se loguea la
     * omisión — nunca falla en silencio sin dejar rastro.
     */
    public boolean validarFirma(String xSignature, String xRequestId, String dataIdQueryParam) {
        String secreto = mercadoPagoConfig.getWebhookSecret();
        if (secreto == null || secreto.isBlank()) {
            log.warn("mercadopago.webhook-secret no configurado — se omite la validación de x-signature del webhook");
            return true;
        }
        if (xSignature == null || xSignature.isBlank()) {
            return false;
        }

        String ts = null;
        String v1 = null;
        for (String parte : xSignature.split(",")) {
            String[] par = parte.trim().split("=", 2);
            if (par.length != 2) {
                continue;
            }
            if ("ts".equals(par[0].trim())) {
                ts = par[1].trim();
            } else if ("v1".equals(par[0].trim())) {
                v1 = par[1].trim();
            }
        }
        if (ts == null || v1 == null) {
            return false;
        }

        String manifest = "id:" + (dataIdQueryParam == null ? "" : dataIdQueryParam.toLowerCase())
                + ";request-id:" + (xRequestId == null ? "" : xRequestId)
                + ";ts:" + ts + ";";

        String firmaCalculada = calcularHmacSha256Hex(manifest, secreto);
        return firmaCalculada.equalsIgnoreCase(v1);
    }

    /**
     * Procesa la notificación ya validada (firma correcta o validación omitida por falta de
     * secreto). {@code pedidoIdBusqueda} es solo la clave de búsqueda tomada del query param
     * propio de la {@code notification_url} (ver Javadoc de clase) — nunca se confía en ella sin
     * cruzarla contra el {@code external_reference} real que devuelve MercadoPago. {@code
     * ipOrigen} es solo para dejar rastro en {@link AlertaWebhookMpService} si el cruce falla —
     * puede venir {@code null} sin afectar el resto del procesamiento.
     */
    public void procesarNotificacion(Integer pedidoIdBusqueda, String paymentId, String ipOrigen) {
        Pago pago = pagoService.buscarPorPedido(pedidoIdBusqueda).orElse(null);
        if (pago == null) {
            log.warn("Webhook de MercadoPago para pedidoId={} sin ninguna preferencia de pago creada por Bajoneá — se ignora", pedidoIdBusqueda);
            return;
        }
        Pedido pedido = pago.getPedido();
        CuentaMercadoPago cuenta = obtenerCuentaDelComercio(pedido);

        PagoMpResponse pagoMp = obtenerPagoEnMercadoPago(paymentId, cuenta.getAccessToken());
        validarYAplicarResultado(pago, paymentId, pagoMp, ipOrigen);
    }

    /**
     * Sincronización a pedido del Cliente al volver del checkout: consulta el pago en MercadoPago
     * y aplica el resultado con la misma rutina que el webhook. Si el pedido ya no está en
     * {@code PENDIENTE_PAGO} devuelve el estado actual sin consultar a MercadoPago. Nunca confía en
     * el {@code paymentId} que manda el frontend: se cruza el {@code external_reference}.
     */
    public PedidoResponseDTO sincronizarPago(Integer usuarioId, Integer pedidoId, String paymentId, String ipOrigen) {
        Pedido pedido = pedidoService.obtenerPedidoDelCliente(usuarioId, pedidoId);
        if (pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO) {
            return pedidoService.obtenerDetalleCliente(pedido);
        }
        Pago pago = pagoService.buscarPorPedido(pedidoId).orElse(null);
        if (pago == null) {
            return pedidoService.obtenerDetalleCliente(pedido);
        }

        CuentaMercadoPago cuenta = obtenerCuentaDelComercio(pedido);
        PagoMpResponse pagoMp;
        String idPago;
        if (paymentId != null && !paymentId.isBlank()) {
            idPago = paymentId;
            pagoMp = obtenerPagoEnMercadoPago(idPago, cuenta.getAccessToken());
        } else {
            pagoMp = buscarMejorPagoPorReferencia(pedidoId, cuenta.getAccessToken());
            if (pagoMp == null || pagoMp.id() == null) {
                return pedidoService.obtenerDetalleCliente(pedido);
            }
            idPago = String.valueOf(pagoMp.id());
        }

        validarYAplicarResultado(pago, idPago, pagoMp, ipOrigen);
        return pedidoService.obtenerDetalleCliente(pedido);
    }

    private void validarYAplicarResultado(Pago pago, String paymentId, PagoMpResponse pagoMp, String ipOrigen) {
        Pedido pedido = pago.getPedido();
        if (!pedido.getId().toString().equals(pagoMp.externalReference())) {
            log.warn("MercadoPago: paymentId={} tiene external_reference={} que no coincide con pedidoId={} — se ignora",
                    paymentId, pagoMp.externalReference(), pedido.getId());
            alertaWebhookMpService.registrarExternalReferenceMismatch(pedido, paymentId, pagoMp.externalReference(), ipOrigen);
            return;
        }
        aplicarResultadoPago(pago, paymentId, pagoMp, ipOrigen);
    }

    /**
     * Rutina única de "aplicar el resultado de un pago a un pedido", compartida por el webhook y
     * la sincronización. Corre con el pedido bloqueado (FOR UPDATE) para que dos ejecuciones
     * simultáneas se serialicen. Un pago aprobado nunca se pisa.
     */
    private void aplicarResultadoPago(Pago pagoInicial, String paymentId, PagoMpResponse pagoMp, String ipOrigen) {
        Pedido pedido = pedidoService.bloquearParaActualizar(pagoInicial.getPedido().getId());
        Pago pago = pagoInicial;
        pagoService.refrescar(pago);

        boolean aprobado = ESTADO_APROBADO.equals(pagoMp.status());
        boolean yaHayPagoAprobado = pago.getFechaConfirmacion() != null;

        if (aprobado) {
            if (yaHayPagoAprobado && !paymentId.equals(pago.getIdTransaccionMp())) {
                log.warn("MercadoPago: pago aprobado {} duplicado para pedidoId={}, ya tiene el pago aprobado {}",
                        paymentId, pedido.getId(), pago.getIdTransaccionMp());
                alertaWebhookMpService.registrarPagoAprobadoDuplicado(pedido, paymentId, ipOrigen);
                return;
            }
            pagoService.registrarResultado(pago, paymentId, pagoMp.status(), pagoMp.paymentTypeId(), true);
            if (pedido.getEstado() == EstadoPedido.PENDIENTE_PAGO) {
                pedidoService.confirmarPagoAprobado(pedido.getId());
            } else if (pedido.getPagoEstado() != EstadoPagoPedido.PAGADO) {
                alertaWebhookMpService.registrarPagoAprobadoSobrePedidoCancelado(pedido, paymentId, ipOrigen);
            }
            verificarSplitAplicado(pedido, paymentId, pagoMp, ipOrigen);
            return;
        }

        if (yaHayPagoAprobado) {
            return;
        }
        pagoService.registrarResultado(pago, paymentId, pagoMp.status(), pagoMp.paymentTypeId(), false);
        if (ESTADOS_RECHAZO.contains(pagoMp.status())) {
            pedidoService.marcarPagoRechazado(pedido.getId());
        }
    }

    /**
     * Confirma contra la propia respuesta de MercadoPago (nunca contra lo que Bajoneá calculó de
     * antemano) que el split de marketplace se aplicó de verdad sobre este pago aprobado. Nunca
     * bloquea ni revierte nada del pedido/pago — el cliente ya pagó y el comercio ya tiene su
     * pedido; si el split falló o vino con un monto distinto al esperado, queda solo como
     * {@link AlertaWebhookMpService#registrarSplitNoAplicado} para revisión manual.
     */
    private void verificarSplitAplicado(Pedido pedido, String paymentId, PagoMpResponse pagoMp, String ipOrigen) {
        BigDecimal montoEsperado = pedido.getCargoServicioCliente().add(pedido.getCargoServicioComercio());
        BigDecimal montoCapturado = pagoMp.feeDetails() == null ? null : pagoMp.feeDetails().stream()
                .filter(fee -> "application_fee".equals(fee.type()))
                .map(FeeDetail::amount)
                .findFirst()
                .orElse(null);

        boolean coincide = montoCapturado != null
                && montoEsperado.subtract(montoCapturado).abs().compareTo(TOLERANCIA_SPLIT) <= 0;
        if (coincide) {
            log.info("MercadoPago: split de marketplace confirmado para pedidoId={}, paymentId={} — monto={}",
                    pedido.getId(), paymentId, montoCapturado);
            return;
        }
        log.warn("MercadoPago: split de marketplace no coincide para pedidoId={}, paymentId={} — esperado={}, capturado={}",
                pedido.getId(), paymentId, montoEsperado, montoCapturado);
        alertaWebhookMpService.registrarSplitNoAplicado(pedido, paymentId, montoEsperado, montoCapturado, ipOrigen);
    }

    private PagoMpResponse buscarMejorPagoPorReferencia(Integer pedidoId, String accessToken) {
        try {
            return elegirMejorPago(pedidoId, accessToken);
        } catch (RestClientResponseException ex) {
            log.warn("No se pudo buscar pagos por external_reference={} en Mercado Pago: {}", pedidoId, ex.getStatusCode());
            return null;
        }
    }

    /**
     * Variante estricta para "Ir a pagar": cualquier falla al consultar a MercadoPago (red, error de
     * la API, tiempo agotado) bloquea la operación con 503 en vez de degradar a "sin pagos".
     */
    private PagoMpResponse buscarMejorPagoOFallar(Integer pedidoId, String accessToken) {
        try {
            return elegirMejorPago(pedidoId, accessToken);
        } catch (RestClientException ex) {
            log.warn("No se pudo verificar el pago del pedidoId={} en Mercado Pago: {}", pedidoId, ex.getMessage());
            throw new ServicioNoDisponibleException(MENSAJE_VERIFICACION_FALLIDA);
        }
    }

    private PagoMpResponse elegirMejorPago(Integer pedidoId, String accessToken) {
        PagoMpBusquedaResponse busqueda = restClient.get()
                .uri(URL_BUSCAR_PAGOS + "?external_reference={ref}&sort=date_created&criteria=desc&limit=20", pedidoId.toString())
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .body(PagoMpBusquedaResponse.class);
        if (busqueda == null || busqueda.results() == null || busqueda.results().isEmpty()) {
            return null;
        }
        List<PagoMpResponse> resultados = busqueda.results();
        for (PagoMpResponse candidato : resultados) {
            if (ESTADO_APROBADO.equals(candidato.status())) {
                return candidato;
            }
        }
        return resultados.stream()
                .max(Comparator.comparing(p -> p.dateCreated() == null ? "" : p.dateCreated()))
                .orElse(null);
    }

    private CuentaMercadoPago obtenerCuentaDelComercio(Pedido pedido) {
        Integer duenoId = pedido.getComercio().getDueno().getId();
        try {
            return cuentaMercadoPagoService.obtenerActivaPorDueno(duenoId);
        } catch (RecursoNoEncontradoException ex) {
            throw new ConflictoDeNegocioException(
                    "El comercio de este pedido no tiene una cuenta de Mercado Pago vinculada. No se puede procesar el pago.");
        }
    }

    private boolean esSandbox(CuentaMercadoPago cuenta) {
        return cuenta.isEsCuentaPrueba();
    }

    private PreferenciaResponse crearPreferenciaEnMercadoPago(Pedido pedido, CuentaMercadoPago cuenta) {
        List<DetallePedido> detalles = detallePedidoRepository.findByPedidoId(pedido.getId());

        List<ItemPreferencia> items = new ArrayList<>();
        for (DetallePedido detalle : detalles) {
            items.add(new ItemPreferencia(
                    String.valueOf(detalle.getProducto().getId()),
                    detalle.getProducto().getNombre(),
                    detalle.getCantidad(),
                    MONEDA,
                    detalle.getPrecioUnitario()));
        }
        items.add(new ItemPreferencia("cargo-servicio", "Cargo por servicio Bajoneá", 1, MONEDA, pedido.getCargoServicioCliente()));

        String pedidoIdStr = pedido.getId().toString();
        String notificationUrl = backendBaseUrl + "/api/v1/webhooks/mercadopago?pedidoId=" + pedidoIdStr;
        BackUrls backUrls = new BackUrls(
                frontendBaseUrl + "/pedido-detalle.html?id=" + pedidoIdStr + "&pago=exito",
                frontendBaseUrl + "/pedido-detalle.html?id=" + pedidoIdStr + "&pago=pendiente",
                frontendBaseUrl + "/pedido-detalle.html?id=" + pedidoIdStr + "&pago=fallo");

        BigDecimal marketplaceFee = pedido.getCargoServicioCliente().add(pedido.getCargoServicioComercio());

        Duration restante = Duration.ofMinutes(timeoutProperties.getPagoMinutos())
                .minus(Duration.between(pedido.getFechaCreacion(), LocalDateTime.now()));
        if (restante.isZero() || restante.isNegative()) {
            throw new ConflictoDeNegocioException("El pedido venció, ya no se puede pagar");
        }
        OffsetDateTime ahora = OffsetDateTime.now(ZONA_PREFERENCIA);
        String vigenteDesde = ahora.truncatedTo(ChronoUnit.SECONDS).format(FORMATO_FECHA_MP);
        String vigenteHasta = ahora.plus(restante).format(FORMATO_FECHA_MP);

        PreferenciaRequest request = new PreferenciaRequest(items, backUrls, notificationUrl, "approved", pedidoIdStr, marketplaceFee,
                true, vigenteDesde, vigenteHasta);

        try {
            PreferenciaResponse respuesta = restClient.post()
                    .uri(URL_CREAR_PREFERENCIA)
                    .header("Authorization", "Bearer " + cuenta.getAccessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(PreferenciaResponse.class);
            if (respuesta == null || respuesta.id() == null) {
                throw new ConflictoDeNegocioException("Mercado Pago no devolvió una preferencia de pago válida");
            }
            return respuesta;
        } catch (RestClientResponseException ex) {
            log.error("Error creando preferencia en Mercado Pago para pedidoId={}: {} {}",
                    pedido.getId(), ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new ConflictoDeNegocioException("No se pudo generar el link de pago con Mercado Pago: " + ex.getStatusText());
        }
    }

    private PagoMpResponse obtenerPagoEnMercadoPago(String paymentId, String accessToken) {
        try {
            PagoMpResponse respuesta = restClient.get()
                    .uri(URL_OBTENER_PAGO + paymentId)
                    .header("Authorization", "Bearer " + accessToken)
                    .retrieve()
                    .body(PagoMpResponse.class);
            if (respuesta == null) {
                throw new ConflictoDeNegocioException("Mercado Pago no devolvió información del pago " + paymentId);
            }
            return respuesta;
        } catch (RestClientResponseException ex) {
            log.error("Error consultando el pago {} en Mercado Pago: {} {}", paymentId, ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new ConflictoDeNegocioException("No se pudo consultar el pago " + paymentId + " en Mercado Pago: " + ex.getStatusText());
        }
    }

    private static String calcularHmacSha256Hex(String manifest, String secreto) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secreto.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HmacSHA256 no disponible en esta JVM", e);
        }
    }

    private record ItemPreferencia(
            String id,
            String title,
            Integer quantity,
            @JsonProperty("currency_id") String currencyId,
            @JsonProperty("unit_price") BigDecimal unitPrice) {
    }

    private record BackUrls(String success, String pending, String failure) {
    }

    private record PreferenciaRequest(
            List<ItemPreferencia> items,
            @JsonProperty("back_urls") BackUrls backUrls,
            @JsonProperty("notification_url") String notificationUrl,
            @JsonProperty("auto_return") String autoReturn,
            @JsonProperty("external_reference") String externalReference,
            @JsonProperty("marketplace_fee") BigDecimal marketplaceFee,
            boolean expires,
            @JsonProperty("expiration_date_from") String expirationDateFrom,
            @JsonProperty("expiration_date_to") String expirationDateTo) {
    }

    private record PreferenciaResponse(
            String id,
            @JsonProperty("init_point") String initPoint,
            @JsonProperty("sandbox_init_point") String sandboxInitPoint) {
    }

    private record PagoMpBusquedaResponse(List<PagoMpResponse> results) {
    }

    private record PagoMpResponse(
            Long id,
            @JsonProperty("date_created") String dateCreated,
            String status,
            @JsonProperty("status_detail") String statusDetail,
            @JsonProperty("external_reference") String externalReference,
            @JsonProperty("payment_type_id") String paymentTypeId,
            @JsonProperty("fee_details") List<FeeDetail> feeDetails) {
    }

    /**
     * Tal como lo documenta MercadoPago para el recurso {@code Payment}: {@code fee_details} trae
     * una entrada por cada comisión aplicada al pago. La del split de marketplace (nuestro
     * {@code marketplace_fee} de la preferencia) aparece siempre con {@code type=application_fee}
     * — mismo nombre de tipo que usa la API de Pagos para su propio campo {@code application_fee},
     * aunque acá el split se haya originado por {@code marketplace_fee} en la preferencia.
     */
    private record FeeDetail(String type, @JsonProperty("fee_payer") String feePayer, BigDecimal amount) {
    }
}
