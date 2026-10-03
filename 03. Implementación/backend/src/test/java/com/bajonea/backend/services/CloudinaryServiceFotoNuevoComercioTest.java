package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ImagenProductoRepository;
import com.cloudinary.Cloudinary;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class CloudinaryServiceFotoNuevoComercioTest {

    private static final String PREFIJO = "https://res.cloudinary.com/mi-cuenta/image/upload/";

    private CloudinaryService service;

    @BeforeEach
    void preparar() {
        service = new CloudinaryService(mock(Cloudinary.class), mock(ImagenProductoRepository.class));
        ReflectionTestUtils.setField(service, "cloudName", "mi-cuenta");
    }

    @Test
    void aceptaLaFotoDeLaCarpetaDelDuenoConYSinVersion() {
        assertDoesNotThrow(() -> service.validarFotoNuevoComercio(7, PREFIJO + "v1700000000/duenos/7/comercios-nuevos/foto.png"));
        assertDoesNotThrow(() -> service.validarFotoNuevoComercio(7, PREFIJO + "duenos/7/comercios-nuevos/foto.png"));
    }

    @Test
    void rechazaLaFotoDeOtroDuenoInclusoSiElIdPropioEsSoloUnPrefijo() {
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7, PREFIJO + "v1/duenos/8/comercios-nuevos/foto.png"));
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7, PREFIJO + "v1/duenos/70/comercios-nuevos/foto.png"));
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(70, PREFIJO + "v1/duenos/7/comercios-nuevos/foto.png"));
    }

    @Test
    void rechazaOtrasCarpetasOtraCuentaYUrlsQueNoSonDeCloudinary() {
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7, PREFIJO + "v1/comercios/pre-registro/foto.png"));
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7, PREFIJO + "v1/duenos/7/otra-carpeta/foto.png"));
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7, PREFIJO + "v1/x/duenos/7/comercios-nuevos/foto.png"));
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7, PREFIJO + "v1/duenos/7/comercios-nuevos/sub/foto.png"));
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7,
                "https://res.cloudinary.com/otra-cuenta/image/upload/v1/duenos/7/comercios-nuevos/foto.png"));
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7, "https://ejemplo.com/duenos/7/comercios-nuevos/foto.png"));
        assertThrows(ValidacionException.class, () -> service.validarFotoNuevoComercio(7, null));
    }
}
