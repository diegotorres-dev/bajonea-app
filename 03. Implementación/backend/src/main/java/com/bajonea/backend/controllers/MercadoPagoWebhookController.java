package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.services.MercadoPagoPagoService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Recibe las notificaciones de pago de MercadoPago (Checkout Pro vía Preferencias, ver
 * docs/MERCADOPAGO-BAJONEA-FINAL.md). Público — lo llama MercadoPago, nunca el frontend de
 * Bajoneá — la autenticidad se valida vía el header {@code x-signature}
 * ({@link MercadoPagoPagoService#validarFirma}), no vía JWT (ver
 * {@code SecurityConfig.RUTAS_PUBLICAS}).
 *
 * <p>Se leen únicamente los query params ({@code pedidoId}, {@code data.id}, {@code type}), no
 * el body — el manifest de {@code x-signature} que documenta MercadoPago usa explícitamente el
 * {@code data.id} del query string (no el del JSON), y {@code pedidoId} es un query param propio
 * de Bajoneá agregado a la {@code notification_url} al crear cada preferencia (ver Javadoc de
 * {@code MercadoPagoPagoService}) — MercadoPago lo reenvía intacto en cada notificación.
 */
@RestController
@RequestMapping("/api/v1/webhooks/mercadopago")
@RequiredArgsConstructor
public class MercadoPagoWebhookController {

    private final MercadoPagoPagoService mercadoPagoPagoService;

    @PostMapping
    public ResponseEntity<ApiResponse<Void>> recibirNotificacion(
            @RequestParam(required = false) String pedidoId,
            @RequestParam(name = "data.id", required = false) String dataId,
            @RequestParam(required = false) String type,
            @RequestHeader(name = "x-signature", required = false) String xSignature,
            @RequestHeader(name = "x-request-id", required = false) String xRequestId,
            HttpServletRequest httpRequest) {

        if (!"payment".equals(type) || dataId == null || pedidoId == null) {
            return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Notificación ignorada", null));
        }

        if (!mercadoPagoPagoService.validarFirma(xSignature, xRequestId, dataId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiResponse<>("Firma inválida", null));
        }

        mercadoPagoPagoService.procesarNotificacion(Integer.valueOf(pedidoId), dataId, httpRequest.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Notificación procesada", null));
    }
}
