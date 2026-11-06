package com.bajonea.backend.exceptions;

import com.bajonea.backend.dto.response.ComercioAlReactivarResponseDTO;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * La contraseña es correcta pero la cuenta está inactiva por falta de uso. Mapea a {@code 409} con
 * {@code data.codigo = CUENTA_INACTIVA}, para que el cliente ofrezca reactivar la cuenta sin leer el texto. El texto
 * es el mismo que el login ya devolvía para una cuenta inactiva, así las pantallas anteriores siguen reconociéndolo.
 */
public class CuentaInactivaException extends ConflictoDeNegocioException {

    public static final String CODIGO = "CUENTA_INACTIVA";
    public static final String MENSAJE = "Cuenta inactiva. Solicitá la reactivación de tu cuenta";

    private final transient Map<String, Object> data;

    public CuentaInactivaException() {
        this(List.of());
    }

    public CuentaInactivaException(List<ComercioAlReactivarResponseDTO> comercios) {
        super(MENSAJE);
        Map<String, Object> datos = new LinkedHashMap<>();
        datos.put("codigo", CODIGO);
        datos.put("comercios", comercios);
        this.data = datos;
    }

    public Map<String, Object> getData() {
        return data;
    }
}
