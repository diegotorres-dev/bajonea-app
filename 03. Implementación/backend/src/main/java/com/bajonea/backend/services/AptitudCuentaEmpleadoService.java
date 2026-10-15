package com.bajonea.backend.services;

import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.util.EdadUtils;
import java.time.Clock;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reglas de aptitud de una cuenta existente para ser Empleado de un comercio, en un solo lugar: las usan invitar,
 * reenviar, validar y aceptar una invitación ({@link InvitacionEmpleadoService}) y la reactivación directa
 * ({@link GestionMiembroEquipoService}), para que no diverjan. El orden de {@link #evaluar} es el de la
 * aceptación: matriz de roles, estado de la cuenta y edad. Cada llamador decide qué mensaje muestra por cada
 * resultado (la invitación distingue el motivo; la reactivación y la invitación del Dueño no lo revelan).
 * <p>
 * No toma bloqueos: el estado de la cuenta lo lee y lo bloquea quien llama, en el orden de bloqueo que
 * corresponda a su operación, y lo pasa como argumento.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AptitudCuentaEmpleadoService {

    public static final int EDAD_MINIMA_EMPLEADO = 18;

    public enum Aptitud {
        APTA,
        ROL_INCOMPATIBLE,
        CUENTA_NO_ACTIVA,
        MENOR_DE_EDAD
    }

    private final MatrizRolesService matrizRolesService;
    private final PersonaFisicaRepository personaFisicaRepository;
    private final Clock clock;

    public boolean puedeSerEmpleado(Integer usuarioId) {
        return matrizRolesService.puedeSerEmpleado(usuarioId);
    }

    /**
     * Aptitud por edad: la edad es la declarada en la persona física, calculada con el reloj del sistema.
     */
    public boolean tieneEdadParaEquipo(Integer usuarioId) {
        PersonaFisica persona = personaFisicaRepository.findById(usuarioId)
                .orElseThrow(() -> new IllegalStateException("La cuenta usuarioId=" + usuarioId + " no tiene persona física"));
        return EdadUtils.cumpleEdadMinima(persona.getFechaNacimiento(), LocalDate.now(clock), EDAD_MINIMA_EMPLEADO);
    }

    public Aptitud evaluar(Integer usuarioId, EstadoUsuario estado) {
        if (!puedeSerEmpleado(usuarioId)) {
            return Aptitud.ROL_INCOMPATIBLE;
        }
        if (estado != EstadoUsuario.ACTIVO) {
            return Aptitud.CUENTA_NO_ACTIVA;
        }
        if (!tieneEdadParaEquipo(usuarioId)) {
            return Aptitud.MENOR_DE_EDAD;
        }
        return Aptitud.APTA;
    }
}
