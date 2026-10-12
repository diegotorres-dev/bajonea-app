package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoComercio;
import java.util.List;
import lombok.Getter;

/**
 * Perfil del comercio para un Empleado ({@code GET /api/v1/comercios/perfil} cuando el actor es Empleado). Es
 * una lista blanca de campos: nombre, foto, descripción, dirección del local, teléfono, tipo de comercio,
 * modalidades de entrega, horarios, estado, si está abierto o cerrado manualmente, si puede cambiar el cierre y
 * el texto de reapertura. No lleva datos fiscales ni del titular (CUIT, razón social, condición de IVA, tipo de
 * sociedad, domicilio fiscal, fecha de inicio de actividades, representante), ni el email de contacto (queda
 * para E3), ni el motivo de rechazo, ni nada de Mercado Pago. Un campo nuevo de {@link ComercioResponseDTO} no
 * llega al Empleado salvo que se agregue acá a propósito.
 */
@Getter
public class ComercioEmpleadoResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String descripcion;
    private final String fotoPerfilUrl;
    private final String telefono;
    private final TipoComercio tipoComercio;
    private final boolean aceptaDelivery;
    private final boolean aceptaRetiro;
    private final DireccionResponseDTO direccion;
    private final List<HorarioResponseDTO> horarios;
    private final EstadoComercio estado;
    private final boolean cerradoManualmente;
    private final boolean abiertoAhora;
    private final boolean puedeCambiarCierre;
    private final String textoReapertura;

    public ComercioEmpleadoResponseDTO(Integer id, String nombre, String descripcion, String fotoPerfilUrl, String telefono,
            TipoComercio tipoComercio, boolean aceptaDelivery, boolean aceptaRetiro, DireccionResponseDTO direccion,
            List<HorarioResponseDTO> horarios, EstadoComercio estado, boolean cerradoManualmente, boolean abiertoAhora,
            boolean puedeCambiarCierre, String textoReapertura) {
        this.id = id;
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.telefono = telefono;
        this.tipoComercio = tipoComercio;
        this.aceptaDelivery = aceptaDelivery;
        this.aceptaRetiro = aceptaRetiro;
        this.direccion = direccion;
        this.horarios = horarios;
        this.estado = estado;
        this.cerradoManualmente = cerradoManualmente;
        this.abiertoAhora = abiertoAhora;
        this.puedeCambiarCierre = puedeCambiarCierre;
        this.textoReapertura = textoReapertura;
    }
}
