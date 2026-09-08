package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.DiaSemana;
import java.time.LocalTime;
import lombok.Getter;

@Getter
public class HorarioResponseDTO {

    private final Integer id;
    private final DiaSemana diaSemana;
    private final LocalTime horaApertura;
    private final LocalTime horaCierre;

    public HorarioResponseDTO(Integer id, DiaSemana diaSemana, LocalTime horaApertura, LocalTime horaCierre) {
        this.id = id;
        this.diaSemana = diaSemana;
        this.horaApertura = horaApertura;
        this.horaCierre = horaCierre;
    }
}
