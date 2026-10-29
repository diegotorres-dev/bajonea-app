package com.bajonea.backend.exceptions;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * La cuenta del usuario está suspendida. Mapea a {@code 409} con {@code data.codigo = CUENTA_SUSPENDIDA} y el motivo
 * que cargó el Administrador, para que el cliente muestre la pantalla de cuenta suspendida sin leer el texto. La
 * variante para una sesión que ya estaba abierta (el filtro JWT) responde {@code 401} con el mismo código y motivo.
 */
public class CuentaSuspendidaException extends ConflictoDeNegocioException {

    public static final String CODIGO = "CUENTA_SUSPENDIDA";
    public static final String MENSAJE = "Tu cuenta fue suspendida";

    private final transient Map<String, Object> data;

    public CuentaSuspendidaException(String motivo) {
        super(MENSAJE);
        this.data = datos(motivo);
    }

    public Map<String, Object> getData() {
        return data;
    }

    public static Map<String, Object> datos(String motivo) {
        Map<String, Object> datos = new LinkedHashMap<>();
        datos.put("codigo", CODIGO);
        datos.put("motivo", motivo);
        return datos;
    }
}
