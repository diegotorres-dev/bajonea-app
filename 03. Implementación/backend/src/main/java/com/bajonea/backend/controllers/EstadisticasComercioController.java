package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.EstadisticasComercioResponseDTO;
import com.bajonea.backend.services.EstadisticasComercioService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/comercios/estadisticas")
@RequiredArgsConstructor
public class EstadisticasComercioController {

    private final EstadisticasComercioService estadisticasComercioService;

    /**
     * Estadísticas del comercio activo entre {@code desde} y {@code hasta} (AAAA-MM-DD, ambos inclusive, hasta 92 días),
     * agrupadas por {@code DIA} (por defecto) o {@code TURNO}. Exclusivo del Dueño: no está en la lista de rutas
     * delegables al Empleado.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<EstadisticasComercioResponseDTO>> obtener(ComercioActivo comercio,
            @RequestParam(required = false) String desde, @RequestParam(required = false) String hasta,
            @RequestParam(required = false) String agrupar) {
        EstadisticasComercioResponseDTO response = estadisticasComercioService.obtener(comercio.comercioId(), desde, hasta, agrupar);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Estadísticas obtenidas correctamente", response));
    }
}
