package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Una invitación de empleado tal como la ve el Dueño. {@code estado} es el estado visible: una invitación
 * guardada como {@code PENDIENTE} cuya fecha de vencimiento ya pasó se informa como {@code VENCIDA}
 * (calculado al armar la respuesta, sin job). No incluye el código.
 */
@Getter
public class InvitacionEmpleadoResponseDTO {

    private final Integer id;
    private final String email;
    private final EstadoInvitacionEmpleado estado;
    private final LocalDateTime fechaCreacion;
    private final LocalDateTime fechaVencimiento;

    public InvitacionEmpleadoResponseDTO(Integer id, String email, EstadoInvitacionEmpleado estado, LocalDateTime fechaCreacion,
            LocalDateTime fechaVencimiento) {
        this.id = id;
        this.email = email;
        this.estado = estado;
        this.fechaCreacion = fechaCreacion;
        this.fechaVencimiento = fechaVencimiento;
    }
}
