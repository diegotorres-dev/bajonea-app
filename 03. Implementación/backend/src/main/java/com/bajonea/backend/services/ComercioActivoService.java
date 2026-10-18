package com.bajonea.backend.services;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Único punto donde se decide sobre qué comercio opera el usuario en una request y con qué actor. Con el header
 * {@code X-Comercio-Id} presente y numérico:
 * <ul>
 * <li>Dueño: el comercio tiene que ser suyo, en cualquier estado.</li>
 * <li>Cliente: solo si es Empleado con una relación {@code ACTIVO} con el comercio y el comercio está en un
 * estado accesible para el Empleado ({@link #ESTADOS_ACCESIBLES_EMPLEADO}). La relación se comprueba contra la
 * base en cada request.</li>
 * <li>Administrador (o cualquier otro rol): nunca.</li>
 * </ul>
 * Todo rechazo es el mismo {@code 404} ({@link ComercioNoDisponibleException}): inexistente, ajeno, sin
 * relación activa y estado no accesible no se distinguen. El header es obligatorio: ausente, vacío o no
 * numérico es {@code 400}, también cuando el usuario tiene un único comercio.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ComercioActivoService {

    public static final String HEADER_COMERCIO_ID = "X-Comercio-Id";

    public static final Set<EstadoComercio> ESTADOS_ACCESIBLES_EMPLEADO = Set.of(EstadoComercio.APROBADO,
            EstadoComercio.APTO_VENTA, EstadoComercio.SUSPENDIDO, EstadoComercio.CERRADO_TEMPORALMENTE);

    private static final Set<EstadoComercio> ESTADOS_OPERATIVOS = Set.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA);

    private final ComercioRepository comercioRepository;
    private final EmpleadoComercioRepository empleadoComercioRepository;

    public ComercioActivo resolver(Integer usuarioId, RolUsuario rol, String headerComercioId) {
        if (rol != RolUsuario.DUENO && rol != RolUsuario.CLIENTE) {
            throw new ComercioNoDisponibleException();
        }
        if (headerComercioId == null || headerComercioId.isBlank()) {
            throw new ValidacionException("Falta indicar el comercio");
        }
        Integer comercioId = parsearHeader(headerComercioId.trim());
        return rol == RolUsuario.DUENO ? resolverComoDueno(usuarioId, comercioId) : resolverComoEmpleado(usuarioId, comercioId);
    }

    /**
     * Para los endpoints compartidos con otros roles (las notificaciones los usan también el Cliente y el
     * Administrador):
     * <ul>
     * <li>Dueño: resuelve su comercio activo con la misma regla de {@link #resolver} (header obligatorio).</li>
     * <li>Cliente: sin header (ausente o en blanco) devuelve vacío y ve todo lo suyo, como siempre; con header
     * lo trata como contexto de Empleado: tiene que ser un Empleado con relación {@code ACTIVO} con ese comercio,
     * si no es el mismo {@code 404} que en el resto, y un valor no numérico es {@code 400}.</li>
     * <li>Cualquier otro rol (Administrador): devuelve vacío y el header se ignora por completo, sin validarlo.</li>
     * </ul>
     */
    public Optional<ComercioActivo> resolverSiCorresponde(AuthenticatedUser usuario, String headerComercioId) {
        if (usuario.rol() == RolUsuario.DUENO) {
            return Optional.of(resolver(usuario.userId(), usuario.rol(), headerComercioId));
        }
        if (usuario.rol() == RolUsuario.CLIENTE && headerComercioId != null && !headerComercioId.isBlank()) {
            return Optional.of(resolver(usuario.userId(), usuario.rol(), headerComercioId));
        }
        return Optional.empty();
    }

    /**
     * Un comercio es operativo en {@code APROBADO} y {@code APTO_VENTA}: es la única definición de
     * "operativo" del backend y la reutilizan quienes la necesiten (ej. el listado {@code mis-comercios}).
     */
    public static boolean esOperativo(EstadoComercio estado) {
        return ESTADOS_OPERATIVOS.contains(estado);
    }

    private ComercioActivo resolverComoDueno(Integer duenoId, Integer comercioId) {
        Comercio comercio = comercioRepository.findByIdAndDuenoId(comercioId, duenoId)
                .orElseThrow(ComercioNoDisponibleException::new);
        return new ComercioActivo(comercio.getId(), duenoId, duenoId, RolActorComercio.DUENO, comercio.getEstado());
    }

    private ComercioActivo resolverComoEmpleado(Integer usuarioId, Integer comercioId) {
        Comercio comercio = empleadoComercioRepository
                .findComercioAccesible(usuarioId, comercioId, EstadoEmpleadoComercio.ACTIVO, ESTADOS_ACCESIBLES_EMPLEADO)
                .orElseThrow(ComercioNoDisponibleException::new);
        return new ComercioActivo(comercio.getId(), comercio.getDueno().getId(), usuarioId, RolActorComercio.EMPLEADO,
                comercio.getEstado());
    }

    /**
     * Revalida, dentro de la transacción de una escritura delegada, que el Empleado siga teniendo la relación
     * {@code ACTIVO} con el comercio: lee {@code empleado_comercio} con bloqueo compartido, así que una
     * desactivación (que la toma {@code FOR UPDATE}) espera a que esta transacción termine, y si ya se confirmó la
     * escritura ve {@code INACTIVO} y responde el mismo {@code 404} que el resolver. Para el Dueño no hace nada.
     * <p>
     * Orden de bloqueo: va después de los usuarios (quien actúa, y en pedidos también el Cliente y el Dueño) y antes
     * del comercio y del pedido. Quien la llame tiene que haber tomado antes la fila del usuario que actúa.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void exigirRelacionActiva(ComercioActivo actor) {
        if (actor.esEmpleado()) {
            exigirRelacionActiva(actor.actorUsuarioId(), actor.comercioId());
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void exigirRelacionActiva(Integer empleadoId, Integer comercioId) {
        boolean activa = empleadoComercioRepository.leerEstadoConBloqueoCompartido(empleadoId, comercioId)
                .map(estado -> EstadoEmpleadoComercio.valueOf(estado) == EstadoEmpleadoComercio.ACTIVO)
                .orElse(false);
        if (!activa) {
            throw new ComercioNoDisponibleException();
        }
    }

    /**
     * Guard de las modificaciones del Empleado sobre productos, imágenes y datos operativos: con el comercio
     * {@code SUSPENDIDO} responde {@code 409} {@code COMERCIO_SUSPENDIDO}; con {@code CERRADO_TEMPORALMENTE} (y
     * con los operativos) puede editar. Un estado al que el Empleado no accede es el {@code 404} de siempre. El
     * Dueño no tiene este guard (hueco conocido, se resuelve en el tramo de rediseño de la suspensión).
     */
    public static void validarComercioModificable(ComercioActivo actor, EstadoComercio estadoComercio) {
        if (!actor.esEmpleado()) {
            return;
        }
        if (!ESTADOS_ACCESIBLES_EMPLEADO.contains(estadoComercio)) {
            throw new ComercioNoDisponibleException();
        }
        if (estadoComercio == EstadoComercio.SUSPENDIDO) {
            throw new ConflictoComercioException(ConflictoComercioException.SUSPENDIDO,
                    "El comercio está suspendido: por ahora no se puede modificar.");
        }
    }

    /**
     * Guard de aceptar pedidos nuevos del Empleado: con el comercio {@code SUSPENDIDO} o
     * {@code CERRADO_TEMPORALMENTE} responde {@code 409} {@code COMERCIO_SIN_OPERACION}. El cierre manual (comercio
     * operativo con la bandera encendida) no lo activa. Rechazar, despachar, entregar y anular no pasan por acá.
     */
    public static void validarComercioAceptaPedidosNuevos(EstadoComercio estadoComercio) {
        if (!ESTADOS_ACCESIBLES_EMPLEADO.contains(estadoComercio)) {
            throw new ComercioNoDisponibleException();
        }
        if (!ESTADOS_OPERATIVOS.contains(estadoComercio)) {
            throw new ConflictoComercioException(ConflictoComercioException.SIN_OPERACION,
                    "El comercio no está operativo: no podés aceptar pedidos nuevos. Sí podés rechazarlos.");
        }
    }

    private Integer parsearHeader(String valor) {
        try {
            return Integer.valueOf(valor);
        } catch (NumberFormatException ex) {
            throw new ValidacionException("El comercio indicado no es válido");
        }
    }
}
