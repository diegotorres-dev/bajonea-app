package com.bajonea.backend.services;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
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
            throw new ValidacionException("Falta indicar el comercio sobre el que operás (header " + HEADER_COMERCIO_ID + ")");
        }
        Integer comercioId = parsearHeader(headerComercioId.trim());
        return rol == RolUsuario.DUENO ? resolverComoDueno(usuarioId, comercioId) : resolverComoEmpleado(usuarioId, comercioId);
    }

    /**
     * Para los endpoints compartidos con otros roles (las notificaciones los usa también el Cliente): si el
     * usuario es Dueño resuelve su comercio activo con la misma regla de {@link #resolver}; para cualquier
     * otro rol devuelve vacío y el header se ignora por completo, sin validarlo. Las notificaciones del
     * Empleado quedan fuera de este tramo.
     */
    public Optional<ComercioActivo> resolverSiCorresponde(AuthenticatedUser usuario, String headerComercioId) {
        if (usuario.rol() != RolUsuario.DUENO) {
            return Optional.empty();
        }
        return Optional.of(resolver(usuario.userId(), usuario.rol(), headerComercioId));
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

    private Integer parsearHeader(String valor) {
        try {
            return Integer.valueOf(valor);
        } catch (NumberFormatException ex) {
            throw new ValidacionException("El header " + HEADER_COMERCIO_ID + " debe ser un número entero");
        }
    }
}
