package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.TipoDocumentoComercio;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import org.springframework.web.multipart.MultipartFile;

@Getter
public class SubirDocumentoComercioRequestDTO {

    @NotNull(message = "Elegí el tipo de documento")
    private TipoDocumentoComercio tipo;

    @Size(max = 100, message = "La descripción puede tener hasta 100 caracteres")
    private String descripcion;

    @NotNull(message = "Elegí el archivo que vas a subir")
    private MultipartFile archivo;

    public void setTipo(TipoDocumentoComercio tipo) {
        this.tipo = tipo;
    }

    public void setDescripcion(String descripcion) {
        this.descripcion = descripcion == null ? null : descripcion.trim();
    }

    public void setArchivo(MultipartFile archivo) {
        this.archivo = archivo;
    }

    @AssertTrue(message = "Contanos qué documento es")
    public boolean isDescripcionDeOtroCompleta() {
        return tipo != TipoDocumentoComercio.OTRO || (descripcion != null && !descripcion.isBlank());
    }
}
