package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarCodigoPostalArgentino;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Bloque de dirección reutilizado dentro de {@link RegistroClienteRequestDTO} y
 * {@link RegistroComercioRequestDTO}. No lleva {@code clienteId}/{@code comercioId}: a
 * cuál de los dos se asocia la dirección resultante lo determina el propio flujo de
 * registro que la contiene (el Service la crea ya asociada al Cliente o al Comercio que se
 * está registrando), nunca lo elige el request. Por eso {@code @DireccionExclusionMutua} no
 * se aplica acá — no hay nada que excluir mutuamente en este DTO, la exclusión queda
 * garantizada estructuralmente por tener dos flujos de registro separados en vez de un
 * único endpoint genérico de alta de direcciones.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class DireccionRequestDTO {

    @NotBlank(message = "La calle es obligatoria")
    @Size(max = 150, message = "La calle no puede superar los 150 caracteres")
    @Pattern(regexp = ".*[\\p{L}0-9].*", message = "La calle no puede contener solo caracteres especiales")
    private String calle;

    @NotBlank(message = "El número es obligatorio")
    @Size(max = 10, message = "El número no puede superar los 10 caracteres")
    @Pattern(regexp = "^\\d+$", message = "Solo se permiten números")
    private String numero;

    @Size(max = 30, message = "El piso/departamento no puede superar los 30 caracteres")
    @Pattern(regexp = "\\s*|.*[\\p{L}0-9].*", message = "El piso/departamento no puede contener solo caracteres especiales")
    private String pisoDepto;

    @NotBlank(message = "El código postal es obligatorio")
    @ValidarCodigoPostalArgentino(message = "Ingresá un código postal válido (4 dígitos o formato CPA)")
    private String codigoPostal;

    @NotBlank(message = "Seleccioná tu localidad")
    @Size(max = 15, message = "La localidad no puede superar los 15 caracteres")
    private String localidadId;

    private boolean principal;
}
