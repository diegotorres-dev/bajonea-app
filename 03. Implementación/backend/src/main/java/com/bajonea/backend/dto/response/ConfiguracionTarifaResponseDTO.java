package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.TipoCargo;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class ConfiguracionTarifaResponseDTO {

    private final Integer id;
    private final BigDecimal cargoCliente;
    private final TipoCargo tipoCargoCliente;
    private final BigDecimal cargoComercio;
    private final TipoCargo tipoCargoComercio;
    private final LocalDateTime fechaVigencia;

    public ConfiguracionTarifaResponseDTO(
            Integer id,
            BigDecimal cargoCliente,
            TipoCargo tipoCargoCliente,
            BigDecimal cargoComercio,
            TipoCargo tipoCargoComercio,
            LocalDateTime fechaVigencia) {
        this.id = id;
        this.cargoCliente = cargoCliente;
        this.tipoCargoCliente = tipoCargoCliente;
        this.cargoComercio = cargoComercio;
        this.tipoCargoComercio = tipoCargoComercio;
        this.fechaVigencia = fechaVigencia;
    }
}
