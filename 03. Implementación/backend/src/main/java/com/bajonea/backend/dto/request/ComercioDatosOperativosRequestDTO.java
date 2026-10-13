package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body de {@code PUT /api/v1/comercios/perfil/datos-operativos}: lo único del perfil que un Empleado puede editar
 * (descripción y teléfono; los horarios no tienen todavía un endpoint de edición). A diferencia del resto de los
 * cuerpos del proyecto, rechaza las propiedades que no conoce: Spring Boot configura Jackson para ignorarlas en
 * silencio, así que acá se recogen con {@code @JsonAnySetter} y una validación hace que un Empleado que mande
 * {@code nombre}, {@code emailContacto}, modalidades de entrega o cualquier otro campo del Dueño reciba {@code 400}
 * y no se cambie nada. Mismas reglas de validación que {@link ComercioPerfilRequestDTO} para los dos campos.
 */
@Getter
@Setter
@NoArgsConstructor
public class ComercioDatosOperativosRequestDTO {

    @Size(max = 2000, message = "La descripción no puede superar los 2000 caracteres.")
    private String descripcion;

    @NotBlank(message = "No debe estar vacío")
    @ValidarTelefonoArgentino
    @Size(max = 30)
    private String telefono;

    @JsonIgnore
    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    private final Map<String, Object> camposNoPermitidos = new LinkedHashMap<>();

    public ComercioDatosOperativosRequestDTO(String descripcion, String telefono) {
        this.descripcion = descripcion;
        this.telefono = telefono;
    }

    @JsonAnySetter
    void campoNoPermitido(String nombre, Object valor) {
        camposNoPermitidos.put(nombre, valor);
    }

    @JsonIgnore
    @AssertTrue(message = "Solo se pueden enviar la descripción y el teléfono")
    public boolean isSoloDescripcionYTelefono() {
        return camposNoPermitidos.isEmpty();
    }
}
