package com.bajonea.backend.services;

import com.bajonea.backend.enums.CampoCambioComercio;

/**
 * Un dato de un comercio que una operación de {@link ComercioEdicionService} realmente cambió: el campo
 * y los valores anterior y nuevo ya como texto legible. {@code null} es un dato vacío.
 */
public record CambioComercio(CampoCambioComercio campo, String anterior, String nuevo) {
}
