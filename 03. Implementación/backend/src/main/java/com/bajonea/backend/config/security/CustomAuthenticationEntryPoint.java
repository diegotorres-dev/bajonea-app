package com.bajonea.backend.config.security;

import com.bajonea.backend.dto.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Dispara ante 401: sin token, token inválido/expirado, o sesión cerrada (ver
 * JwtAuthenticationFilter). No pasa por GlobalExceptionHandler — Spring Security intercepta
 * antes de llegar al DispatcherServlet — así que escribe el {@link ApiResponse} directo al
 * response para mantener el mismo formato de error en toda la API (CLAUDE.md, regla 3).
 */
@Component
public class CustomAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException authException)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(
                new ApiResponse<>("No autenticado: token ausente, inválido, expirado o sesión cerrada", null)));
    }
}
