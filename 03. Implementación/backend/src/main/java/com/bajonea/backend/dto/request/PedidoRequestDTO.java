package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.TipoEntrega;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * {@code direccionId} no lleva {@code @NotNull}: es condicionalmente obligatorio solo si
 * {@code tipoEntrega = DOMICILIO}, y esa coherencia entre campos se valida en
 * {@code PedidoService} (Fase 8), no acá — mismo criterio que la exclusión mutua de
 * Direccion, documentado en {@code docs/modelo-mvp.md}.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PedidoRequestDTO {

    @NotNull(message = "Debés seleccionar una modalidad de entrega")
    private TipoEntrega tipoEntrega;

    private Integer direccionId;

    @DecimalMin(value = "0", message = "El total esperado no puede ser negativo")
    @Digits(integer = 10, fraction = 2, message = "El total esperado no es válido")
    private BigDecimal totalEsperado;
}
