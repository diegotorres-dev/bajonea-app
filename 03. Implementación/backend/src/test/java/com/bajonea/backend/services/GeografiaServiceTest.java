package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.LocalidadResponseDTO;
import com.bajonea.backend.dto.response.ProvinciaResponseDTO;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.Provincia;
import com.bajonea.backend.repositories.LocalidadRepository;
import com.bajonea.backend.repositories.ProvinciaRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GeografiaServiceTest {

    private static final List<String> HABILITADAS = List.of("94008010", "94015020", "94011010");

    private LocalidadRepository localidadRepository;
    private ProvinciaRepository provinciaRepository;
    private GeografiaService service;

    @BeforeEach
    void preparar() {
        localidadRepository = mock(LocalidadRepository.class);
        provinciaRepository = mock(ProvinciaRepository.class);
        service = new GeografiaService(provinciaRepository, localidadRepository, new LocalidadesHabilitadas("94008010,94015020,94011010"));
    }

    @Test
    void soloSeListanLasProvinciasConAlMenosUnaLocalidadHabilitada() {
        when(localidadRepository.findProvinciaIdsByIdIn(HABILITADAS)).thenReturn(List.of("94"));
        when(provinciaRepository.findAllById(List.of("94")))
                .thenReturn(List.of(Provincia.builder().id("94").nombre("Tierra del Fuego").build()));

        List<ProvinciaResponseDTO> provincias = service.listarProvincias();

        assertEquals(1, provincias.size());
        assertEquals("94", provincias.get(0).getId());
        verify(localidadRepository).findProvinciaIdsByIdIn(HABILITADAS);
    }

    @Test
    void soloSeListanLasLocalidadesHabilitadasDeLaProvinciaPedida() {
        Provincia tdf = Provincia.builder().id("94").nombre("Tierra del Fuego").build();
        when(localidadRepository.findByProvinciaIdAndIdInOrderByNombreAsc("94", HABILITADAS)).thenReturn(List.of(
                Localidad.builder().id("94008010").nombre("Río Grande").provincia(tdf).build(),
                Localidad.builder().id("94011010").nombre("Tolhuin").provincia(tdf).build(),
                Localidad.builder().id("94015020").nombre("Ushuaia").provincia(tdf).build()));

        List<LocalidadResponseDTO> localidades = service.listarLocalidadesPorProvincia("94");

        assertEquals(List.of("94008010", "94011010", "94015020"), localidades.stream().map(LocalidadResponseDTO::getId).toList());
    }

    @Test
    void unaProvinciaSinLocalidadesHabilitadasDevuelveListaVacia() {
        when(localidadRepository.findByProvinciaIdAndIdInOrderByNombreAsc("02", HABILITADAS)).thenReturn(List.of());

        assertTrue(service.listarLocalidadesPorProvincia("02").isEmpty());
    }
}
