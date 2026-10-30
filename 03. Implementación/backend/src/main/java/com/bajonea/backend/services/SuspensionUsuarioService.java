package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.response.SuspensionClientePreviaResponseDTO;
import com.bajonea.backend.dto.response.SuspensionUsuarioResponseDTO;
import com.bajonea.backend.entities.HistorialEstadoUsuario;
import com.bajonea.backend.entities.Sesion;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoCierreSesion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.HistorialEstadoUsuarioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.SesionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Suspensión y levantamiento de la cuenta de un Cliente por el Administrador. Solo el Administrador suspende y
 * levanta; el objetivo es un usuario con rol {@code CLIENTE} (un Empleado es un Cliente). Un Dueño todavía no se
 * puede suspender desde acá (arrastra sus comercios, tramos siguientes) y un Administrador no se suspende nunca.
 *
 * <p><b>Dos fases.</b> La fase 1 es una transacción corta que toma la fila del usuario {@code FOR UPDATE} (la misma
 * que toman el login, la recuperación de contraseña y todas las acciones que lo involucran con bloqueo compartido),
 * revalida el estado sobre esa fila, cambia el estado por {@link EstadoUsuarioService}, cierra su sesión, y deja el
 * aviso y el email. La fase 2 corre después del commit y cancela, uno por transacción, los pedidos sin pagar; no puede
 * ir dentro de la fase 1 porque cada pedido toma la fila del Cliente con bloqueo compartido y esperaría a la
 * transacción que la sostiene de forma exclusiva.
 *
 * <p>Orden de bloqueo: los dos usuarios involucrados (el Administrador, que la clave foránea del historial toma con
 * bloqueo compartido, y el objetivo, exclusivo) en id ascendente.
 */
@Service
public class SuspensionUsuarioService {

    static final String MENSAJE_YA_SUSPENDIDA = "La cuenta ya está suspendida";
    static final String MENSAJE_NO_SUSPENDIDA = "La cuenta no está suspendida";
    static final String MENSAJE_ADMINISTRADOR = "No se puede suspender a un Administrador";
    static final String MENSAJE_PROPIA_CUENTA = "No podés suspender tu propia cuenta";
    static final String MENSAJE_DUENO_NO_SOPORTADO = "Un Dueño se suspende desde la lista de Dueños";

    private static final List<EstadoPedido> EN_CURSO_PAGADOS = List.of(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO,
            EstadoPedido.EN_PREPARACION, EstadoPedido.EN_CAMINO, EstadoPedido.LISTO_PARA_RETIRAR);

    @PersistenceContext
    private EntityManager entityManager;

    private final UsuarioRepository usuarioRepository;
    private final SesionRepository sesionRepository;
    private final PedidoRepository pedidoRepository;
    private final HistorialEstadoUsuarioRepository historialEstadoUsuarioRepository;
    private final EstadoUsuarioService estadoUsuarioService;
    private final AvisoCuentaService avisoCuentaService;
    private final PedidoService pedidoService;
    private final Clock clock;
    private final TransactionTemplate transaccion;

    public SuspensionUsuarioService(UsuarioRepository usuarioRepository, SesionRepository sesionRepository,
            PedidoRepository pedidoRepository, HistorialEstadoUsuarioRepository historialEstadoUsuarioRepository,
            EstadoUsuarioService estadoUsuarioService, AvisoCuentaService avisoCuentaService, PedidoService pedidoService,
            Clock clock, PlatformTransactionManager transactionManager) {
        this.usuarioRepository = usuarioRepository;
        this.sesionRepository = sesionRepository;
        this.pedidoRepository = pedidoRepository;
        this.historialEstadoUsuarioRepository = historialEstadoUsuarioRepository;
        this.estadoUsuarioService = estadoUsuarioService;
        this.avisoCuentaService = avisoCuentaService;
        this.pedidoService = pedidoService;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
    }

    public SuspensionUsuarioResponseDTO suspender(Integer usuarioId, Integer administradorId, SuspensionUsuarioRequestDTO request) {
        validarObjetivo(usuarioId, administradorId);
        transaccion.executeWithoutResult(status -> {
            Usuario usuario = bloquearParaCambiar(usuarioId, administradorId);
            if (usuario.getEstado() == EstadoUsuario.SUSPENDIDO) {
                throw new ConflictoDeNegocioException(MENSAJE_YA_SUSPENDIDA);
            }
            estadoUsuarioService.cambiar(usuario, EstadoUsuario.SUSPENDIDO, request.getMotivo(), administradorId);
            cerrarSesionesPorSuspension(usuarioId);
            avisoCuentaService.avisarSuspension(usuarioId, usuario.getEmail(), request.getMotivo());
        });
        int cancelados = pedidoService.cancelarPedidosSinPagarPorSuspensionCliente(usuarioId);
        return new SuspensionUsuarioResponseDTO(usuarioId, EstadoUsuario.SUSPENDIDO, cancelados);
    }

