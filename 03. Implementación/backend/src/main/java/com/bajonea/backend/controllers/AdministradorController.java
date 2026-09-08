package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.response.AdministradorResponseDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ClienteAdminResponseDTO;
import com.bajonea.backend.dto.response.ComercioAdminResponseDTO;
import com.bajonea.backend.dto.response.MetricasAdminResponseDTO;
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
    public ResponseEntity<ApiResponse<List<ComercioAdminResponseDTO>>> listarComerciosPendientes() {
        List<ComercioAdminResponseDTO> comercios = administradorService.listarComerciosPendientes();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercios pendientes obtenidos correctamente", comercios));
    }

    @GetMapping("/comercios")
    public ResponseEntity<ApiResponse<List<ComercioAdminResponseDTO>>> listarComerciosAprobados() {
        List<ComercioAdminResponseDTO> comercios = administradorService.listarComerciosAprobados();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercios obtenidos correctamente", comercios));
    }

    @GetMapping("/clientes")
    public ResponseEntity<ApiResponse<List<ClienteAdminResponseDTO>>> listarClientes() {
        List<ClienteAdminResponseDTO> clientes = administradorService.listarClientes();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Clientes obtenidos correctamente", clientes));
    }

    @GetMapping("/perfil")
    public ResponseEntity<ApiResponse<AdministradorResponseDTO>> obtenerPerfil(@AuthenticationPrincipal AuthenticatedUser administrador) {
        AdministradorResponseDTO response = administradorService.obtenerPerfil(administrador.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Perfil obtenido correctamente", response));
    }

    @GetMapping("/metricas")
    public ResponseEntity<ApiResponse<MetricasAdminResponseDTO>> obtenerMetricas() {
        MetricasAdminResponseDTO metricas = administradorService.obtenerMetricas();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Métricas obtenidas correctamente", metricas));
    }

    @PutMapping("/comercios/{comercioId}/resolver")
    public ResponseEntity<ApiResponse<Void>> resolverAprobacion(@PathVariable Integer comercioId,
            @Valid @RequestBody AprobacionComercioRequestDTO request, @AuthenticationPrincipal AuthenticatedUser administrador) {
        administradorService.resolverAprobacion(comercioId, administrador.userId(), request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercio resuelto correctamente", null));
    }
}
