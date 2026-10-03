package com.bajonea.backend.exceptions;

/**
 * La cuenta de Mercado Pago que se quiere vincular ya está activa en otro Dueño. Mapea a {@code 409} por ser
 * una {@link ConflictoDeNegocioException}; el mensaje no revela quién la tiene.
 */
public class CuentaMercadoPagoEnUsoException extends ConflictoDeNegocioException {

    public static final String MENSAJE = "Esa cuenta de Mercado Pago ya está en uso por otro Dueño. "
            + "Usá otra cuenta, o pedí que la desvinculen primero.";

    public CuentaMercadoPagoEnUsoException() {
        super(MENSAJE);
    }
}
