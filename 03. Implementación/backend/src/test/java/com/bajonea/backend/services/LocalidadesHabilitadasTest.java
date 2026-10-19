package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class LocalidadesHabilitadasTest {

    @Test
    void laListaPorDefectoSonRioGrandeUshuaiaYTolhuin() {
        LocalidadesHabilitadas habilitadas = new LocalidadesHabilitadas("94008010,94015020,94011010");

        assertEquals(List.of("94008010", "94015020", "94011010"), habilitadas.ids());
        assertTrue(habilitadas.contiene("94008010"));
        assertTrue(habilitadas.contiene("94015020"));
        assertTrue(habilitadas.contiene("94011010"));
    }

    @Test
    void cualquierOtraLocalidadNoEstaHabilitada() {
        LocalidadesHabilitadas habilitadas = new LocalidadesHabilitadas("94008010,94015020,94011010");

        assertFalse(habilitadas.contiene("94015010"));
        assertFalse(habilitadas.contiene("94021010"));
        assertFalse(habilitadas.contiene("02014010"));
        assertFalse(habilitadas.contiene("940021"));
        assertFalse(habilitadas.contiene(null));
        assertFalse(habilitadas.contiene(""));
    }

    @Test
    void ignoraEspaciosYElementosVacios() {
        LocalidadesHabilitadas habilitadas = new LocalidadesHabilitadas(" 94008010 , ,94015020,");

        assertEquals(List.of("94008010", "94015020"), habilitadas.ids());
        assertTrue(habilitadas.contiene(" 94008010 "));
    }
}
