package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ReclamoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ReclamoPedidoResponseDTO;
import com.bajonea.backend.services.ReclamoService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * El Cliente reclama un pedido entregado. Va bajo {@code /pedidos/cliente/**}, que ya exige el rol {@code CLIENTE}; el
 * Empleado es un Cliente y reclama sus propios pedidos como cualquiera. Un pedido ajeno o inexistente es {@code 404}.
 */
@RestController
@RequestMapping("/api/v1/pedidos/cliente")
@RequiredArgsConstructor
public class ReclamoController {

    private final ReclamoService reclamoService;

    @PostMapping(value = "/{id}/reclamo", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<ReclamoPedidoResponseDTO>> crear(@PathVariable Integer id,
            @Valid @RequestBody ReclamoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        ReclamoPedidoResponseDTO reclamo = reclamoService.crear(usuario.userId(), id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Recibimos tu reclamo", reclamo));
    }

    @PostMapping(value = "/{id}/reclamo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ReclamoPedidoResponseDTO>> crearConFotos(@PathVariable Integer id,
            @Valid @RequestPart("reclamo") ReclamoRequestDTO request,
            @RequestPart(value = "fotos", required = false) List<MultipartFile> fotos,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        ReclamoPedidoResponseDTO reclamo = reclamoService.crear(usuario.userId(), id, request, fotos == null ? List.of() : fotos);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Recibimos tu reclamo", reclamo));
    }
}
