package com.bajonea.backend.services;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.entities.Notificacion;
import com.bajonea.backend.enums.CanalNotificacion;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
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
    private final ComercioRepository comercioRepository;
    private final ComercioActivoService comercioActivoService;

    public void crear(Integer usuarioId, String mensaje, TipoNotificacion tipo) {
        crear(usuarioId, mensaje, tipo, null, null);
    }

    public void crear(Integer usuarioId, String mensaje, TipoNotificacion tipo,
            TipoEntidadNotificacion entidadTipo, Integer entidadId) {
        String mensajeTruncado = mensaje.length() > 500 ? mensaje.substring(0, 500) : mensaje;
        Notificacion notificacion = Notificacion.builder()
                .usuario(usuarioRepository.getReferenceById(usuarioId))
                .tipo(tipo)
                .mensaje(mensajeTruncado)
                .leida(false)
                .fechaCreacion(LocalDateTime.now())
                .canal(CanalNotificacion.PUSH)
                .estado(EstadoEnvioNotificacion.PENDIENTE)
                .entidadTipo(entidadTipo)
                .entidadId(entidadId)
                .build();
        notificacionRepository.save(notificacion);
    }

    /**
     * Para el Dueño lista solo las notificaciones del comercio activo (header {@code X-Comercio-Id}, obligatorio
     * para el Dueño); para el Cliente y el resto de los roles lista todas, ignorando el header.
     */
    public List<NotificacionResponseDTO> listar(AuthenticatedUser usuario, String headerComercioId) {
        Optional<ComercioActivo> comercio = comercioActivoService.resolverSiCorresponde(usuario, headerComercioId);
        List<Notificacion> notificaciones = comercio.isPresent()
                ? notificacionRepository.findByUsuarioIdAndComercioId(usuario.userId(), comercio.get().comercioId())
                : notificacionRepository.findByUsuarioIdOrderByFechaCreacionDesc(usuario.userId());
        return notificaciones.stream().map(this::aResponseDTO).toList();
    }

    public NotificacionResponseDTO marcarLeida(Integer usuarioId, Integer notificacionId) {
        Notificacion notificacion = obtenerNotificacionDelUsuario(usuarioId, notificacionId);
        notificacion.setLeida(true);
        notificacionRepository.save(notificacion);
        return aResponseDTO(notificacion);
    }

    public long contarNoLeidas(AuthenticatedUser usuario, String headerComercioId) {
        Optional<ComercioActivo> comercio = comercioActivoService.resolverSiCorresponde(usuario, headerComercioId);
        return comercio.isPresent()
                ? notificacionRepository.countNoLeidasByUsuarioIdAndComercioId(usuario.userId(), comercio.get().comercioId())
                : notificacionRepository.countByUsuarioIdAndLeidaFalse(usuario.userId());
    }

    /**
     * Marca como leídas todas las notificaciones no leídas del Dueño que pertenecen al comercio de la ruta,
     * y devuelve cuántas cambiaron. Si el comercio no es del Dueño, {@code 404} (el mismo que un comercio
     * inexistente). No exige que el comercio esté operativo: lo usan las pantallas de estado (pendiente,
     * rechazado, rechazo definitivo). Idempotente: repetirlo devuelve {@code 0}.
     */
    public int marcarLeidasDelComercio(Integer duenoId, Integer comercioId) {
        comercioRepository.findByIdAndDuenoId(comercioId, duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return notificacionRepository.marcarLeidasByUsuarioIdAndComercioId(duenoId, comercioId);
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
                notificacion.getFechaCreacion(),
                notificacion.getEntidadTipo(),
                notificacion.getEntidadId());
    }
}
