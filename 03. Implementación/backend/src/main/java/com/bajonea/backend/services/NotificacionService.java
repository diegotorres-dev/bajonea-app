package com.bajonea.backend.services;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.entities.Notificacion;
import com.bajonea.backend.enums.AudienciaNotificacion;
import com.bajonea.backend.enums.CanalNotificacion;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Punto único de creación de {@code Notificacion} + listado y marcado de lectura, consumidos por polling.
 * <p>
 * Cada aviso es una copia por destinatario, con su propio estado de lectura. Los avisos del comercio llevan
 * {@code comercio_id} ({@link #crearParaDueno}, {@link #crearParaEquipo}) y se ven solo con ese comercio abierto
 * ({@code X-Comercio-Id}); los personales del Cliente no lo llevan ({@link #crearParaCliente}) y se ven sin header.
 * Cada método de creación exige que la {@link AudienciaNotificacion} del tipo sea compatible: así un tipo nunca
 * llega por un camino que no le corresponde.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class NotificacionService {

    private static final int LOTE_MARCADO = 500;

    private final NotificacionRepository notificacionRepository;
    private final UsuarioRepository usuarioRepository;
    private final ComercioRepository comercioRepository;
    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final ComercioActivoService comercioActivoService;
    private final Clock clock;

    public void crearParaCliente(Integer usuarioId, String mensaje, TipoNotificacion tipo) {
        crearParaCliente(usuarioId, mensaje, tipo, null, null);
    }

    public void crearParaCliente(Integer usuarioId, String mensaje, TipoNotificacion tipo,
            TipoEntidadNotificacion entidadTipo, Integer entidadId) {
        exigirAudiencia(tipo, AudienciaNotificacion.CLIENTE, AudienciaNotificacion.CLIENTE_O_DUENO);
        notificacionRepository.save(construir(usuarioId, mensaje, tipo, entidadTipo, entidadId, null));
    }

    /**
     * Aviso de administración del comercio: llega solo al Dueño y lleva el comercio, para que lo vea con ese
     * comercio abierto (un Dueño con varios comercios ve cada aviso en el suyo).
     */
    public void crearParaDueno(Integer duenoId, Integer comercioId, String mensaje, TipoNotificacion tipo,
            TipoEntidadNotificacion entidadTipo, Integer entidadId) {
        exigirAudiencia(tipo, AudienciaNotificacion.DUENO, AudienciaNotificacion.CLIENTE_O_DUENO);
        notificacionRepository.save(construir(duenoId, mensaje, tipo, entidadTipo, entidadId, comercioId));
    }

    /**
     * Aviso operativo del comercio: una copia para el Dueño y una por cada Empleado destinatario, en id
     * ascendente de usuario. Quien llama ya tomó (antes que el pedido) los bloqueos de esos usuarios y de las
     * relaciones y resolvió quiénes son los destinatarios; ver {@code PedidoService.bloquearParaActualizarConEquipo}.
     */
    public void crearParaEquipo(Integer comercioId, Integer duenoId, Collection<Integer> empleadosIds, String mensaje,
            TipoNotificacion tipo, TipoEntidadNotificacion entidadTipo, Integer entidadId) {
        exigirAudiencia(tipo, AudienciaNotificacion.EQUIPO);
        TreeSet<Integer> destinatarios = new TreeSet<>(empleadosIds);
        destinatarios.add(duenoId);
        List<Notificacion> copias = new ArrayList<>(destinatarios.size());
        for (Integer destinatario : destinatarios) {
            copias.add(construir(destinatario, mensaje, tipo, entidadTipo, entidadId, comercioId));
        }
        notificacionRepository.saveAll(copias);
    }

    /**
     * Rastro de un email enviado al usuario: fila de canal {@code EMAIL} ya en {@code ENVIADO} (significa "se
     * intentó": quien envía no recibe un resultado). No aparece en la campana, que lista solo {@code PUSH}.
     * La fecha la pone quien llama, para que el tope diario se cuente con el mismo reloj con que se escribe.
     */
    public void registrarEmailEnviado(Integer usuarioId, String mensaje, TipoNotificacion tipo, LocalDateTime fecha) {
        Notificacion notificacion = Notificacion.builder()
                .usuario(usuarioRepository.getReferenceById(usuarioId))
                .tipo(tipo)
                .mensaje(truncar(mensaje))
                .leida(false)
                .fechaCreacion(fecha)
                .canal(CanalNotificacion.EMAIL)
                .estado(EstadoEnvioNotificacion.ENVIADO)
                .fechaEnvio(fecha)
                .build();
        notificacionRepository.save(notificacion);
    }

    /**
     * Con comercio abierto (Dueño siempre, con header obligatorio; Cliente que manda {@code X-Comercio-Id}, que se
     * trata como Empleado de ese comercio) lista los avisos del usuario sobre ese comercio. Sin comercio (el Cliente
     * sin header, y el Administrador, que ignora el header) lista solo los personales: nunca los del comercio.
     */
    public List<NotificacionResponseDTO> listar(AuthenticatedUser usuario, String headerComercioId) {
        Optional<ComercioActivo> comercio = comercioActivoService.resolverSiCorresponde(usuario, headerComercioId);
        List<Notificacion> notificaciones = comercio.isPresent()
                ? notificacionRepository.findByUsuarioIdAndComercioId(usuario.userId(), comercio.get().comercioId())
                : notificacionRepository.findPersonalesPushByUsuarioId(usuario.userId());
        return notificaciones.stream().map(this::aResponseDTO).toList();
    }

    /**
     * Marca una notificación propia como leída. Si es un aviso de un comercio, además exige que el usuario siga
     * siendo el Dueño de ese comercio o su Empleado {@code ACTIVO} (con el comercio accesible): un Empleado que
     * perdió la relación recibe el mismo {@code 404} que en el resto, también acá.
     */
    public NotificacionResponseDTO marcarLeida(Integer usuarioId, Integer notificacionId) {
        Notificacion notificacion = obtenerNotificacionDelUsuario(usuarioId, notificacionId);
        if (notificacion.getComercioId() != null && !tieneAccesoAlComercio(usuarioId, notificacion.getComercioId())) {
            throw new RecursoNoEncontradoException("Notificación no encontrada");
        }
        notificacion.setLeida(true);
        notificacionRepository.save(notificacion);
        return aResponseDTO(notificacion);
    }

    public long contarNoLeidas(AuthenticatedUser usuario, String headerComercioId) {
        Optional<ComercioActivo> comercio = comercioActivoService.resolverSiCorresponde(usuario, headerComercioId);
        return comercio.isPresent()
                ? notificacionRepository.countNoLeidasByUsuarioIdAndComercioId(usuario.userId(), comercio.get().comercioId())
                : notificacionRepository.countPersonalesPushNoLeidasByUsuarioId(usuario.userId());
    }

    /**
     * Marca como leídas todas las no leídas del usuario sobre el comercio abierto (header obligatorio; Dueño o
     * Empleado {@code ACTIVO}) y devuelve cuántas cambiaron. Idempotente: repetirlo devuelve {@code 0}.
     */
    public int marcarLeidasDelComercioActivo(AuthenticatedUser usuario, String headerComercioId) {
        ComercioActivo comercio = comercioActivoService.resolver(usuario.userId(), usuario.rol(), headerComercioId);
        return marcarLeidasDelUsuarioEnComercio(usuario.userId(), comercio.comercioId());
    }

    /**
     * Marca como leídas todas las no leídas del Dueño que pertenecen al comercio de la ruta, y devuelve cuántas
     * cambiaron. Si el comercio no es del Dueño, {@code 404} (el mismo que un comercio inexistente). No exige que
     * el comercio esté operativo: lo usan las pantallas de estado (pendiente, rechazado, rechazo definitivo).
     * Idempotente: repetirlo devuelve {@code 0}.
     */
    public int marcarLeidasDelComercio(Integer duenoId, Integer comercioId) {
        comercioRepository.findByIdAndDuenoId(comercioId, duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return marcarLeidasDelUsuarioEnComercio(duenoId, comercioId);
    }

    /**
     * Borra, por clave primaria, todos los avisos del usuario sobre el comercio. Se llama al activar o reactivar
     * a un Empleado, dentro de la misma transacción: quien se suma ve solo avisos posteriores a su activación. Los
     * borra por id y no por rango para no tomar bloqueos de hueco sobre las notificaciones del usuario. La
     * desactivación y la renuncia (tramo E4) tienen que hacer el mismo purgado.
     */
    public int purgarAvisosDelComercio(Integer usuarioId, Integer comercioId) {
        List<Integer> ids = notificacionRepository.findIdsByUsuarioIdAndComercioId(usuarioId, comercioId);
        if (ids.isEmpty()) {
            return 0;
        }
        notificacionRepository.deleteAllByIdInBatch(ids);
        return ids.size();
    }

    private int marcarLeidasDelUsuarioEnComercio(Integer usuarioId, Integer comercioId) {
        List<Integer> ids = notificacionRepository.findIdsNoLeidasByUsuarioIdAndComercioId(usuarioId, comercioId);
        int marcadas = 0;
        for (int desde = 0; desde < ids.size(); desde += LOTE_MARCADO) {
            marcadas += notificacionRepository.marcarLeidasPorIds(ids.subList(desde, Math.min(desde + LOTE_MARCADO, ids.size())));
        }
        return marcadas;
    }

    private boolean tieneAccesoAlComercio(Integer usuarioId, Integer comercioId) {
        if (comercioRepository.findByIdAndDuenoId(comercioId, usuarioId).isPresent()) {
            return true;
        }
        return empleadoComercioRepository.findComercioAccesible(usuarioId, comercioId, EstadoEmpleadoComercio.ACTIVO,
                ComercioActivoService.ESTADOS_ACCESIBLES_EMPLEADO).isPresent();
    }

    private Notificacion construir(Integer usuarioId, String mensaje, TipoNotificacion tipo, TipoEntidadNotificacion entidadTipo,
            Integer entidadId, Integer comercioId) {
        return Notificacion.builder()
                .usuario(usuarioRepository.getReferenceById(usuarioId))
                .tipo(tipo)
                .mensaje(truncar(mensaje))
                .leida(false)
                .fechaCreacion(LocalDateTime.now(clock))
                .canal(CanalNotificacion.PUSH)
                .estado(EstadoEnvioNotificacion.PENDIENTE)
                .entidadTipo(entidadTipo)
                .entidadId(entidadId)
                .comercioId(comercioId)
                .build();
    }

    private static void exigirAudiencia(TipoNotificacion tipo, AudienciaNotificacion... permitidas) {
        for (AudienciaNotificacion audiencia : permitidas) {
            if (tipo.getAudiencia() == audiencia) {
                return;
            }
        }
        throw new IllegalArgumentException("El tipo " + tipo + " (audiencia " + tipo.getAudiencia()
                + ") no se puede crear por este camino");
    }

    private static String truncar(String mensaje) {
        return mensaje.length() > 500 ? mensaje.substring(0, 500) : mensaje;
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
