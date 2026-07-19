package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.CambioEstadoProductoRequestDTO;
import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.ImagenProductoResponseDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.services.ProductoService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/productos")
@RequiredArgsConstructor
public class ProductoController {

    private final ProductoService productoService;

    @PostMapping
    public ResponseEntity<ApiResponse<ProductoResponseDTO>> crearProducto(@Valid @RequestBody ProductoRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        ProductoResponseDTO response = productoService.crearProducto(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Producto creado correctamente", response));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductoResponseDTO>> editarProducto(@PathVariable Integer id,
            @Valid @RequestBody ProductoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        ProductoResponseDTO response = productoService.editarProducto(usuario.userId(), id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Producto actualizado correctamente", response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ProductoResponseDTO>>> listarProductosDelComercio(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        List<ProductoResponseDTO> productos = productoService.listarProductosDelComercio(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Productos obtenidos correctamente", productos));
    }

    @PatchMapping("/{id}/estado")
    public ResponseEntity<ApiResponse<ProductoResponseDTO>> cambiarEstado(@PathVariable Integer id,
            @Valid @RequestBody CambioEstadoProductoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        ProductoResponseDTO response = productoService.cambiarEstado(usuario.userId(), id, request.getEstado());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Estado del producto actualizado correctamente", response));
    }

    @PostMapping("/{id}/cloudinary/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaImagen(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        CloudinarySignatureResponseDTO response = productoService.generarFirmaImagen(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PostMapping("/{id}/imagenes")
    public ResponseEntity<ApiResponse<ImagenProductoResponseDTO>> agregarImagen(@PathVariable Integer id,
            @Valid @RequestBody ImagenProductoRequestDTO request, @AuthenticationPrincipal AuthenticatedUser usuario) {
        ImagenProductoResponseDTO response = productoService.agregarImagen(usuario.userId(), id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Imagen agregada correctamente", response));
    }

    @DeleteMapping("/{id}/imagenes/{imagenId}")
    public ResponseEntity<ApiResponse<Void>> eliminarImagen(@PathVariable Integer id, @PathVariable Integer imagenId,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        productoService.eliminarImagen(usuario.userId(), id, imagenId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Imagen eliminada correctamente", null));
    }

    @PatchMapping("/{id}/imagenes/{imagenId}/principal")
    public ResponseEntity<ApiResponse<ImagenProductoResponseDTO>> marcarImagenPrincipal(@PathVariable Integer id,
            @PathVariable Integer imagenId, @AuthenticationPrincipal AuthenticatedUser usuario) {
        ImagenProductoResponseDTO response = productoService.marcarImagenPrincipal(usuario.userId(), id, imagenId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Imagen principal actualizada correctamente", response));
    }
}
