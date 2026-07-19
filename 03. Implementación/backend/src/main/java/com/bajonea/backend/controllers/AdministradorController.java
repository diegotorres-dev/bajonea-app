package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.services.AdministradorService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * No incluye gestión de Categoría/Tag — ver {@code CategoriaController}/{@code TagController}
 * (tanda propia, docs/DECISIONES.md 2026-07-17).
 */
@RestController
@RequestMapping("/api/v1/administrador")
@RequiredArgsConstructor
public class AdministradorController {

    private final AdministradorService administradorService;

    @GetMapping("/comercios/pendientes")
    public ResponseEntity<ApiResponse<List<ComercioResponseDTO>>> listarComerciosPendientes() {
        List<ComercioResponseDTO> comercios = administradorService.listarComerciosPendientes();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercios pendientes obtenidos correctamente", comercios));
    }

    @PutMapping("/comercios/{comercioId}/resolver")
    public ResponseEntity<ApiResponse<Void>> resolverAprobacion(@PathVariable Integer comercioId,
            @Valid @RequestBody AprobacionComercioRequestDTO request, @AuthenticationPrincipal AuthenticatedUser administrador) {
        administradorService.resolverAprobacion(comercioId, administrador.userId(), request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercio resuelto correctamente", null));
    }
}
