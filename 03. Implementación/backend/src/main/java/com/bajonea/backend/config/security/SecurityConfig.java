package com.bajonea.backend.config.security;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * {@code sessionCreationPolicy(STATELESS)} es sobre el {@code HttpSession}/cookie de servlet
 * de Spring Security — no tiene relación con la tabla {@code Sesion} propia de la aplicación
 * (ver CLAUDE.md §7 y docs/DECISIONES.md, 2026-07-17). Ambas conviven sin contradicción:
 * Spring Security sigue sin guardar nada en el servidor vía HttpSession; el estado de sesión
 * de negocio lo valida {@link JwtAuthenticationFilter} contra {@code Sesion.activa}.
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final CustomAuthenticationEntryPoint authenticationEntryPoint;
    private final CustomAccessDeniedHandler accessDeniedHandler;

    /**
     * {@code /error} tiene que ser público sin importar qué endpoint haya fallado: cualquier
     * excepción no cubierta por {@code GlobalExceptionHandler} (ej. un {@code @RequestParam}
     * requerido ausente) se resuelve con {@code response.sendError(...)}, que el contenedor
     * traduce en un forward interno a {@code /error} — y ese forward vuelve a pasar por este
     * mismo filtro de seguridad. Si {@code /error} no está acá, ese segundo paso lo intercepta
     * {@code anyRequest().authenticated()} y devuelve {@code 401} en vez del status real del
     * error original, incluso en un endpoint público (ver docs/DECISIONES.md, 2026-07-18: bug
     * real encontrado probando {@code GeografiaService} — {@code MissingServletRequestParameterException}
     * enmascarada como 401 en vez de 400).
     * <p>
     * {@code /swagger-ui.html} necesita su propia entrada, separada de
     * {@code /swagger-ui/**}: springdoc lo registra como un redirect a
     * {@code /swagger-ui/index.html}, no como un subpath de {@code /swagger-ui/} — sin esta
     * entrada, {@code /swagger-ui.html} (el link literal que da la guía y que springdoc loguea
     * al arrancar) devolvía {@code 401} en vez de redirigir (bug real encontrado probando
     * Fase 13, ver docs/DECISIONES.md, 2026-07-19).
     * <p>
     * {@code /api/v1/test/**} (Fase 14, bypass de verificación para Postman) es público acá,
     * pero la protección real es estructural, no esta lista: {@code TestController}/
     * {@code TestSupportService} llevan {@code @Profile("test")}, así que fuera de ese perfil
     * Spring nunca registra el bean ni la ruta — permitirla acá no la hace alcanzable en el
     * perfil normal/producción, donde ni siquiera existe un handler que responda.
     */
    private static final String[] RUTAS_PUBLICAS = {
            "/api/v1/auth/registro/**",
            "/api/v1/auth/login",
            "/api/v1/auth/verificar/**",
            "/api/v1/auth/recuperar-password",
            "/api/v1/auth/recuperar-password/confirmar",
            "/api/v1/auth/reactivar-cuenta",
            "/api/v1/auth/reactivar-cuenta/confirmar/**",
            "/api/v1/catalogo/**",
            "/api/v1/geografia/**",
            "/api/v1/health",
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/v3/api-docs/**",
            "/error",
            "/api/v1/test/**"
    };

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptionHandling -> exceptionHandling
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(RUTAS_PUBLICAS).permitAll()
                        .requestMatchers("/api/v1/productos/**", "/api/v1/comercios/**").hasRole("COMERCIO")
                        .requestMatchers("/api/v1/categorias/**", "/api/v1/tags/**", "/api/v1/administrador/**")
                        .hasRole("ADMINISTRADOR")
                        .requestMatchers("/api/v1/carrito/**", "/api/v1/pedidos/cliente/**").hasRole("CLIENTE")
                        .requestMatchers("/api/v1/pedidos/comercio/**").hasRole("COMERCIO")
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of("*"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
