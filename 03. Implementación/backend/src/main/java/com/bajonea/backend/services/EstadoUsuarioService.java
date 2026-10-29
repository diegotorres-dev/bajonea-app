package com.bajonea.backend.services;

import com.bajonea.backend.entities.HistorialEstadoUsuario;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.exceptions.CuentaSuspendidaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.HistorialEstadoUsuarioRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.repositories.UsuarioRepository.EstadoCuenta;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Único punto de la aplicación que cambia {@code usuario.estado}: cambia el estado, mantiene las dos columnas de la
 * suspensión (que la base exige completas si y solo si el estado es {@code SUSPENDIDO}) y escribe la fila de
 * {@code historial_estado_usuario} en la misma transacción. Ningún otro código puede llamar a
 * {@link Usuario#aplicarEstado} (lo garantiza {@code EstadoUsuarioCentralizadoTest}). Exige una transacción abierta con
 * la fila del usuario ya bloqueada por quien llama (login, recuperación de contraseña, verificación, suspensión).
 *
 * <p>También concentra la regla de lectura "esta cuenta está suspendida", para que el checkout, el pago y las
 * escrituras del Empleado la apliquen con la misma lectura bloqueante y el mismo error.
 */
@Service
@RequiredArgsConstructor
public class EstadoUsuarioService {

    private final HistorialEstadoUsuarioRepository historialEstadoUsuarioRepository;
    private final UsuarioRepository usuarioRepository;
    private final Clock clock;

    /**
     * @param administradorId quien hizo el cambio, o {@code null} si lo hizo el sistema (login, recuperación,
     *        verificación, bloqueo por intentos)
     * @return {@code false} si el usuario ya estaba en el estado de destino y no se escribió nada
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean cambiar(Usuario usuario, EstadoUsuario destino, String motivo, Integer administradorId) {
        EstadoUsuario origen = usuario.getEstado();
        if (origen == destino) {
            return false;
        }
        LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        usuario.aplicarEstado(destino, destino == EstadoUsuario.SUSPENDIDO ? motivo : null, ahora);
        usuario.setFechaActualizacion(ahora);
        usuarioRepository.save(usuario);
        historialEstadoUsuarioRepository.save(HistorialEstadoUsuario.builder()
                .usuario(usuario)
                .administrador(administradorId == null ? null : usuarioRepository.getReferenceById(administradorId))
                .estadoOrigen(origen)
                .estadoDestino(destino)
                .motivo(motivo)
                .fechaHora(ahora)
                .build());
        return true;
    }

    /**
     * Lee el estado de la cuenta con bloqueo compartido y responde {@code 409} {@code CUENTA_SUSPENDIDA} si está
     * suspendida. Para quien va a actuar en nombre del usuario dentro de una transacción (el JWT ya pasó el filtro
     * antes de la suspensión): o ve la suspensión ya confirmada, o la suspensión espera a que esta transacción
     * termine.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void exigirNoSuspendido(Integer usuarioId) {
        exigirNoSuspendido(usuarioRepository, usuarioId);
    }

    /**
     * Misma regla para quien ya tiene el repositorio a mano y no necesita el servicio completo (las escrituras del
     * comercio, que el Empleado hace con su cuenta de Cliente).
     */
    public static void exigirNoSuspendido(UsuarioRepository usuarioRepository, Integer usuarioId) {
        EstadoCuenta cuenta = usuarioRepository.leerEstadoCuentaConBloqueoCompartido(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
        if (EstadoUsuario.valueOf(cuenta.getEstado()) == EstadoUsuario.SUSPENDIDO) {
            throw new CuentaSuspendidaException(cuenta.getMotivoSuspension());
        }
    }
}
