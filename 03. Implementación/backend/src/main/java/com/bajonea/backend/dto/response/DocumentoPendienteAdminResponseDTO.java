package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.TipoDocumentoComercio;
import com.bajonea.backend.repositories.DocumentoComercioRepository.DocumentoPendienteFila;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class DocumentoPendienteAdminResponseDTO {

    private final Integer id;
    private final Integer comercioId;
    private final String nombreComercio;
    private final Integer duenoId;
    private final String nombreDueno;
    private final TipoDocumentoComercio tipo;
    private final String tipoEtiqueta;
    private final String descripcion;
    private final String nombreOriginal;
    private final String tipoMime;
    private final Integer tamanoBytes;
    private final LocalDateTime fechaSubida;
    private final boolean cuentaMercadoPagoVinculada;

    public DocumentoPendienteAdminResponseDTO(DocumentoPendienteFila fila) {
        this.id = fila.getId();
        this.comercioId = fila.getComercioId();
        this.nombreComercio = fila.getNombreComercio();
        this.duenoId = fila.getDuenoId();
        this.nombreDueno = (fila.getNombreDueno() + " " + fila.getApellidoDueno()).trim();
        this.tipo = fila.getTipo();
        this.tipoEtiqueta = fila.getTipo().getEtiqueta();
        this.descripcion = fila.getDescripcion();
        this.nombreOriginal = fila.getNombreOriginal();
        this.tipoMime = fila.getTipoMime();
        this.tamanoBytes = fila.getTamanoBytes();
        this.fechaSubida = fila.getFechaSubida();
        this.cuentaMercadoPagoVinculada = fila.getCuentasMercadoPagoActivas() != null && fila.getCuentasMercadoPagoActivas() > 0;
    }
}
