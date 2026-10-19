package com.bajonea.backend.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.DatosLegalesComercioRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class DatosLegalesComercioOpcionalesTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private List<String> mensajesDe(Object dto, String propiedad) {
        Set<? extends ConstraintViolation<?>> violaciones = validator.validateProperty(dto, propiedad);
        return violaciones.stream().map(ConstraintViolation::getMessage).distinct().sorted().toList();
    }

    @Test
    void enElRegistroLosCuatroCamposOpcionalesPuedenFaltar() {
        RegistroComercioRequestDTO dto = new RegistroComercioRequestDTO();
        dto.setRazonSocial(null);
        dto.setTipoSociedad(null);
        dto.setCondicionIva(null);
        dto.setFechaInicioActividades(null);
        for (String campo : List.of("razonSocial", "tipoSociedad", "condicionIva", "fechaInicioActividades")) {
            assertTrue(mensajesDe(dto, campo).isEmpty(), campo);
        }
    }

    @Test
    void enLaCorreccionLosCuatroCamposOpcionalesPuedenFaltar() {
        DatosLegalesComercioRequestDTO dto = new DatosLegalesComercioRequestDTO();
        for (String campo : List.of("razonSocial", "tipoSociedad", "condicionIva", "fechaInicioActividades")) {
            assertTrue(mensajesDe(dto, campo).isEmpty(), campo);
        }
    }

    @Test
    void unaRazonSocialVaciaOEnBlancoQuedaEnNulo() {
        RegistroComercioRequestDTO registro = new RegistroComercioRequestDTO();
        registro.setRazonSocial("   ");
        assertNull(registro.getRazonSocial());
        registro.setRazonSocial("");
        assertNull(registro.getRazonSocial());
        DatosLegalesComercioRequestDTO legales = new DatosLegalesComercioRequestDTO();
        legales.setRazonSocial("  ");
        assertNull(legales.getRazonSocial());
        legales.setRazonSocial("  Mi Razon SRL ");
        assertEquals("Mi Razon SRL", legales.getRazonSocial());
    }

    @Test
    void siLaRazonSocialVieneSeSigueValidando() {
        RegistroComercioRequestDTO registro = new RegistroComercioRequestDTO();
        registro.setRazonSocial("####");
        assertEquals(List.of("La razón social no puede contener solo caracteres especiales"), mensajesDe(registro, "razonSocial"));
        registro.setRazonSocial("R".repeat(151));
        assertEquals(List.of("La razón social no puede superar los 150 caracteres"), mensajesDe(registro, "razonSocial"));
    }

    @Test
    void elCuitYElDomicilioFiscalSiguenSiendoObligatorios() {
        RegistroComercioRequestDTO registro = new RegistroComercioRequestDTO();
        assertEquals(List.of("El CUIT es obligatorio"), mensajesDe(registro, "cuit"));
        assertEquals(List.of("El domicilio fiscal es obligatorio"), mensajesDe(registro, "domicilioFiscal"));
        DatosLegalesComercioRequestDTO legales = new DatosLegalesComercioRequestDTO();
        assertEquals(List.of("El CUIT es obligatorio"), mensajesDe(legales, "cuit"));
        assertEquals(List.of("El domicilio fiscal es obligatorio"), mensajesDe(legales, "domicilioFiscal"));
    }

    @Test
    void losDatosDelRepresentanteSiguenSiendoObligatorios() {
        RegistroComercioRequestDTO registro = new RegistroComercioRequestDTO();
        assertEquals(List.of("El nombre es obligatorio"), mensajesDe(registro, "nombreRepresentante"));
        assertEquals(List.of("El apellido es obligatorio"), mensajesDe(registro, "apellidoRepresentante"));
        assertEquals(List.of("El DNI es obligatorio"), mensajesDe(registro, "dniRepresentante"));
        assertEquals(List.of("El teléfono es obligatorio"), mensajesDe(registro, "telefonoRepresentante"));
        assertEquals(List.of("La fecha de nacimiento es obligatoria"), mensajesDe(registro, "fechaNacimientoRepresentante"));
    }
}
