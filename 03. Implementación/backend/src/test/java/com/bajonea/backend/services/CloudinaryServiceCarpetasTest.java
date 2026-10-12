package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ImagenProductoRepository;
import com.cloudinary.Cloudinary;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Bloque A0.3 de E3: la foto del comercio y las imágenes de producto (alta, reemplazo y recorte) tienen que estar en la
 * carpeta que firman los endpoints de firma, no solo en el dominio de Cloudinary.
 */
class CloudinaryServiceCarpetasTest {

    private static final String PREFIJO = "https://res.cloudinary.com/mi-cuenta/image/upload/";

    private CloudinaryService cloudinary;

    @BeforeEach
    void preparar() {
        cloudinary = new CloudinaryService(mock(Cloudinary.class), mock(ImagenProductoRepository.class));
        ReflectionTestUtils.setField(cloudinary, "cloudName", "mi-cuenta");
    }

    @Test
    void laImagenDeProductoTieneQueEstarEnLaCarpetaDeSuComercioYSuProducto() {
        assertDoesNotThrow(() -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1700000000/productos/4/9/foto.png"));
        assertDoesNotThrow(() -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "productos/4/9/foto.webp"));
    }

    @Test
    void laImagenDeProductoDeOtroComercioOOtroProductoOOtraCarpetaSeRechaza() {
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1/productos/5/9/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1/productos/4/10/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1/productos/44/9/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1/productos/4/99/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1/comercios/4/perfil/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1/productos/4/9/sub/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1/otro/productos/4/9/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9,
                "https://res.cloudinary.com/otra-cuenta/image/upload/v1/productos/4/9/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, "https://ejemplo.com/productos/4/9/foto.png"));
        assertThrows(ValidacionException.class, () -> cloudinary.validarImagenProducto(4, 9, null));
    }

    @Test
    void elMensajeDeLaImagenDeProductoNoHablaDeFotoDePerfil() {
        ValidacionException ex = assertThrows(ValidacionException.class,
                () -> cloudinary.validarImagenProducto(4, 9, PREFIJO + "v1/productos/5/9/foto.png"));
        assertEquals("La imagen no es válida. Subila de nuevo desde el formulario.", ex.getMessage());
    }

    @Test
    void laFotoDelComercioConservaSuMensajeYSuCarpeta() {
        assertDoesNotThrow(() -> cloudinary.validarFotoPerfilComercio(4, PREFIJO + "v1/comercios/4/perfil/foto.png"));
        ValidacionException ex = assertThrows(ValidacionException.class,
                () -> cloudinary.validarFotoPerfilComercio(4, PREFIJO + "v1/comercios/5/perfil/foto.png"));
        assertEquals("La foto de perfil no es válida. Subila de nuevo desde el formulario.", ex.getMessage());
    }
}
