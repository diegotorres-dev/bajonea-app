package com.bajonea.backend.validation.validators;

import com.bajonea.backend.validation.annotations.DireccionExclusionMutua;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.lang.reflect.Field;

/**
 * Valida, por reflexión sobre los campos {@code clienteId} y {@code comercioId} del DTO
 * anotado (buscados en toda la jerarquía de clases, no solo la declarante directa), que
 * exactamente uno de los dos sea no nulo — ambos nulos o ambos presentes son inválidos. Si
 * el DTO no declara ninguno de los dos campos, la validación se considera no aplicable y no
 * falla (fail-open), ya que en ese caso el error es de configuración del DTO, no del dato
 * de entrada; si declara al menos uno de los dos, la regla de exclusión mutua se aplica con
 * normalidad.
 */
public class DireccionExclusionMutuaValidator
        implements ConstraintValidator<DireccionExclusionMutua, Object> {

    private static final String CAMPO_CLIENTE_ID = "clienteId";
    private static final String CAMPO_COMERCIO_ID = "comercioId";

    @Override
    public boolean isValid(Object dto, ConstraintValidatorContext context) {
        if (dto == null) {
            return true;
        }

        CampoLeido clienteId = leerCampo(dto, CAMPO_CLIENTE_ID);
        CampoLeido comercioId = leerCampo(dto, CAMPO_COMERCIO_ID);

        if (!clienteId.encontrado() && !comercioId.encontrado()) {
            return true;
        }

        boolean clientePresente = clienteId.valor() != null;
        boolean comercioPresente = comercioId.valor() != null;

        return clientePresente ^ comercioPresente;
    }

    private CampoLeido leerCampo(Object dto, String nombreCampo) {
        Class<?> clase = dto.getClass();
        while (clase != null) {
            try {
                Field campo = clase.getDeclaredField(nombreCampo);
                campo.setAccessible(true);
                return new CampoLeido(true, campo.get(dto));
            } catch (NoSuchFieldException e) {
                clase = clase.getSuperclass();
            } catch (IllegalAccessException e) {
                return new CampoLeido(true, null);
            }
        }
        return new CampoLeido(false, null);
    }

    private record CampoLeido(boolean encontrado, Object valor) {
    }
}