    public SuspensionUsuarioResponseDTO levantar(Integer usuarioId, Integer administradorId,
            LevantamientoSuspensionRequestDTO request) {
        validarObjetivo(usuarioId, administradorId);
        String motivo = request == null ? null : request.getMotivo();
        EstadoUsuario destino = transaccion.execute(status -> {
            Usuario usuario = bloquearParaCambiar(usuarioId, administradorId);
            if (usuario.getEstado() != EstadoUsuario.SUSPENDIDO) {
                throw new ConflictoDeNegocioException(MENSAJE_NO_SUSPENDIDA);
            }
            EstadoUsuario estadoDestino = estadoAlLevantar(usuarioId);
            usuario.setIntentosFallidos(0);
            estadoUsuarioService.cambiar(usuario, estadoDestino, motivo, administradorId);
            if (estadoDestino == EstadoUsuario.ACTIVO) {
                usuario.setFechaUltimoAcceso(LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS));
                usuarioRepository.save(usuario);
            }
            avisoCuentaService.avisarLevantamiento(usuarioId, usuario.getEmail(), motivo);
            return estadoDestino;
        });
        return new SuspensionUsuarioResponseDTO(usuarioId, destino, 0);
    }

    /**
     * Estado al que vuelve la cuenta: el que tenía antes de la suspensión (origen de la última fila del historial con
     * destino {@code SUSPENDIDO}). Una cuenta bloqueada vuelve {@code ACTIVO} (con los intentos en cero); si no hay
     * fila o no trae origen (una suspensión cargada a mano en la base), vuelve {@code ACTIVO}.
     */
    EstadoUsuario estadoAlLevantar(Integer usuarioId) {
        EstadoUsuario origen = historialEstadoUsuarioRepository
                .findTopByUsuarioIdAndEstadoDestinoOrderByIdDesc(usuarioId, EstadoUsuario.SUSPENDIDO)
                .map(HistorialEstadoUsuario::getEstadoOrigen)
                .orElse(null);
        if (origen == EstadoUsuario.PENDIENTE || origen == EstadoUsuario.INACTIVO) {
            return origen;
        }
        return EstadoUsuario.ACTIVO;
    }

    public SuspensionClientePreviaResponseDTO vistaPrevia(Integer usuarioId, Integer administradorId) {
        validarObjetivo(usuarioId, administradorId);
        EstadoUsuario estado = usuarioRepository.findEstadoById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
        return new SuspensionClientePreviaResponseDTO(usuarioId, estado,
                pedidoRepository.countByClienteIdAndEstadoIn(usuarioId, EN_CURSO_PAGADOS),
                pedidoRepository.countByClienteIdAndEstadoIn(usuarioId, List.of(EstadoPedido.PENDIENTE_PAGO)));
    }

    public EstadoEnvioNotificacion reenviarEmail(Integer usuarioId, Integer administradorId) {
        validarObjetivo(usuarioId, administradorId);
        return avisoCuentaService.reenviarEmailFallido(usuarioId);
    }

    private void validarObjetivo(Integer usuarioId, Integer administradorId) {
        if (usuarioId.equals(administradorId)) {
            throw new ConflictoDeNegocioException(MENSAJE_PROPIA_CUENTA);
        }
        RolUsuario rol = usuarioRepository.findRolById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
        if (rol == RolUsuario.ADMINISTRADOR) {
            throw new ConflictoDeNegocioException(MENSAJE_ADMINISTRADOR);
        }
        if (rol == RolUsuario.DUENO) {
            throw new ConflictoDeNegocioException(MENSAJE_DUENO_NO_SOPORTADO);
        }
    }

    /**
     * Toma las filas de los dos usuarios en id ascendente (el Administrador compartido, el objetivo exclusivo) y
     * devuelve el objetivo releído con su estado confirmado: en el contexto de persistencia puede haber una copia
     * vieja si el pedido ya lo cargó, y se valida sobre la fila bloqueada. El bloqueo tiene que ser la primera lectura
     * de la transacción: una lectura común antes fija el snapshot de la transacción (REPEATABLE READ) y las
     * lecturas siguientes (las sesiones activas, el historial) no verían lo que un login simultáneo confirmó mientras
     * esta transacción esperaba el bloqueo; el {@code refresh} posterior ya corre con el bloqueo tomado.
     */
    private Usuario bloquearParaCambiar(Integer usuarioId, Integer administradorId) {
        if (administradorId < usuarioId) {
            usuarioRepository.leerIdConBloqueoCompartido(administradorId);
        }
        Usuario usuario = usuarioRepository.findByIdConBloqueo(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
        entityManager.refresh(usuario);
        if (administradorId > usuarioId) {
            usuarioRepository.leerIdConBloqueoCompartido(administradorId);
        }
        return usuario;
    }

    private void cerrarSesionesPorSuspension(Integer usuarioId) {
        LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        for (Sesion sesion : sesionRepository.findActivasDelUsuario(usuarioId)) {
            sesion.setActiva(false);
            sesion.setTipoCierre(TipoCierreSesion.SUSPENSION);
            sesion.setFechaCierre(ahora);
            sesionRepository.save(sesion);
        }
    }
}
