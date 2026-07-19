package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.ValidarTelefonoArgentino;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Valida un teléfono argentino tolerando los formatos reales en uso. Algoritmo exacto:
 * <ol>
 *   <li>Se descartan todos los caracteres que no sean dígitos (espacios, guiones,
 *       paréntesis, el signo {@code +}).</li>
 *   <li>Si el resultado empieza con {@code "0054"}, se descartan esos 4 dígitos
 *       (código de país con el 0 de larga distancia incluido por error de tipeo).</li>
 *   <li>Si no, y el resultado empieza con {@code "54"} y tiene más de 10 dígitos, se
 *       descartan esos 2 (código de país sin el {@code +}).</li>
 *   <li>Si el resultado empieza con {@code "9"} (indicador de línea móvil en formato
 *       E.164), se descarta ese dígito.</li>
 *   <li>Si el resultado empieza con {@code "0"} (prefijo de larga distancia nacional,
 *       ej. "011"), se descarta ese dígito.</li>
 *   <li>Si aparece la secuencia {@code "15"} inmediatamente después de un código de área
 *       de 2, 3 o 4 dígitos (formato histórico de celular con 15), se descarta.</li>
 *   <li>El resultado final debe tener entre 8 y 10 dígitos (código de área de 2 a 4
 *       dígitos + número local de 6 a 8 dígitos).</li>
 * </ol>
 * Formatos de entrada aceptados como consecuencia de este algoritmo, entre otros:
 * {@code "+54 9 2964 12-3456"}, {@code "02964 15 123456"}, {@code "1123456789"},
 * {@code "011 4123-4567"}.
 */
public class TelefonoArgentinoValidator implements ConstraintValidator<ValidarTelefonoArgentino, String> {

    private static final int LONGITUD_MINIMA = 8;
    private static final int LONGITUD_MAXIMA = 10;

    @Override
    public boolean isValid(String telefono, ConstraintValidatorContext context) {
        if (telefono == null) {
            return true;
        }

        String digitos = telefono.replaceAll("[^0-9]", "");
        if (digitos.isEmpty()) {
            return false;
        }

        if (digitos.startsWith("0054")) {
            digitos = digitos.substring(4);
        } else if (digitos.startsWith("54") && digitos.length() > 10) {
            digitos = digitos.substring(2);
        }

        if (digitos.startsWith("9")) {
            digitos = digitos.substring(1);
        }

        if (digitos.startsWith("0")) {
            digitos = digitos.substring(1);
        }

        digitos = quitarQuinceTrasCodigoDeArea(digitos);

        return digitos.length() >= LONGITUD_MINIMA && digitos.length() <= LONGITUD_MAXIMA;
    }

    private String quitarQuinceTrasCodigoDeArea(String digitos) {
        for (int longitudCodigoArea = 2; longitudCodigoArea <= 4; longitudCodigoArea++) {
            int inicioQuince = longitudCodigoArea;
            int finQuince = longitudCodigoArea + 2;
            if (digitos.length() >= finQuince && digitos.substring(inicioQuince, finQuince).equals("15")) {
                return digitos.substring(0, inicioQuince) + digitos.substring(finQuince);
            }
        }
        return digitos;
    }
}
