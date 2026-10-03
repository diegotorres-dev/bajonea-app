package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.services.ComercioActivoService;
import com.bajonea.backend.services.NotificacionService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notificaciones")
@RequiredArgsConstructor
public class NotificacionController {

    private final NotificacionService notificacionService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<NotificacionResponseDTO>>> listar(
            @AuthenticationPrincipal AuthenticatedUser usuario,
            @RequestHeader(value = ComercioActivoService.HEADER_COMERCIO_ID, required = false) String comercioId) {
        List<NotificacionResponseDTO> notificaciones = notificacionService.listar(usuario, comercioId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Notificaciones obtenidas correctamente", notificaciones));
    }

    @PutMapping("/{id}/leida")
    public ResponseEntity<ApiResponse<NotificacionResponseDTO>> marcarLeida(@PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        NotificacionResponseDTO response = notificacionService.marcarLeida(usuario.userId(), id);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Notificación marcada como leída", response));
    }

    @GetMapping("/no-leidas/contador")
    public ResponseEntity<ApiResponse<Long>> contarNoLeidas(@AuthenticationPrincipal AuthenticatedUser usuario,
            @RequestHeader(value = ComercioActivoService.HEADER_COMERCIO_ID, required = false) String comercioId) {
        long contador = notificacionService.contarNoLeidas(usuario, comercioId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Contador de notificaciones no leídas obtenido correctamente", contador));
    }

    /**
     * Solo Dueño ({@code SecurityConfig}). El comercio viene en la ruta: no usa {@code X-Comercio-Id}.
     */
    @PutMapping("/comercio/{comercioId}/leidas")
    public ResponseEntity<ApiResponse<Integer>> marcarLeidasDelComercio(@PathVariable Integer comercioId,
            @AuthenticationPrincipal AuthenticatedUser usuario) {
        int marcadas = notificacionService.marcarLeidasDelComercio(usuario.userId(), comercioId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Notificaciones del comercio marcadas como leídas", marcadas));
    }
}
