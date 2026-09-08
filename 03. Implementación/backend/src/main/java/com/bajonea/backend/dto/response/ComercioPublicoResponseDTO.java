package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoComercio;
import java.util.List;
import lombok.Getter;

/**
 * Variante de {@code ComercioResponseDTO} exclusiva de {@code CatalogoController} (público, sin
 * autenticación) — separada en la corrección retroactiva a los Tramos 16.1/16.8 (ver
 * docs/DECISIONES.md) para que ningún dato del representante (nombre, apellido, DNI, teléfono
 * personal, fecha de nacimiento) viaje nunca a través de esta ruta. Mismos campos que
 * {@code ComercioResponseDTO} tenía antes de esa corrección.
 */
@Getter
public class ComercioPublicoResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String descripcion;
    private final String fotoPerfilUrl;
    private final String telefono;
    private final String emailContacto;
    private final TipoComercio tipoComercio;
    private final boolean aceptaDelivery;
    private final boolean aceptaRetiro;
    private final EstadoComercio estado;
    private final String razonSocial;
    private final String cuit;
    private final DireccionResponseDTO direccion;
    private final List<HorarioResponseDTO> horarios;

    public ComercioPublicoResponseDTO(
            Integer id,
            String nombre,
            String descripcion,
            String fotoPerfilUrl,
            String telefono,
            String emailContacto,
            TipoComercio tipoComercio,
            boolean aceptaDelivery,
            boolean aceptaRetiro,
            EstadoComercio estado,
            String razonSocial,
            String cuit,
            DireccionResponseDTO direccion,
            List<HorarioResponseDTO> horarios) {
        this.id = id;
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.telefono = telefono;
        this.emailContacto = emailContacto;
        this.tipoComercio = tipoComercio;
        this.aceptaDelivery = aceptaDelivery;
        this.aceptaRetiro = aceptaRetiro;
        this.estado = estado;
        this.razonSocial = razonSocial;
        this.cuit = cuit;
        this.direccion = direccion;
        this.horarios = horarios;
    }
}
