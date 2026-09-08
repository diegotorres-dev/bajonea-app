package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoUsuario;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Listado de solo lectura de todos los Clientes para {@code AdministradorController} (Fase 16
 * Tramo 21) — sin acción de suspender/reactivar, confirmado fuera de alcance del MVP actual.
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

    public ClienteAdminResponseDTO(
            Integer id, String nombre, String apellido, String dni, String email, EstadoUsuario estado, LocalDateTime fechaRegistro) {
        this.id = id;
        this.nombre = nombre;
        this.apellido = apellido;
        this.dni = dni;
        this.email = email;
        this.estado = estado;
        this.fechaRegistro = fechaRegistro;
    }
}
