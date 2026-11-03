package com.bajonea.backend.services;

/**
 * Resultado de una transacción del módulo de Soporte: el valor o el error de negocio que corresponde lanzar. El error se
 * lanza recién cuando la transacción terminó ({@link #obtener}), para que un límite superado, una consulta que no existe
 * o un mensaje fuera de turno nunca revierta la transacción (y con ella los contadores de intentos que hay que conservar).
 */
public record ResultadoSoporte<T>(T valor, RuntimeException error) {

    public static <T> ResultadoSoporte<T> ok(T valor) {
        return new ResultadoSoporte<>(valor, null);
    }

    public static <T> ResultadoSoporte<T> error(RuntimeException error) {
        return new ResultadoSoporte<>(null, error);
    }

    public T obtener() {
        if (error != null) {
            throw error;
        }
        return valor;
    }
}
