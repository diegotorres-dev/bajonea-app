package com.bajonea.backend.exceptions;

/**
 * El Dueño ya tiene una cuenta de Mercado Pago activa y quiere vincular otra distinta (o iniciar una nueva
 * vinculación) sin desvincular antes. Mapea a {@code 409} por ser una {@link ConflictoDeNegocioException};
 * es una clase propia para que el callback de OAuth la distinga de un error genérico.
 */
public class CuentaMercadoPagoYaVinculadaException extends ConflictoDeNegocioException {

    public static final String MENSAJE = "Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra.";

    public CuentaMercadoPagoYaVinculadaException() {
        super(MENSAJE);
    }
}
