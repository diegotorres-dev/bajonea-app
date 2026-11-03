package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.TipoTicketSoporte;
import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CrearConsultaSoporteRequestDTO {

    @NotBlank(message = "El email es obligatorio")
    @ValidarFormatoEmail
    @Size(max = 254, message = "El email no puede superar los 254 caracteres")
    private String email;

    @NotNull(message = "Elegí el motivo de tu consulta")
    private TipoTicketSoporte tipo;

    @NotBlank(message = "Escribí tu mensaje")
    @Size(min = 10, max = 1000, message = "El mensaje debe tener entre 10 y 1000 caracteres")
    private String mensaje;

    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public void setTipo(TipoTicketSoporte tipo) {
        this.tipo = tipo;
    }

    public void setMensaje(String mensaje) {
        this.mensaje = mensaje == null ? null : mensaje.trim();
    }
}
