package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.FotoPerfilUsuarioRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.services.UsuarioService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/usuarios")
@RequiredArgsConstructor
public class UsuarioController {

    private final UsuarioService usuarioService;

    @PostMapping("/{id}/foto-perfil/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaFotoPerfil(
            @PathVariable Integer id, @AuthenticationPrincipal AuthenticatedUser usuario) {
        CloudinarySignatureResponseDTO response = usuarioService.generarFirmaFotoPerfil(id, usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PatchMapping("/{id}/foto-perfil")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> actualizarFotoPerfil(
            @PathVariable Integer id, @Valid @RequestBody FotoPerfilUsuarioRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        UsuarioResponseDTO response = usuarioService.actualizarFotoPerfil(id, usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Foto de perfil actualizada correctamente", response));
    }

    @DeleteMapping("/{id}/foto-perfil")
    public ResponseEntity<ApiResponse<UsuarioResponseDTO>> eliminarFotoPerfil(
            @PathVariable Integer id, @AuthenticationPrincipal AuthenticatedUser usuario) {
        UsuarioResponseDTO response = usuarioService.eliminarFotoPerfil(id, usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Foto de perfil eliminada correctamente", response));
    }
}
