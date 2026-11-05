package com.bajonea.backend.services;

import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.repositories.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Único camino que saca una cuenta de {@code INACTIVO}: pasa a {@code ACTIVO} por {@link EstadoUsuarioService} (que deja
 * el historial y fija el último acceso), pone los intentos fallidos en cero y, si es un Dueño, devuelve sus comercios
 * {@code INACTIVO} al estado que les corresponde ({@code APTO_VENTA} o {@code APROBADO}, según Mercado Pago y
 * documentos; un comercio suspendido por separado sigue suspendido porque la inactivación nunca lo tocó). Lo usan la
 * reactivación con usuario y contraseña, la del código por email, la recuperación de contraseña y el Administrador.
 * Exige la fila del usuario ya bloqueada por quien llama.
 */
@Service
@RequiredArgsConstructor
public class ReactivacionCuentaService {

    private final EstadoUsuarioService estadoUsuarioService;
    private final AptitudVentaComercioService aptitudVentaComercioService;
    private final UsuarioRepository usuarioRepository;

    /**
     * @return {@code false} si la cuenta no estaba inactiva y no se hizo nada
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean reactivar(Usuario usuario, String motivoUsuario, String motivoComercios, Integer administradorId) {
        if (usuario.getEstado() != EstadoUsuario.INACTIVO) {
            return false;
        }
        estadoUsuarioService.cambiar(usuario, EstadoUsuario.ACTIVO, motivoUsuario, administradorId);
        usuario.setIntentosFallidos(0);
        usuarioRepository.save(usuario);
        if (usuario.getRol() == RolUsuario.DUENO) {
            aptitudVentaComercioService.restaurar(usuario.getId(), EstadoComercio.INACTIVO, motivoComercios);
        }
        return true;
    }
}
