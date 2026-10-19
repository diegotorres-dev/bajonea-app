package com.bajonea.backend.services;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Lista fija de localidades donde se puede registrar una dirección: Río Grande, Ushuaia y Tolhuin, todas de
 * Tierra del Fuego. Vive en configuración ({@code geografia.localidades-habilitadas}) y no en una columna de
 * {@code localidad}: no depende del orden en que se carguen el seed de Georef y las migraciones, y las filas del
 * resto del país siguen en la base, así que las direcciones ya guardadas se leen igual.
 */
@Component
public class LocalidadesHabilitadas {

    private final Set<String> ids;

    public LocalidadesHabilitadas(
            @Value("${geografia.localidades-habilitadas:94008010,94015020,94011010}") String localidadesHabilitadas) {
        this.ids = new LinkedHashSet<>(Arrays.stream(localidadesHabilitadas.split(","))
                .map(String::trim)
                .filter(id -> !id.isEmpty())
                .toList());
    }

    public boolean contiene(String localidadId) {
        return localidadId != null && ids.contains(localidadId.trim());
    }

    public List<String> ids() {
        return List.copyOf(ids);
    }
}
