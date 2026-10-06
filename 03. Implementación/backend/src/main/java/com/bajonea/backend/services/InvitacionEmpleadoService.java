package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.EquipoComercioResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.MiembroEquipoResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.EmpleadoComercio;
import com.bajonea.backend.entities.HistorialEmpleadoComercio;
import com.bajonea.backend.entities.InvitacionEmpleado;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
import com.bajonea.backend.enums.MotivoRegularizacionInvitacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.GeneracionTokenException;
import com.bajonea.backend.exceptions.InvitacionNoAptaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.HistorialEmpleadoComercioRepository;
import com.bajonea.backend.repositories.InvitacionEmpleadoRepository;
import com.bajonea.backend.repositories.InvitacionInsercionRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.util.EjecucionPostCommit;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Invitaciones de empleado de un comercio: invitar, reenviar, cancelar y listar el equipo (el Dueño opera
 * siempre sobre el comercio activo de la request). Una fila de {@code invitacion_empleado} por envío:
 * reenviar crea una fila nueva y deja la anterior {@code REEMPLAZADA}; cancelar la deja {@code CANCELADA};
 * nada se borra. El estado visible "vencida" se calcula al listar y además se materializa de forma perezosa
 * (las pendientes vencidas del par pasan a {@code VENCIDA} al invitar o reenviar, para liberar el único
 * pendiente por comercio y email).
 * <p>
 * Orden de bloqueo: la fila de {@code usuario} del Dueño primero, en modo exclusivo al invitar y reenviar (esa
 * fila serializa el tope de envíos por hora del comercio y toda la secuencia comprobar-y-escribir) y en modo
 * compartido al cancelar; después la invitación, la relación con el empleado y el comercio (lectura compartida
 * del estado). Todas las validaciones corren antes de la primera escritura: lo único que se escribe y tiene
 * que sobrevivir a un {@code 409} es la fila de regularización de {@link InvitacionRegularizacionService},
 * por eso {@link InvitacionNoAptaException} (y solo ella) va en {@code noRollbackFor}. Los emails salen recién
 * al confirmar la transacción.
 */
@Service
public class InvitacionEmpleadoService {

    public static final int TOPE_POR_HORA = 5;
    public static final int VIGENCIA_DIAS = 7;

    private static final Logger log = LoggerFactory.getLogger(InvitacionEmpleadoService.class);

    private static final DateTimeFormatter FORMATO_HORA = DateTimeFormatter.ofPattern("HH:mm");
    private static final Set<EstadoInvitacionEmpleado> ESTADOS_REENVIABLES = Set.of(
            EstadoInvitacionEmpleado.PENDIENTE, EstadoInvitacionEmpleado.VENCIDA, EstadoInvitacionEmpleado.INVALIDADA);
    private static final List<EstadoInvitacionEmpleado> ESTADOS_LISTADOS = List.of(
            EstadoInvitacionEmpleado.PENDIENTE, EstadoInvitacionEmpleado.INVALIDADA);

    static final String MENSAJE_COMERCIO_NO_OPERATIVO = "Este comercio no puede invitar empleados en este momento";
    static final String MENSAJE_YA_ES_DEL_EQUIPO = "Esa persona ya es parte de tu equipo";
    static final String MENSAJE_PENDIENTE_EXISTENTE = "Ya hay una invitación pendiente para ese email. Podés reenviarla.";
    static final String MENSAJE_NO_SE_PUEDE_INVITAR = "No se puede invitar a este email";
    static final String MENSAJE_NO_REENVIABLE = "Esta invitación ya no se puede reenviar";
    static final String MENSAJE_NO_CANCELABLE = "Solo se puede cancelar una invitación pendiente";
    static final String MENSAJE_NO_ENCONTRADA = "Invitación no encontrada";

    private final InvitacionEmpleadoRepository invitacionRepository;
    private final InvitacionInsercionRepository insercionRepository;
    private final HistorialEmpleadoComercioRepository historialRepository;
    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final UsuarioRepository usuarioRepository;
    private final ComercioRepository comercioRepository;
    private final DuenoRepository duenoRepository;
    private final MatrizRolesService matrizRolesService;
    private final InvitacionRegularizacionService regularizacionService;
    private final CodigoTokenGenerador codigoGenerador;
    private final EmailService emailService;
    private final Clock clock;
    private final int maxIntentosCodigo;

