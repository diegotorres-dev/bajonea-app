package com.bajonea.backend.services;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.dto.request.LevantamientoSuspensionRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.response.SuspensionDuenoPreviaResponseDTO;
import com.bajonea.backend.dto.response.SuspensionDuenoPreviaResponseDTO.AtencionDePedidos;
import com.bajonea.backend.dto.response.SuspensionDuenoPreviaResponseDTO.ComercioPrevia;
import com.bajonea.backend.dto.response.SuspensionDuenoPreviaResponseDTO.Efecto;
import com.bajonea.backend.dto.response.SuspensionDuenoResponseDTO;
import com.bajonea.backend.entities.Administrador;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.Sesion;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.EstadoEnvioNotificacion;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.OrigenSuspensionComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoCierreSesion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository.EstadoDeRelacion;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.SesionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Suspensión y levantamiento de la cuenta de un Dueño por el Administrador, con la cascada a sus comercios. Reutiliza lo
 * de la suspensión de Clientes ({@link SuspensionUsuarioService}): el motivo, el cambio de estado por
 * {@link EstadoUsuarioService}, el cierre de sesión y el estado al que vuelve la cuenta.
 *
 * <p><b>Suspender.</b> Una transacción que toma, en este orden, las filas de los usuarios involucrados en id ascendente (el
 * Dueño {@code FOR UPDATE}, el Administrador y los Empleados activos con bloqueo compartido), las relaciones de los
 * Empleados por clave primaria y cada comercio a suspender {@code FOR UPDATE}, en id ascendente. Suspende los comercios
 * {@code APROBADO}, {@code APTO_VENTA} y {@code CERRADO_TEMPORALMENTE} con origen {@code DUENO}; deja como están los
 * pendientes, rechazados, inactivos y los ya suspendidos por separado. La lista de comercios se lee después de tomar el
 * bloqueo del Dueño, así una aprobación simultánea (que toma el estado del Dueño con bloqueo compartido antes de bloquear
 * el comercio) queda del lado de la suspensión o del lado de la aprobación, nunca a medias. Los pedidos se procesan
 * <i>después</i> del commit, uno por transacción: los pendientes de confirmación se rechazan y los de preparación o listos
 * de un comercio sin Empleados activos se anulan o cancelan, siempre con reembolso.
 *
 * <p><b>Levantar.</b> Mismo orden de bloqueo, con la cuenta de Mercado Pago del Dueño entre los usuarios y los comercios.
 * Restaura solo los comercios con origen {@code DUENO}, cada uno con la regla de seguir vendiendo; los suspendidos por
 * separado siguen así. Lo ya rechazado o anulado no se restaura.
 */
@Service
public class SuspensionDuenoService {

    static final String MENSAJE_YA_SUSPENDIDA = "La cuenta ya está suspendida";
    static final String MENSAJE_NO_SUSPENDIDA = "La cuenta no está suspendida";
    static final String MENSAJE_ADMINISTRADOR = "No se puede suspender a un Administrador";
    static final String MENSAJE_PROPIA_CUENTA = "No podés suspender tu propia cuenta";

