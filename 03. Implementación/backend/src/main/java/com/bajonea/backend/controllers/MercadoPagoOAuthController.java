package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.CuentaMercadoPagoResponseDTO;
import com.bajonea.backend.dto.response.DesvinculacionPreviaResponseDTO;
import com.bajonea.backend.dto.response.IniciarVinculacionMercadoPagoResponseDTO;
import com.bajonea.backend.exceptions.CuentaMercadoPagoEnUsoException;
import com.bajonea.backend.exceptions.CuentaMercadoPagoYaVinculadaException;
import com.bajonea.backend.services.MercadoPagoOAuthService;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Vinculación OAuth {@code authorization_code} + PKCE de la cuenta de MercadoPago del Dueño. El
 * callback ({@code /callback}) lo invoca el navegador del Dueño por redirect de MercadoPago, no
 * un fetch del frontend — nunca devuelve JSON, siempre un 302 de vuelta a
 * {@code comercio-perfil.html} con el resultado en query param ({@code vinculacionMp}: {@code exito},
 * {@code cuenta-en-uso}, {@code cuenta-ya-vinculada} o {@code error}), porque ahí es donde termina la
 * navegación del navegador tras el consentimiento en MP.
 */
@RestController
@RequestMapping("/api/v1/oauth/mercadopago")
@RequiredArgsConstructor
public class MercadoPagoOAuthController {

    private static final String RESULTADO_EXITO = "exito";
    private static final String RESULTADO_CUENTA_EN_USO = "cuenta-en-uso";
    private static final String RESULTADO_CUENTA_YA_VINCULADA = "cuenta-ya-vinculada";
    private static final String RESULTADO_ERROR = "error";

    private final MercadoPagoOAuthService mercadoPagoOAuthService;

    @Value("${app.frontend-base-url:}")
    private String frontendBaseUrl;

    @GetMapping("/iniciar")
    public ResponseEntity<ApiResponse<IniciarVinculacionMercadoPagoResponseDTO>> iniciar(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        String url = mercadoPagoOAuthService.iniciarVinculacion(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("URL de autorización generada correctamente", new IniciarVinculacionMercadoPagoResponseDTO(url)));
    }

    @GetMapping("/callback")
    public ResponseEntity<ApiResponse<Void>> callback(@RequestParam(required = false) String code,
            @RequestParam(required = false) String state) {
        String resultado;
        if (code == null || code.isBlank() || state == null || state.isBlank()) {
            resultado = RESULTADO_ERROR;
        } else {
            try {
                mercadoPagoOAuthService.procesarCallback(code, state);
                resultado = RESULTADO_EXITO;
            } catch (CuentaMercadoPagoEnUsoException ex) {
                resultado = RESULTADO_CUENTA_EN_USO;
            } catch (CuentaMercadoPagoYaVinculadaException ex) {
                resultado = RESULTADO_CUENTA_YA_VINCULADA;
            } catch (RuntimeException ex) {
                resultado = RESULTADO_ERROR;
            }
        }
        URI destino = URI.create(frontendBaseUrl + "/comercio-perfil.html?vinculacionMp=" + resultado);
        return ResponseEntity.status(HttpStatus.FOUND).location(destino)
                .body(new ApiResponse<>("Redirigiendo a Bajoneá", null));
    }

    @GetMapping("/desvinculacion/previa")
    public ResponseEntity<ApiResponse<DesvinculacionPreviaResponseDTO>> previaDesvinculacion(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        DesvinculacionPreviaResponseDTO response = mercadoPagoOAuthService.previaDesvinculacion(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Previa de desvinculación obtenida correctamente", response));
    }

    @DeleteMapping("/desvincular")
    public ResponseEntity<ApiResponse<Void>> desvincular(@AuthenticationPrincipal AuthenticatedUser usuario) {
        mercadoPagoOAuthService.desvincular(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Cuenta de Mercado Pago desvinculada correctamente", null));
    }

    @GetMapping("/cuenta")
    public ResponseEntity<ApiResponse<CuentaMercadoPagoResponseDTO>> consultarEstado(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        CuentaMercadoPagoResponseDTO response = mercadoPagoOAuthService.consultarEstado(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Estado de vinculación obtenido correctamente", response));
    }
}
