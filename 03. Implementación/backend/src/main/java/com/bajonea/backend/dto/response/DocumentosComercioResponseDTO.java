package com.bajonea.backend.dto.response;

import java.util.List;
import lombok.Getter;

@Getter
public class DocumentosComercioResponseDTO {

    private final List<DocumentoComercioResponseDTO> documentos;
    private final long enRevision;
    private final int maxEnRevision;
    private final long total;
    private final int maxTotal;
    private final int maxBytes;

    public DocumentosComercioResponseDTO(List<DocumentoComercioResponseDTO> documentos, long enRevision,
            int maxEnRevision, long total, int maxTotal, int maxBytes) {
        this.documentos = documentos;
        this.enRevision = enRevision;
        this.maxEnRevision = maxEnRevision;
        this.total = total;
        this.maxTotal = maxTotal;
        this.maxBytes = maxBytes;
    }
}