    private static final Set<EstadoComercio> SUSPENDIBLES = Set.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA,
            EstadoComercio.CERRADO_TEMPORALMENTE);

    @PersistenceContext
    private EntityManager entityManager;

    private final UsuarioRepository usuarioRepository;
    private final SesionRepository sesionRepository;
    private final ComercioRepository comercioRepository;
    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final AdministradorRepository administradorRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final PedidoRepository pedidoRepository;
    private final EstadoUsuarioService estadoUsuarioService;
    private final SuspensionUsuarioService suspensionUsuarioService;
    private final AptitudVentaComercioService aptitudVentaComercioService;
    private final AvisoCuentaService avisoCuentaService;
    private final PedidoService pedidoService;
    private final PedidoTimeoutProperties timeoutProperties;
    private final Clock clock;
    private final TransactionTemplate transaccion;

    public SuspensionDuenoService(UsuarioRepository usuarioRepository, SesionRepository sesionRepository,
            ComercioRepository comercioRepository, EmpleadoComercioRepository empleadoComercioRepository,
            AdministradorRepository administradorRepository, HistorialEstadoComercioRepository historialEstadoComercioRepository,
            PedidoRepository pedidoRepository, EstadoUsuarioService estadoUsuarioService,
            SuspensionUsuarioService suspensionUsuarioService, AptitudVentaComercioService aptitudVentaComercioService,
            AvisoCuentaService avisoCuentaService, PedidoService pedidoService, PedidoTimeoutProperties timeoutProperties,
            Clock clock, PlatformTransactionManager transactionManager) {
        this.usuarioRepository = usuarioRepository;
        this.sesionRepository = sesionRepository;
        this.comercioRepository = comercioRepository;
        this.empleadoComercioRepository = empleadoComercioRepository;
        this.administradorRepository = administradorRepository;
        this.historialEstadoComercioRepository = historialEstadoComercioRepository;
        this.pedidoRepository = pedidoRepository;
        this.estadoUsuarioService = estadoUsuarioService;
        this.suspensionUsuarioService = suspensionUsuarioService;
        this.aptitudVentaComercioService = aptitudVentaComercioService;
        this.avisoCuentaService = avisoCuentaService;
        this.pedidoService = pedidoService;
        this.timeoutProperties = timeoutProperties;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
    }

    private record Candidatos(List<Integer> relacionesIds, Map<Integer, List<Integer>> empleadosPorComercio,
            Set<Integer> empleados) {
    }

    private record Resultado(List<Comercio> suspendidos, List<Comercio> restaurados, List<Comercio> siguenSuspendidos,
            List<Integer> comerciosSuspendidosAhora, EstadoUsuario estadoCuenta) {
    }

    public SuspensionDuenoResponseDTO suspender(Integer duenoId, Integer administradorId, SuspensionUsuarioRequestDTO request) {
        validarObjetivo(duenoId, administradorId);
        Candidatos candidatos = leerCandidatos(duenoId);
        Resultado resultado = transaccion.execute(status -> {
            Map<Integer, String> estados = new HashMap<>();
            Usuario dueno = bloquearUsuarios(duenoId, administradorId, candidatos, estados);
            if (dueno.getEstado() == EstadoUsuario.SUSPENDIDO) {
                throw new ConflictoDeNegocioException(MENSAJE_YA_SUSPENDIDA);
            }
            Set<Integer> destinatarios = bloquearRelaciones(candidatos, estados);

            List<Comercio> comercios = comerciosDelDueno(duenoId);
            List<Comercio> bloqueados = new ArrayList<>();
            List<Integer> yaSuspendidos = new ArrayList<>();
            for (Comercio comercio : comercios) {
                if (SUSPENDIBLES.contains(comercio.getEstado())) {
                    Comercio bloqueado = aptitudVentaComercioService.bloquearComercio(comercio.getId());
                    if (SUSPENDIBLES.contains(bloqueado.getEstado())) {
                        bloqueados.add(bloqueado);
                    }
                } else if (comercio.getEstado() == EstadoComercio.SUSPENDIDO) {
                    yaSuspendidos.add(comercio.getId());
                }
            }

            Administrador administrador = administradorRepository.findById(administradorId)
                    .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));
            estadoUsuarioService.cambiar(dueno, EstadoUsuario.SUSPENDIDO, request.getMotivo(), administradorId);
            cerrarSesiones(duenoId);

            LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
            for (Comercio comercio : bloqueados) {
                EstadoComercio origen = comercio.getEstado();
                comercio.setEstado(EstadoComercio.SUSPENDIDO);
                comercio.setSuspensionOrigen(OrigenSuspensionComercio.DUENO);
                comercio.setSuspendidoDesde(ahora);
                comercio.setMotivoSuspension(request.getMotivo());
                comercio.setFechaModificacion(ahora);
                comercioRepository.save(comercio);
                historialEstadoComercioRepository.save(HistorialEstadoComercio.builder()
                        .comercio(comercio)
                        .administrador(administrador)
                        .estadoOrigen(origen)
                        .estadoDestino(EstadoComercio.SUSPENDIDO)
                        .motivo(request.getMotivo())
                        .suspensionOrigen(OrigenSuspensionComercio.DUENO)
                        .fechaHora(ahora)
                        .build());
            }

            avisoCuentaService.avisarSuspensionDueno(duenoId, dueno.getEmail(), request.getMotivo(),
                    bloqueados.stream().map(c -> new AvisoCuentaService.ComercioAvisado(c.getId(), c.getNombre())).toList());
            for (Comercio comercio : bloqueados) {
                avisoCuentaService.avisarEmpleadosSuspensionComercio(comercio.getId(), comercio.getNombre(),
                        empleadosDestinatarios(candidatos, comercio.getId(), destinatarios));
            }
            List<Integer> todosLosSuspendidos = new ArrayList<>(yaSuspendidos);
            bloqueados.forEach(c -> todosLosSuspendidos.add(c.getId()));
            return new Resultado(bloqueados, List.of(), List.of(), todosLosSuspendidos, EstadoUsuario.SUSPENDIDO);
        });

        int pendientes = 0;
        int sinAtencion = 0;
        for (Integer comercioId : resultado.comerciosSuspendidosAhora().stream().sorted().toList()) {
            pendientes += pedidoService.rechazarPendientesDelComercioSuspendido(comercioId);
            sinAtencion += pedidoService.procesarPedidosSinAtencionDelComercio(comercioId);
        }
        return new SuspensionDuenoResponseDTO(duenoId, EstadoUsuario.SUSPENDIDO,
                resultado.suspendidos().stream().map(Comercio::getId).toList(), List.of(), List.of(), pendientes, sinAtencion);
    }

    public SuspensionDuenoResponseDTO levantar(Integer duenoId, Integer administradorId, LevantamientoSuspensionRequestDTO request) {
        validarObjetivo(duenoId, administradorId);
        String motivo = request == null ? null : request.getMotivo();
        Candidatos candidatos = leerCandidatos(duenoId);
        Resultado resultado = transaccion.execute(status -> {
            Map<Integer, String> estados = new HashMap<>();
            Usuario dueno = bloquearUsuarios(duenoId, administradorId, candidatos, estados);
            if (dueno.getEstado() != EstadoUsuario.SUSPENDIDO) {
                throw new ConflictoDeNegocioException(MENSAJE_NO_SUSPENDIDA);
            }
            Set<Integer> destinatarios = bloquearRelaciones(candidatos, estados);
            AptitudVentaComercioService.EntradasDueno entradas = aptitudVentaComercioService.leerDuenoRestaurado(duenoId);

            List<Comercio> comercios = comerciosDelDueno(duenoId);
            List<Comercio> restaurables = new ArrayList<>();
            List<Comercio> siguen = new ArrayList<>();
            for (Comercio comercio : comercios) {
                if (comercio.getEstado() != EstadoComercio.SUSPENDIDO) {
                    continue;
                }
                Comercio bloqueado = aptitudVentaComercioService.bloquearComercio(comercio.getId());
                if (bloqueado.getEstado() != EstadoComercio.SUSPENDIDO) {
                    continue;
                }
                if (bloqueado.getSuspensionOrigen() == OrigenSuspensionComercio.DUENO) {
                    restaurables.add(bloqueado);
                } else {
                    siguen.add(bloqueado);
                }
            }

            Administrador administrador = administradorRepository.findById(administradorId)
                    .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));
            EstadoUsuario destinoCuenta = suspensionUsuarioService.estadoAlLevantar(duenoId);
            dueno.setIntentosFallidos(0);
            estadoUsuarioService.cambiar(dueno, destinoCuenta, motivo, administradorId);
            LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
            if (destinoCuenta == EstadoUsuario.ACTIVO) {
                dueno.setFechaUltimoAcceso(ahora);
                usuarioRepository.save(dueno);
            }

            for (Comercio comercio : restaurables) {
                EstadoComercio destino = aptitudVentaComercioService.destinoAlLevantarSuspension(comercio, entradas);
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
                        .suspensionOrigen(OrigenSuspensionComercio.DUENO)
                        .fechaHora(ahora)
                        .build());
            }

            avisoCuentaService.avisarLevantamientoDueno(duenoId, dueno.getEmail(), motivo,
                    restaurables.stream().map(c -> new AvisoCuentaService.ComercioAvisado(c.getId(), c.getNombre())).toList(),
                    siguen.stream().map(c -> new AvisoCuentaService.ComercioAvisado(c.getId(), c.getNombre())).toList());
            for (Comercio comercio : restaurables) {
                avisoCuentaService.avisarEmpleadosLevantamientoComercio(comercio.getId(), comercio.getNombre(),
                        empleadosDestinatarios(candidatos, comercio.getId(), destinatarios));
            }
            return new Resultado(List.of(), restaurables, siguen, List.of(), destinoCuenta);
        });
        return new SuspensionDuenoResponseDTO(duenoId, resultado.estadoCuenta(), List.of(),
                resultado.restaurados().stream().map(Comercio::getId).toList(),
                resultado.siguenSuspendidos().stream().map(Comercio::getId).toList(), 0, 0);
    }

    /**
     * Qué pasa con cada comercio del Dueño si se lo suspende: el efecto, los pedidos por estado, los Empleados activos y quién
     * atiende los pedidos en curso. Tres consultas sin importar cuántos comercios tenga el Dueño.
     */
    public SuspensionDuenoPreviaResponseDTO vistaPrevia(Integer duenoId, Integer administradorId) {
        validarObjetivo(duenoId, administradorId);
        EstadoUsuario estado = usuarioRepository.findEstadoById(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Dueño no encontrado"));
        List<Comercio> comercios = comerciosDelDueno(duenoId);
        List<ComercioPrevia> filas = new ArrayList<>();
        if (!comercios.isEmpty()) {
            List<Integer> ids = comercios.stream().map(Comercio::getId).toList();
            Map<Integer, Map<EstadoPedido, Long>> pedidos = new HashMap<>();
            for (Object[] fila : pedidoRepository.contarPorComercioYEstado(ids, List.of(EstadoPedido.PENDIENTE_PAGO,
                    EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, EstadoPedido.EN_PREPARACION, EstadoPedido.LISTO_PARA_RETIRAR,
                    EstadoPedido.EN_CAMINO))) {
                pedidos.computeIfAbsent((Integer) fila[0], k -> new HashMap<>()).put((EstadoPedido) fila[1], (Long) fila[2]);
            }
            Map<Integer, Long> empleados = new HashMap<>();
            for (Object[] fila : empleadoComercioRepository.findEmpleadosActivosDeComercios(ids)) {
                empleados.merge((Integer) fila[0], 1L, Long::sum);
            }
            for (Comercio comercio : comercios) {
                Map<EstadoPedido, Long> cantidades = pedidos.getOrDefault(comercio.getId(), Map.of());
                long enPreparacion = cantidades.getOrDefault(EstadoPedido.EN_PREPARACION, 0L);
                long listos = cantidades.getOrDefault(EstadoPedido.LISTO_PARA_RETIRAR, 0L);
                long activos = empleados.getOrDefault(comercio.getId(), 0L);
                AtencionDePedidos atencion = activos > 0 ? AtencionDePedidos.ATENDIDOS_POR_EMPLEADOS
                        : enPreparacion + listos > 0 ? AtencionDePedidos.SE_ANULAN_AL_INSTANTE
                        : AtencionDePedidos.SIN_PEDIDOS_EN_PREPARACION;
                boolean seSuspende = SUSPENDIBLES.contains(comercio.getEstado());
                filas.add(new ComercioPrevia(comercio.getId(), comercio.getNombre(), comercio.getEstado(),
                        comercio.getSuspensionOrigen(), seSuspende ? Efecto.SE_SUSPENDE : Efecto.QUEDA_COMO_ESTA,
                        seSuspende ? null : motivoQueSeQuedaComoEsta(comercio),
                        cantidades.getOrDefault(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, 0L), enPreparacion, listos,
                        cantidades.getOrDefault(EstadoPedido.EN_CAMINO, 0L),
                        cantidades.getOrDefault(EstadoPedido.PENDIENTE_PAGO, 0L), activos, atencion));
            }
        }
        return new SuspensionDuenoPreviaResponseDTO(duenoId, estado, filas, timeoutProperties.getPreparacionSuspensionMinutos(),
                timeoutProperties.getRetiroSuspensionMinutos());
    }

    public EstadoEnvioNotificacion reenviarEmail(Integer duenoId, Integer administradorId) {
        validarObjetivo(duenoId, administradorId);
        return avisoCuentaService.reenviarEmailDuenoFallido(duenoId);
    }

    private static String motivoQueSeQuedaComoEsta(Comercio comercio) {
        return switch (comercio.getEstado()) {
            case SUSPENDIDO -> "Ya está suspendido por separado y sigue así";
            case PENDIENTE -> "Todavía no fue aprobado";
            case RECHAZADO, RECHAZO_DEFINITIVO -> "Fue rechazado";
            case INACTIVO -> "Está inactivo";
            default -> "No está operativo";
        };
    }

    private void validarObjetivo(Integer duenoId, Integer administradorId) {
        if (duenoId.equals(administradorId)) {
            throw new ConflictoDeNegocioException(MENSAJE_PROPIA_CUENTA);
        }
        RolUsuario rol = usuarioRepository.findRolById(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Dueño no encontrado"));
        if (rol == RolUsuario.ADMINISTRADOR) {
            throw new ConflictoDeNegocioException(MENSAJE_ADMINISTRADOR);
        }
        if (rol != RolUsuario.DUENO) {
            throw new RecursoNoEncontradoException("Dueño no encontrado");
        }
    }

    /**
     * Primera mitad de la resolución de los destinatarios, con lecturas simples fuera de toda transacción: los Empleados
     * activos de todos los comercios del Dueño y sus relaciones. Quien se suma después no recibe el aviso.
     */
    private Candidatos leerCandidatos(Integer duenoId) {
        List<Integer> comercioIds = comercioRepository.findIdsByDuenoId(duenoId);
        Map<Integer, List<Integer>> porComercio = new HashMap<>();
        Set<Integer> empleados = new TreeSet<>();
        List<Integer> relaciones = new ArrayList<>();
        if (!comercioIds.isEmpty()) {
            for (Object[] fila : empleadoComercioRepository.findRelacionesActivasDeComercios(comercioIds)) {
                relaciones.add((Integer) fila[0]);
                porComercio.computeIfAbsent((Integer) fila[2], k -> new ArrayList<>()).add((Integer) fila[1]);
                empleados.add((Integer) fila[1]);
            }
        }
        return new Candidatos(relaciones.stream().sorted().distinct().toList(), porComercio, empleados);
    }

    /**
     * Toma las filas de los usuarios en id ascendente: el Dueño {@code FOR UPDATE} (y releído con su estado confirmado), el
     * Administrador y los Empleados con bloqueo compartido. El bloqueo tiene que ser la primera lectura de la transacción.
     */
    private Usuario bloquearUsuarios(Integer duenoId, Integer administradorId, Candidatos candidatos, Map<Integer, String> estados) {
        TreeSet<Integer> usuarios = new TreeSet<>(candidatos.empleados());
        usuarios.add(duenoId);
        usuarios.add(administradorId);
        Usuario dueno = null;
        for (Integer usuarioId : usuarios) {
            if (usuarioId.equals(duenoId)) {
                dueno = usuarioRepository.findByIdConBloqueo(duenoId)
                        .orElseThrow(() -> new RecursoNoEncontradoException("Dueño no encontrado"));
                entityManager.refresh(dueno);
            } else {
                usuarioRepository.leerEstadoCuentaConBloqueoCompartido(usuarioId)
                        .ifPresent(cuenta -> estados.put(usuarioId, cuenta.getEstado()));
            }
        }
        return dueno;
    }

    /** Las relaciones por clave primaria, en id ascendente; devuelve los Empleados que siguen activos y sin cuenta suspendida. */
    private Set<Integer> bloquearRelaciones(Candidatos candidatos, Map<Integer, String> estados) {
        Set<Integer> destinatarios = new HashSet<>();
        if (candidatos.relacionesIds().isEmpty()) {
            return destinatarios;
        }
        for (EstadoDeRelacion relacion : empleadoComercioRepository.leerRelacionesConBloqueoCompartido(candidatos.relacionesIds())) {
            boolean activa = EstadoEmpleadoComercio.valueOf(relacion.getEstado()) == EstadoEmpleadoComercio.ACTIVO;
            String estadoCuenta = estados.get(relacion.getEmpleadoId());
            if (activa && !EstadoUsuario.SUSPENDIDO.name().equals(estadoCuenta)) {
                destinatarios.add(relacion.getEmpleadoId());
            }
        }
        return destinatarios;
    }

    private static Collection<Integer> empleadosDestinatarios(Candidatos candidatos, Integer comercioId, Set<Integer> destinatarios) {
        return candidatos.empleadosPorComercio().getOrDefault(comercioId, List.of()).stream()
                .filter(destinatarios::contains).toList();
    }

    private List<Comercio> comerciosDelDueno(Integer duenoId) {
        return comercioRepository.findByDuenoIdOrderByFechaRegistroAscIdAsc(duenoId).stream()
                .sorted(Comparator.comparing(Comercio::getId)).toList();
    }

    private void cerrarSesiones(Integer usuarioId) {
        LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        for (Sesion sesion : sesionRepository.findActivasDelUsuario(usuarioId)) {
            sesion.setActiva(false);
            sesion.setTipoCierre(TipoCierreSesion.SUSPENSION);
            sesion.setFechaCierre(ahora);
            sesionRepository.save(sesion);
        }
    }
}
