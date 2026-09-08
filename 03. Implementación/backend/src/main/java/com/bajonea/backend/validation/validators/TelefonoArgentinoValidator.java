package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.regex.Pattern;

/**
 * Valida un teléfono argentino en el único formato real que usan hoy los formularios del
 * proyecto: prefijo fijo {@code +549} mostrado aparte en el HTML (no editable) + un campo
 * editable con el resto del número. Algoritmo exacto:
 * <ol>
 *   <li>Se descartan espacios, paréntesis y guiones (separadores de tipeo tolerados).</li>
 *   <li>El valor sanitizado debe empezar explícitamente con el prefijo fijo
 *       {@code "+549"} — un valor sin el prefijo se rechaza, no se completa
 *       silenciosamente (decisión explícita: el backend nunca corrige datos fuera de
 *       contrato, ver {@code docs/DECISIONES.md}). El propio frontend concatena el
 *       prefijo antes de enviar ({@code construirTelefono()} en {@code auth.js}), así que
 *       un valor sin prefijo solo puede venir de un cliente de API fuera de contrato.</li>
 *   <li>Tras el prefijo debe haber exactamente 10 dígitos numéricos — sin tolerancia de
 *       longitud ni de prefijos alternativos (054, 15, 0 de larga distancia, etc.), a
 *       diferencia de la versión anterior de este validador.</li>
 * </ol>
 */
public class TelefonoArgentinoValidator implements ConstraintValidator<ValidarTelefonoArgentino, String> {

    private static final Pattern PREFIJO_MAS_DIEZ_DIGITOS = Pattern.compile("^\\+549\\d{10}$");

    @Override
    public boolean isValid(String telefono, ConstraintValidatorContext context) {
        if (telefono == null || telefono.isBlank()) {
            return true;
        }

        String sanitizado = telefono.replaceAll("[ ()\\-]", "");
        return PREFIJO_MAS_DIEZ_DIGITOS.matcher(sanitizado).matches();
    }
}
