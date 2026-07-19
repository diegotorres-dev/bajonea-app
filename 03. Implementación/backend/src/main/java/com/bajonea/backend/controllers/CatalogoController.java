package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.services.CatalogoService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalogo")
@RequiredArgsConstructor
public class CatalogoController {

    private final CatalogoService catalogoService;

    @GetMapping("/comercios")
    public ResponseEntity<ApiResponse<List<ComercioResponseDTO>>> listarComercios() {
        List<ComercioResponseDTO> comercios = catalogoService.listarComerciosAprobados();
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercios obtenidos correctamente", comercios));
    }

    @GetMapping("/comercios/{id}/productos")
    public ResponseEntity<ApiResponse<List<ProductoResponseDTO>>> listarProductosDelComercio(@PathVariable Integer id,
            @RequestParam(required = false) Integer categoriaId, @RequestParam(required = false) Integer tagId) {
        List<ProductoResponseDTO> productos = catalogoService.listarProductosDelComercio(id, categoriaId, tagId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Productos obtenidos correctamente", productos));
    }
}
