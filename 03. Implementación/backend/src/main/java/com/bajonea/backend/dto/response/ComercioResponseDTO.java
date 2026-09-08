package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CondicionIva;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoComercio;
import com.bajonea.backend.enums.TipoPersonaJuridica;
import java.time.LocalDate;
import java.util.List;
import lombok.Getter;

/**
 * Perfil propio del Comercio autenticado ({@code ComercioController}) — nunca usado por
 * {@code CatalogoController} (público, sin autenticación), que usa
 * {@code ComercioPublicoResponseDTO} en su lugar (separación hecha en la corrección retroactiva
 * a los Tramos 16.1/16.8, ver docs/DECISIONES.md). Incluye {@code razonSocial}/{@code cuit} de
 * la {@code PersonaJuridica} titular como campos descriptivos planos, no el objeto completo.
 * Incluye la {@code direccion} operativa anidada completa (no solo su id): es la dirección
 * única del comercio, parte central de su perfil, no una relación secundaria — mismo criterio
 * de excepción ya habilitado en {@code generar-capa-crud/SKILL.md} §2 ("salvo que el caso de
 * uso lo justifique explícitamente"). Mismo criterio aplicado a {@code horarios} (Fase 16a):
 * lista completa, no solo ids. {@code representante} puede ser {@code null} para comercios
 * registrados antes de esta corrección, que no tienen ninguna {@code PersonaFisica} asociada.
 * {@code motivoRechazo} es {@code null} salvo que {@code estado == RECHAZADO}, en cuyo caso
 * viene de la última fila de {@code HistorialEstadoComercio} para ese comercio (Tramo de
 * correcciones UX 15 puntos, punto 09 — el motivo nunca se guarda en {@code Comercio} mismo).
 */
@Getter
public class ComercioResponseDTO {

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
    private final CondicionIva condicionIva;
    private final TipoPersonaJuridica tipoSociedad;
    private final String domicilioFiscal;
    private final LocalDate fechaInicioActividades;
    private final DireccionResponseDTO direccion;
    private final List<HorarioResponseDTO> horarios;
    private final RepresentanteResponseDTO representante;
    private final String motivoRechazo;

    public ComercioResponseDTO(
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
            CondicionIva condicionIva,
            TipoPersonaJuridica tipoSociedad,
            String domicilioFiscal,
            LocalDate fechaInicioActividades,
            DireccionResponseDTO direccion,
            List<HorarioResponseDTO> horarios,
            RepresentanteResponseDTO representante,
            String motivoRechazo) {
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
        this.condicionIva = condicionIva;
        this.tipoSociedad = tipoSociedad;
        this.domicilioFiscal = domicilioFiscal;
        this.fechaInicioActividades = fechaInicioActividades;
        this.direccion = direccion;
        this.horarios = horarios;
        this.representante = representante;
        this.motivoRechazo = motivoRechazo;
    }
}
