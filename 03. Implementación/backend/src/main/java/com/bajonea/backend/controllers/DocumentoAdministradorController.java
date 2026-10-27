package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ResolverDocumentoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.DocumentoComercioResponseDTO;
import com.bajonea.backend.dto.response.DocumentoPendienteAdminResponseDTO;
import com.bajonea.backend.services.RevisionDocumentoService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Revisión de los documentos de los comercios por el Administrador. */
@RestController
@RequestMapping("/api/v1/administrador")
@RequiredArgsConstructor
public class DocumentoAdministradorController {

    private final RevisionDocumentoService revisionDocumentoService;

    @GetMapping("/documentos/pendientes")
    public ResponseEntity<ApiResponse<List<DocumentoPendienteAdminResponseDTO>>> pendientes() {
        return ResponseEntity.ok(new ApiResponse<>("Documentos pendientes obtenidos correctamente",
                revisionDocumentoService.pendientes()));
    }

    @GetMapping("/comercios/{comercioId}/documentos")
    public ResponseEntity<ApiResponse<List<DocumentoComercioResponseDTO>>> documentosDeComercio(
            @PathVariable Integer comercioId) {
        return ResponseEntity.ok(new ApiResponse<>("Documentos del comercio obtenidos correctamente",
                revisionDocumentoService.documentosDeComercio(comercioId)));
    }

    @GetMapping("/documentos/{id}/archivo")
    public ResponseEntity<byte[]> archivo(@PathVariable Integer id) {
        return DocumentoComercioController.respuestaDeArchivo(revisionDocumentoService.archivo(id));
    }

    @PutMapping("/documentos/{id}/resolver")
    public ResponseEntity<ApiResponse<DocumentoComercioResponseDTO>> resolver(@PathVariable Integer id,
            @Valid @RequestBody ResolverDocumentoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser administrador) {
        DocumentoComercioResponseDTO documento = revisionDocumentoService.resolver(id, administrador.userId(), request);
        String mensaje = Boolean.TRUE.equals(request.getAprobar()) ? "Documento aprobado" : "Documento rechazado";
        return ResponseEntity.ok(new ApiResponse<>(mensaje, documento));
    }
}
