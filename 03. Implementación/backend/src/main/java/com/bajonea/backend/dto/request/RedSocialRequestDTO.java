package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.TipoRedSocial;
import com.bajonea.backend.util.TextoUtils;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RedSocialRequestDTO {

    @NotNull(message = "Seleccioná el tipo de red social")
    private TipoRedSocial tipo;

    @NotBlank(message = "El link es obligatorio")
    @Pattern(regexp = "^(?=.*\\p{L})(?=.*\\.)\\S+$", message = "Ingresá un link válido")
    @Size(max = 500, message = "El link no puede superar los 500 caracteres")
    @Setter(AccessLevel.NONE)
    private String url;

    public void setUrl(String url) {
        this.url = TextoUtils.normalizarUrlConEsquema(url);
    }
}
