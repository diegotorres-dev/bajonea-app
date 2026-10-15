package com.bajonea.backend.dto.response;

import com.bajonea.backend.entities.EmpleadoComercio;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import java.time.LocalDateTime;
import lombok.Getter;

/**
 * Miembro del equipo tal como lo ven el Dueño y el Administrador. {@code motivoBaja} ({@code BAJA_DUENO} o
 * {@code RENUNCIA}) y {@code puedeReactivar} solo tienen valor en un miembro {@code INACTIVO}: el motivo es el de
 * su última baja registrada (nulo si no hay registro, como en una relación que dejó el atajo de test), y se puede
 * reactivar directamente solo si lo dio de baja el Dueño. El Empleado no recibe este DTO.
 */
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
    private final MotivoHistorialEmpleado motivoBaja;
    private final boolean puedeReactivar;

    public MiembroEquipoResponseDTO(Integer empleadoId, String nombre, String apellido, String email, String fotoPerfilUrl,
            EstadoEmpleadoComercio estado, LocalDateTime fechaAlta, LocalDateTime fechaBaja, MotivoHistorialEmpleado motivoBaja,
            boolean puedeReactivar) {
        this.empleadoId = empleadoId;
        this.nombre = nombre;
        this.apellido = apellido;
        this.email = email;
        this.fotoPerfilUrl = fotoPerfilUrl;
        this.estado = estado;
        this.fechaAlta = fechaAlta;
        this.fechaBaja = fechaBaja;
        this.motivoBaja = motivoBaja;
        this.puedeReactivar = puedeReactivar;
    }

    /**
     * @param ultimoMotivoDeBaja motivo de la última baja de la relación; se ignora si la relación no está inactiva
     */
    public static MiembroEquipoResponseDTO de(EmpleadoComercio relacion, MotivoHistorialEmpleado ultimoMotivoDeBaja) {
        PersonaFisica persona = relacion.getEmpleado().getPersonaFisica();
        Usuario usuario = persona.getPersona().getUsuario();
        boolean inactivo = relacion.getEstado() == EstadoEmpleadoComercio.INACTIVO;
        MotivoHistorialEmpleado motivo = inactivo ? ultimoMotivoDeBaja : null;
        return new MiembroEquipoResponseDTO(relacion.getEmpleado().getId(), persona.getNombre(), persona.getApellido(),
                usuario.getEmail(), usuario.getFotoPerfilUrl(), relacion.getEstado(), relacion.getFechaAlta(), relacion.getFechaBaja(),
                motivo, motivo == MotivoHistorialEmpleado.BAJA_DUENO);
    }
}
