package com.bajonea.backend.config.security;

import com.bajonea.backend.entities.Sesion;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.repositories.SesionRepository;
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
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final SesionRepository sesionRepository;
    private final AuthenticationEntryPoint authenticationEntryPoint;

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

            boolean sesionActiva = sesionRepository.findById(sesionId)
                    .map(Sesion::isActiva)
                    .orElse(false);

            if (!sesionActiva) {
                SecurityContextHolder.clearContext();
                authenticationEntryPoint.commence(request, response,
                        new InsufficientAuthenticationException("La sesión fue cerrada"));
                return;
            }

            Integer userId = jwtService.extraerUserId(claims);
            RolUsuario rol = jwtService.extraerRol(claims);
            String email = claims.getSubject();

            AuthenticatedUser principal = new AuthenticatedUser(userId, sesionId, email, rol);
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
