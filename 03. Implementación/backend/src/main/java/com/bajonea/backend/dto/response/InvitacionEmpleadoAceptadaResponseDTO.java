package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Resultado de aceptar una invitación de empleado: el comercio, si se creó una cuenta nueva y si la relación
 * con el comercio era una anterior (dada de baja) que se reactivó. No incluye ninguna sesión: el frontend
 * lleva a la persona al inicio de sesión.
 */
@Getter
public class InvitacionEmpleadoAceptadaResponseDTO {

    private final String comercioNombre;
    private final boolean cuentaCreada;
    private final boolean relacionReactivada;

    public InvitacionEmpleadoAceptadaResponseDTO(String comercioNombre, boolean cuentaCreada, boolean relacionReactivada) {
        this.comercioNombre = comercioNombre;
        this.cuentaCreada = cuentaCreada;
        this.relacionReactivada = relacionReactivada;
    }
}
