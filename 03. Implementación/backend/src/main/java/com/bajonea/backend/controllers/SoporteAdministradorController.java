package com.bajonea.backend.controllers;

import com.bajonea.backend.dto.request.MensajeSoporteRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ConsultaSoporteAdminDetalleResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteAdminResumenResponseDTO;
import com.bajonea.backend.services.SoporteAdminService;
import com.bajonea.backend.services.SoporteAdminService.FiltroBandeja;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Bandeja de Soporte del Administrador. La seguridad ({@code hasRole("ADMINISTRADOR")}) la define el matcher de {@code /administrador/**}. */
@RestController
@RequestMapping("/api/v1/administrador/soporte")
@RequiredArgsConstructor
public class SoporteAdministradorController {

    private final SoporteAdminService soporteAdminService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<ConsultaSoporteAdminResumenResponseDTO>>> listar(
            @RequestParam(required = false) FiltroBandeja estado, @RequestParam(required = false) String email,
            @RequestParam(required = false) Integer limite, @RequestParam(required = false) Integer pagina) {
        return ResponseEntity.ok(new ApiResponse<>("Consultas obtenidas correctamente",
                soporteAdminService.listar(estado, email, limite, pagina)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ConsultaSoporteAdminDetalleResponseDTO>> detalle(@PathVariable Integer id) {
        return ResponseEntity.ok(new ApiResponse<>("Consulta obtenida correctamente", soporteAdminService.detalle(id)));
    }

    @PostMapping("/{id}/mensajes")
    public ResponseEntity<ApiResponse<ConsultaSoporteAdminDetalleResponseDTO>> responder(@PathVariable Integer id,
            @Valid @RequestBody MensajeSoporteRequestDTO request) {
        return ResponseEntity.ok(new ApiResponse<>("Respuesta enviada", soporteAdminService.responder(id, request)));
    }

    @PutMapping("/{id}/cerrar")
    public ResponseEntity<ApiResponse<ConsultaSoporteAdminDetalleResponseDTO>> cerrar(@PathVariable Integer id) {
        return ResponseEntity.ok(new ApiResponse<>("Consulta cerrada", soporteAdminService.cerrar(id)));
    }

    @PostMapping("/{id}/reenviar-email")
    public ResponseEntity<ApiResponse<ConsultaSoporteAdminDetalleResponseDTO>> reenviarEmail(@PathVariable Integer id) {
        ConsultaSoporteAdminDetalleResponseDTO detalle = soporteAdminService.reenviarEmail(id);
        String mensaje = detalle.isEmailPendienteDeReenvio() ? "No se pudo enviar el email. Probá de nuevo." : "Email reenviado";
        return ResponseEntity.ok(new ApiResponse<>(mensaje, detalle));
    }
}
