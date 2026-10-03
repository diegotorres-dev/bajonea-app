package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import lombok.Getter;

/**
 * Resumen de otro comercio del mismo Dueño, para que el Administrador tenga contexto al revisar una
 * solicitud pendiente ({@link ComercioAdminResponseDTO#getOtrosComercios()}). Solo nombre, estado y
 * foto: ningún dato del Dueño ni del comercio que no se vea ya en el listado.
 */
@Getter
public class OtroComercioDuenoResponseDTO {

    private final Integer id;
    private final String nombre;
    private final EstadoComercio estado;
    private final String fotoPerfilUrl;

    public OtroComercioDuenoResponseDTO(Integer id, String nombre, EstadoComercio estado, String fotoPerfilUrl) {
        this.id = id;
        this.nombre = nombre;
        this.estado = estado;
        this.fotoPerfilUrl = fotoPerfilUrl;
    }
}
