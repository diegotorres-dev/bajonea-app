package com.bajonea.backend.config.security;

import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.RolUsuario;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Genera, valida y parsea el JWT (claims {@code sub}=email, {@code userId}, {@code rol},
 * {@code sesionId}, {@code iat}, {@code exp}). {@code sesionId} referencia la fila de
 * {@code Sesion} que {@link JwtAuthenticationFilter} consulta en cada request — ver
 * docs/DECISIONES.md, 2026-07-17.
 */
@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration-ms}")
    private long expirationMs;

    public String generarToken(Usuario usuario, Integer sesionId) {
        Date ahora = new Date();
        Date expiracion = new Date(ahora.getTime() + expirationMs);

        return Jwts.builder()
                .subject(usuario.getEmail())
                .claim("userId", usuario.getId())
                .claim("rol", usuario.getRol().name())
                .claim("sesionId", sesionId)
                .issuedAt(ahora)
                .expiration(expiracion)
                .signWith(claveFirma())
                .compact();
    }

    public Claims validarYExtraerClaims(String token) {
        return Jwts.parser()
                .verifyWith(claveFirma())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public Integer extraerUserId(Claims claims) {
        return claims.get("userId", Integer.class);
    }

    public Integer extraerSesionId(Claims claims) {
        return claims.get("sesionId", Integer.class);
    }

    public RolUsuario extraerRol(Claims claims) {
        return RolUsuario.valueOf(claims.get("rol", String.class));
    }

    private SecretKey claveFirma() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }
}
