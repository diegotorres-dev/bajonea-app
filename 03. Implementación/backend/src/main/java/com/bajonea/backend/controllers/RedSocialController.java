package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.RedSocialResponseDTO;
import com.bajonea.backend.services.RedSocialService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<ApiResponse<List<RedSocialResponseDTO>>> listar(ComercioActivo comercio) {
        List<RedSocialResponseDTO> response = redSocialService.listarActivas(comercio.comercioId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Redes sociales obtenidas correctamente", response));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<RedSocialResponseDTO>> agregar(@Valid @RequestBody RedSocialRequestDTO request,
            ComercioActivo comercio) {
        RedSocialResponseDTO response = redSocialService.agregar(comercio.comercioId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Red social agregada correctamente", response));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<RedSocialResponseDTO>> editar(@PathVariable Integer id,
            @Valid @RequestBody RedSocialRequestDTO request, ComercioActivo comercio) {
        RedSocialResponseDTO response = redSocialService.editar(comercio.comercioId(), id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Red social actualizada correctamente", response));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> darDeBaja(@PathVariable Integer id,
            ComercioActivo comercio) {
        redSocialService.darDeBaja(comercio.comercioId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Red social dada de baja correctamente", null));
    }
}
