package com.bajonea.backend.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class NombreUsuarioTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private List<String> mensajesDe(Object dto, String campo) {
        Set<? extends ConstraintViolation<?>> violaciones = validator.validateProperty(dto, campo);
        return violaciones.stream().map(ConstraintViolation::getMessage).sorted().toList();
    }

    @Test
    void normalizarAplicaTrimYMinusculas() {
        assertEquals("diegotorres", NombreUsuarioPolicy.normalizar("  DiegoTorres  "));
        assertNull(NombreUsuarioPolicy.normalizar(null));
    }

    @Test
    void formatoValidoEntre8y20LetrasYNumeros() {
        assertTrue(NombreUsuarioPolicy.tieneFormatoValido("abcdefgh"));
        assertTrue(NombreUsuarioPolicy.tieneFormatoValido("a1b2c3d4e5f6g7h8i9j0"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("abcdefg"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("a1b2c3d4e5f6g7h8i9j0k"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("abcd_efgh"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("abcd.efgh"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("abcd efgh"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("abcd-efgh"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("juan@mail"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("pérezpérez"));
        assertFalse(NombreUsuarioPolicy.tieneFormatoValido("ñandúñandú"));
    }

    @Test
    void mensajesDeFormatoInvalido() {
        assertEquals("El nombre de usuario es obligatorio", NombreUsuarioPolicy.mensajeDeFormatoInvalido(""));
        assertEquals("Solo se permiten letras y números", NombreUsuarioPolicy.mensajeDeFormatoInvalido("abc_defgh"));
        assertEquals("El nombre de usuario debe tener al menos 8 caracteres", NombreUsuarioPolicy.mensajeDeFormatoInvalido("abc"));
        assertNull(NombreUsuarioPolicy.mensajeDeFormatoInvalido("abcdefgh"));
    }

    @Test
    void reservadosSeCompararExactosEnMinusculas() {
        for (String r : List.of("administrador", "administrator", "bajonea", "soporte", "support",
                "comercio", "cliente", "empleado", "duenio", "superadmin")) {
            assertTrue(NombreUsuarioPolicy.esReservado(r), r);
        }
        assertFalse(NombreUsuarioPolicy.esReservado("adminbajonea"));
        assertFalse(NombreUsuarioPolicy.esReservado("clientedeprueba"));
        assertFalse(NombreUsuarioPolicy.esReservado(null));
    }

    @Test
    void dtoDeRegistroClienteNormalizaAntesDeValidar() {
        RegistroClienteRequestDTO dto = new RegistroClienteRequestDTO();
        dto.setNombreUsuario("  MiUsuario123 ");
        assertEquals("miusuario123", dto.getNombreUsuario());
        assertTrue(mensajesDe(dto, "nombreUsuario").isEmpty());
    }

    @Test
    void dtoDeRegistroComercioNormalizaAntesDeValidar() {
        RegistroComercioRequestDTO dto = new RegistroComercioRequestDTO();
        dto.setNombreUsuario("DuenoPrueba01");
        assertEquals("duenoprueba01", dto.getNombreUsuario());
        assertTrue(mensajesDe(dto, "nombreUsuario").isEmpty());
    }

    @Test
    void dtoRechazaVacioCortoLargoYCaracteresInvalidos() {
        RegistroClienteRequestDTO dto = new RegistroClienteRequestDTO();
        dto.setNombreUsuario(null);
        assertEquals(List.of("El nombre de usuario es obligatorio"), mensajesDe(dto, "nombreUsuario"));
        dto.setNombreUsuario("   ");
        assertEquals(List.of("El nombre de usuario es obligatorio"), mensajesDe(dto, "nombreUsuario"));
        dto.setNombreUsuario("corto");
        assertEquals(List.of("El nombre de usuario debe tener al menos 8 caracteres"), mensajesDe(dto, "nombreUsuario"));
        dto.setNombreUsuario("con espacio1");
        assertEquals(List.of("Solo se permiten letras y números"), mensajesDe(dto, "nombreUsuario"));
        dto.setNombreUsuario("a".repeat(21));
        assertEquals(2, mensajesDe(dto, "nombreUsuario").size());
    }

    @Test
    void loginNormalizaSinValidarFormato() {
        LoginRequestDTO dto = new LoginRequestDTO();
        dto.setNombreUsuario("  AdminBajonea ");
        assertEquals("adminbajonea", dto.getNombreUsuario());
        dto.setNombreUsuario("no valido!");
        assertTrue(mensajesDe(dto, "nombreUsuario").isEmpty());
    }
}
