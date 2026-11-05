package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ResolverReclamoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ReclamoAdminResponseDTO;
import com.bajonea.backend.services.ReclamoAdminService;
import com.bajonea.backend.services.ReclamoAdminService.FiltroBandeja;
import com.bajonea.backend.services.ReclamoFotoService;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Bandeja y resolución de reclamos del Administrador. La seguridad la define el matcher de {@code /administrador/**}. */
@RestController
@RequestMapping("/api/v1/administrador/reclamos")
@RequiredArgsConstructor
public class ReclamoAdministradorController {

    private final ReclamoAdminService reclamoAdminService;

    @GetMapping
    public ResponseEntity<ApiResponse<ReclamoAdminResponseDTO.Bandeja>> listar(
            @RequestParam(required = false) FiltroBandeja filtro, @RequestParam(required = false) Integer limite,
            @RequestParam(required = false) Integer pagina) {
        return ResponseEntity.ok(new ApiResponse<>("Reclamos obtenidos correctamente", reclamoAdminService.listar(filtro, limite, pagina)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ReclamoAdminResponseDTO.Detalle>> detalle(@PathVariable Integer id) {
        return ResponseEntity.ok(new ApiResponse<>("Reclamo obtenido correctamente", reclamoAdminService.detalle(id)));
    }

    @GetMapping("/{id}/fotos/{fotoId}")
    public ResponseEntity<byte[]> foto(@PathVariable Integer id, @PathVariable Integer fotoId) {
        ReclamoFotoService.FotoDescargable foto = reclamoAdminService.foto(id, fotoId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(foto.tipoContenido()))
                .contentLength(foto.contenido().length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(foto.nombre(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(foto.contenido());
    }

    @PutMapping("/{id}/resolver")
    public ResponseEntity<ApiResponse<ReclamoAdminResponseDTO.Detalle>> resolver(@PathVariable Integer id,
            @Valid @RequestBody ResolverReclamoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser administrador) {
        return ResponseEntity.ok(new ApiResponse<>("Reclamo resuelto", reclamoAdminService.resolver(administrador.userId(), id, request)));
    }
}
