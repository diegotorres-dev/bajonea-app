package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.request.TagRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.TagResponseDTO;
import com.bajonea.backend.services.TagService;
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
@RequestMapping("/api/v1/tags")
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    @PostMapping
    public ResponseEntity<ApiResponse<TagResponseDTO>> crear(@Valid @RequestBody TagRequestDTO request) {
        TagResponseDTO response = tagService.crear(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Tag creado correctamente", response));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<TagResponseDTO>> editar(@PathVariable Integer id,
            @Valid @RequestBody TagRequestDTO request) {
        TagResponseDTO response = tagService.editar(id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Tag actualizado correctamente", response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<TagResponseDTO>>> listar() {
        List<TagResponseDTO> tags = tagService.listar();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Tags obtenidos correctamente", tags));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> baja(@PathVariable Integer id) {
        tagService.baja(id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Tag dado de baja correctamente", null));
    }

    @PutMapping("/{id}/reactivar")
    public ResponseEntity<ApiResponse<TagResponseDTO>> reactivar(@PathVariable Integer id) {
        TagResponseDTO response = tagService.reactivar(id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Tag reactivado correctamente", response));
    }
}
