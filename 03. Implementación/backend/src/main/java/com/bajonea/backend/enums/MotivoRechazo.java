package com.bajonea.backend.enums;

public enum MotivoRechazo {
    SIN_STOCK("Sin stock"),
    CERRADO("Comercio cerrado"),
    ALTO_VOLUMEN_PEDIDOS("Alto volumen de pedidos"),
    PRODUCTO_NO_DISPONIBLE_TEMPORAL("Producto no disponible temporalmente"),
    SIN_DELIVERY_DISPONIBLE("Sin delivery disponible"),
    PROBLEMA_TECNICO("Problema técnico"),
    OTRO("Otro");

    private final String etiqueta;

    MotivoRechazo(String etiqueta) {
        this.etiqueta = etiqueta;
    }

    public String getEtiqueta() {
        return etiqueta;
    }
}
