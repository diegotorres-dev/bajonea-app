package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.MotivoRechazo;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RechazoPedidoRequestDTO {

    @NotNull
    private MotivoRechazo motivo;

    @Size(max = 500)
    private String comentario;
}
