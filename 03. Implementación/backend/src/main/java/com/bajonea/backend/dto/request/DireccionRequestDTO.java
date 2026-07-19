package com.bajonea.backend.dto.request;

import com.bajonea.backend.validation.annotations.ValidarCodigoPostalArgentino;
import jakarta.validation.constraints.NotBlank;
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

    @NotBlank
    @Size(max = 150)
    private String calle;

    @NotBlank
    @Size(max = 10)
    private String numero;

    @Size(max = 30)
    private String pisoDepto;

    @NotBlank
    @ValidarCodigoPostalArgentino
    private String codigoPostal;

    @NotBlank
    @Size(max = 15)
    private String localidadId;

    private boolean principal;
}
