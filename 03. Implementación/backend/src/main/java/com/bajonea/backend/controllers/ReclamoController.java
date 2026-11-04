package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ReclamoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ReclamoPedidoResponseDTO;
import com.bajonea.backend.services.ReclamoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * El Cliente reclama un pedido entregado. Va bajo {@code /pedidos/cliente/**}, que ya exige el rol {@code CLIENTE}; el
 * Empleado es un Cliente y reclama sus propios pedidos como cualquiera. Un pedido ajeno o inexistente es {@code 404}.
 */
@RestController
@RequestMapping("/api/v1/pedidos/cliente")
@RequiredArgsConstructor
public class ReclamoController {

    private final ReclamoService reclamoService;

    @PostMapping("/{id}/reclamo")
    public ResponseEntity<ApiResponse<ReclamoPedidoResponseDTO>> crear(@PathVariable Integer id,
            @Valid @RequestBody ReclamoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        ReclamoPedidoResponseDTO reclamo = reclamoService.crear(usuario.userId(), id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Recibimos tu reclamo", reclamo));
    }
}
