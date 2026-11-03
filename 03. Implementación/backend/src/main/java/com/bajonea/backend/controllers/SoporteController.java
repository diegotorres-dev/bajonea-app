package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.request.AccesoConsultaSoporteRequestDTO;
import com.bajonea.backend.dto.request.CrearConsultaSoporteRequestDTO;
import com.bajonea.backend.dto.request.CrearConsultaSoporteSesionRequestDTO;
import com.bajonea.backend.dto.request.MensajeSoporteRequestDTO;
import com.bajonea.backend.dto.request.ReenviarCodigosSoporteRequestDTO;
import com.bajonea.backend.dto.request.ResponderConsultaSoportePublicaRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteResumenResponseDTO;
import com.bajonea.backend.dto.response.ContadorSoporteResponseDTO;
import com.bajonea.backend.services.SoporteService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultas a Soporte. Las rutas bajo {@code /publico} son públicas (el acceso es el email más el código de la consulta,
 * con límite de intentos); el resto exige sesión de cualquier rol, también con la cuenta suspendida. Una consulta ajena
 * responde siempre {@code 404}.
 */
@RestController
@RequestMapping("/api/v1/soporte")
@RequiredArgsConstructor
public class SoporteController {

    private final SoporteService soporteService;

    @PostMapping("/publico/consultas")
    public ResponseEntity<ApiResponse<ConsultaSoporteCreadaResponseDTO>> crearSinSesion(
            @Valid @RequestBody CrearConsultaSoporteRequestDTO request, HttpServletRequest httpRequest) {
        ConsultaSoporteCreadaResponseDTO response = soporteService.crearSinSesion(request, httpRequest.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Recibimos tu consulta", response));
    }

    @PostMapping("/publico/consultas/ver")
    public ResponseEntity<ApiResponse<ConsultaSoporteResponseDTO>> verSinSesion(
            @Valid @RequestBody AccesoConsultaSoporteRequestDTO request, HttpServletRequest httpRequest) {
        ConsultaSoporteResponseDTO response = soporteService.verSinSesion(request, httpRequest.getRemoteAddr());
        return ResponseEntity.ok(new ApiResponse<>("Consulta obtenida correctamente", response));
    }

    @PostMapping("/publico/consultas/responder")
    public ResponseEntity<ApiResponse<ConsultaSoporteResponseDTO>> responderSinSesion(
            @Valid @RequestBody ResponderConsultaSoportePublicaRequestDTO request, HttpServletRequest httpRequest) {
        ConsultaSoporteResponseDTO response = soporteService.responderSinSesion(request, httpRequest.getRemoteAddr());
        return ResponseEntity.ok(new ApiResponse<>("Enviamos tu mensaje", response));
    }

    @PostMapping("/publico/codigos/reenviar")
    public ResponseEntity<ApiResponse<Void>> reenviarCodigos(@Valid @RequestBody ReenviarCodigosSoporteRequestDTO request,
            HttpServletRequest httpRequest) {
        String mensaje = soporteService.reenviarCodigos(request, httpRequest.getRemoteAddr());
        return ResponseEntity.ok(new ApiResponse<>(mensaje, null));
    }

    @PostMapping("/consultas")
    public ResponseEntity<ApiResponse<ConsultaSoporteCreadaResponseDTO>> crearConSesion(
            @AuthenticationPrincipal AuthenticatedUser usuario, @Valid @RequestBody CrearConsultaSoporteSesionRequestDTO request,
            HttpServletRequest httpRequest) {
        ConsultaSoporteCreadaResponseDTO response = soporteService.crearConSesion(usuario.userId(), request,
                httpRequest.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.CREATED).body(new ApiResponse<>("Recibimos tu consulta", response));
    }

    @GetMapping("/mis-consultas")
    public ResponseEntity<ApiResponse<List<ConsultaSoporteResumenResponseDTO>>> misConsultas(
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        return ResponseEntity.ok(new ApiResponse<>("Consultas obtenidas correctamente",
                soporteService.misConsultas(usuario.userId())));
    }

    @GetMapping("/mis-consultas/contador")
    public ResponseEntity<ApiResponse<ContadorSoporteResponseDTO>> contador(@AuthenticationPrincipal AuthenticatedUser usuario) {
        return ResponseEntity.ok(new ApiResponse<>("Contador obtenido correctamente", soporteService.contador(usuario.userId())));
    }

    @GetMapping("/mis-consultas/{id}")
    public ResponseEntity<ApiResponse<ConsultaSoporteResponseDTO>> miConsulta(@AuthenticationPrincipal AuthenticatedUser usuario,
            @PathVariable Integer id) {
        return ResponseEntity.ok(new ApiResponse<>("Consulta obtenida correctamente",
                soporteService.miConsulta(usuario.userId(), id)));
    }

    @PostMapping("/mis-consultas/{id}/mensajes")
    public ResponseEntity<ApiResponse<ConsultaSoporteResponseDTO>> responder(@AuthenticationPrincipal AuthenticatedUser usuario,
            @PathVariable Integer id, @Valid @RequestBody MensajeSoporteRequestDTO request) {
        return ResponseEntity.ok(new ApiResponse<>("Enviamos tu mensaje",
                soporteService.responderConSesion(usuario.userId(), id, request)));
    }
}
