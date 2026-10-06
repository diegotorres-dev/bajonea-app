package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class MiembroEquipoResponseDTO {

    private final Integer empleadoId;
    private final String nombre;
    private final String apellido;
    private final String email;
    private final String fotoPerfilUrl;
    private final EstadoEmpleadoComercio estado;
    private final LocalDateTime fechaAlta;
    private final LocalDateTime fechaBaja;

    public MiembroEquipoResponseDTO(Integer empleadoId, String nombre, String apellido, String email, String fotoPerfilUrl,
            EstadoEmpleadoComercio estado, LocalDateTime fechaAlta, LocalDateTime fechaBaja) {
        this.empleadoId = empleadoId;
        this.nombre = nombre;
        this.apellido = apellido;
        this.email = email;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.estado = estado;
        this.fechaAlta = fechaAlta;
        this.fechaBaja = fechaBaja;
    }
}
