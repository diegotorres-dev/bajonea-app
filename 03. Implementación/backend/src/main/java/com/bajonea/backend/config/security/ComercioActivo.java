package com.bajonea.backend.config.security;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolActorComercio;

/**
 * Comercio sobre el que opera el usuario autenticado en la request actual, resuelto en un único punto por
 * {@link ComercioActivoArgumentResolver} (header {@code X-Comercio-Id}). Los controllers de operaciones del
 * Comercio lo declaran como parámetro en vez de leer {@code AuthenticatedUser} y buscar el comercio a mano.
 * <p>
 * {@code duenoId} es siempre el id del Dueño real del comercio (mismo id que {@code Usuario}/{@code Dueno}),
 * sea quien sea el actor. {@code actorUsuarioId} y {@code actorRol} dicen quién opera: el propio Dueño, o un
 * Empleado con relación activa con el comercio. {@code estadoComercio} es el estado que tenía el comercio al
 * resolverlo.
 */
public record ComercioActivo(Integer comercioId, Integer duenoId, Integer actorUsuarioId, RolActorComercio actorRol,
        EstadoComercio estadoComercio) {

    public static ComercioActivo delDueno(Integer comercioId, Integer duenoId, EstadoComercio estadoComercio) {
        return new ComercioActivo(comercioId, duenoId, duenoId, RolActorComercio.DUENO, estadoComercio);
    }

    public boolean esEmpleado() {
        return actorRol == RolActorComercio.EMPLEADO;
    }
}
