package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ClienteEditarPerfilRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ClienteResponseDTO;
import com.bajonea.backend.services.ClienteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/clientes")
@RequiredArgsConstructor
public class ClienteController {

    private final ClienteService clienteService;

    @GetMapping("/perfil")
    public ResponseEntity<ApiResponse<ClienteResponseDTO>> verPerfil(@AuthenticationPrincipal AuthenticatedUser usuario) {
        ClienteResponseDTO response = clienteService.verPerfil(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Perfil obtenido correctamente", response));
    }

    @PutMapping("/perfil")
    public ResponseEntity<ApiResponse<ClienteResponseDTO>> editarPerfil(@Valid @RequestBody ClienteEditarPerfilRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        ClienteResponseDTO response = clienteService.editarPerfil(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Perfil actualizado correctamente", response));
    }
}
