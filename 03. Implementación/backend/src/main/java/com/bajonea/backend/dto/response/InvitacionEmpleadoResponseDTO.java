package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Una invitación de empleado tal como la ve el Dueño. {@code estado} es el estado guardado, salvo en el
 * intervalo en que el proceso de vencimiento todavía no corrió: una invitación {@code PENDIENTE} cuya fecha de
 * vencimiento ya pasó se informa como {@code VENCIDA} (red de seguridad al armar la respuesta). No incluye el
 * código.
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
