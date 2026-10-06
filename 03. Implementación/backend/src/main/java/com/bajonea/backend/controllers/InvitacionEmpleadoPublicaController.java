package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.request.AceptarInvitacionEmpleadoRequestDTO;
import com.bajonea.backend.dto.request.ValidarInvitacionEmpleadoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.InvitacionEmpleadoAceptadaResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoValidadaResponseDTO;
import com.bajonea.backend.services.InvitacionEmpleadoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Los dos endpoints públicos del alta por invitación de empleado: quien recibe la invitación todavía no
 * tiene sesión (puede ni siquiera tener cuenta). Ambos son rutas exactas de {@code RUTAS_PUBLICAS} en
 * {@code SecurityConfig} y están limitados por IP en {@code RateLimitPublicoFilter}.
 */
@RestController
@RequestMapping("/api/v1/auth/invitaciones-empleado")
@RequiredArgsConstructor
public class InvitacionEmpleadoPublicaController {

    private final InvitacionEmpleadoService invitacionEmpleadoService;

    @PostMapping("/validar")
    public ResponseEntity<ApiResponse<InvitacionEmpleadoValidadaResponseDTO>> validar(
            @Valid @RequestBody ValidarInvitacionEmpleadoRequestDTO request) {
        InvitacionEmpleadoValidadaResponseDTO response = invitacionEmpleadoService.validar(request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Invitación válida", response));
    }

    @PostMapping("/aceptar")
    public ResponseEntity<ApiResponse<InvitacionEmpleadoAceptadaResponseDTO>> aceptar(
            @Valid @RequestBody AceptarInvitacionEmpleadoRequestDTO request) {
        InvitacionEmpleadoAceptadaResponseDTO response = invitacionEmpleadoService.aceptar(request);
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Ya sos parte del equipo de " + response.getComercioNombre(), response));
    }
}
