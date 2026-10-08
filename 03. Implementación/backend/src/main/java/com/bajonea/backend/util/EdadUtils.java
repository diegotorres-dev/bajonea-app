package com.bajonea.backend.util;

import java.time.LocalDate;

/**
 * Regla única para decidir si una fecha de nacimiento alcanza una edad mínima: cumplir los años hoy ya
 * habilita, es decir {@code fechaNacimiento <= hoy - años}. La comparten la anotación de edad mínima del
 * registro y las reglas de aptitud del alta de empleados, para que no diverjan.
 */
public final class EdadUtils {

    private EdadUtils() {
    }

    public static boolean cumpleEdadMinima(LocalDate fechaNacimiento, LocalDate hoy, int anios) {
        return !fechaNacimiento.isAfter(hoy.minusYears(anios));
    }
}
