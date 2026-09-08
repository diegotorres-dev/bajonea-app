package com.bajonea.backend.config.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rate limit simple en memoria, por IP, exclusivo de los endpoints de firma de Cloudinary sin
 * autenticación del proyecto (necesario porque el comercio/cliente todavía no tiene sesión al
 * momento del registro, ver CLAUDE.md §5bis): {@code POST /auth/registro/comercio/foto-firma}
 * y {@code POST /auth/registro/cliente/foto-firma}. Un {@code ConcurrentHashMap} con ventana
 * fija de 60 segundos alcanza: un solo servidor, sin necesidad de nada distribuido (Redis,
 * etc.) mientras el proyecto no escale a más de una instancia — si eso cambia, este filtro
 * deja de ser suficiente y hay que migrar a un rate limiter compartido entre instancias.
 * <p>
 * El límite es configurable ({@code app.rate-limit.foto-registro-por-minuto}, default 5) para
 * que {@code application-test.properties} pueda subirlo sin tocar el comportamiento real de
 * producción/desarrollo: la suite de Playwright (Fase 17) registra varios comercios reales en
 * poco tiempo desde la misma IP (localhost), y 5/min por IP para TODAS las firmas de
 * pre-registro combinadas (comercio + cliente comparten el mismo contador por IP) alcanzaba en
 * segundos un 429 real contra el propio backend, no contra Cloudinary.
 */
@Component
public class RateLimitFotoRegistroFilter extends OncePerRequestFilter {

    private static final Set<String> RUTAS_LIMITADAS = Set.of(
            "/api/v1/auth/registro/comercio/foto-firma",
            "/api/v1/auth/registro/cliente/foto-firma");

    @Value("${app.rate-limit.foto-registro-por-minuto:5}")
    private int limitePorMinuto;

    private final Map<String, VentanaRateLimit> ventanasPorIp = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!RUTAS_LIMITADAS.contains(request.getRequestURI()) || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String ip = request.getRemoteAddr();
        long ventanaActual = Instant.now().getEpochSecond() / 60;
        VentanaRateLimit ventana = ventanasPorIp.computeIfAbsent(ip, key -> new VentanaRateLimit());

        boolean excedido;
        synchronized (ventana) {
            if (ventana.ventana != ventanaActual) {
                ventana.ventana = ventanaActual;
                ventana.contador = 0;
            }
            ventana.contador++;
            excedido = ventana.contador > limitePorMinuto;
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
        private long ventana;
        private int contador;
    }
}
