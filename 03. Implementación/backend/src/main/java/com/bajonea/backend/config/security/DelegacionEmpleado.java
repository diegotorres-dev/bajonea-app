package com.bajonea.backend.config.security;

import java.util.List;
import org.springframework.http.HttpMethod;

/**
 * Lista blanca de los endpoints de operación del Comercio que un Empleado puede usar (rol Empleado, tramo E2). Es
 * la única fuente: la usan {@link SecurityConfig}, que los abre a {@code DUENO} y {@code CLIENTE} (el Empleado es
 * un Cliente con una relación activa con el comercio) por delante de los matchers {@code hasRole("DUENO")}, y la
 * prueba de arranque que clasifica todos los mappings del módulo. Cada entrada es una ruta exacta con su método,
 * nunca un comodín; lo que no está acá sigue siendo exclusivo del Dueño. La autorización real de cada una la
 * hace el resolver de comercio activo ({@link ComercioActivoArgumentResolver}): relación {@code ACTIVO} con el
 * comercio indicado en {@code X-Comercio-Id}, comprobada contra la base en cada request.
 */
public final class DelegacionEmpleado {

    public record RutaDelegable(HttpMethod metodo, String patron) {

        public String clave() {
            return metodo.name() + " " + patron;
        }
    }

    public static final List<RutaDelegable> RUTAS = List.of(
            new RutaDelegable(HttpMethod.GET, "/api/v1/comercios/perfil"),
            new RutaDelegable(HttpMethod.GET, "/api/v1/productos"),
            new RutaDelegable(HttpMethod.GET, "/api/v1/pedidos/comercio"),
            new RutaDelegable(HttpMethod.GET, "/api/v1/pedidos/comercio/resumen-hoy"));

    private DelegacionEmpleado() {
    }
}
