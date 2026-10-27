package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.DireccionClienteRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.DireccionClienteResponseDTO;
import com.bajonea.backend.services.DireccionClienteService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/clientes/direcciones")
@RequiredArgsConstructor
public class DireccionClienteController {

    private final DireccionClienteService direccionClienteService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<DireccionClienteResponseDTO>>> listar(@AuthenticationPrincipal AuthenticatedUser usuario) {
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Direcciones obtenidas correctamente", direccionClienteService.listar(usuario.userId())));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<DireccionClienteResponseDTO>> crear(@Valid @RequestBody DireccionClienteRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ApiResponse<>("Dirección agregada correctamente", direccionClienteService.crear(usuario.userId(), request)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<DireccionClienteResponseDTO>> editar(@PathVariable Integer id,
            @Valid @RequestBody DireccionClienteRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Dirección actualizada correctamente", direccionClienteService.editar(usuario.userId(), id, request)));
    }

    @PutMapping("/{id}/principal")
    public ResponseEntity<ApiResponse<List<DireccionClienteResponseDTO>>> marcarPredeterminada(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Dirección predeterminada actualizada correctamente",
                direccionClienteService.marcarPredeterminada(usuario.userId(), id)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<List<DireccionClienteResponseDTO>>> eliminar(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Dirección eliminada correctamente", direccionClienteService.eliminar(usuario.userId(), id)));
    }
}
