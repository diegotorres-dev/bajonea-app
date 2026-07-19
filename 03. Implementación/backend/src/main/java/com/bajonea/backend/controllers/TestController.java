package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.services.TestSupportService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
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
public class TestController {

    private final TestSupportService testSupportService;

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
}
