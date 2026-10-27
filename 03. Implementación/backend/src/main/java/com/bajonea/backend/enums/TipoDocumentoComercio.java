package com.bajonea.backend.enums;

public enum TipoDocumentoComercio {
    LIBRETA_SANITARIA("Libreta sanitaria"),
    CARNET_MANIPULACION_ALIMENTOS("Carnet de manipulación de alimentos"),
    HABILITACION_COMERCIAL("Habilitación comercial"),
    OTRO("Otro");

    private final String etiqueta;

    TipoDocumentoComercio(String etiqueta) {
        this.etiqueta = etiqueta;
    }

    public String getEtiqueta() {
        return etiqueta;
    }
}
