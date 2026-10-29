package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.MiembroEquipoResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.EmpleadoComercio;
import com.bajonea.backend.entities.HistorialEmpleadoComercio;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.HistorialEmpleadoComercioRepository;
import com.bajonea.backend.repositories.InvitacionEmpleadoRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Gestión de la relación de un Empleado con un comercio: por parte del Dueño, dar de baja ({@code desactivar}) y
 * reactivar directamente (sin invitación nueva) a un miembro del equipo, sobre el comercio activo de la request; por
 * parte del propio Empleado, {@code renunciar} a un comercio.
 * <p>
 * Las tres operaciones son idempotentes: repetir una desactivación o una renuncia sobre una relación ya inactiva, o
 * una reactivación sobre una ya activa, responde {@code 200} con el estado actual sin escribir historial ni avisos.
 * <p>
 * Orden de bloqueo (el global del proyecto, ver {@code docs/CONCURRENCIA-Y-TRANSACCIONES.md}): las filas de
 * {@code usuario} del Dueño y del Empleado en id ascendente (compartidas al desactivar; la del Dueño exclusiva al
 * reactivar, para serializar con invitar y reenviar, que la toman igual); después la relación
 * {@code FOR UPDATE}, siempre como la primera lectura de esa fila (leerla antes con bloqueo compartido y
 * escribirla después mejora el bloqueo y se interbloquea con una operación igual); después, solo al reactivar, el
 * estado del comercio (lectura compartida). El comercio nunca se escribe. Las decisiones se toman con la relación
 * ya bloqueada y sin ninguna lectura simple anterior en la transacción (la primera fija la foto de la
 * transacción, y una anterior al bloqueo puede no ver una baja o una renuncia confirmada mientras se esperaba).
 * La relación se escribe sobre la entidad ya cargada, es decir por clave primaria, y los avisos del comercio del
 * Empleado se borran por clave primaria ({@link NotificacionService#purgarAvisosDelComercio}).
 * <p>
 * La renuncia sigue el mismo orden. Como el Empleado no es quien tiene el comercio abierto, el id del Dueño (que
 * hay que conocer para bloquear su usuario en id ascendente) se lee antes, con una consulta escalar en su propia
 * transacción ya cerrada: el Dueño de un comercio no cambia, y así la primera lectura simple de la transacción de
 * la renuncia (la que fija la foto) llega recién con la relación bloqueada, como en el resto.
 */
@Service
@RequiredArgsConstructor
public class GestionMiembroEquipoService {

    static final String MENSAJE_MIEMBRO_NO_ENCONTRADO = "Miembro no encontrado";
    static final String MENSAJE_COMERCIO_NO_OPERATIVO = "Este comercio no puede reactivar empleados en este momento";
    static final String MENSAJE_COMERCIO_SUSPENDIDO = "El comercio está suspendido: el equipo se puede ver, pero no modificar";
    static final String MENSAJE_RENUNCIO = "Esta persona dejó el equipo por su cuenta. Para que vuelva, invitala de nuevo.";
    static final String MENSAJE_SIN_REGISTRO_DE_BAJA = "Esta persona no se puede reactivar directamente. Para que vuelva, invitala de nuevo.";
    static final String MENSAJE_INVITACION_PENDIENTE = "Hay una invitación pendiente para esta persona. Cancelala primero.";
    static final String MENSAJE_CUENTA_NO_APTA = "No se puede reactivar a esta persona";

    public record ResultadoCambio(MiembroEquipoResponseDTO miembro, boolean huboCambio) {
    }

    public record ResultadoRenuncia(boolean huboCambio) {
    }

    private final UsuarioRepository usuarioRepository;
    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final ComercioRepository comercioRepository;
    private final HistorialEmpleadoComercioRepository historialRepository;
    private final InvitacionEmpleadoRepository invitacionRepository;
    private final NotificacionService notificacionService;
    private final AptitudCuentaEmpleadoService aptitud;
    private final Clock clock;
    private final TransactionTemplate transactionTemplate;

    @Transactional
    public ResultadoCambio desactivar(ComercioActivo activo, Integer empleadoId) {
        bloquearUsuarios(activo.duenoId(), empleadoId, false);
        EmpleadoComercio relacion = bloquearRelacion(empleadoId, activo.comercioId());
        exigirComercioNoSuspendido(activo.comercioId());
        if (relacion.getEstado() == EstadoEmpleadoComercio.INACTIVO) {
            return new ResultadoCambio(miembroInactivo(relacion), false);
        }
        LocalDateTime ahora = LocalDateTime.now(clock);
        relacion.setEstado(EstadoEmpleadoComercio.INACTIVO);
        relacion.setFechaBaja(ahora);
        Comercio comercio = comercio(activo.comercioId());
        guardarHistorial(comercio, relacion, MotivoHistorialEmpleado.BAJA_DUENO, EstadoEmpleadoComercio.ACTIVO,
                EstadoEmpleadoComercio.INACTIVO, activo.duenoId(), ahora);
        notificacionService.purgarAvisosDelComercio(empleadoId, comercio.getId());
        notificacionService.crearParaCliente(empleadoId,
                comercio.getNombre() + " te dio de baja del equipo. Ya no tenés acceso a ese comercio.",
                TipoNotificacion.EMPLEADO_DESACTIVADO, TipoEntidadNotificacion.COMERCIO, comercio.getId());
        return new ResultadoCambio(MiembroEquipoResponseDTO.de(relacion, MotivoHistorialEmpleado.BAJA_DUENO), true);
    }

    @Transactional
    public ResultadoCambio reactivar(ComercioActivo activo, Integer empleadoId) {
        String estadoCuenta = bloquearUsuarios(activo.duenoId(), empleadoId, true);
        EmpleadoComercio relacion = bloquearRelacion(empleadoId, activo.comercioId());
        if (relacion.getEstado() == EstadoEmpleadoComercio.ACTIVO) {
            return new ResultadoCambio(MiembroEquipoResponseDTO.de(relacion, null), false);
        }
        exigirComercioOperativo(activo.comercioId());

        MotivoHistorialEmpleado motivoBaja = historialRepository.findUltimaBaja(List.of(relacion.getId())).stream()
                .findFirst()
                .map(HistorialEmpleadoComercioRepository.UltimaBaja::getMotivo)
                .orElse(null);
        if (motivoBaja != MotivoHistorialEmpleado.BAJA_DUENO) {
            throw new ConflictoComercioException(ConflictoComercioException.EMPLEADO_NO_REACTIVABLE,
                    motivoBaja == MotivoHistorialEmpleado.RENUNCIA ? MENSAJE_RENUNCIO : MENSAJE_SIN_REGISTRO_DE_BAJA);
        }

        LocalDateTime ahora = LocalDateTime.now(clock);
        String email = relacion.getEmpleado().getPersonaFisica().getPersona().getUsuario().getEmail();
        boolean invitacionVigente = invitacionRepository.findFirstByComercioIdAndEmailOrderByIdDesc(activo.comercioId(), email)
                .filter(ultima -> ultima.getEstado() == EstadoInvitacionEmpleado.PENDIENTE
                        && ultima.getFechaVencimiento().isAfter(ahora))
                .isPresent();
        if (invitacionVigente) {
            throw new ConflictoComercioException(ConflictoComercioException.INVITACION_PENDIENTE, MENSAJE_INVITACION_PENDIENTE);
        }

        if (aptitud.evaluar(empleadoId, EstadoUsuario.valueOf(estadoCuenta)) != AptitudCuentaEmpleadoService.Aptitud.APTA) {
            throw new ConflictoDeNegocioException(MENSAJE_CUENTA_NO_APTA);
        }

        relacion.setEstado(EstadoEmpleadoComercio.ACTIVO);
        relacion.setFechaBaja(null);
        Comercio comercio = comercio(activo.comercioId());
        guardarHistorial(comercio, relacion, MotivoHistorialEmpleado.REACTIVACION, EstadoEmpleadoComercio.INACTIVO,
                EstadoEmpleadoComercio.ACTIVO, activo.duenoId(), ahora);
        notificacionService.purgarAvisosDelComercio(empleadoId, comercio.getId());
        notificacionService.crearParaCliente(empleadoId,
                comercio.getNombre() + " te reactivó en el equipo. Ya podés volver a trabajar ahí.",
                TipoNotificacion.EMPLEADO_REACTIVADO, TipoEntidadNotificacion.COMERCIO, comercio.getId());
        return new ResultadoCambio(MiembroEquipoResponseDTO.de(relacion, null), true);
    }

    /**
     * El propio Empleado deja de trabajar en el comercio: la relación pasa a {@code INACTIVO} con {@code fecha_baja},
     * se escribe la fila {@code RENUNCIA} (origen {@code ACTIVO}, destino {@code INACTIVO}, actor el Empleado), se
     * borran sus avisos del comercio y el Dueño recibe el aviso T34 ({@code EMPLEADO_DESACTIVADO}, del comercio).
     * Idempotente: sobre una relación ya inactiva responde {@code 200} sin escribir nada. Funciona con el comercio en
     * cualquier estado. Sin relación (o sin comercio) es el mismo {@code 404 COMERCIO_NO_DISPONIBLE} del resolver de
     * comercio activo, sin revelar cuál de las dos cosas falta.
     */
    public ResultadoRenuncia renunciar(Integer empleadoId, Integer comercioId) {
        Integer duenoId = comercioRepository.findDuenoIdById(comercioId).orElseThrow(ComercioNoDisponibleException::new);
        return transactionTemplate.execute(estado -> renunciarBloqueando(empleadoId, comercioId, duenoId));
    }

    private ResultadoRenuncia renunciarBloqueando(Integer empleadoId, Integer comercioId, Integer duenoId) {
        bloquearUsuarios(duenoId, empleadoId, false, ComercioNoDisponibleException::new, ComercioNoDisponibleException::new);
        EmpleadoComercio relacion = empleadoComercioRepository.findByEmpleadoIdAndComercioIdConBloqueo(empleadoId, comercioId)
                .orElseThrow(ComercioNoDisponibleException::new);
        if (relacion.getEstado() == EstadoEmpleadoComercio.INACTIVO) {
            return new ResultadoRenuncia(false);
        }
        LocalDateTime ahora = LocalDateTime.now(clock);
        relacion.setEstado(EstadoEmpleadoComercio.INACTIVO);
        relacion.setFechaBaja(ahora);
        Comercio comercio = comercio(comercioId);
        guardarHistorial(comercio, relacion, MotivoHistorialEmpleado.RENUNCIA, EstadoEmpleadoComercio.ACTIVO,
                EstadoEmpleadoComercio.INACTIVO, empleadoId, ahora);
        notificacionService.purgarAvisosDelComercio(empleadoId, comercio.getId());
        PersonaFisica persona = relacion.getEmpleado().getPersonaFisica();
        notificacionService.crearParaDueno(duenoId, comercio.getId(),
                persona.getNombre() + " " + persona.getApellido() + " dejó de trabajar en " + comercio.getNombre() + ".",
                TipoNotificacion.EMPLEADO_DESACTIVADO, TipoEntidadNotificacion.COMERCIO, comercio.getId());
        return new ResultadoRenuncia(true);
    }

    /**
     * Bloquea las filas de {@code usuario} del Dueño y del Empleado en id ascendente y devuelve el estado de la
     * cuenta del Empleado (lectura compartida: lo último confirmado). El Dueño va compartido, o exclusivo si
     * {@code duenoExclusivo}.
     */
    private String bloquearUsuarios(Integer duenoId, Integer empleadoId, boolean duenoExclusivo) {
        return bloquearUsuarios(duenoId, empleadoId, duenoExclusivo,
                () -> new RecursoNoEncontradoException(MENSAJE_MIEMBRO_NO_ENCONTRADO),
                () -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    private String bloquearUsuarios(Integer duenoId, Integer empleadoId, boolean duenoExclusivo,
            Supplier<? extends RuntimeException> miembroAusente, Supplier<? extends RuntimeException> duenoAusente) {
        if (duenoId.equals(empleadoId)) {
            throw miembroAusente.get();
        }
        if (duenoId < empleadoId) {
            bloquearDueno(duenoId, duenoExclusivo, duenoAusente);
            return leerEstadoCuenta(empleadoId, miembroAusente);
        }
        String estado = leerEstadoCuenta(empleadoId, miembroAusente);
        bloquearDueno(duenoId, duenoExclusivo, duenoAusente);
        return estado;
    }

    private void bloquearDueno(Integer duenoId, boolean exclusivo, Supplier<? extends RuntimeException> duenoAusente) {
        boolean existe = exclusivo
                ? usuarioRepository.findByIdConBloqueo(duenoId).isPresent()
                : usuarioRepository.leerIdConBloqueoCompartido(duenoId).isPresent();
        if (!existe) {
            throw duenoAusente.get();
        }
    }

    private String leerEstadoCuenta(Integer empleadoId, Supplier<? extends RuntimeException> miembroAusente) {
        return usuarioRepository.leerEstadoConBloqueoCompartido(empleadoId).orElseThrow(miembroAusente);
    }

    private EmpleadoComercio bloquearRelacion(Integer empleadoId, Integer comercioId) {
        return empleadoComercioRepository.findByEmpleadoIdAndComercioIdConBloqueo(empleadoId, comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_MIEMBRO_NO_ENCONTRADO));
    }

    private void exigirComercioNoSuspendido(Integer comercioId) {
        String estado = comercioRepository.leerEstadoConBloqueoCompartido(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"))
                .getEstado();
        if (EstadoComercio.valueOf(estado) == EstadoComercio.SUSPENDIDO) {
            throw new ConflictoComercioException(ConflictoComercioException.SUSPENDIDO, MENSAJE_COMERCIO_SUSPENDIDO);
        }
    }

    private void exigirComercioOperativo(Integer comercioId) {
        String estado = comercioRepository.leerEstadoConBloqueoCompartido(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"))
                .getEstado();
        if (!ComercioActivoService.esOperativo(EstadoComercio.valueOf(estado))) {
            throw new ConflictoComercioException(ConflictoComercioException.NO_OPERATIVO, MENSAJE_COMERCIO_NO_OPERATIVO);
        }
    }

    private Comercio comercio(Integer comercioId) {
        return comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    private MiembroEquipoResponseDTO miembroInactivo(EmpleadoComercio relacion) {
        MotivoHistorialEmpleado motivo = historialRepository.findUltimaBaja(List.of(relacion.getId())).stream()
                .findFirst()
                .map(HistorialEmpleadoComercioRepository.UltimaBaja::getMotivo)
                .orElse(null);
        return MiembroEquipoResponseDTO.de(relacion, motivo);
    }

    private void guardarHistorial(Comercio comercio, EmpleadoComercio relacion, MotivoHistorialEmpleado motivo,
            EstadoEmpleadoComercio origen, EstadoEmpleadoComercio destino, Integer actorUsuarioId, LocalDateTime fechaHora) {
        historialRepository.save(HistorialEmpleadoComercio.builder()
                .comercio(comercio)
                .empleadoComercio(relacion)
                .estadoOrigen(origen)
                .estadoDestino(destino)
                .motivo(motivo)
                .actorUsuarioId(actorUsuarioId)
                .fechaHora(fechaHora)
                .build());
    }
}
