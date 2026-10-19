package com.bajonea.backend.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.AltaComercioAdicionalRequestDTO;
import com.bajonea.backend.dto.request.DatosNegocioComercioRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.request.ReSolicitudComercioRequestDTO;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class AceptaTerminosRegistroComercioTest {

    private static final String MENSAJE = "Tenés que aceptar los Términos y Condiciones";

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private List<String> mensajesDe(Object dto) {
        Set<? extends ConstraintViolation<?>> violaciones = validator.validateProperty(dto, "aceptaTerminos");
        return violaciones.stream().map(ConstraintViolation::getMessage).distinct().sorted().toList();
    }

    @Test
    void elRegistroDeComercioRechazaTerminosFaltantes() {
        RegistroComercioRequestDTO dto = new RegistroComercioRequestDTO();
        dto.setAceptaTerminos(null);
        assertEquals(List.of(MENSAJE), mensajesDe(dto));
    }

    @Test
    void elRegistroDeComercioRechazaTerminosEnFalse() {
        RegistroComercioRequestDTO dto = new RegistroComercioRequestDTO();
        dto.setAceptaTerminos(false);
        assertEquals(List.of(MENSAJE), mensajesDe(dto));
    }

    @Test
    void elRegistroDeComercioAceptaTerminosEnTrue() {
        RegistroComercioRequestDTO dto = new RegistroComercioRequestDTO();
        dto.setAceptaTerminos(true);
        assertTrue(mensajesDe(dto).isEmpty());
    }

    @Test
    void elAltaAdicionalRechazaTerminosFaltantes() {
        AltaComercioAdicionalRequestDTO dto = new AltaComercioAdicionalRequestDTO();
        dto.setAceptaTerminos(null);
        assertEquals(List.of(MENSAJE), mensajesDe(dto));
    }

    @Test
    void elAltaAdicionalRechazaTerminosEnFalse() {
        AltaComercioAdicionalRequestDTO dto = new AltaComercioAdicionalRequestDTO();
        dto.setAceptaTerminos(false);
        assertEquals(List.of(MENSAJE), mensajesDe(dto));
    }

    @Test
    void elAltaAdicionalAceptaTerminosEnTrue() {
        AltaComercioAdicionalRequestDTO dto = new AltaComercioAdicionalRequestDTO();
        dto.setAceptaTerminos(true);
        assertTrue(mensajesDe(dto).isEmpty());
    }

    @Test
    void laCorreccionDeUnRechazadoNoPideTerminosNiLaSuperclaseDeLosDatosDelNegocio() {
        assertThrows(NoSuchMethodException.class, () -> ReSolicitudComercioRequestDTO.class.getMethod("getAceptaTerminos"));
        assertThrows(NoSuchMethodException.class, () -> DatosNegocioComercioRequestDTO.class.getMethod("getAceptaTerminos"));
    }
}
