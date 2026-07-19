package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.request.CategoriaRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.CategoriaResponseDTO;
import com.bajonea.backend.services.CategoriaService;
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
@RequestMapping("/api/v1/categorias")
@RequiredArgsConstructor
public class CategoriaController {

    private final CategoriaService categoriaService;

    @PostMapping
    public ResponseEntity<ApiResponse<CategoriaResponseDTO>> crear(@Valid @RequestBody CategoriaRequestDTO request) {
        CategoriaResponseDTO response = categoriaService.crear(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Categoría creada correctamente", response));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<CategoriaResponseDTO>> editar(@PathVariable Integer id,
            @Valid @RequestBody CategoriaRequestDTO request) {
        CategoriaResponseDTO response = categoriaService.editar(id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Categoría actualizada correctamente", response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<CategoriaResponseDTO>>> listar() {
        List<CategoriaResponseDTO> categorias = categoriaService.listar();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Categorías obtenidas correctamente", categorias));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> baja(@PathVariable Integer id) {
        categoriaService.baja(id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Categoría dada de baja correctamente", null));
    }

    @PutMapping("/{id}/reactivar")
    public ResponseEntity<ApiResponse<CategoriaResponseDTO>> reactivar(@PathVariable Integer id) {
        CategoriaResponseDTO response = categoriaService.reactivar(id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Categoría reactivada correctamente", response));
    }
}
