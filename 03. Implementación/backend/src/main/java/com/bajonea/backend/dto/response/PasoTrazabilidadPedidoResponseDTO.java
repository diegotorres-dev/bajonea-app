package com.bajonea.backend.dto.response;

import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Un paso del recorrido de un pedido. {@code actorNombre} es nulo en las acciones del sistema ({@code actorRol =
 * SISTEMA}: la pantalla escribe "Sistema"); en las del Cliente lleva su nombre y apellido y en las del Dueño y los
 * Empleados el nombre y apellido de la persona, nunca otro dato. No lleva ids de usuario. {@code motivo} solo está
 * en el rechazo y la anulación.
 */
@Getter
public class PasoTrazabilidadPedidoResponseDTO {

    private final LocalDateTime fechaHora;
    private final String estado;
    private final String accionTexto;
    private final String actorRol;
    private final String actorRolTexto;
    private final String actorNombre;
    private final String motivo;

    public PasoTrazabilidadPedidoResponseDTO(LocalDateTime fechaHora, String estado, String accionTexto, String actorRol,
            String actorRolTexto, String actorNombre, String motivo) {
        this.fechaHora = fechaHora;
        this.estado = estado;
        this.accionTexto = accionTexto;
        this.actorRol = actorRol;
        this.actorRolTexto = actorRolTexto;
        this.actorNombre = actorNombre;
        this.motivo = motivo;
    }
}
