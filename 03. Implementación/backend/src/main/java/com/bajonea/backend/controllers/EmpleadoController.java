package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.MiComercioEmpleadoResponseDTO;
import com.bajonea.backend.services.MisComerciosEmpleadoService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rutas propias del Empleado (rol Empleado, tramo E2). El Empleado es un Cliente con relaciones activas con
 * comercios: estas rutas actúan sobre el usuario autenticado, no sobre un comercio, así que no declaran
 * {@code ComercioActivo} e ignoran {@code X-Comercio-Id}. Acceso solo con rol {@code CLIENTE}; el Dueño y el
 * Administrador reciben {@code 403}.
 */
@RestController
@RequestMapping("/api/v1/empleados")
@RequiredArgsConstructor
public class EmpleadoController {

    private final MisComerciosEmpleadoService misComerciosEmpleadoService;

    @GetMapping("/mis-comercios")
    public ResponseEntity<ApiResponse<List<MiComercioEmpleadoResponseDTO>>> misComercios(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        List<MiComercioEmpleadoResponseDTO> comercios = misComerciosEmpleadoService.listar(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercios obtenidos correctamente", comercios));
    }
}
