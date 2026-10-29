package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.dto.response.SuspensionComercioPreviaResponseDTO;
import com.bajonea.backend.dto.response.SuspensionComercioResponseDTO;
import com.bajonea.backend.entities.Administrador;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.OrigenSuspensionComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository.EstadoDeRelacion;
import com.bajonea.backend.repositories.EmpleadoComercioRepository.RelacionDeEmpleado;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Suspensión individual de un comercio por el Administrador y su levantamiento. Solo se suspende un comercio
 * {@code APROBADO}, {@code APTO_VENTA} o {@code CERRADO_TEMPORALMENTE}. Suspender no toca ningún pedido: los pedidos del
 * comercio siguen su camino y los dos topes de 90 minutos (preparación y retiro) los resuelven los procesos de
 * {@link PedidoService}, que cuentan desde {@code comercio.suspendido_desde}.
 *
 * <p><b>Reglas.</b> Re-suspender uno ya suspendido solo es posible si su origen es {@code DUENO}: pasa a
 * {@code INDIVIDUAL}, cambia el motivo y conserva {@code suspendido_desde}; cualquier otro caso es {@code 409}. Un
 * comercio suspendido por la suspensión del Dueño no se levanta individualmente. El cierre manual no se toca. Al levantar
 * el destino lo decide {@link AptitudVentaComercioService} con la regla de seguir vendiendo.
 *
 * <p><b>Orden de bloqueo</b> (siempre, y el bloqueo es la primera lectura de la transacción): las filas de los usuarios
 * del Dueño y de los Empleados activos con {@code LOCK IN SHARE MODE} en id ascendente (los avisos las referencian), las
 * relaciones por clave primaria en id ascendente, la cuenta de Mercado Pago del Dueño (solo al levantar) y por último el
 * comercio {@code FOR UPDATE}. Los destinatarios se leen antes, fuera de la transacción: quien se suma después no recibe
 * el aviso y una baja concurrente deja afuera a esa persona.
 */
@Service
public class SuspensionComercioService {

    static final String MENSAJE_NO_SUSPENDIBLE = "Solo se puede suspender un comercio aprobado";
    static final String MENSAJE_YA_SUSPENDIDO = "El comercio ya está suspendido";
    static final String MENSAJE_NO_SUSPENDIDO = "El comercio no está suspendido";
    static final String MENSAJE_SUSPENDIDO_POR_DUENO = "Este comercio está suspendido porque se suspendió a su Dueño. "
            + "Hay que levantar la suspensión del Dueño";

