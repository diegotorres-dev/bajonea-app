package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.AccesoComercioEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.MiComercioEmpleadoResponseDTO;
import com.bajonea.backend.services.AccesoEmpleadoService;
import com.bajonea.backend.services.GestionMiembroEquipoService;
import com.bajonea.backend.services.GestionMiembroEquipoService.ResultadoRenuncia;
import com.bajonea.backend.services.MisComerciosEmpleadoService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
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
    private final GestionMiembroEquipoService gestionMiembroEquipoService;
    private final AccesoEmpleadoService accesoEmpleadoService;

    @GetMapping("/mis-comercios")
    public ResponseEntity<ApiResponse<List<MiComercioEmpleadoResponseDTO>>> misComercios(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        List<MiComercioEmpleadoResponseDTO> comercios = misComerciosEmpleadoService.listar(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Comercios obtenidos correctamente", comercios));
    }

    /**
     * El Empleado deja de trabajar en el comercio. Idempotente: repetirla (o hacerla sobre una relación que ya está
     * inactiva) responde {@code 200} sin escribir nada. Sin relación con ese comercio, el mismo {@code 404
     * COMERCIO_NO_DISPONIBLE} del resolver de comercio activo.
     */
    @PutMapping("/comercios/{comercioId}/renunciar")
    public ResponseEntity<ApiResponse<Void>> renunciar(@AuthenticationPrincipal AuthenticatedUser usuario,
            @PathVariable Integer comercioId) {
        ResultadoRenuncia resultado = gestionMiembroEquipoService.renunciar(usuario.userId(), comercioId);
        String mensaje = resultado.huboCambio() ? "Dejaste de trabajar en el comercio" : "Ya habías dejado de trabajar en este comercio";
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>(mensaje, null));
    }

    /**
     * Cómo está la relación propia con el comercio (activa o inactiva, y por qué se dio de baja) y si el comercio es
     * accesible para un Empleado. Solo lectura. Sin relación, el mismo {@code 404 COMERCIO_NO_DISPONIBLE}.
     */
    @GetMapping("/comercios/{comercioId}/acceso")
    public ResponseEntity<ApiResponse<AccesoComercioEmpleadoResponseDTO>> acceso(
            @AuthenticationPrincipal AuthenticatedUser usuario, @PathVariable Integer comercioId) {
        AccesoComercioEmpleadoResponseDTO acceso = accesoEmpleadoService.consultar(usuario.userId(), comercioId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Acceso obtenido correctamente", acceso));
    }
}
