package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.RedSocialResponseDTO;
import com.bajonea.backend.services.RedSocialService;
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
@RequestMapping("/api/v1/comercios/redes-sociales")
@RequiredArgsConstructor
public class RedSocialController {

    private final RedSocialService redSocialService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<RedSocialResponseDTO>>> listar(@AuthenticationPrincipal AuthenticatedUser usuario) {
        List<RedSocialResponseDTO> response = redSocialService.listarActivas(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Redes sociales obtenidas correctamente", response));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<RedSocialResponseDTO>> agregar(@Valid @RequestBody RedSocialRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        RedSocialResponseDTO response = redSocialService.agregar(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Red social agregada correctamente", response));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<RedSocialResponseDTO>> editar(@PathVariable Integer id,
            @Valid @RequestBody RedSocialRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        RedSocialResponseDTO response = redSocialService.editar(usuario.userId(), id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Red social actualizada correctamente", response));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> darDeBaja(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        redSocialService.darDeBaja(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Red social dada de baja correctamente", null));
    }
}
