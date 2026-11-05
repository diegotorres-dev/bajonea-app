package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.ReactivacionCuentaResponseDTO;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.UsuarioRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * El Administrador reactiva desde la ficha una cuenta inactiva por falta de uso (Cliente o Dueño). Toma las filas del
 * Administrador (compartida) y de la cuenta ({@code FOR UPDATE}) en id ascendente, con la cuenta como primera lectura
 * de la transacción cuando le toca, y delega en {@link ReactivacionCuentaService}. Una cuenta que no está inactiva
 * responde {@code 409}: reactivar una cuenta bloqueada o suspendida tiene su propio camino.
 */
@Service
public class ReactivacionCuentaAdminService {

    static final String MENSAJE_NO_INACTIVA = "La cuenta no está inactiva";
    static final String MENSAJE_ADMINISTRADOR = "No se puede reactivar la cuenta de un Administrador";
    static final String MOTIVO_USUARIO = "Reactivación por el Administrador";
    static final String MOTIVO_COMERCIOS = "Reactivación de la cuenta del Dueño por el Administrador";

    private final UsuarioRepository usuarioRepository;
    private final ReactivacionCuentaService reactivacionCuentaService;
    private final TransactionTemplate transaccion;

    public ReactivacionCuentaAdminService(UsuarioRepository usuarioRepository,
            ReactivacionCuentaService reactivacionCuentaService, PlatformTransactionManager transactionManager) {
        this.usuarioRepository = usuarioRepository;
        this.reactivacionCuentaService = reactivacionCuentaService;
        this.transaccion = new TransactionTemplate(transactionManager);
    }

    public ReactivacionCuentaResponseDTO reactivar(Integer usuarioId, Integer administradorId) {
        RolUsuario rol = usuarioRepository.findRolById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
        if (rol == RolUsuario.ADMINISTRADOR) {
            throw new ConflictoDeNegocioException(MENSAJE_ADMINISTRADOR);
        }
        EstadoUsuario estado = transaccion.execute(status -> {
            if (administradorId < usuarioId) {
                usuarioRepository.leerIdConBloqueoCompartido(administradorId);
            }
            Usuario usuario = usuarioRepository.findByIdConBloqueo(usuarioId)
                    .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
            if (administradorId > usuarioId) {
                usuarioRepository.leerIdConBloqueoCompartido(administradorId);
            }
            if (!reactivacionCuentaService.reactivar(usuario, MOTIVO_USUARIO, MOTIVO_COMERCIOS, administradorId)) {
                throw new ConflictoDeNegocioException(MENSAJE_NO_INACTIVA);
            }
            return usuario.getEstado();
        });
        return new ReactivacionCuentaResponseDTO(usuarioId, estado);
    }
}
