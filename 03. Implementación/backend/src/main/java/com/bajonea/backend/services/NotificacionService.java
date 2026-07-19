package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.entities.Notificacion;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Punto único de creación de {@code Notificacion} (antes duplicado inline en PedidoService,
 * ProductoService y AdministradorService — ver docs/DECISIONES.md, 2026-07-18) + listado y
 * marcado de lectura para el usuario dueño, consumidos por polling (Fase 12).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class NotificacionService {

    private final NotificacionRepository notificacionRepository;
    private final UsuarioRepository usuarioRepository;

    public void crear(Integer usuarioId, String mensaje) {
        String mensajeTruncado = mensaje.length() > 500 ? mensaje.substring(0, 500) : mensaje;
        Notificacion notificacion = Notificacion.builder()
                .usuario(usuarioRepository.getReferenceById(usuarioId))
                .mensaje(mensajeTruncado)
                .leida(false)
                .fechaCreacion(LocalDateTime.now())
                .build();
        notificacionRepository.save(notificacion);
    }

    public List<NotificacionResponseDTO> listar(Integer usuarioId) {
        return notificacionRepository.findByUsuarioIdOrderByFechaCreacionDesc(usuarioId).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public NotificacionResponseDTO marcarLeida(Integer usuarioId, Integer notificacionId) {
        Notificacion notificacion = obtenerNotificacionDelUsuario(usuarioId, notificacionId);
        notificacion.setLeida(true);
        notificacionRepository.save(notificacion);
        return aResponseDTO(notificacion);
    }

    public long contarNoLeidas(Integer usuarioId) {
        return notificacionRepository.countByUsuarioIdAndLeidaFalse(usuarioId);
    }

    private Notificacion obtenerNotificacionDelUsuario(Integer usuarioId, Integer notificacionId) {
        Notificacion notificacion = notificacionRepository.findById(notificacionId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Notificación no encontrada"));
        if (!notificacion.getUsuario().getId().equals(usuarioId)) {
            throw new RecursoNoEncontradoException("Notificación no encontrada");
        }
        return notificacion;
    }

    private NotificacionResponseDTO aResponseDTO(Notificacion notificacion) {
        return new NotificacionResponseDTO(
                notificacion.getId(),
                notificacion.getMensaje(),
                notificacion.isLeida(),
                notificacion.getFechaCreacion());
    }
}
