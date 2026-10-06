package com.bajonea.backend.config.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rate limit simple en memoria, por IP y por grupo de rutas, para los endpoints públicos del proyecto que
 * un tercero puede martillar sin tener sesión. Cada grupo tiene su propio contador por IP y su propio límite
 * por minuto ({@code app.rate-limit.*}), configurable para que {@code application-test.properties} pueda
 * subirlo sin tocar el comportamiento real de producción y desarrollo:
 * <ul>
 * <li>{@code foto-registro} (default 5): los endpoints de firma de Cloudinary sin autenticación
 * ({@code POST /auth/registro/comercio/foto-firma} y {@code POST /auth/registro/cliente/foto-firma}); el
 * comercio y el cliente todavía no tienen sesión al registrarse (ver CLAUDE.md §5bis) y comparten el mismo
 * contador por IP. La suite de Playwright registra muchos usuarios desde la misma IP (localhost).</li>
 * <li>{@code invitacion-empleado} (default 10): {@code POST /auth/invitaciones-empleado/validar} y
 * {@code /aceptar}, que comparten contador. Cada código incorrecto suma un intento a las invitaciones del
 * email, así que sin este límite alguien podría invalidar invitaciones ajenas a golpes.</li>
 * </ul>
 * Un {@code ConcurrentHashMap} con ventana fija de 60 segundos alcanza: un solo servidor, sin necesidad de
 * nada distribuido (Redis, etc.) mientras el proyecto no escale a más de una instancia — si eso cambia, este
 * filtro deja de ser suficiente y hay que migrar a un rate limiter compartido entre instancias. La IP es
 * {@code request.getRemoteAddr()}: detrás de un proxy inverso hace falta que el servidor la resuelva desde
 * {@code X-Forwarded-For} ({@code server.forward-headers-strategy}), pendiente de la lista de despliegue; sin
 * eso todos los clientes comparten el contador de la IP del proxy.
 */

//Limita la cantidad de veces por minuto que un cliente puede llamar a ciertos endpoints públicos, por IP
@Component
public class RateLimitPublicoFilter extends OncePerRequestFilter {

    private static final int VENTANAS_MAXIMAS_ANTES_DE_PURGAR = 10_000;

    private static final String GRUPO_FOTO_REGISTRO = "foto-registro";
    private static final String GRUPO_INVITACION_EMPLEADO = "invitacion-empleado";

    private static final Map<String, String> GRUPO_POR_RUTA = Map.of(
            "/api/v1/auth/registro/comercio/foto-firma", GRUPO_FOTO_REGISTRO,
            "/api/v1/auth/registro/cliente/foto-firma", GRUPO_FOTO_REGISTRO,
            "/api/v1/auth/invitaciones-empleado/validar", GRUPO_INVITACION_EMPLEADO,
            "/api/v1/auth/invitaciones-empleado/aceptar", GRUPO_INVITACION_EMPLEADO);

    private final Map<String, Integer> limitePorGrupo;
    private final Map<String, VentanaRateLimit> ventanasPorGrupoEIp = new ConcurrentHashMap<>();

    public RateLimitPublicoFilter(
            @Value("${app.rate-limit.foto-registro-por-minuto:5}") int limiteFotoRegistroPorMinuto,
            @Value("${app.rate-limit.invitacion-empleado-por-minuto:10}") int limiteInvitacionEmpleadoPorMinuto) {
        this.limitePorGrupo = Map.of(
                GRUPO_FOTO_REGISTRO, limiteFotoRegistroPorMinuto,
                GRUPO_INVITACION_EMPLEADO, limiteInvitacionEmpleadoPorMinuto);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String grupo = GRUPO_POR_RUTA.get(request.getRequestURI());
        if (grupo == null || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        long ventanaActual = Instant.now().getEpochSecond() / 60;
        if (ventanasPorGrupoEIp.size() > VENTANAS_MAXIMAS_ANTES_DE_PURGAR) {
            ventanasPorGrupoEIp.values().removeIf(ventana -> ventana.ventana != ventanaActual);
        }
        VentanaRateLimit ventana = ventanasPorGrupoEIp.computeIfAbsent(grupo + "|" + request.getRemoteAddr(),
                clave -> new VentanaRateLimit());

        boolean excedido;
        synchronized (ventana) {
            if (ventana.ventana != ventanaActual) {
                ventana.ventana = ventanaActual;
                ventana.contador = 0;
            }
            ventana.contador++;
            excedido = ventana.contador > limitePorGrupo.get(grupo);
        }

        if (excedido) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"mensaje\":\"Demasiadas solicitudes. Esperá un minuto e intentá de nuevo.\",\"data\":null}");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private static final class VentanaRateLimit {
        private volatile long ventana;
        private int contador;
    }
}
