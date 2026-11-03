package com.bajonea.backend.services;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Datos únicos para las pruebas (DNI, CUIT, sufijos de teléfono, email y nombre de usuario). Son un contador
 * atómico que arranca en un punto distinto en cada corrida y avanza de a uno: dentro de una corrida nunca se repite
 * un valor, ni siquiera entre hilos ni entre clases de prueba, y entre dos corridas sobre la misma base la
 * probabilidad de pisarse es despreciable. Reemplaza a los valores al azar, que a veces repetían un DNI.
 */
final class DatosUnicos {

    private static final long DNI_MINIMO = 30_000_000L;
    private static final long DNI_RANGO = 69_000_000L;
    private static final AtomicLong DNI = new AtomicLong(arranque(DNI_RANGO));
    private static final AtomicLong CUIT = new AtomicLong(arranque(800_000_000L));
    private static final AtomicLong SUFIJO = new AtomicLong(arranque(8_000_000_000L));

    private DatosUnicos() {
    }

    private static long arranque(long rango) {
        return (System.currentTimeMillis() * 7919L + System.nanoTime()) % rango;
    }

    static int siguienteDni() {
        return (int) (DNI_MINIMO + Math.floorMod(DNI.incrementAndGet(), DNI_RANGO));
    }

    static long siguienteCuit() {
        return 100_000_000L + Math.floorMod(CUIT.incrementAndGet(), 800_000_000L);
    }

    static long siguienteSufijo() {
        return 1_000_000_000L + Math.floorMod(SUFIJO.incrementAndGet(), 8_000_000_000L);
    }
}
