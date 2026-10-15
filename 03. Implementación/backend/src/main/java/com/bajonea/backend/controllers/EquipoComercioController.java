package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.InvitarEmpleadoRequestDTO;
import com.bajonea.backend.dto.response.ActividadComercioResponseDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.EquipoComercioResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoResponseDTO;
import com.bajonea.backend.services.ActividadComercioService;
import com.bajonea.backend.services.InvitacionEmpleadoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Equipo del comercio activo, para el Dueño: ver miembros e invitaciones, invitar, reenviar y cancelar. Todas
 * las rutas declaran {@link ComercioActivo} (header {@code X-Comercio-Id} obligatorio) y quedan bajo el
 * matcher {@code /api/v1/comercios/**} de {@code SecurityConfig}, exclusivo del rol Dueño.
 */
@RestController
@RequestMapping("/api/v1/comercios/equipo")
@RequiredArgsConstructor
public class EquipoComercioController {

    private final InvitacionEmpleadoService invitacionEmpleadoService;
    private final ActividadComercioService actividadComercioService;

    @GetMapping
    public ResponseEntity<ApiResponse<EquipoComercioResponseDTO>> verEquipo(ComercioActivo comercio) {
        EquipoComercioResponseDTO response = invitacionEmpleadoService.listarEquipo(comercio);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Equipo obtenido correctamente", response));
    }

    /**
     * Actividad del comercio (ediciones, acciones sobre pedidos y cierres), de la más nueva a la más vieja, de a
     * {@code limite} filas (30 por defecto, 100 como máximo). Para pedir la página siguiente se manda el
     * {@code siguienteCursor} de la anterior como {@code cursor}. {@code fuente} (opcional: PEDIDO, EDICION o CIERRE)
     * limita la lista a una de las tres. Solo el Dueño.
     */
    @GetMapping("/actividad")
    public ResponseEntity<ApiResponse<ActividadComercioResponseDTO>> verActividad(ComercioActivo comercio,
            @RequestParam(required = false) Integer limite, @RequestParam(required = false) String cursor,
            @RequestParam(required = false) String fuente) {
        ActividadComercioResponseDTO response = actividadComercioService.listar(comercio, limite, cursor, fuente);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Actividad obtenida correctamente", response));
    }

    @PostMapping("/invitaciones")
    public ResponseEntity<ApiResponse<InvitacionEmpleadoResponseDTO>> invitar(ComercioActivo comercio,
            @Valid @RequestBody InvitarEmpleadoRequestDTO request) {
        InvitacionEmpleadoResponseDTO response = invitacionEmpleadoService.invitar(comercio, request.getEmail());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ApiResponse<>("Invitación enviada a " + response.getEmail(), response));
    }

    @PostMapping("/invitaciones/{invitacionId}/reenviar")
    public ResponseEntity<ApiResponse<InvitacionEmpleadoResponseDTO>> reenviar(ComercioActivo comercio,
            @PathVariable Integer invitacionId) {
        InvitacionEmpleadoResponseDTO response = invitacionEmpleadoService.reenviar(comercio, invitacionId);
        return ResponseEntity.status(HttpStatus.OK)
                .body(new ApiResponse<>("Invitación reenviada a " + response.getEmail(), response));
    }

    @PutMapping("/invitaciones/{invitacionId}/cancelar")
    public ResponseEntity<ApiResponse<InvitacionEmpleadoResponseDTO>> cancelar(ComercioActivo comercio,
            @PathVariable Integer invitacionId) {
        InvitacionEmpleadoResponseDTO response = invitacionEmpleadoService.cancelar(comercio, invitacionId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Invitación cancelada", response));
    }
}
