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
/**
 * Rutas de operación del Comercio sobre su catálogo: el Dueño y el Empleado activo las usan por igual (todas figuran
 * en {@code DelegacionEmpleado}). {@code ComercioActivo} va siempre como primer parámetro para que el resolver
 * (relación activa, comercio disponible) corra antes de leer y validar el cuerpo.
 */
public class ProductoController {

    private final ProductoService productoService;

    @PostMapping
    public ResponseEntity<ApiResponse<ProductoResponseDTO>> crearProducto(ComercioActivo comercio,
            @Valid @RequestBody ProductoRequestDTO request) {
        ProductoResponseDTO response = productoService.crearProducto(comercio, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Producto creado correctamente", response));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductoResponseDTO>> editarProducto(ComercioActivo comercio,
            @PathVariable Integer id, @Valid @RequestBody ProductoRequestDTO request) {
        ProductoResponseDTO response = productoService.editarProducto(comercio, id, request);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Producto actualizado correctamente", response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ProductoResponseDTO>>> listarProductosDelComercio(
            ComercioActivo comercio) {
        List<ProductoResponseDTO> productos = productoService.listarProductosDelComercio(comercio.comercioId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Productos obtenidos correctamente", productos));
    }

    @PatchMapping("/{id}/estado")
    public ResponseEntity<ApiResponse<ProductoResponseDTO>> cambiarEstado(ComercioActivo comercio,
            @PathVariable Integer id, @Valid @RequestBody CambioEstadoProductoRequestDTO request) {
        ProductoResponseDTO response = productoService.cambiarEstado(comercio, id, request.getEstado());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Estado del producto actualizado correctamente", response));
    }

    @PostMapping("/{id}/cloudinary/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaImagen(ComercioActivo comercio,
            @PathVariable Integer id) {
        CloudinarySignatureResponseDTO response = productoService.generarFirmaImagen(comercio, id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PostMapping("/{id}/imagenes")
    public ResponseEntity<ApiResponse<ImagenProductoResponseDTO>> agregarImagen(ComercioActivo comercio,
            @PathVariable Integer id, @Valid @RequestBody ImagenProductoRequestDTO request) {
        ImagenProductoResponseDTO response = productoService.agregarImagen(comercio, id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Imagen agregada correctamente", response));
    }

    @DeleteMapping("/{id}/imagenes/{imagenId}")
    public ResponseEntity<ApiResponse<Void>> eliminarImagen(ComercioActivo comercio,
            @PathVariable Integer id, @PathVariable Integer imagenId) {
        productoService.eliminarImagen(comercio, id, imagenId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Imagen eliminada correctamente", null));
    }

    @PatchMapping("/{id}/imagenes/{imagenId}/orden")
    public ResponseEntity<ApiResponse<ImagenProductoResponseDTO>> reordenarImagen(ComercioActivo comercio,
            @PathVariable Integer id, @PathVariable Integer imagenId, @Valid @RequestBody OrdenImagenRequestDTO request) {
        ImagenProductoResponseDTO response = productoService.reordenarImagen(comercio, id, imagenId, request.getOrden());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Orden de la imagen actualizado correctamente", response));
    }

    @PostMapping("/{id}/imagenes/{imagenId}/recorte/firma")
    public ResponseEntity<ApiResponse<CloudinarySignatureResponseDTO>> generarFirmaRecorteImagen(ComercioActivo comercio,
            @PathVariable Integer id, @PathVariable Integer imagenId) {
        CloudinarySignatureResponseDTO response = productoService.generarFirmaRecorteImagen(comercio, id, imagenId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Firma generada correctamente", response));
    }

    @PatchMapping("/{id}/imagenes/{imagenId}/url")
    public ResponseEntity<ApiResponse<ImagenProductoResponseDTO>> actualizarUrlImagen(ComercioActivo comercio,
            @PathVariable Integer id, @PathVariable Integer imagenId, @Valid @RequestBody UrlImagenRequestDTO request) {
        ImagenProductoResponseDTO response = productoService.actualizarUrlImagen(comercio, id, imagenId, request.getUrl());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Imagen actualizada correctamente", response));
    }
}
