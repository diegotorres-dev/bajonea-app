package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.services.DisponibilidadComercioService;
import com.bajonea.backend.services.ReaperturaComerciosJob;
import com.bajonea.backend.services.TestSupportService;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoints auxiliares exclusivos del perfil {@code test} (Fase 14, ver docs/DECISIONES.md
 * y CLAUDE.md §9). No existen fuera de ese perfil — {@code @Profile("test")} evita que
 * Spring registre este bean (y por lo tanto la ruta) en el perfil normal/producción.
 */
@RestController
@RequestMapping("/api/v1/test")
@RequiredArgsConstructor
@Profile("test")

// Endpoints para un entorno de prueba. Sirve para Playwright y Postman para obtener tokens sin tener que leer emails.
// Solo arranca cuando el perfil de test activo, no en producción.
public class TestController {

    private final TestSupportService testSupportService;
    private final ReaperturaComerciosJob reaperturaComerciosJob;
    private final DisponibilidadComercioService disponibilidadComercioService;

    @GetMapping("/token-verificacion")
    public ResponseEntity<ApiResponse<String>> obtenerTokenVerificacion(@RequestParam String email) {
        String token = testSupportService.obtenerTokenVerificacionPendiente(email);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Token de verificación obtenido", token));
    }

    @GetMapping("/token")
    public ResponseEntity<ApiResponse<String>> obtenerToken(
            @RequestParam String email, @RequestParam TipoToken tipo) {
        String token = testSupportService.obtenerTokenPendiente(email, tipo);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Token obtenido", token));
    }

    @PutMapping("/comercios/{id}/apto-venta")
    public ResponseEntity<ApiResponse<Void>> marcarAptoVenta(@PathVariable Integer id) {
        testSupportService.marcarAptoVenta(id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercio marcado como APTO_VENTA", null));
    }

    @PostMapping("/comercios/{id}/clonar")
    public ResponseEntity<ApiResponse<Integer>> clonarComercio(@PathVariable Integer id, @RequestParam String nombre,
            @RequestParam(required = false) EstadoComercio estado) {
        Integer clonId = testSupportService.clonarComercio(id, nombre, estado);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Comercio clonado", clonId));
    }

    @PostMapping("/duenos/{id}/mercadopago-simulada")
    public ResponseEntity<ApiResponse<Void>> vincularCuentaMercadoPagoSimulada(@PathVariable Integer id,
            @RequestParam(required = false) String mpUserId) {
        testSupportService.vincularCuentaMercadoPagoSimulada(id, mpUserId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Cuenta de Mercado Pago simulada vinculada", null));
    }

    @PostMapping("/jobs/reapertura-comercios")
    public ResponseEntity<ApiResponse<Integer>> ejecutarReaperturaComercios(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime ahora) {
        int reabiertos = ahora == null
                ? reaperturaComerciosJob.reabrirComerciosVencidos(disponibilidadComercioService.ahora())
                : reaperturaComerciosJob.reabrirComerciosVencidos(ahora);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Job de reapertura ejecutado", reabiertos));
    }

    @PutMapping("/pedidos/{id}/pago-aprobado")
    public ResponseEntity<ApiResponse<Void>> confirmarPagoAprobado(@PathVariable Integer id) {
        testSupportService.confirmarPagoAprobado(id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Pago del pedido confirmado", null));
    }
}
