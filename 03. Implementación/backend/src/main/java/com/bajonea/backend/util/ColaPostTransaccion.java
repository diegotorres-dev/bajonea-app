package com.bajonea.backend.util;

import java.util.ArrayDeque;
import java.util.Deque;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Efectos hacia afuera (un email, la llamada a Mercado Pago) que tienen que correr después de que la transacción más
 * externa terminó y soltó su conexión. Desde {@code afterCommit} la transacción ya se confirmó, pero su conexión sigue
 * tomada hasta que el gestor limpia sus recursos: cualquier transacción nueva que se abra ahí pide una segunda conexión
 * mientras se sostiene la primera, y con el pool lleno de hilos en esa situación nadie avanza. El gestor de
 * transacciones de la aplicación ({@code GestorTransacciones}) cuenta las transacciones que empezó en el hilo y vacía
 * esta cola cuando termina la última, ya sin conexión ni sincronización activas.
 *
 * <p>Sin un gestor que la vacíe (una prueba unitaria que simula la sincronización a mano) la acción corre en el acto,
 * como antes.
 */
public final class ColaPostTransaccion {

    private static final Logger log = LoggerFactory.getLogger(ColaPostTransaccion.class);

    private static final ThreadLocal<Integer> ABIERTAS = ThreadLocal.withInitial(() -> 0);
    private static final ThreadLocal<Deque<Runnable>> PENDIENTES = ThreadLocal.withInitial(ArrayDeque::new);
    private static final ThreadLocal<Boolean> VACIANDO = ThreadLocal.withInitial(() -> false);

    private ColaPostTransaccion() {
    }

    /** El gestor empezó una transacción en este hilo (una anidada con {@code REQUIRES_NEW} también cuenta). */
    public static void transaccionIniciada() {
        ABIERTAS.set(ABIERTAS.get() + 1);
    }

    /** El gestor limpió los recursos de una transacción; si era la última del hilo, corre lo que quedó pendiente. */
    public static void transaccionTerminada() {
        int restantes = Math.max(0, ABIERTAS.get() - 1);
        ABIERTAS.set(restantes);
        if (restantes == 0) {
            ejecutarPendientes();
        }
    }

    /** Corre la acción después de la transacción más externa, o en el acto si no hay un gestor que la vacíe. */
    public static void encolar(Runnable accion) {
        if (ABIERTAS.get() > 0) {
            PENDIENTES.get().addLast(accion);
            return;
        }
        accion.run();
    }

    /** Corre lo que quedó en la cola; lo llama el gestor al terminar la última transacción y las pruebas que simulan el commit a mano. */
    public static void ejecutarPendientes() {
        if (VACIANDO.get()) {
            return;
        }
        Deque<Runnable> pendientes = PENDIENTES.get();
        if (pendientes.isEmpty()) {
            return;
        }
        VACIANDO.set(true);
        try {
            Runnable accion;
            while ((accion = pendientes.pollFirst()) != null) {
                try {
                    accion.run();
                } catch (RuntimeException ex) {
                    log.error("Una acción posterior a la transacción terminó con un error inesperado", ex);
                }
            }
        } finally {
            VACIANDO.set(false);
            if (ABIERTAS.get() == 0 && pendientes.isEmpty()) {
                PENDIENTES.remove();
                VACIANDO.remove();
                ABIERTAS.remove();
            }
        }
    }
}
