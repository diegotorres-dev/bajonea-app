package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;

@Getter
public class ResolverDocumentoRequestDTO {

    @NotNull(message = "Indicá si aprobás o rechazás el documento")
    private Boolean aprobar;

    @Size(max = 255, message = "El motivo puede tener hasta 255 caracteres")
    private String motivo;

    public void setAprobar(Boolean aprobar) {
        this.aprobar = aprobar;
    }

    public void setMotivo(String motivo) {
        this.motivo = motivo == null ? null : motivo.trim();
    }

    @AssertTrue(message = "El motivo es obligatorio al rechazar un documento")
    public boolean isMotivoCompletoAlRechazar() {
        return !Boolean.FALSE.equals(aprobar) || (motivo != null && !motivo.isBlank());
    }
}
