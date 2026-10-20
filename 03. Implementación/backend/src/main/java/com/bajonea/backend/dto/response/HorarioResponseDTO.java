package com.bajonea.backend.dto.response;

import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.services.DisponibilidadComercioService;
import java.time.LocalTime;
import lombok.Getter;

@Getter
public class HorarioResponseDTO {

    private final Integer id;
    private final DiaSemana diaSemana;
    private final LocalTime horaApertura;
    private final LocalTime horaCierre;
    private final boolean cruzaMedianoche;

    public HorarioResponseDTO(Integer id, DiaSemana diaSemana, LocalTime horaApertura, LocalTime horaCierre) {
        this.id = id;
        this.diaSemana = diaSemana;
        this.horaApertura = horaApertura;
        this.horaCierre = horaCierre;
        this.cruzaMedianoche = DisponibilidadComercioService.cruzaMedianoche(horaApertura, horaCierre);
    }

    public static HorarioResponseDTO de(Horario horario) {
        return new HorarioResponseDTO(horario.getId(), horario.getDiaSemana(), horario.getHoraApertura(),
                horario.getHoraCierre());
    }
}
