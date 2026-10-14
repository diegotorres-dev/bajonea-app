package com.bajonea.backend.config.security;

import java.util.List;
import org.springframework.http.HttpMethod;

/**
 * Lista blanca de los endpoints de operación del Comercio que un Empleado puede usar (rol Empleado: las cuatro
 * lecturas de E2, la trazabilidad de pedidos del bloque A3 de E3 y las 18 escrituras de E3: 17 del bloque A2 y el cierre como no retirado del A4b). Es
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
            new RutaDelegable(HttpMethod.GET, "/api/v1/pedidos/comercio/resumen-hoy"),
            new RutaDelegable(HttpMethod.GET, "/api/v1/pedidos/comercio/{id}/trazabilidad"),
            new RutaDelegable(HttpMethod.POST, "/api/v1/productos"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/productos/{id}"),
            new RutaDelegable(HttpMethod.PATCH, "/api/v1/productos/{id}/estado"),
            new RutaDelegable(HttpMethod.POST, "/api/v1/productos/{id}/cloudinary/firma"),
            new RutaDelegable(HttpMethod.POST, "/api/v1/productos/{id}/imagenes"),
            new RutaDelegable(HttpMethod.DELETE, "/api/v1/productos/{id}/imagenes/{imagenId}"),
            new RutaDelegable(HttpMethod.PATCH, "/api/v1/productos/{id}/imagenes/{imagenId}/orden"),
            new RutaDelegable(HttpMethod.POST, "/api/v1/productos/{id}/imagenes/{imagenId}/recorte/firma"),
            new RutaDelegable(HttpMethod.PATCH, "/api/v1/productos/{id}/imagenes/{imagenId}/url"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/comercios/perfil/datos-operativos"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/comercios/cerrar"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/comercios/abrir"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/pedidos/comercio/{id}/aceptar"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/pedidos/comercio/{id}/rechazar"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/pedidos/comercio/{id}/despachar"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/pedidos/comercio/{id}/entregar"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/pedidos/comercio/{id}/no-retirado"),
            new RutaDelegable(HttpMethod.PUT, "/api/v1/pedidos/comercio/{id}/anular"));

    private DelegacionEmpleado() {
    }
}
