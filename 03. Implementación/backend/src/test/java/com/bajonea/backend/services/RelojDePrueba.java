package com.bajonea.backend.services;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Reloj de las pruebas de invitaciones de empleado: sin fijar devuelve la hora real y fijado devuelve un
 * momento elegido por la prueba, de modo que los vencimientos de 7 días y las ventanas de 24 horas se
 * pueden recorrer sin esperar. Se instala como {@code Clock} primario con {@link ConfiguracionRelojDePrueba}.
 */
class RelojDePrueba extends Clock {

    private volatile Instant fijo;

    void fijar(LocalDateTime momento) {
        fijo = momento.atZone(ZoneId.systemDefault()).toInstant();
    }

    void volverAlReloj() {
        fijo = null;
    }

    @Override
    public ZoneId getZone() {
        return ZoneId.systemDefault();
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    @Override
    public Instant instant() {
        Instant actual = fijo;
        return actual != null ? actual : Instant.now();
    }
}
