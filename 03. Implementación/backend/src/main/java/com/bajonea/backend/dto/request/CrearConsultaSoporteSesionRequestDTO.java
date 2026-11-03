package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.TipoTicketSoporte;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CrearConsultaSoporteSesionRequestDTO {

    @NotNull(message = "Elegí el motivo de tu consulta")
    private TipoTicketSoporte tipo;

    @NotBlank(message = "Escribí tu mensaje")
    @Size(min = 10, max = 1000, message = "El mensaje debe tener entre 10 y 1000 caracteres")
    private String mensaje;

    public void setTipo(TipoTicketSoporte tipo) {
        this.tipo = tipo;
    }

    public void setMensaje(String mensaje) {
        this.mensaje = mensaje == null ? null : mensaje.trim();
    }
}
