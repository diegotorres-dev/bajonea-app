package com.bajonea.backend.exceptions;

/**
 * El comercio indicado en {@code X-Comercio-Id} no se puede usar para el usuario autenticado: no existe, es de
 * otro Dueño, el Empleado no tiene relación activa con él o está en un estado al que ese actor no accede.
 * Mapea a {@code 404} con el mismo mensaje y el mismo código estable en {@code data} para todos los casos, de
 * modo que nada permita distinguirlos.
 */
public class ComercioNoDisponibleException extends RecursoNoEncontradoException {

    public static final String MENSAJE = "Comercio no encontrado";
    public static final String CODIGO = "COMERCIO_NO_DISPONIBLE";

    public ComercioNoDisponibleException() {
        super(MENSAJE);
    }
}
