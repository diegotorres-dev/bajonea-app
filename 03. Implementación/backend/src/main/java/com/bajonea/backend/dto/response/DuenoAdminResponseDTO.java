package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import java.time.LocalDateTime;
import lombok.Getter;

@Getter
public class DuenoAdminResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String apellido;
    private final String dni;
    private final String email;
    private final EstadoUsuario estado;
    private final LocalDateTime fechaRegistro;
    private final long cantidadComercios;
    private final String motivoSuspension;
    private final LocalDateTime suspendidoDesde;
    private final boolean ultimoEmailAvisoFallido;
    private final EstadoUsuario estadoPrevioSuspension;

    public DuenoAdminResponseDTO(Integer id, String nombre, String apellido, String dni, String email, EstadoUsuario estado,
            LocalDateTime fechaRegistro, long cantidadComercios, String motivoSuspension, LocalDateTime suspendidoDesde,
            boolean ultimoEmailAvisoFallido, EstadoUsuario estadoPrevioSuspension) {
        this.id = id;
        this.nombre = nombre;
        this.apellido = apellido;
        this.dni = dni;
        this.email = email;
        this.estado = estado;
        this.fechaRegistro = fechaRegistro;
        this.cantidadComercios = cantidadComercios;
        this.motivoSuspension = motivoSuspension;
        this.suspendidoDesde = suspendidoDesde;
        this.ultimoEmailAvisoFallido = ultimoEmailAvisoFallido;
        this.estadoPrevioSuspension = estadoPrevioSuspension;
    }
}