    public InvitacionEmpleadoService(InvitacionEmpleadoRepository invitacionRepository,
            InvitacionInsercionRepository insercionRepository, HistorialEmpleadoComercioRepository historialRepository,
            EmpleadoComercioRepository empleadoComercioRepository, UsuarioRepository usuarioRepository,
            ComercioRepository comercioRepository, DuenoRepository duenoRepository, MatrizRolesService matrizRolesService,
            InvitacionRegularizacionService regularizacionService, CodigoTokenGenerador codigoGenerador,
            EmailService emailService, Clock clock, @Value("${token.generacion.max-intentos:20}") int maxIntentosCodigo) {
        this.invitacionRepository = invitacionRepository;
        this.insercionRepository = insercionRepository;
        this.historialRepository = historialRepository;
        this.empleadoComercioRepository = empleadoComercioRepository;
        this.usuarioRepository = usuarioRepository;
        this.comercioRepository = comercioRepository;
        this.duenoRepository = duenoRepository;
        this.matrizRolesService = matrizRolesService;
        this.regularizacionService = regularizacionService;
        this.codigoGenerador = codigoGenerador;
        this.emailService = emailService;
        this.clock = clock;
        this.maxIntentosCodigo = maxIntentosCodigo;
    }

    @Transactional(noRollbackFor = InvitacionNoAptaException.class)
    public InvitacionEmpleadoResponseDTO invitar(ComercioActivo activo, String emailCrudo) {
        String email = normalizarEmail(emailCrudo);
        bloquearDueno(activo.duenoId());
        LocalDateTime ahora = LocalDateTime.now(clock);

        Comercio comercio = comercioOperativo(activo.comercioId());
        validarDestinatario(comercio, email);
        List<InvitacionEmpleado> pendientes = invitacionRepository.findByComercioIdAndEmailAndEstadoConBloqueo(
                comercio.getId(), email, EstadoInvitacionEmpleado.PENDIENTE);
        validarSinPendienteVigente(pendientes, null, ahora);
        validarTope(comercio.getId(), ahora);

        return enviar(comercio, activo.duenoId(), email, pendientes, null, ahora);
    }

