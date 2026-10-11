package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import java.util.List;
import lombok.Getter;

/**
 * Perfil del comercio para un Empleado ({@code GET /api/v1/comercios/perfil} cuando el actor es Empleado). Es
 * una lista blanca de campos: nombre, foto, descripción, dirección del local, teléfono, horarios, estado y si
 * está abierto o cerrado manualmente. No lleva datos fiscales ni del titular (CUIT, razón social, condición de
 * IVA, tipo de sociedad, domicilio fiscal, fecha de inicio de actividades, representante), ni el email de
 * contacto, ni el motivo de rechazo, ni nada de Mercado Pago. Un campo nuevo de {@link ComercioResponseDTO} no
 * llega al Empleado salvo que se agregue acá a propósito.
 */
@Getter
public class ComercioEmpleadoResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String descripcion;
    private final String fotoPerfilUrl;
    private final String telefono;
    private final DireccionResponseDTO direccion;
    private final List<HorarioResponseDTO> horarios;
    private final EstadoComercio estado;
    private final boolean cerradoManualmente;
    private final boolean abiertoAhora;

    public ComercioEmpleadoResponseDTO(Integer id, String nombre, String descripcion, String fotoPerfilUrl, String telefono,
            DireccionResponseDTO direccion, List<HorarioResponseDTO> horarios, EstadoComercio estado,
            boolean cerradoManualmente, boolean abiertoAhora) {
        this.id = id;
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.telefono = telefono;
        this.direccion = direccion;
        this.horarios = horarios;
        this.estado = estado;
        this.cerradoManualmente = cerradoManualmente;
        this.abiertoAhora = abiertoAhora;
    }
}
