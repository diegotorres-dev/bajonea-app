package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.EstadoProducto;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CambioEstadoProductoRequestDTO {

    @NotNull(message = "El estado es obligatorio")
    private EstadoProducto estado;
}
