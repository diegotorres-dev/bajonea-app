package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Listado de todos los Clientes para {@code AdministradorController} (Fase 16 Tramo 21). Desde la Fase 5 suma el
 * motivo y la fecha de la suspensión vigente (nulos si la cuenta no está suspendida), para que el Administrador
 * pueda suspender y levantar desde el listado, y si el último email de aviso que corresponde a su estado (el de la
 * suspensión si está suspendida, el del levantamiento si no) quedó fallido, y el estado que tenía antes de la suspensión vigente (nulo si no está suspendida o no se conoce).
 * Distinto de {@code ClienteResponseDTO} (autoservicio de perfil propio, sin {@code estado} ni
 * {@code fechaRegistro}): acá el Administrador necesita ambos para poder listar la cuenta.
 */
@Getter
public class ClienteAdminResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String apellido;
    private final String dni;
    private final String email;
    private final EstadoUsuario estado;
    private final LocalDateTime fechaRegistro;
    private final String motivoSuspension;
    private final LocalDateTime suspendidoDesde;
    private final boolean ultimoEmailAvisoFallido;
    private final EstadoUsuario estadoPrevioSuspension;

    public ClienteAdminResponseDTO(Integer id, String nombre, String apellido, String dni, String email, EstadoUsuario estado,
            LocalDateTime fechaRegistro, String motivoSuspension, LocalDateTime suspendidoDesde,
            boolean ultimoEmailAvisoFallido, EstadoUsuario estadoPrevioSuspension) {
        this.id = id;
        this.nombre = nombre;
        this.apellido = apellido;
        this.dni = dni;
        this.email = email;
        this.estado = estado;
        this.fechaRegistro = fechaRegistro;
        this.motivoSuspension = motivoSuspension;
        this.suspendidoDesde = suspendidoDesde;
        this.ultimoEmailAvisoFallido = ultimoEmailAvisoFallido;
        this.estadoPrevioSuspension = estadoPrevioSuspension;
    }
}
