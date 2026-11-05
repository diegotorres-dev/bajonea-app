package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.bajonea.backend.config.ReclamoFotosProperties;
import com.bajonea.backend.exceptions.ValidacionFotoReclamoException;
import com.bajonea.backend.repositories.ReclamoFotoArchivoRepository;
import com.bajonea.backend.repositories.ReclamoFotoRepository;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class ReclamoFotoServiceTest {

    private final ReclamoFotosProperties propiedades = new ReclamoFotosProperties();
    private final ReclamoFotoService servicio = new ReclamoFotoService(propiedades, mock(ReclamoFotoRepository.class),
            mock(ReclamoFotoArchivoRepository.class));

    private static MockMultipartFile jpeg(String nombre) {
        return new MockMultipartFile("fotos", nombre, "image/jpeg", new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2});
    }

    @Test
    void sinPartesOConPartesVaciasNoHayFotos() {
        assertTrue(servicio.validar(null).isEmpty());
        assertTrue(servicio.validar(List.of()).isEmpty());
        assertTrue(servicio.validar(Arrays.asList(null, new MockMultipartFile("fotos", "", "application/octet-stream", new byte[0]))).isEmpty());
    }

    @Test
    void unaPartedeNombreVacioConNombreEsUnaFotoVacia() {
        ValidacionFotoReclamoException ex = assertThrows(ValidacionFotoReclamoException.class,
                () -> servicio.validar(List.of(new MockMultipartFile("fotos", "x.jpg", "image/jpeg", new byte[0]))));
        assertEquals(ValidacionFotoReclamoException.FORMATO_NO_PERMITIDO, ex.getCodigo());
    }

    @Test
    void elNombreSeLimpiaDeRutasYCaracteresDeControl() {
        List<ReclamoFotoService.FotoValidada> validadas = servicio.validar(List.of(
                jpeg("C:\\fotos\\mala\u0007.jpg"), jpeg("../../etc/passwd.jpg"), jpeg("   ")));
        assertEquals("mala.jpg", validadas.get(0).nombre());
        assertEquals("passwd.jpg", validadas.get(1).nombre());
        assertEquals("foto", validadas.get(2).nombre());
        assertEquals("foto", servicio.validar(List.of(new MockMultipartFile("fotos", null, "image/jpeg",
                new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}))).get(0).nombre());
    }

    @Test
    void lasPropiedadesDefinenLosLimites() {
        propiedades.setMaxCantidad(1);
        ValidacionFotoReclamoException ex = assertThrows(ValidacionFotoReclamoException.class,
                () -> servicio.validar(List.of(jpeg("a.jpg"), jpeg("b.jpg"))));
        assertEquals("Podés adjuntar hasta 1 fotos", ex.getMessage());
    }

    @Test
    void contarSinReclamosNoConsultaNada() {
        assertTrue(servicio.contarPorReclamo(List.of()).isEmpty());
    }
}
