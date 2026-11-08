package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.services.ComercioActivoService;
import com.bajonea.backend.services.NotificacionService;
import com.bajonea.backend.services.NotificacionService.PaginaNotificaciones;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notificaciones")
@RequiredArgsConstructor
public class NotificacionController {

    private final NotificacionService notificacionService;

    public static final String HEADER_SIGUIENTE_CURSOR = "X-Siguiente-Cursor";

    /**
     * Una página de avisos (20 por defecto, 50 como máximo), de la más nueva a la más vieja. {@code data} sigue siendo
     * el arreglo de avisos; si hay otra página, el encabezado {@code X-Siguiente-Cursor} trae el valor que se manda como
     * {@code cursor} para pedirla, y si no hay, el encabezado no está.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<NotificacionResponseDTO>>> listar(
            @AuthenticationPrincipal AuthenticatedUser usuario,
            @RequestHeader(value = ComercioActivoService.HEADER_COMERCIO_ID, required = false) String comercioId,
            @RequestParam(required = false) Integer limite, @RequestParam(required = false) String cursor) {
        PaginaNotificaciones pagina = notificacionService.listar(usuario, comercioId, limite, cursor);
        ResponseEntity.BodyBuilder respuesta = ResponseEntity.status(HttpStatus.OK);
        if (pagina.siguienteCursor() != null) {
            respuesta.header(HEADER_SIGUIENTE_CURSOR, pagina.siguienteCursor());
        }
        return respuesta.body(new ApiResponse<>("Notificaciones obtenidas correctamente", pagina.items()));
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
     * Marca como leídas todas las no leídas del usuario sobre el comercio abierto. Compartido: el Dueño y el Empleado
     * {@code ACTIVO} (un Cliente con {@code X-Comercio-Id} se trata como Empleado de ese comercio). Header obligatorio.
     */
    @PutMapping("/leidas")
    public ResponseEntity<ApiResponse<Integer>> marcarLeidasDelComercioActivo(@AuthenticationPrincipal AuthenticatedUser usuario,
            @RequestHeader(value = ComercioActivoService.HEADER_COMERCIO_ID, required = false) String comercioId) {
        int marcadas = notificacionService.marcarLeidasDelComercioActivo(usuario, comercioId);
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Notificaciones del comercio marcadas como leídas", marcadas));
    }

    /**
     * Marca como leídos los avisos personales de quien llama (los que no son de ningún comercio). Ruta propia y
     * explícita: no depende de {@code X-Comercio-Id}, así que olvidar ese encabezado en la ruta del comercio sigue
     * fallando en vez de marcar otra cosa en silencio. No toca los avisos de ningún comercio.
     */
    @PutMapping("/personales/leidas")
    public ResponseEntity<ApiResponse<Integer>> marcarLeidasPersonales(@AuthenticationPrincipal AuthenticatedUser usuario) {
        int marcadas = notificacionService.marcarLeidasPersonales(usuario.userId());
        return ResponseEntity.status(HttpStatus.OK).body(new ApiResponse<>("Notificaciones personales marcadas como leídas", marcadas));
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
