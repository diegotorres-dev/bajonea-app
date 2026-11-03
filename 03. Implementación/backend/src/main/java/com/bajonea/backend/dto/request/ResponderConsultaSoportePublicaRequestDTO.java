package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ResponderConsultaSoportePublicaRequestDTO {

    @NotBlank(message = "El email es obligatorio")
    @ValidarFormatoEmail
    @Size(max = 254, message = "El email no puede superar los 254 caracteres")
    private String email;

    @NotBlank(message = "El código es obligatorio")
    @Size(max = 30, message = "El código es demasiado largo")
    private String codigo;

    @NotBlank(message = "Escribí tu mensaje")
    @Size(max = 1000, message = "El mensaje no puede superar los 1000 caracteres")
    private String texto;

    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo;
    }

    public void setTexto(String texto) {
        this.texto = texto == null ? null : texto.trim();
    }
}
