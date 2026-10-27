package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import java.util.List;
import lombok.Getter;

@Getter
public class RequisitosVentaResponseDTO {

    @Getter
    public static class TipoDocumentoDTO {
        private final String codigo;
        private final String etiqueta;
        private final boolean requiereDescripcion;

        public TipoDocumentoDTO(String codigo, String etiqueta, boolean requiereDescripcion) {
            this.codigo = codigo;
            this.etiqueta = etiqueta;
            this.requiereDescripcion = requiereDescripcion;
        }
    }

    private final EstadoComercio estadoComercio;
    private final boolean comercioAprobado;
    private final boolean cuentaMercadoPagoVinculada;
    private final boolean documentacionRequerida;
    private final long documentosAprobados;
    private final long documentosPendientes;
    private final long documentosRechazados;
    private final boolean aptoVenta;
    private final boolean puedeSubir;
    private final List<String> faltan;
    private final List<TipoDocumentoDTO> tipos;
    private final int maxBytes;
    private final int maxEnRevision;
    private final int maxTotal;
    private final List<String> formatosPermitidos;

    public RequisitosVentaResponseDTO(EstadoComercio estadoComercio, boolean comercioAprobado,
            boolean cuentaMercadoPagoVinculada, boolean documentacionRequerida, long documentosAprobados,
            long documentosPendientes, long documentosRechazados, boolean aptoVenta, boolean puedeSubir,
            List<String> faltan, List<TipoDocumentoDTO> tipos, int maxBytes, int maxEnRevision, int maxTotal,
            List<String> formatosPermitidos) {
        this.estadoComercio = estadoComercio;
        this.comercioAprobado = comercioAprobado;
        this.cuentaMercadoPagoVinculada = cuentaMercadoPagoVinculada;
        this.documentacionRequerida = documentacionRequerida;
        this.documentosAprobados = documentosAprobados;
        this.documentosPendientes = documentosPendientes;
        this.documentosRechazados = documentosRechazados;
        this.aptoVenta = aptoVenta;
        this.puedeSubir = puedeSubir;
        this.faltan = faltan;
        this.tipos = tipos;
        this.maxBytes = maxBytes;
        this.maxEnRevision = maxEnRevision;
        this.maxTotal = maxTotal;
        this.formatosPermitidos = formatosPermitidos;
    }
}
