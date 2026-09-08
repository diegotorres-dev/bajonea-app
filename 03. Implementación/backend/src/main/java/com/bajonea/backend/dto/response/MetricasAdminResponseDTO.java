package com.bajonea.backend.dto.response;

import lombok.Getter;

/**
 * Resumen para el dashboard del Administrador (AD01, Fase 16 Tramo 8). {@code comerciosTotal}
 * y {@code clientesTotal} cuentan todos los registros sin filtrar por estado — no existe hoy
 * ningún endpoint de listado completo de comercios/clientes (ver docs/DECISIONES.md, gap
 * heredado de Fase 15 §2.4, AD07/AD11), así que estos 2 campos son deliberadamente solo un
 * conteo agregado, no una lista.
 */
@Getter
public class MetricasAdminResponseDTO {

    private final long comerciosPendientes;
    private final long comerciosTotal;
    private final long clientesTotal;
    private final long categoriasActivas;
    private final long tagsActivos;

    public MetricasAdminResponseDTO(
            long comerciosPendientes,
            long comerciosTotal,
            long clientesTotal,
            long categoriasActivas,
            long tagsActivos) {
        this.comerciosPendientes = comerciosPendientes;
        this.comerciosTotal = comerciosTotal;
        this.clientesTotal = clientesTotal;
        this.categoriasActivas = categoriasActivas;
        this.tagsActivos = tagsActivos;
    }
}