    @Transactional(noRollbackFor = InvitacionNoAptaException.class)
    public InvitacionEmpleadoResponseDTO reenviar(ComercioActivo activo, Integer invitacionId) {
        bloquearDueno(activo.duenoId());
        LocalDateTime ahora = LocalDateTime.now(clock);

        Comercio comercio = comercioOperativo(activo.comercioId());
        InvitacionEmpleado anterior = invitacionRepository.findByIdAndComercioIdConBloqueo(invitacionId, comercio.getId())
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));
        if (!ESTADOS_REENVIABLES.contains(anterior.getEstado())) {
            throw new ConflictoDeNegocioException(MENSAJE_NO_REENVIABLE);
        }
        String email = anterior.getEmail();
        validarDestinatario(comercio, email);
        List<InvitacionEmpleado> pendientes = invitacionRepository.findByComercioIdAndEmailAndEstadoConBloqueo(
                comercio.getId(), email, EstadoInvitacionEmpleado.PENDIENTE);
        validarSinPendienteVigente(pendientes, anterior.getId(), ahora);
        validarTope(comercio.getId(), ahora);

        return enviar(comercio, activo.duenoId(), email, pendientes, anterior, ahora);
    }

    @Transactional
    public InvitacionEmpleadoResponseDTO cancelar(ComercioActivo activo, Integer invitacionId) {
        usuarioRepository.leerIdConBloqueoCompartido(activo.duenoId())
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));
        InvitacionEmpleado invitacion = invitacionRepository.findByIdAndComercioIdConBloqueo(invitacionId, activo.comercioId())
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));
        if (invitacion.getEstado() != EstadoInvitacionEmpleado.PENDIENTE) {
            throw new ConflictoDeNegocioException(MENSAJE_NO_CANCELABLE);
        }
        LocalDateTime ahora = LocalDateTime.now(clock);
        invitacion.setEstado(EstadoInvitacionEmpleado.CANCELADA);
        invitacion.setFechaResolucion(ahora);
        guardarHistorial(invitacion.getComercio(), invitacion, MotivoHistorialEmpleado.INVITACION_CANCELADA, activo.duenoId(), ahora);
        return aDto(invitacion, ahora);
    }

    @Transactional(readOnly = true)
    public EquipoComercioResponseDTO listarEquipo(ComercioActivo activo) {
        LocalDateTime ahora = LocalDateTime.now(clock);
        List<MiembroEquipoResponseDTO> miembros = empleadoComercioRepository.findEquipoByComercioId(activo.comercioId()).stream()
                .map(this::aMiembroDto)
                .toList();
        List<InvitacionEmpleadoResponseDTO> invitaciones = invitacionRepository
                .findByComercioIdAndEstadoInOrderByFechaCreacionDescIdDesc(activo.comercioId(), ESTADOS_LISTADOS).stream()
                .map(invitacion -> aDto(invitacion, ahora))
                .toList();
        return new EquipoComercioResponseDTO(miembros, invitaciones);
    }

    private void bloquearDueno(Integer duenoId) {
        usuarioRepository.findByIdConBloqueo(duenoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    private Comercio comercioOperativo(Integer comercioId) {
        String estado = comercioRepository.leerEstadoConBloqueoCompartido(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"))
                .getEstado();
        if (!ComercioActivoService.esOperativo(EstadoComercio.valueOf(estado))) {
            throw new ConflictoDeNegocioException(MENSAJE_COMERCIO_NO_OPERATIVO);
        }
        return comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    /**
     * Reglas sobre la cuenta del email, en este orden: si pertenece a un Dueño o un Administrador, no se invita
     * y no se manda nada; si ya es parte activa del equipo, es un conflicto con motivo (es dato del propio
     * Dueño); si la cuenta no está activa, no se invita y se le manda el aviso de regularización dentro del
     * tope. En los dos primeros casos de rechazo el Dueño ve el mismo mensaje genérico, sin saber por qué.
     */
    private void validarDestinatario(Comercio comercio, String email) {
        Usuario existente = usuarioRepository.findByEmail(email).orElse(null);
        if (existente == null) {
            return;
        }
        if (!matrizRolesService.puedeSerEmpleado(existente.getId())) {
            throw new InvitacionNoAptaException(MENSAJE_NO_SE_PUEDE_INVITAR);
        }
        if (empleadoComercioRepository.existsByEmpleadoIdAndComercioIdAndEstado(
                existente.getId(), comercio.getId(), EstadoEmpleadoComercio.ACTIVO)) {
            throw new ConflictoDeNegocioException(MENSAJE_YA_ES_DEL_EQUIPO);
        }
        if (existente.getEstado() != EstadoUsuario.ACTIVO) {
            regularizacionService.registrarYEnviar(existente, comercio.getNombre(),
                    MotivoRegularizacionInvitacion.de(existente.getEstado()));
            throw new InvitacionNoAptaException(MENSAJE_NO_SE_PUEDE_INVITAR);
        }
    }

    private void validarSinPendienteVigente(List<InvitacionEmpleado> pendientes, Integer excluirId, LocalDateTime ahora) {
        boolean hayVigente = pendientes.stream()
                .filter(pendiente -> !pendiente.getId().equals(excluirId))
                .anyMatch(pendiente -> pendiente.getFechaVencimiento().isAfter(ahora));
        if (hayVigente) {
            throw new ConflictoDeNegocioException(MENSAJE_PENDIENTE_EXISTENTE);
        }
    }

    private void validarTope(Integer comercioId, LocalDateTime ahora) {
        LocalDateTime desde = ahora.minusHours(1);
        if (invitacionRepository.countByComercioIdAndFechaCreacionAfter(comercioId, desde) < TOPE_POR_HORA) {
            return;
        }
        LocalDateTime reintento = invitacionRepository
                .findFirstByComercioIdAndFechaCreacionAfterOrderByFechaCreacionAscIdAsc(comercioId, desde)
                .map(masAntigua -> masAntigua.getFechaCreacion().plusHours(1))
                .orElse(ahora);
        throw new ConflictoDeNegocioException("Alcanzaste el máximo de " + TOPE_POR_HORA
                + " invitaciones por hora. Probá de nuevo a las " + reintento.format(FORMATO_HORA));
    }

    private InvitacionEmpleadoResponseDTO enviar(Comercio comercio, Integer duenoUsuarioId, String email,
            List<InvitacionEmpleado> pendientes, InvitacionEmpleado reemplazada, LocalDateTime ahora) {
        for (InvitacionEmpleado pendiente : pendientes) {
            if (reemplazada == null || !pendiente.getId().equals(reemplazada.getId())) {
                pendiente.setEstado(EstadoInvitacionEmpleado.VENCIDA);
                pendiente.setFechaResolucion(ahora);
            }
        }
        if (reemplazada != null) {
            reemplazada.setEstado(EstadoInvitacionEmpleado.REEMPLAZADA);
            reemplazada.setFechaResolucion(ahora);
        }
        invitacionRepository.flush();

        Integer id = insertarConCodigoUnico(comercio.getId(), email, duenoUsuarioId, ahora);
        InvitacionEmpleado nueva = invitacionRepository.findById(id).orElseThrow();

        guardarHistorial(comercio, nueva, MotivoHistorialEmpleado.INVITACION, duenoUsuarioId, ahora);

        String nombreDueno = nombreCompleto(duenoRepository.findById(duenoUsuarioId).orElseThrow(), duenoUsuarioId);
        String nombreComercio = comercio.getNombre();
        String codigo = nueva.getCodigo();
        EjecucionPostCommit.ejecutar(() -> emailService.enviarInvitacionEmpleado(email, nombreDueno, nombreComercio, codigo));
        return aDto(nueva, ahora);
    }

    /**
     * Genera un código de 6 dígitos, comprueba que no esté en uso por otra invitación pendiente del mismo email
     * y lo inserta; si el INSERT choca por el índice de código (carrera) vuelve a generar. Un choque por el
     * índice del par comercio y email no se arregla cambiando el código: es "ya hay una pendiente".
     */
    private Integer insertarConCodigoUnico(Integer comercioId, String email, Integer duenoUsuarioId, LocalDateTime ahora) {
        for (int intento = 1; intento <= maxIntentosCodigo; intento++) {
            String codigo = codigoGenerador.generar();
            if (insercionRepository.existeCodigoPendiente(email, codigo)) {
                log.warn("Colisión de código de invitación (intento {}/{}): se genera otro", intento, maxIntentosCodigo);
                continue;
            }
            try {
                return insercionRepository.insertarPendiente(comercioId, email, codigo, duenoUsuarioId, ahora,
                        ahora.plusDays(VIGENCIA_DIAS));
            } catch (DuplicateKeyException ex) {
                String detalle = ex.getMessage();
                if (detalle != null && detalle.contains(InvitacionInsercionRepository.INDICE_PENDIENTE_POR_COMERCIO_Y_EMAIL)) {
                    throw new ConflictoDeNegocioException(MENSAJE_PENDIENTE_EXISTENTE);
                }
                log.warn("Colisión de código de invitación en el INSERT (intento {}/{}): se genera otro", intento, maxIntentosCodigo);
            }
        }
        log.error("No se pudo generar un código de invitación único tras {} intentos (comercioId {})", maxIntentosCodigo, comercioId);
        throw new GeneracionTokenException("No pudimos generar el código de la invitación. Intentá nuevamente en unos instantes.");
    }

    private void guardarHistorial(Comercio comercio, InvitacionEmpleado invitacion, MotivoHistorialEmpleado motivo,
            Integer actorUsuarioId, LocalDateTime fechaHora) {
        historialRepository.save(HistorialEmpleadoComercio.builder()
                .comercio(comercio)
                .invitacion(invitacion)
                .motivo(motivo)
                .actorUsuarioId(actorUsuarioId)
                .fechaHora(fechaHora)
                .build());
    }

    private String nombreCompleto(Dueno dueno, Integer duenoUsuarioId) {
        PersonaFisica persona = dueno.getPersonaFisica();
        if (persona == null) {
            log.warn("El Dueño usuarioId={} no tiene persona física: el email de invitación sale sin su nombre", duenoUsuarioId);
            return "Un comercio";
        }
        return persona.getNombre() + " " + persona.getApellido();
    }

    private String normalizarEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private MiembroEquipoResponseDTO aMiembroDto(EmpleadoComercio relacion) {
        PersonaFisica persona = relacion.getEmpleado().getPersonaFisica();
        Usuario usuario = persona.getPersona().getUsuario();
        return new MiembroEquipoResponseDTO(relacion.getEmpleado().getId(), persona.getNombre(), persona.getApellido(),
                usuario.getEmail(), usuario.getFotoPerfilUrl(), relacion.getEstado(), relacion.getFechaAlta(), relacion.getFechaBaja());
    }

    private InvitacionEmpleadoResponseDTO aDto(InvitacionEmpleado invitacion, LocalDateTime ahora) {
        EstadoInvitacionEmpleado visible = invitacion.getEstado();
        if (visible == EstadoInvitacionEmpleado.PENDIENTE && !invitacion.getFechaVencimiento().isAfter(ahora)) {
            visible = EstadoInvitacionEmpleado.VENCIDA;
        }
        return new InvitacionEmpleadoResponseDTO(invitacion.getId(), invitacion.getEmail(), visible,
                invitacion.getFechaCreacion(), invitacion.getFechaVencimiento());
    }
}
