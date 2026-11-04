package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.TipoResolucionReclamo;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ResolverReclamoRequestDTO {

    @NotNull(message = "Elegí cómo se resuelve el reclamo")
    private TipoResolucionReclamo tipo;

    @Digits(integer = 8, fraction = 2, message = "El monto tiene que ser un importe con hasta 2 decimales")
    private BigDecimal monto;

    @Size(max = 500, message = "El motivo no puede superar los 500 caracteres")
    private String motivo;
}
