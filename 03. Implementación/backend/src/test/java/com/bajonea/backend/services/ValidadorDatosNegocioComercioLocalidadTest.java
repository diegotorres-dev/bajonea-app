package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.bajonea.backend.repositories.LocalidadRepository;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ValidadorDatosNegocioComercioLocalidadTest {

    private LocalidadRepository localidadRepository;
    private ValidadorDatosNegocioComercio validador;

    @BeforeEach
    void preparar() {
        localidadRepository = mock(LocalidadRepository.class);
        validador = new ValidadorDatosNegocioComercio(localidadRepository, new LocalidadesHabilitadas("94008010,94015020,94011010"));
    }

    @Test
    void unaLocalidadHabilitadaSeDevuelve() {
        Localidad rioGrande = Localidad.builder().id("94008010").nombre("Río Grande").build();
        when(localidadRepository.findById("94008010")).thenReturn(Optional.of(rioGrande));

        assertSame(rioGrande, validador.obtenerLocalidad("94008010"));
    }

    @Test
    void unaLocalidadExistenteFueraDeLaListaDaErrorPorCampo() {
        when(localidadRepository.findById("94015010")).thenReturn(Optional.of(Localidad.builder().id("94015010").nombre("Laguna Escondida").build()));
        when(localidadRepository.findById("02014010")).thenReturn(Optional.of(Localidad.builder().id("02014010").nombre("Ciudad de Buenos Aires").build()));

        for (String id : new String[] {"94015010", "02014010"}) {
            ValidacionCamposException ex = assertThrows(ValidacionCamposException.class, () -> validador.obtenerLocalidad(id));
            assertEquals(Map.of("direccion.localidadId", "Esa localidad todavía no está disponible"), ex.getErrores());
        }
    }

    @Test
    void unaLocalidadInexistenteSigueDando404() {
        when(localidadRepository.findById("99999999")).thenReturn(Optional.empty());

        RecursoNoEncontradoException ex = assertThrows(RecursoNoEncontradoException.class, () -> validador.obtenerLocalidad("99999999"));
        assertEquals("La localidad indicada no existe", ex.getMessage());
    }

    @Test
    void soloSeConsideraNoHabilitadaUnaLocalidadQueExisteYNoEstaEnLaLista() {
        when(localidadRepository.existsById("94015010")).thenReturn(true);
        when(localidadRepository.existsById("99999999")).thenReturn(false);

        assertTrue(validador.esLocalidadExistenteNoHabilitada("94015010"));
        assertFalse(validador.esLocalidadExistenteNoHabilitada("99999999"));
        assertFalse(validador.esLocalidadExistenteNoHabilitada("94008010"));
        assertFalse(validador.esLocalidadExistenteNoHabilitada(null));
    }
}
