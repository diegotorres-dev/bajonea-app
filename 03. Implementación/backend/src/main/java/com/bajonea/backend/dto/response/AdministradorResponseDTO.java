package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Perfil propio del Administrador autenticado (Fase 16 Tramo 21) — {@code nombre}/
 * {@code apellido} para mostrar en el header del dashboard, leídos vía la cadena
 * {@code Administrador → PersonaFisica} (mismo patrón que {@code ClienteService}/
 * {@code ComercioService}). Sin endpoint de edición de nombre/apellido: el Administrador se
 * siembra por Flyway, no tiene autoservicio de esos datos. {@code fotoPerfilUrl} (Usuario,
 * Tramo de portabilidad a bajonea_final) sí es editable vía {@code UsuarioController}.
 */
@Getter
public class AdministradorResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String apellido;
    private final String fotoPerfilUrl;

    public AdministradorResponseDTO(Integer id, String nombre, String apellido, String fotoPerfilUrl) {
        this.id = id;
        this.nombre = nombre;
        this.apellido = apellido;
        this.fotoPerfilUrl = fotoPerfilUrl;
    }
}
