package com.bajonea.backend.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ComercioHorariosRequestDTO {

    @NotEmpty(message = "Cargá al menos un horario de atención")
    @Valid
    private List<HorarioRequestDTO> horarios;
}
