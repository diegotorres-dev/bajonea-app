package com.bajonea.backend.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class AceptaTerminosRegistroClienteTest {

    private static final String MENSAJE = "Tenés que aceptar los Términos y Condiciones";

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private List<String> mensajesDe(RegistroClienteRequestDTO dto) {
        Set<? extends ConstraintViolation<?>> violaciones = validator.validateProperty(dto, "aceptaTerminos");
        return violaciones.stream().map(ConstraintViolation::getMessage).distinct().sorted().toList();
    }

    @Test
    void faltanteSeRechazaConElMensajeDeTerminos() {
        RegistroClienteRequestDTO dto = new RegistroClienteRequestDTO();
        dto.setAceptaTerminos(null);
        assertEquals(List.of(MENSAJE), mensajesDe(dto));
    }

    @Test
    void falseSeRechazaConElMensajeDeTerminos() {
        RegistroClienteRequestDTO dto = new RegistroClienteRequestDTO();
        dto.setAceptaTerminos(false);
        assertEquals(List.of(MENSAJE), mensajesDe(dto));
    }

    @Test
    void trueEsValido() {
        RegistroClienteRequestDTO dto = new RegistroClienteRequestDTO();
        dto.setAceptaTerminos(true);
        assertTrue(mensajesDe(dto).isEmpty());
    }
}
