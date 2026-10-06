package com.bajonea.backend.dto.response;

import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Lo que ve quien probó el código de una invitación de empleado: a qué comercio lo invitaron, si el email ya
 * tiene cuenta (y por lo tanto no hay que pedirle datos) y hasta cuándo vale la invitación.
 */
@Getter
public class InvitacionEmpleadoValidadaResponseDTO {

    private final String comercioNombre;
    private final String comercioFotoPerfilUrl;
    private final boolean cuentaExistente;
    private final LocalDateTime fechaVencimiento;

    public InvitacionEmpleadoValidadaResponseDTO(String comercioNombre, String comercioFotoPerfilUrl,
            boolean cuentaExistente, LocalDateTime fechaVencimiento) {
        this.comercioNombre = comercioNombre;
        this.comercioFotoPerfilUrl = comercioFotoPerfilUrl;
        this.cuentaExistente = cuentaExistente;
        this.fechaVencimiento = fechaVencimiento;
    }
}
