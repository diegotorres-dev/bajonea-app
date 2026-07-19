package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.ActualizarCantidadItemCarritoRequestDTO;
import com.bajonea.backend.dto.request.ItemCarritoRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.CarritoResponseDTO;
import com.bajonea.backend.services.CarritoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/carrito")
@RequiredArgsConstructor
public class CarritoController {

    private final CarritoService carritoService;

    @GetMapping
    public ResponseEntity<ApiResponse<CarritoResponseDTO>> verCarrito(@AuthenticationPrincipal AuthenticatedUser usuario) {
        CarritoResponseDTO response = carritoService.verCarrito(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Carrito obtenido correctamente", response));
    }

    @PostMapping("/items")
    public ResponseEntity<ApiResponse<CarritoResponseDTO>> agregarItem(@Valid @RequestBody ItemCarritoRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        CarritoResponseDTO response = carritoService.agregarItem(usuario.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Producto agregado al carrito", response));
    }

    @PutMapping("/items/{id}")
    public ResponseEntity<ApiResponse<CarritoResponseDTO>> actualizarCantidad(@PathVariable Integer id,
            @Valid @RequestBody ActualizarCantidadItemCarritoRequestDTO request,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        CarritoResponseDTO response = carritoService.actualizarCantidad(usuario.userId(), id, request.getCantidad());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Cantidad actualizada correctamente", response));
    }

    @DeleteMapping("/items/{id}")
    public ResponseEntity<ApiResponse<CarritoResponseDTO>> eliminarItem(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        CarritoResponseDTO response = carritoService.eliminarItem(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Ítem eliminado del carrito", response));
    }

    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> vaciarCarrito(@AuthenticationPrincipal AuthenticatedUser usuario) {
        carritoService.vaciarCarrito(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Carrito vaciado correctamente", null));
    }
}
