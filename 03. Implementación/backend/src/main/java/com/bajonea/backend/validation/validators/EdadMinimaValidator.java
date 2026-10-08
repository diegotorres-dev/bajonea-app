package com.bajonea.backend.validation.validators;

import com.bajonea.backend.util.EdadUtils;
import com.bajonea.backend.validation.annotations.EdadMinima;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.time.Clock;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Edad mínima configurable por anotación. En la aplicación Spring crea el validador con el bean
 * {@link Clock} (misma fuente de hora que el resto del sistema); el constructor sin argumentos existe para
 * los validadores por defecto de Bean Validation fuera de Spring y usa el reloj del sistema.
 */
public class EdadMinimaValidator implements ConstraintValidator<EdadMinima, LocalDate> {

    private static final String MENSAJE_FECHA_NO_VALIDA = "La fecha ingresada no es válida";

    private final Clock clock;
    private int anios;

    public EdadMinimaValidator() {
        this(Clock.systemDefaultZone());
    }

    @Autowired
    public EdadMinimaValidator(Clock clock) {
        this.clock = clock;
    }

    @Override
    public void initialize(EdadMinima anotacion) {
        this.anios = anotacion.anios();
    }

    @Override
    public boolean isValid(LocalDate fechaNacimiento, ConstraintValidatorContext context) {
        if (fechaNacimiento == null) {
            return true;
        }
        LocalDate hoy = LocalDate.now(clock);
        if (fechaNacimiento.isAfter(hoy)) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(MENSAJE_FECHA_NO_VALIDA).addConstraintViolation();
            return false;
        }
        return EdadUtils.cumpleEdadMinima(fechaNacimiento, hoy, anios);
    }
}
