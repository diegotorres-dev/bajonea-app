package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.TipoTicketSoporte;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class ConsultaSoporteAdminResumenResponseDTO {

    private final Integer id;
    private final String codigo;
    private final TipoTicketSoporte tipo;
    private final String email;
    private final EstadoTicketSoporte estado;
    private final int cantidadMensajes;
    private final LocalDateTime creadoEn;
    private final LocalDateTime actualizadoEn;
    private final boolean cuentaSuspendida;
    private final boolean emailPendienteDeReenvio;

    public ConsultaSoporteAdminResumenResponseDTO(Integer id, String codigo, TipoTicketSoporte tipo, String email,
            EstadoTicketSoporte estado, int cantidadMensajes, LocalDateTime creadoEn, LocalDateTime actualizadoEn,
            boolean cuentaSuspendida, boolean emailPendienteDeReenvio) {
        this.id = id;
        this.codigo = codigo;
        this.tipo = tipo;
        this.email = email;
        this.estado = estado;
        this.cantidadMensajes = cantidadMensajes;
        this.creadoEn = creadoEn;
        this.actualizadoEn = actualizadoEn;
        this.cuentaSuspendida = cuentaSuspendida;
        this.emailPendienteDeReenvio = emailPendienteDeReenvio;
    }
}
