package com.bajonea.backend.dto.response;

import com.bajonea.backend.enums.CondicionIva;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoComercio;
import com.bajonea.backend.enums.TipoPersonaJuridica;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Getter;

/**
 * Variante de {@code ComercioResponseDTO} exclusiva de {@code AdministradorController} — usada
 * tanto para el listado/detalle de solicitudes pendientes como para el listado/detalle de
 * comercios ya aprobados (Fase 16 Tramo 8 y Tramo 21). Nunca usada por {@code ComercioController}
 * (perfil propio, mismo campo {@code representante}) ni {@code CatalogoController} (público, usa
 * {@code ComercioPublicoResponseDTO}, sin este campo). Suma {@code fechaRegistro},
 * {@code condicionIva}, {@code tipoSociedad}, {@code domicilioFiscal}, {@code fechaInicioActividades}
 * (los datos fiscales completos, para que el Administrador compare una re-solicitud), {@code emailCuenta} (email de login, {@code Usuario.email}) y
 * {@code fotoPerfilUrl}, datos que un Administrador necesita para revisar o listar un comercio
 * pero que no corresponde exponer en el perfil público de un comercio ya aprobado.
 * {@code representante} puede ser {@code null} para comercios registrados antes de la corrección
 * retroactiva a los Tramos 16.1/16.8 (ver docs/DECISIONES.md), que no tienen ninguna
 * {@code PersonaFisica} asociada. {@code redesSociales} suma las redes sociales activas del
 * comercio (Bloque 1 de la corrección del gap de la Fase 2 de Postman de Administrador, ver
 * docs/DECISIONES.md) — lista vacía si el comercio no tiene ninguna activa, nunca {@code null}.
 * <p>
 * {@code duenoId}, {@code esAdicional} y {@code otrosComercios} (multi-comercio, tramo 2A) solo se
 * pueblan en el listado de pendientes: dicen si la solicitud es de un Dueño que ya tuvo otro comercio
 * aprobado y cuáles son los demás comercios de ese Dueño (en cualquier estado, incluidas otras altas
 * pendientes). En el listado de aprobados valen {@code null}, {@code false} y lista vacía.
 */
@Getter
public class ComercioAdminResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String descripcion;
    private final String fotoPerfilUrl;
    private final String telefono;
    private final String emailContacto;
    private final String emailCuenta;
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
    private final LocalDateTime fechaRegistro;
    private final DireccionResponseDTO direccion;
    private final List<HorarioResponseDTO> horarios;
    private final RepresentanteResponseDTO representante;
    private final List<RedSocialResponseDTO> redesSociales;
    private final Integer duenoId;
    private final boolean esAdicional;
    private final List<OtroComercioDuenoResponseDTO> otrosComercios;

    public ComercioAdminResponseDTO(
            Integer id,
            String nombre,
            String descripcion,
            String fotoPerfilUrl,
            String telefono,
            String emailContacto,
            String emailCuenta,
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
            LocalDateTime fechaRegistro,
            DireccionResponseDTO direccion,
            List<HorarioResponseDTO> horarios,
            RepresentanteResponseDTO representante,
            List<RedSocialResponseDTO> redesSociales,
            Integer duenoId,
            boolean esAdicional,
            List<OtroComercioDuenoResponseDTO> otrosComercios) {
        this.id = id;
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.telefono = telefono;
        this.emailContacto = emailContacto;
        this.emailCuenta = emailCuenta;
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
        this.fechaRegistro = fechaRegistro;
        this.direccion = direccion;
        this.horarios = horarios;
        this.representante = representante;
        this.redesSociales = redesSociales;
        this.duenoId = duenoId;
        this.esAdicional = esAdicional;
        this.otrosComercios = otrosComercios;
    }
}
