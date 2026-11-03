package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import lombok.Getter;

@Getter
public class CuentaAsociadaSoporteResponseDTO {

    private final Integer usuarioId;
    private final String nombre;
    private final String apellido;
    private final EstadoUsuario estado;
    private final RolUsuario rol;
    private final boolean esEmpleado;

    public CuentaAsociadaSoporteResponseDTO(Integer usuarioId, String nombre, String apellido, EstadoUsuario estado, RolUsuario rol,
            boolean esEmpleado) {
        this.usuarioId = usuarioId;
        this.nombre = nombre;
        this.apellido = apellido;
        this.estado = estado;
        this.rol = rol;
        this.esEmpleado = esEmpleado;
    }
}
