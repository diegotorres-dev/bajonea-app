package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.AutorMensajeSoporte;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MensajeSoporteResponseDTO {

    private final Integer id;
    private final AutorMensajeSoporte autor;
    private final String texto;
    private final LocalDateTime creadoEn;
    private final Boolean emailEnviado;

    public MensajeSoporteResponseDTO(Integer id, AutorMensajeSoporte autor, String texto, LocalDateTime creadoEn,
            Boolean emailEnviado) {
        this.id = id;
        this.autor = autor;
        this.texto = texto;
        this.creadoEn = creadoEn;
        this.emailEnviado = emailEnviado;
    }
}
