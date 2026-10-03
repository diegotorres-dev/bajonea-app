package com.bajonea.backend.services;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ComercioRepository;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Único punto donde se decide sobre qué comercio opera un Dueño en una request. Con el header
 * {@code X-Comercio-Id} presente y numérico, el comercio tiene que existir y ser del Dueño
 * autenticado; si no, {@code 404} con el mismo mensaje genérico que un comercio inexistente (nunca
 * revela si el id pertenece a otro Dueño). El header es obligatorio para el Dueño: ausente, vacío o
 * no numérico es {@code 400}, también cuando tiene un único comercio.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ComercioActivoService {

    public static final String HEADER_COMERCIO_ID = "X-Comercio-Id";

    private static final String MENSAJE_NO_ENCONTRADO = "Comercio no encontrado";
    private static final Set<EstadoComercio> ESTADOS_OPERATIVOS = Set.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA);

    private final ComercioRepository comercioRepository;

    public ComercioActivo resolver(Integer duenoId, String headerComercioId) {
        if (headerComercioId == null || headerComercioId.isBlank()) {
            throw new ValidacionException("El header " + HEADER_COMERCIO_ID + " es obligatorio para el Dueño");
        }
        Integer comercioId = parsearHeader(headerComercioId.trim());
        Comercio comercio = comercioRepository.findByIdAndDuenoId(comercioId, duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADO));
        return new ComercioActivo(comercio.getId(), duenoId);
    }

    /**
     * Para los endpoints compartidos con otros roles (las notificaciones los usa también el Cliente): si el
     * usuario es Dueño resuelve su comercio activo con la misma regla de {@link #resolver}; para cualquier
     * otro rol devuelve vacío y el header se ignora por completo, sin validarlo.
     */
    public Optional<ComercioActivo> resolverSiCorresponde(AuthenticatedUser usuario, String headerComercioId) {
        if (usuario.rol() != RolUsuario.DUENO) {
            return Optional.empty();
        }
        return Optional.of(resolver(usuario.userId(), headerComercioId));
    }

    /**
     * Un comercio es operativo en {@code APROBADO} y {@code APTO_VENTA}: es la única definición de
     * "operativo" del backend y la reutilizan quienes la necesiten (ej. el listado {@code mis-comercios}).
     */
    public static boolean esOperativo(EstadoComercio estado) {
        return ESTADOS_OPERATIVOS.contains(estado);
    }

    private Integer parsearHeader(String valor) {
        try {
            return Integer.valueOf(valor);
        } catch (NumberFormatException ex) {
            throw new ValidacionException("El header " + HEADER_COMERCIO_ID + " debe ser un número entero");
        }
    }
}
