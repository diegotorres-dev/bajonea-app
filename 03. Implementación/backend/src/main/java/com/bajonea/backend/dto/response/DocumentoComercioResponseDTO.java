package com.bajonea.backend.dto.response;

import com.bajonea.backend.entities.DocumentoComercio;
import com.bajonea.backend.enums.EstadoDocumentoComercio;
import com.bajonea.backend.enums.TipoDocumentoComercio;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class DocumentoComercioResponseDTO {

    private final Integer id;
    private final Integer comercioId;
    private final TipoDocumentoComercio tipo;
    private final String tipoEtiqueta;
    private final String descripcion;
    private final String nombreOriginal;
    private final String tipoMime;
    private final Integer tamanoBytes;
    private final EstadoDocumentoComercio estado;
    private final String motivoRechazo;
    private final LocalDateTime fechaSubida;
    private final LocalDateTime fechaResolucion;

    public DocumentoComercioResponseDTO(DocumentoComercio documento) {
        this.id = documento.getId();
        this.comercioId = documento.getComercioId();
        this.tipo = documento.getTipo();
        this.tipoEtiqueta = documento.getTipo().getEtiqueta();
        this.descripcion = documento.getDescripcion();
        this.nombreOriginal = documento.getNombreOriginal();
        this.tipoMime = documento.getTipoMime();
        this.tamanoBytes = documento.getTamanoBytes();
        this.estado = documento.getEstado();
        this.motivoRechazo = documento.getMotivoRechazo();
        this.fechaSubida = documento.getFechaSubida();
        this.fechaResolucion = documento.getFechaResolucion();
    }
}
