package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.response.ApiResponse;
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

    @GetMapping
    public ResponseEntity<ApiResponse<String>> health() {
        ApiResponse<String> body = new ApiResponse<>("Bajoneá backend operativo", null);
        return ResponseEntity.status(HttpStatus.OK).body(body);
    }
}
