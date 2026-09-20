package com.bajonea.backend.exceptions;

/**
 * Mapea a {@code 503 Service Unavailable} (ver GlobalExceptionHandler). Para fallas de un servicio
 * externo (ej. MercadoPago) que impiden completar una operación que no debe continuar sin él.
 */
public class ServicioNoDisponibleException extends RuntimeException {

    public ServicioNoDisponibleException(String mensaje) {
        super(mensaje);
    }
}
