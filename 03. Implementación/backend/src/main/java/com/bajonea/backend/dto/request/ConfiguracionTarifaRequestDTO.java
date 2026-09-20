package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.TipoCargo;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ConfiguracionTarifaRequestDTO {

    @NotNull(message = "El cargo al cliente es obligatorio")
    @DecimalMin(value = "0", message = "El cargo al cliente no puede ser negativo")
    private BigDecimal cargoCliente;

    @NotNull(message = "Seleccioná el tipo de cargo al cliente")
    private TipoCargo tipoCargoCliente;

    @NotNull(message = "El cargo al comercio es obligatorio")
    @DecimalMin(value = "0", message = "El cargo al comercio no puede ser negativo")
    private BigDecimal cargoComercio;

    @NotNull(message = "Seleccioná el tipo de cargo al comercio")
    private TipoCargo tipoCargoComercio;
}
