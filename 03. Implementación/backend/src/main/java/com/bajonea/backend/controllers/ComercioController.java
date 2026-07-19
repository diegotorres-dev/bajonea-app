package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.dto.request.FotoPerfilComercioRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.services.ComercioService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/comercios")
@RequiredArgsConstructor
public class ComercioController {

    private final ComercioService comercioService;

    @GetMapping("/perfil")
    public ResponseEntity<ApiResponse<ComercioResponseDTO>> verPerfil(@AuthenticationPrincipal AuthenticatedUser usuario) {
        ComercioResponseDTO response = comercioService.verPerfil(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Perfil obtenido correctamente", response));
    }

    @PutMapping("/perfil")
    public ResponseEntity<ApiResponse<ComercioResponseDTO>> editarPerfil(@Valid @RequestBody ComercioPerfilRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        ComercioResponseDTO response = comercioService.editarPerfil(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Perfil actualizado correctamente", response));
    }

    @PostMapping("/perfil/foto/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaFotoPerfil(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        CloudinarySignatureResponseDTO response = comercioService.generarFirmaFotoPerfil(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PutMapping("/perfil/foto")
    public ResponseEntity<ApiResponse<ComercioResponseDTO>> actualizarFotoPerfil(
            @Valid @RequestBody FotoPerfilComercioRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        ComercioResponseDTO response = comercioService.actualizarFotoPerfil(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Foto de perfil actualizada correctamente", response));
    }
}
