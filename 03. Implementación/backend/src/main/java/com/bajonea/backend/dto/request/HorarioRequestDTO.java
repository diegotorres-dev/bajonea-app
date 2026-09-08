package com.bajonea.backend.dto.request;

import com.bajonea.backend.enums.DiaSemana;
import jakarta.validation.constraints.NotNull;
import java.time.LocalTime;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class HorarioRequestDTO {

    @NotNull
    private DiaSemana diaSemana;

    @NotNull
    private LocalTime horaApertura;

    @NotNull
    private LocalTime horaCierre;
}
