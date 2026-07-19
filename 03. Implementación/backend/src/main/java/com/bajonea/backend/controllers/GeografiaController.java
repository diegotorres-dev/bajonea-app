package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.LocalidadResponseDTO;
import com.bajonea.backend.dto.response.ProvinciaResponseDTO;
import com.bajonea.backend.services.GeografiaService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/geografia")
@RequiredArgsConstructor
public class GeografiaController {

    private final GeografiaService geografiaService;

    @GetMapping("/provincias")
    public ResponseEntity<ApiResponse<List<ProvinciaResponseDTO>>> listarProvincias() {
        List<ProvinciaResponseDTO> provincias = geografiaService.listarProvincias();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Provincias obtenidas correctamente", provincias));
    }

    @GetMapping("/localidades")
    public ResponseEntity<ApiResponse<List<LocalidadResponseDTO>>> listarLocalidades(
            @RequestParam String provinciaId) {
        List<LocalidadResponseDTO> localidades = geografiaService.listarLocalidadesPorProvincia(provinciaId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Localidades obtenidas correctamente", localidades));
    }
}
