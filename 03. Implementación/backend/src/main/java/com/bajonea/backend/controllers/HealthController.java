package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.response.ApiResponse;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoint mínimo para validar que ApiResponse + controllers/ + el arranque de Spring
 * funcionan juntos antes de la Fase 4 (Entities).
 */
@RestController
@RequestMapping("/api/v1/health")
public class HealthController {

    //Pregunta si el backend está activo. No llama a ningún service, no tiene lógica. Solo respuesta.
    @GetMapping
    public ResponseEntity<ApiResponse<String>> health() {
        ApiResponse<String> body = new ApiResponse<>("Bajoneá backend operativo", null);
        return ResponseEntity.status(HttpStatus.OK).body(body);
    }

    @GetMapping("/debug-tz-temp")
    public ResponseEntity<ApiResponse<String>> debugTzTemp() {
        String utc = LocalDateTime.now(ZoneOffset.UTC).toString();
        String offsetFijo = LocalDateTime.now(ZoneOffset.of("-03:00")).toString();
        String zonaNombrada = LocalDateTime.now(ZoneId.of("America/Argentina/Ushuaia")).toString();
        String sistemaDefault = LocalDateTime.now().toString() + " (" + ZoneId.systemDefault() + ")";
        String mensaje = "utc=" + utc + " | offsetFijo(-03:00)=" + offsetFijo
                + " | zonaNombrada(Ushuaia)=" + zonaNombrada + " | sistemaDefault=" + sistemaDefault;
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>(mensaje, null));
    }
}