    private static final Set<EstadoComercio> SUSPENDIBLES = Set.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA,
            EstadoComercio.CERRADO_TEMPORALMENTE);

    private final ComercioRepository comercioRepository;
    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final UsuarioRepository usuarioRepository;
    private final AdministradorRepository administradorRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final PedidoRepository pedidoRepository;
    private final AptitudVentaComercioService aptitudVentaComercioService;
    private final AvisoCuentaService avisoCuentaService;
    private final Clock clock;
    private final TransactionTemplate transaccion;

    public SuspensionComercioService(ComercioRepository comercioRepository, EmpleadoComercioRepository empleadoComercioRepository,
            UsuarioRepository usuarioRepository, AdministradorRepository administradorRepository,
            HistorialEstadoComercioRepository historialEstadoComercioRepository, PedidoRepository pedidoRepository,
            AptitudVentaComercioService aptitudVentaComercioService, AvisoCuentaService avisoCuentaService, Clock clock,
            PlatformTransactionManager transactionManager) {
        this.comercioRepository = comercioRepository;
        this.empleadoComercioRepository = empleadoComercioRepository;
        this.usuarioRepository = usuarioRepository;
        this.administradorRepository = administradorRepository;
        this.historialEstadoComercioRepository = historialEstadoComercioRepository;
        this.pedidoRepository = pedidoRepository;
        this.aptitudVentaComercioService = aptitudVentaComercioService;
        this.avisoCuentaService = avisoCuentaService;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
    }

    public SuspensionComercioResponseDTO suspender(Integer comercioId, Integer administradorId, SuspensionComercioRequestDTO request) {
        Destinatarios destinatarios = leerDestinatarios(comercioId);
        return transaccion.execute(status -> {
            Bloqueados bloqueados = bloquearUsuariosYRelaciones(destinatarios);
            Comercio comercio = aptitudVentaComercioService.bloquearComercio(comercioId);
            Administrador administrador = administradorRepository.findById(administradorId)
                    .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));

            EstadoComercio estadoOrigen = comercio.getEstado();
            boolean conversion = estadoOrigen == EstadoComercio.SUSPENDIDO
                    && comercio.getSuspensionOrigen() == OrigenSuspensionComercio.DUENO;
            if (estadoOrigen == EstadoComercio.SUSPENDIDO && !conversion) {
                throw new ConflictoDeNegocioException(MENSAJE_YA_SUSPENDIDO);
            }
            if (!conversion && !SUSPENDIBLES.contains(estadoOrigen)) {
                throw new ConflictoDeNegocioException(MENSAJE_NO_SUSPENDIBLE);
            }

            LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
            comercio.setEstado(EstadoComercio.SUSPENDIDO);
            comercio.setSuspensionOrigen(OrigenSuspensionComercio.INDIVIDUAL);
            comercio.setSuspendidoDesde(conversion ? comercio.getSuspendidoDesde() : ahora);
            comercio.setMotivoSuspension(request.getMotivo());
            comercio.setFechaModificacion(ahora);
            comercioRepository.save(comercio);

            historialEstadoComercioRepository.save(HistorialEstadoComercio.builder()
                    .comercio(comercio)
                    .administrador(administrador)
                    .estadoOrigen(estadoOrigen)
                    .estadoDestino(EstadoComercio.SUSPENDIDO)
                    .motivo(request.getMotivo())
                    .suspensionOrigen(OrigenSuspensionComercio.INDIVIDUAL)
                    .fechaHora(ahora)
                    .build());

            avisoCuentaService.avisarSuspensionComercio(destinatarios.duenoId(), emailDe(destinatarios.duenoId()),
                    comercioId, comercio.getNombre(), request.getMotivo());
            if (!conversion) {
                avisoCuentaService.avisarEmpleadosSuspensionComercio(comercioId, comercio.getNombre(), bloqueados.empleados());
            }
            return aRespuesta(comercio);
        });
    }

    public SuspensionComercioResponseDTO levantar(Integer comercioId, Integer administradorId,
            LevantamientoSuspensionRequestDTO request) {
        String motivo = request == null ? null : request.getMotivo();
        Destinatarios destinatarios = leerDestinatarios(comercioId);
        return transaccion.execute(status -> {
            Bloqueados bloqueados = bloquearUsuariosYRelaciones(destinatarios);
            AptitudVentaComercioService.EntradasDueno entradasDueno = aptitudVentaComercioService.leerDueno(destinatarios.duenoId());
            Comercio comercio = aptitudVentaComercioService.bloquearComercio(comercioId);
            Administrador administrador = administradorRepository.findById(administradorId)
                    .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));

            if (comercio.getEstado() != EstadoComercio.SUSPENDIDO) {
                throw new ConflictoDeNegocioException(MENSAJE_NO_SUSPENDIDO);
            }
            if (comercio.getSuspensionOrigen() == OrigenSuspensionComercio.DUENO) {
                throw new ConflictoDeNegocioException(MENSAJE_SUSPENDIDO_POR_DUENO);
            }

            EstadoComercio destino = aptitudVentaComercioService.destinoAlLevantarSuspension(comercio, entradasDueno);
            OrigenSuspensionComercio origenLevantado = comercio.getSuspensionOrigen();
            LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
            comercio.setEstado(destino);
            comercio.setSuspensionOrigen(null);
            comercio.setSuspendidoDesde(null);
            comercio.setMotivoSuspension(null);
            comercio.setFechaModificacion(ahora);
            comercioRepository.save(comercio);

            historialEstadoComercioRepository.save(HistorialEstadoComercio.builder()
                    .comercio(comercio)
                    .administrador(administrador)
                    .estadoOrigen(EstadoComercio.SUSPENDIDO)
                    .estadoDestino(destino)
                    .motivo(motivo)
                    .suspensionOrigen(origenLevantado)
                    .fechaHora(ahora)
                    .build());

            avisoCuentaService.avisarLevantamientoComercio(destinatarios.duenoId(), emailDe(destinatarios.duenoId()),
                    comercioId, comercio.getNombre(), motivo);
            avisoCuentaService.avisarEmpleadosLevantamientoComercio(comercioId, comercio.getNombre(), bloqueados.empleados());
            return aRespuesta(comercio);
        });
    }

    public SuspensionComercioPreviaResponseDTO vistaPrevia(Integer comercioId) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return new SuspensionComercioPreviaResponseDTO(comercioId, comercio.getEstado(), comercio.getSuspensionOrigen(),
                pedidoRepository.countByComercioIdAndEstado(comercioId, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO),
                pedidoRepository.countByComercioIdAndEstado(comercioId, EstadoPedido.EN_PREPARACION),
                pedidoRepository.countByComercioIdAndEstado(comercioId, EstadoPedido.LISTO_PARA_RETIRAR),
                pedidoRepository.countByComercioIdAndEstado(comercioId, EstadoPedido.EN_CAMINO),
                pedidoRepository.countByComercioIdAndEstado(comercioId, EstadoPedido.PENDIENTE_PAGO));
    }

    public EstadoEnvioNotificacion reenviarEmail(Integer comercioId) {
        return avisoCuentaService.reenviarEmailComercioFallido(comercioId);
    }

    private SuspensionComercioResponseDTO aRespuesta(Comercio comercio) {
        return new SuspensionComercioResponseDTO(comercio.getId(), comercio.getEstado(), comercio.getSuspensionOrigen(),
                comercio.getSuspendidoDesde(), comercio.getMotivoSuspension());
    }

    private String emailDe(Integer usuarioId) {
        return usuarioRepository.findById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado")).getEmail();
    }

    private record Destinatarios(Integer duenoId, List<RelacionDeEmpleado> candidatos) {
    }

    private record Bloqueados(List<Integer> empleados) {
    }

    /**
     * Primera mitad de la resolución de los destinatarios: el Dueño y las relaciones activas, con lecturas simples fuera
     * de toda transacción (así la foto de la transacción de la suspensión se fija después de los bloqueos).
     */
    private Destinatarios leerDestinatarios(Integer comercioId) {
        Integer duenoId = comercioRepository.findDuenoIdById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        List<RelacionDeEmpleado> candidatos = new ArrayList<>(
                empleadoComercioRepository.findRelacionesByComercioIdAndEstado(comercioId, EstadoEmpleadoComercio.ACTIVO));
        return new Destinatarios(duenoId, candidatos);
    }

    /**
     * Segunda mitad: los usuarios del Dueño y de los candidatos con bloqueo compartido en id ascendente y después las
     * relaciones por clave primaria. Los destinatarios son los Empleados cuya relación sigue {@code ACTIVO} y cuya cuenta
     * no está suspendida.
     */
    private Bloqueados bloquearUsuariosYRelaciones(Destinatarios destinatarios) {
        TreeSet<Integer> usuarios = new TreeSet<>();
        usuarios.add(destinatarios.duenoId());
        for (RelacionDeEmpleado candidato : destinatarios.candidatos()) {
            usuarios.add(candidato.getEmpleadoId());
        }
        Map<Integer, EstadoUsuario> estados = new HashMap<>();
        for (Integer usuarioId : usuarios) {
            usuarioRepository.leerEstadoCuentaConBloqueoCompartido(usuarioId)
                    .ifPresent(cuenta -> estados.put(usuarioId, EstadoUsuario.valueOf(cuenta.getEstado())));
        }
        List<Integer> empleados = new ArrayList<>();
        if (!destinatarios.candidatos().isEmpty()) {
            List<Integer> ids = destinatarios.candidatos().stream().map(RelacionDeEmpleado::getId).toList();
            for (EstadoDeRelacion relacion : empleadoComercioRepository.leerRelacionesConBloqueoCompartido(ids)) {
                boolean activa = EstadoEmpleadoComercio.valueOf(relacion.getEstado()) == EstadoEmpleadoComercio.ACTIVO;
                if (activa && estados.get(relacion.getEmpleadoId()) != EstadoUsuario.SUSPENDIDO) {
                    empleados.add(relacion.getEmpleadoId());
                }
            }
        }
        return new Bloqueados(empleados);
    }
}
