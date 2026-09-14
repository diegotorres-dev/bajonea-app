package com.bajonea.backend.config.security;

import com.bajonea.backend.enums.RolUsuario;

/**
 * Principal cargado en el {@code SecurityContextHolder} por {@link JwtAuthenticationFilter}.
 * Lleva {@code sesionId} además de los datos básicos del usuario porque {@code AuthService}
 * (logout, cambio de contraseña) necesita saber qué fila de {@code Sesion} cerrar sin volver
 * a parsear el JWT.
 */

// "Record" porque es inmutable.
// Es el objeto armado con los datos para no usar el token JWT crudo (sino cada controller tendría que validarlo)
public record AuthenticatedUser(Integer userId, Integer sesionId, String email, RolUsuario rol) {
}
