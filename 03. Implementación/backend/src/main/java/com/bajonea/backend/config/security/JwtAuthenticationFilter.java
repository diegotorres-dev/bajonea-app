package com.bajonea.backend.config.security;

import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.repositories.SesionRepository;
import com.bajonea.backend.repositories.SesionRepository.EstadoDeSesion;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Valida la firma del JWT vía {@link JwtService} y, además, que la {@code Sesion} referenciada
 * por el claim {@code sesionId} siga con {@code activa = true} — un JWT firmado correctamente
 * pero con la sesión cerrada (bloqueo, recuperación/cambio de contraseña, login concurrente,
 * logout) igual se rechaza con 401. Ver CLAUDE.md §7 y docs/DECISIONES.md, 2026-07-17.
 * <p>
 * Una cuenta suspendida nunca opera: se mira el estado del usuario en cada request, no solo la sesión. Si la cuenta
 * está suspendida (con la sesión cerrada por la suspensión, o con un token todavía válido por cualquier motivo) la
 * respuesta es 401 con {@code data.codigo = CUENTA_SUSPENDIDA} y el motivo. La firma del token ya está validada en ese
 * punto, así que el motivo no se filtra a quien no tiene un token firmado por la aplicación. Una sesión cerrada por
 * suspensión de una cuenta que después se levantó responde el 401 genérico de siempre.
 */

// Filtro por el que pasan todas las peticiones antes de llegar al controller (decide si el usuario está
// autenticado o no).
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final SesionRepository sesionRepository;
    private final AuthenticationEntryPoint authenticationEntryPoint;

    //Primero verifica si la ruta es pública, si es así, no pide nada. Si requiere autenticación, chequea el JWT y los claims
    //Si el JWT es inválido, tira un 401 (invalido o expiró).
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(7);
        try {
            Claims claims = jwtService.validarYExtraerClaims(token);
            Integer sesionId = jwtService.extraerSesionId(claims);
            if (!jwtService.subjectCoincideConUserId(claims)) {
                throw new JwtException("Token emitido con un formato anterior");
            }

            EstadoDeSesion estado = sesionRepository.leerEstadoDeSesion(sesionId).orElse(null);
            if (estado != null && EstadoUsuario.SUSPENDIDO.name().equals(estado.getEstadoUsuario())) {
                SecurityContextHolder.clearContext();
                authenticationEntryPoint.commence(request, response,
                        new CuentaSuspendidaAuthenticationException(estado.getMotivoSuspension()));
                return;
            }

            if (estado == null || !estado.getActiva()) {
                SecurityContextHolder.clearContext();
                authenticationEntryPoint.commence(request, response,
                        new InsufficientAuthenticationException("La sesión fue cerrada"));
                return;
            }

            Integer userId = jwtService.extraerUserId(claims);
            RolUsuario rol = jwtService.extraerRol(claims);

            AuthenticatedUser principal = new AuthenticatedUser(userId, sesionId, rol);
            List<SimpleGrantedAuthority> authorities = List.of(new SimpleGrantedAuthority("ROLE_" + rol.name()));
            var authentication = new UsernamePasswordAuthenticationToken(principal, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authentication);

            filterChain.doFilter(request, response);
        } catch (JwtException | IllegalArgumentException ex) {
            SecurityContextHolder.clearContext();
            authenticationEntryPoint.commence(request, response,
                    new InsufficientAuthenticationException("Token inválido o expirado", ex));
        }
    }
}
