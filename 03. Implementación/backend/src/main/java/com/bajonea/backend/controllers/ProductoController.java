package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.CambioEstadoProductoRequestDTO;
import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.dto.request.OrdenImagenRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.request.UrlImagenRequestDTO;
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
            ComercioActivo comercio) {
        ProductoResponseDTO response = productoService.crearProducto(comercio.comercioId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Producto creado correctamente", response));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductoResponseDTO>> editarProducto(@PathVariable Integer id,
            @Valid @RequestBody ProductoRequestDTO request, ComercioActivo comercio) {
        ProductoResponseDTO response = productoService.editarProducto(comercio.comercioId(), id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Producto actualizado correctamente", response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ProductoResponseDTO>>> listarProductosDelComercio(
            ComercioActivo comercio) {
        List<ProductoResponseDTO> productos = productoService.listarProductosDelComercio(comercio.comercioId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Productos obtenidos correctamente", productos));
    }

    @PatchMapping("/{id}/estado")
    public ResponseEntity<ApiResponse<ProductoResponseDTO>> cambiarEstado(@PathVariable Integer id,
            @Valid @RequestBody CambioEstadoProductoRequestDTO request, ComercioActivo comercio) {
        ProductoResponseDTO response = productoService.cambiarEstado(comercio.comercioId(), id, request.getEstado());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Estado del producto actualizado correctamente", response));
    }

    @PostMapping("/{id}/cloudinary/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaImagen(@PathVariable Integer id,
            ComercioActivo comercio) {
        CloudinarySignatureResponseDTO response = productoService.generarFirmaImagen(comercio.comercioId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PostMapping("/{id}/imagenes")
    public ResponseEntity<ApiResponse<ImagenProductoResponseDTO>> agregarImagen(@PathVariable Integer id,
            @Valid @RequestBody ImagenProductoRequestDTO request, ComercioActivo comercio) {
        ImagenProductoResponseDTO response = productoService.agregarImagen(comercio.comercioId(), id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Imagen agregada correctamente", response));
    }

    @DeleteMapping("/{id}/imagenes/{imagenId}")
    public ResponseEntity<ApiResponse<Void>> eliminarImagen(@PathVariable Integer id, @PathVariable Integer imagenId,
            ComercioActivo comercio) {
        productoService.eliminarImagen(comercio.comercioId(), id, imagenId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Imagen eliminada correctamente", null));
    }

    @PatchMapping("/{id}/imagenes/{imagenId}/orden")
    public ResponseEntity<ApiResponse<ImagenProductoResponseDTO>> reordenarImagen(@PathVariable Integer id,
            @PathVariable Integer imagenId, @Valid @RequestBody OrdenImagenRequestDTO request,
            ComercioActivo comercio) {
        ImagenProductoResponseDTO response = productoService.reordenarImagen(comercio.comercioId(), id, imagenId, request.getOrden());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Orden de la imagen actualizado correctamente", response));
    }

    @PostMapping("/{id}/imagenes/{imagenId}/recorte/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaRecorteImagen(@PathVariable Integer id,
            @PathVariable Integer imagenId, ComercioActivo comercio) {
        CloudinarySignatureResponseDTO response = productoService.generarFirmaRecorteImagen(comercio.comercioId(), id, imagenId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PatchMapping("/{id}/imagenes/{imagenId}/url")
    public ResponseEntity<ApiResponse<ImagenProductoResponseDTO>> actualizarUrlImagen(@PathVariable Integer id,
            @PathVariable Integer imagenId, @Valid @RequestBody UrlImagenRequestDTO request,
            ComercioActivo comercio) {
        ImagenProductoResponseDTO response = productoService.actualizarUrlImagen(comercio.comercioId(), id, imagenId, request.getUrl());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Imagen actualizada correctamente", response));
    }
}
