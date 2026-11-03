package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarFormatoEmail;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ReenviarCodigosSoporteRequestDTO {

    @NotBlank(message = "El email es obligatorio")
    @ValidarFormatoEmail
    @Size(max = 254, message = "El email no puede superar los 254 caracteres")
    private String email;

    public void setEmail(String email) {
        this.email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
