package com.bajonea.backend.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.dto.request.DatosClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.util.EdadUtils;
import com.bajonea.backend.validation.annotations.EdadMinima;
import com.bajonea.backend.validation.validators.EdadMinimaValidator;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorFactory;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class EdadMinimaTest {

    private static final LocalDate HOY = LocalDate.of(2026, 10, 6);
    private static final Clock RELOJ = Clock.fixed(HOY.atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
    private static final String MENSAJE_14 = "Tenés que tener al menos 14 años para registrarte";
    private static final String FECHA_NO_VALIDA = "La fecha ingresada no es válida";

    static class Con14 {
        @EdadMinima(anios = 14)
        LocalDate fecha;
    }

    static class Con18 {
        @EdadMinima(anios = 18, message = "Mínimo {anios}")
        LocalDate fecha;
    }

    private final Validator validator = Validation.byDefaultProvider().configure()
            .constraintValidatorFactory(new ConstraintValidatorFactory() {
                @Override
                @SuppressWarnings("unchecked")
                public <T extends ConstraintValidator<?, ?>> T getInstance(Class<T> clave) {
                    if (clave == EdadMinimaValidator.class) {
                        return (T) new EdadMinimaValidator(RELOJ);
                    }
                    try {
                        return clave.getDeclaredConstructor().newInstance();
                    } catch (ReflectiveOperationException e) {
                        throw new IllegalStateException(e);
                    }
                }

                @Override
                public void releaseInstance(ConstraintValidator<?, ?> instancia) {
                }
            }).buildValidatorFactory().getValidator();

    private List<String> mensajes(Object bean, String propiedad) {
        Set<? extends ConstraintViolation<?>> violaciones = validator.validateProperty(bean, propiedad);
        return violaciones.stream().map(ConstraintViolation::getMessage).distinct().sorted().toList();
    }

    private List<String> mensajes14(LocalDate fecha) {
        Con14 bean = new Con14();
        bean.fecha = fecha;
        return mensajes(bean, "fecha");
    }

    @Test
    void catorceAniosExactosCumplidosHoyHabilitan() {
        assertTrue(mensajes14(HOY.minusYears(14)).isEmpty());
    }

    @Test
    void unDiaAntesDeCumplirCatorceNoAlcanza() {
        assertEquals(List.of(MENSAJE_14), mensajes14(HOY.minusYears(14).plusDays(1)));
    }

    @Test
    void unDiaDespuesDeCumplirCatorceAlcanza() {
        assertTrue(mensajes14(HOY.minusYears(14).minusDays(1)).isEmpty());
    }

    @Test
    void haberNacidoAyerOHoyNoAlcanza() {
        assertEquals(List.of(MENSAJE_14), mensajes14(HOY.minusDays(1)));
        assertEquals(List.of(MENSAJE_14), mensajes14(HOY));
    }

    @Test
    void nullLoDejaPasarParaQueLoRechaceElNotNull() {
        assertTrue(mensajes14(null).isEmpty());
    }

    @Test
    void unaFechaFuturaSeRechazaConElMismoTextoQueLaPlausibilidad() {
        assertEquals(List.of(FECHA_NO_VALIDA), mensajes14(HOY.plusDays(1)));
        assertEquals(List.of(FECHA_NO_VALIDA), mensajes14(LocalDate.of(2099, 1, 1)));
    }

    @Test
    void elNacidoUnVeintinueveDeFebreroCumpleElUnoDeMarzoEnAnioNoBisiesto() {
        LocalDate nacimiento = LocalDate.of(2012, 2, 29);
        assertTrue(!EdadUtils.cumpleEdadMinima(nacimiento, LocalDate.of(2026, 2, 28), 14));
        assertTrue(EdadUtils.cumpleEdadMinima(nacimiento, LocalDate.of(2026, 3, 1), 14));
    }

    @ParameterizedTest(name = "{0} dias antes del cumpleaños 18 -> {1}")
    @CsvSource({"1,false", "0,true", "-1,true"})
    void elValorDeLaAnotacionEsReutilizable(long diasAntes, boolean valida) {
        Con18 bean = new Con18();
        bean.fecha = HOY.minusYears(18).plusDays(diasAntes);
        List<String> resultado = mensajes(bean, "fecha");
        assertEquals(valida, resultado.isEmpty());
        if (!valida) {
            assertEquals(List.of("Mínimo 18"), resultado);
        }
    }

    @Test
    void elDtoDeDatosDeClienteExigeCatorceAniosEnFechaNacimiento() {
        DatosClienteRequestDTO trece = new DatosClienteRequestDTO();
        trece.setFechaNacimiento(HOY.minusYears(13));
        DatosClienteRequestDTO catorce = new DatosClienteRequestDTO();
        catorce.setFechaNacimiento(HOY.minusYears(14));

        assertEquals(List.of(MENSAJE_14), mensajes(trece, "fechaNacimiento"));
        assertTrue(mensajes(catorce, "fechaNacimiento").isEmpty());
    }

    @Test
    void elRegistroDeClienteHeredaLaMismaReglaDeEdad() {
        RegistroClienteRequestDTO trece = new RegistroClienteRequestDTO();
        trece.setFechaNacimiento(HOY.minusYears(13));
        RegistroClienteRequestDTO catorce = new RegistroClienteRequestDTO();
        catorce.setFechaNacimiento(HOY.minusYears(14));

        assertEquals(List.of(MENSAJE_14), mensajes(trece, "fechaNacimiento"));
        assertTrue(mensajes(catorce, "fechaNacimiento").isEmpty());
    }
}
