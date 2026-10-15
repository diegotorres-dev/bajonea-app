package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Una invitación de empleado tal como la ve el Dueño. {@code estado} es el estado guardado, salvo en el
 * intervalo en que el proceso de vencimiento todavía no corrió: una invitación {@code PENDIENTE} cuya fecha de
 * vencimiento ya pasó se informa como {@code VENCIDA} (red de seguridad al armar la respuesta). No incluye el
 * código.
 * <p>
 * {@code diasRestantes} solo tiene valor en una invitación {@code PENDIENTE} vigente (nulo en el resto) y lo calcula
 * el servidor con la hora y la zona de la aplicación: los días que faltan para el vencimiento redondeados hacia
 * arriba, con un mínimo de 1 (una invitación que vence dentro de las próximas 24 horas dice 1; una que vence en
 * 6 días y medio dice 7). Es el mismo cálculo que hacía la pantalla, sin depender de la zona del navegador.
 */
@Getter
public class InvitacionEmpleadoResponseDTO {

    private final Integer id;
    private final String email;
    private final EstadoInvitacionEmpleado estado;
    private final LocalDateTime fechaCreacion;
    private final LocalDateTime fechaVencimiento;
    private final Integer diasRestantes;

    public InvitacionEmpleadoResponseDTO(Integer id, String email, EstadoInvitacionEmpleado estado, LocalDateTime fechaCreacion,
            LocalDateTime fechaVencimiento, Integer diasRestantes) {
        this.id = id;
        this.email = email;
        this.estado = estado;
        this.fechaCreacion = fechaCreacion;
        this.fechaVencimiento = fechaVencimiento;
        this.diasRestantes = diasRestantes;
    }
}
