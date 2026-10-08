package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AceptarInvitacionEmpleadoRequestDTO;
import com.bajonea.backend.dto.request.ValidarInvitacionEmpleadoRequestDTO;
import com.bajonea.backend.dto.response.EquipoComercioResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoAceptadaResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.InvitacionEmpleadoValidadaResponseDTO;
import com.bajonea.backend.dto.response.MiembroEquipoResponseDTO;
import com.bajonea.backend.entities.Cliente;
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
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.CodigoInvitacionInvalidoException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.GeneracionTokenException;
import com.bajonea.backend.exceptions.InvitacionNoAptaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.EmpleadoInsercionRepository;
import com.bajonea.backend.repositories.HistorialEmpleadoComercioRepository;
import com.bajonea.backend.repositories.InvitacionEmpleadoRepository;
import com.bajonea.backend.repositories.InvitacionEmpleadoRepository.InvitacionPendienteVista;
import com.bajonea.backend.repositories.InvitacionInsercionRepository;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.util.EdadUtils;
import com.bajonea.backend.util.EjecucionPostCommit;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Invitaciones de empleado de un comercio: invitar, reenviar, cancelar y listar el equipo (el Dueño opera
 * siempre sobre el comercio activo de la request) y, del lado público, validar el código y aceptar la
 * invitación (quien la recibe todavía no tiene sesión). Una fila de {@code invitacion_empleado} por envío:
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
 * al confirmar la transacción. En validar y aceptar lo que tiene que sobrevivir a un error es el contador de
 * intentos del código, por eso solo {@link CodigoInvitacionInvalidoException} va en {@code noRollbackFor}
 * (ver {@link #aceptar} para el orden de bloqueo).
 */
@Service
public class InvitacionEmpleadoService {

    public static final int TOPE_POR_HORA = 5;
    public static final int VIGENCIA_DIAS = 7;
    public static final int MAX_INTENTOS_CODIGO = 5;
    public static final int EDAD_MINIMA_EMPLEADO = 18;

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
    static final String MENSAJE_NO_CANCELABLE = "Esta invitación ya no se puede cancelar";
    static final String MENSAJE_NO_ENCONTRADA = "Invitación no encontrada";
    static final String MENSAJE_NO_SE_PUEDE_ACEPTAR = "No se puede aceptar esta invitación con esta cuenta";
    static final String MENSAJE_INVITACION_NO_DISPONIBLE = "Esta invitación ya no está disponible";
    static final String MENSAJE_FALTAN_DATOS_DE_CUENTA = "Completá tus datos para crear tu cuenta";
    static final String MENSAJE_TERMINOS = "Tenés que aceptar los Términos y Condiciones";
    static final String CAMPO_FECHA_NACIMIENTO_CUENTA_NUEVA = "cuentaNueva.fechaNacimiento";
    static final String MENSAJE_EDAD_CUENTA_NUEVA = "Tenés que tener 18 años o más para trabajar en un comercio";
    static final String MENSAJE_EDAD_CUENTA_EXISTENTE = "Tenés que tener 18 años o más para sumarte a un equipo";

    private static final Set<EstadoComercio> ESTADOS_ACEPTABLES = Set.of(
            EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE, EstadoComercio.SUSPENDIDO);

    private final InvitacionEmpleadoRepository invitacionRepository;
    private final InvitacionInsercionRepository insercionRepository;
    private final HistorialEmpleadoComercioRepository historialRepository;
    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final UsuarioRepository usuarioRepository;
    private final ComercioRepository comercioRepository;
    private final DuenoRepository duenoRepository;
    private final PersonaFisicaRepository personaFisicaRepository;
    private final EmpleadoInsercionRepository empleadoInsercionRepository;
    private final RegistroService registroService;
    private final NotificacionService notificacionService;
    private final MatrizRolesService matrizRolesService;
    private final InvitacionRegularizacionService regularizacionService;
    private final CodigoTokenGenerador codigoGenerador;
    private final EmailService emailService;
    private final Clock clock;
    private final int maxIntentosCodigo;

    public InvitacionEmpleadoService(InvitacionEmpleadoRepository invitacionRepository,
            InvitacionInsercionRepository insercionRepository, HistorialEmpleadoComercioRepository historialRepository,
            EmpleadoComercioRepository empleadoComercioRepository, UsuarioRepository usuarioRepository,
            ComercioRepository comercioRepository, DuenoRepository duenoRepository, PersonaFisicaRepository personaFisicaRepository,
            EmpleadoInsercionRepository empleadoInsercionRepository, RegistroService registroService,
            NotificacionService notificacionService, MatrizRolesService matrizRolesService,
            InvitacionRegularizacionService regularizacionService, CodigoTokenGenerador codigoGenerador,
            EmailService emailService, Clock clock, @Value("${token.generacion.max-intentos:20}") int maxIntentosCodigo) {
        this.invitacionRepository = invitacionRepository;
        this.insercionRepository = insercionRepository;
        this.historialRepository = historialRepository;
        this.empleadoComercioRepository = empleadoComercioRepository;
        this.usuarioRepository = usuarioRepository;
        this.comercioRepository = comercioRepository;
        this.duenoRepository = duenoRepository;
        this.personaFisicaRepository = personaFisicaRepository;
        this.empleadoInsercionRepository = empleadoInsercionRepository;
        this.registroService = registroService;
        this.notificacionService = notificacionService;
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

    /**
     * Prueba el código de una invitación sin aceptarla, para que la pantalla pública sepa a qué comercio lo
     * invitaron y si hay que pedirle datos de cuenta. Usa la misma resolución que {@link #aceptar} (un código
     * incorrecto suma un intento acá igual que allá) y no escribe nada más. Cualquier falla de resolución es el
     * mismo {@code 401}, sin intentos restantes y sin distinguir la causa. Recién después de verificar el código
     * (quien llega hasta ahí ya lo probó, así que se le puede decir el motivo) comprueba con las mismas reglas
     * que {@link #aceptar} que la invitación se pueda aceptar: una cuenta existente no apta o de rol
     * incompatible, o un comercio no aceptable, dan {@code 409} para no mostrarle el formulario a quien después
     * no podría terminar. Ese {@code 409} no deja nada sin revertir: validar no escribe.
     */
    @Transactional(noRollbackFor = CodigoInvitacionInvalidoException.class)
    public InvitacionEmpleadoValidadaResponseDTO validar(ValidarInvitacionEmpleadoRequestDTO request) {
        String email = normalizarEmail(request.getEmail());
        LocalDateTime ahora = LocalDateTime.now(clock);
        InvitacionEmpleado invitacion = resolver(email, request.getCodigo(), ahora, false).invitacion();
        Comercio comercio = invitacion.getComercio();
        Usuario existente = usuarioRepository.findByEmail(email).orElse(null);
        validarSePuedeAceptar(existente, comercio.getId());
        boolean cuentaExistente = existente != null;
        return new InvitacionEmpleadoValidadaResponseDTO(comercio.getNombre(), comercio.getFotoPerfilUrl(), cuentaExistente,
                invitacion.getFechaVencimiento());
    }

    /**
     * Acepta una invitación de empleado. Con una cuenta existente la usa y no la modifica (ignora cualquier
     * {@code cuentaNueva}); sin cuenta exige {@code cuentaNueva} y la aceptación de los Términos, y la crea
     * activa en la misma transacción (el código de la invitación ya probó el email, no hay segundo código).
     * No inicia sesión.
     * <p>
     * Orden de bloqueo: lectura sin bloqueo de las invitaciones pendientes del email (para conocer al Dueño),
     * {@code usuario} del invitado (si existe) y del Dueño en id ascendente, invitaciones pendientes del email
     * con {@code FOR UPDATE}, relación con el comercio, estado del comercio (lectura compartida) y las
     * escrituras. Las altas de {@code empleado} y de {@code empleado_comercio} son "insertar, y si existe, no
     * hacer nada" (ver {@link EmpleadoInsercionRepository}) y la relación existente se bloquea recién cuando el
     * insert chocó. El estado del comercio se comprueba después de tocar la relación, para respetar ese orden;
     * si no es aceptable, el {@code 409} revierte toda la transacción. El único cambio que sobrevive a un error
     * es el de intentos de {@link #resolver}, y solo para {@link CodigoInvitacionInvalidoException}.
     */
    @Transactional(noRollbackFor = CodigoInvitacionInvalidoException.class)
    public InvitacionEmpleadoAceptadaResponseDTO aceptar(AceptarInvitacionEmpleadoRequestDTO request) {
        String email = normalizarEmail(request.getEmail());
        LocalDateTime ahora = LocalDateTime.now(clock);
        Resolucion resolucion = resolver(email, request.getCodigo(), ahora, true);
        InvitacionEmpleado invitacion = resolucion.invitacion();
        Comercio comercio = invitacion.getComercio();
        Usuario existente = resolucion.invitado();

        if (existente != null) {
            validarCuentaExistente(existente);
        } else {
            validarDatosDeCuentaNueva(request);
        }

        boolean cuentaCreada = existente == null;
        Usuario invitado;
        PersonaFisica personaFisica;
        if (cuentaCreada) {
            Cliente cliente = registroService.crearCliente(request.getCuentaNueva(), email, EstadoUsuario.ACTIVO);
            personaFisica = cliente.getPersonaFisica();
            invitado = personaFisica.getPersona().getUsuario();
        } else {
            invitado = existente;
            personaFisica = personaFisicaRepository.findById(existente.getId())
                    .orElseThrow(() -> new IllegalStateException("La cuenta usuarioId=" + existente.getId() + " no tiene persona física"));
        }

        invitacionRepository.flush();
        empleadoInsercionRepository.insertarEmpleadoSiNoExiste(invitado.getId(), ahora);
        Optional<Integer> relacionNueva = empleadoInsercionRepository
                .insertarRelacionActivaSiNoExiste(invitado.getId(), comercio.getId(), ahora);
        EmpleadoComercio relacion;
        boolean reactivada = false;
        if (relacionNueva.isPresent()) {
            relacion = empleadoComercioRepository.getReferenceById(relacionNueva.get());
        } else {
            relacion = empleadoComercioRepository.findByEmpleadoIdAndComercioIdConBloqueo(invitado.getId(), comercio.getId())
                    .orElseThrow(() -> new IllegalStateException("La relación del empleado " + invitado.getId()
                            + " con el comercio " + comercio.getId() + " existe y no se pudo leer"));
            if (relacion.getEstado() == EstadoEmpleadoComercio.INACTIVO) {
                relacion.setEstado(EstadoEmpleadoComercio.ACTIVO);
                relacion.setFechaBaja(null);
                reactivada = true;
            }
        }

        validarComercioAceptable(comercio.getId());

        invitacion.setEstado(EstadoInvitacionEmpleado.ACEPTADA);
        invitacion.setUsuarioAceptanteId(invitado.getId());
        invitacion.setFechaResolucion(ahora);
        guardarHistorial(comercio, invitacion, relacion, MotivoHistorialEmpleado.ACEPTACION, null,
                EstadoEmpleadoComercio.ACTIVO, invitado.getId(), ahora);
        if (reactivada) {
            guardarHistorial(comercio, invitacion, relacion, MotivoHistorialEmpleado.REACTIVACION,
                    EstadoEmpleadoComercio.INACTIVO, EstadoEmpleadoComercio.ACTIVO, invitado.getId(), ahora);
        }

        notificacionService.crear(resolucion.duenoId(),
                personaFisica.getNombre() + " " + personaFisica.getApellido() + " aceptó tu invitación y ya es parte del equipo de "
                        + comercio.getNombre(),
                TipoNotificacion.INVITACION_EMPLEADO, TipoEntidadNotificacion.COMERCIO, comercio.getId());
        return new InvitacionEmpleadoAceptadaResponseDTO(comercio.getNombre(), cuentaCreada, reactivada);
    }

    private record Resolucion(InvitacionEmpleado invitacion, Usuario invitado, Integer duenoId) {
    }

    /**
     * Rutina única de resolución de {@link #validar} y {@link #aceptar}: encuentra la invitación pendiente y
     * vigente del email cuyo código coincide. Si no hay ninguna, o el código no coincide con ninguna, suma un
     * intento fallido a todas las pendientes vigentes del email (a los {@link #MAX_INTENTOS_CODIGO} pasa a
     * {@code INVALIDADA}) y lanza {@link CodigoInvitacionInvalidoException}, que no revierte la transacción
     * para que el contador quede guardado. Las invitaciones vencidas no se tocan: "vencida" se calcula al
     * listar el equipo.
     * <p>
     * Las invitaciones se bloquean por clave primaria sobre los ids de la lectura previa y no por el rango
     * (email, estado): ese rango toma bloqueos de hueco sobre los índices únicos parciales y se interbloquea
     * con el {@code UPDATE} que pasa una invitación a {@code INVALIDADA} o {@code ACEPTADA} (ver
     * {@link InvitacionEmpleadoRepository#findByIdInConBloqueo}).
     * <p>
     * Para aceptar, antes de bloquear las invitaciones se bloquean las filas de {@code usuario} del invitado
     * (si ya tiene cuenta) y del Dueño del comercio, en id ascendente: el aviso al Dueño al final toma esa
     * última fila y, si la invitación se bloqueara primero, se cruzaría con una invitación o un reenvío del
     * Dueño, que bloquea su propia fila y después la invitación. El Dueño se conoce por una lectura previa sin
     * bloqueo; si la invitación que coincide ya no es la que se leyó (otra transacción la reemplazó o creó una
     * nueva en el medio), se trata como código incorrecto en vez de bloquear filas fuera de orden.
     */
    private Resolucion resolver(String email, String codigo, LocalDateTime ahora, boolean paraAceptar) {
        List<InvitacionPendienteVista> vistas = invitacionRepository
                .findVistasVigentesByEmailAndEstado(email, EstadoInvitacionEmpleado.PENDIENTE, ahora);
        if (vistas.isEmpty()) {
            throw new CodigoInvitacionInvalidoException();
        }
        InvitacionPendienteVista prevista = vistas.stream()
                .filter(vista -> vista.getCodigo().equals(codigo))
                .findFirst()
                .orElse(null);

        Usuario invitado = null;
        if (paraAceptar && prevista != null) {
            invitado = bloquearUsuariosEnOrden(usuarioRepository.findIdByEmail(email).orElse(null), prevista.getDuenoId());
        }

        List<InvitacionEmpleado> vigentes = invitacionRepository
                .findByIdInConBloqueo(vistas.stream().map(InvitacionPendienteVista::getId).toList()).stream()
                .filter(invitacion -> invitacion.getEstado() == EstadoInvitacionEmpleado.PENDIENTE
                        && invitacion.getFechaVencimiento().isAfter(ahora))
                .toList();
        InvitacionEmpleado coincidente = prevista == null ? null : vigentes.stream()
                .filter(invitacion -> invitacion.getId().equals(prevista.getId()) && invitacion.getCodigo().equals(codigo))
                .findFirst()
                .orElse(null);
        if (coincidente == null) {
            registrarIntentoFallido(vigentes, ahora);
            throw new CodigoInvitacionInvalidoException();
        }
        return new Resolucion(coincidente, invitado, prevista.getDuenoId());
    }

    private void registrarIntentoFallido(List<InvitacionEmpleado> vigentes, LocalDateTime ahora) {
        for (InvitacionEmpleado invitacion : vigentes) {
            int intentos = invitacion.getIntentosFallidos() + 1;
            invitacion.setIntentosFallidos(intentos);
            if (intentos >= MAX_INTENTOS_CODIGO) {
                invitacion.setEstado(EstadoInvitacionEmpleado.INVALIDADA);
                invitacion.setFechaResolucion(ahora);
            }
        }
    }

    private Usuario bloquearUsuariosEnOrden(Integer invitadoId, Integer duenoId) {
        if (invitadoId == null) {
            bloquearDuenoCompartido(duenoId);
            return null;
        }
        if (invitadoId < duenoId) {
            Usuario invitado = bloquearInvitado(invitadoId);
            bloquearDuenoCompartido(duenoId);
            return invitado;
        }
        if (invitadoId > duenoId) {
            bloquearDuenoCompartido(duenoId);
            return bloquearInvitado(invitadoId);
        }
        return bloquearInvitado(invitadoId);
    }

    private Usuario bloquearInvitado(Integer usuarioId) {
        return usuarioRepository.findByIdConBloqueo(usuarioId)
                .orElseThrow(() -> new IllegalStateException("La cuenta usuarioId=" + usuarioId + " desapareció durante la aceptación"));
    }

    private void bloquearDuenoCompartido(Integer duenoId) {
        usuarioRepository.leerIdConBloqueoCompartido(duenoId)
                .orElseThrow(() -> new IllegalStateException("El Dueño usuarioId=" + duenoId + " no existe"));
    }

    /**
     * Las reglas de aptitud de {@link #aceptar} agrupadas para {@link #validar}: la cuenta existente (si la hay)
     * y después el comercio, con las mismas dos rutinas que usa aceptar. Aceptar no puede llamarla de una vez
     * porque el estado del comercio se lee con bloqueo compartido recién después de tocar la relación con el
     * empleado (orden de bloqueo), así que invoca las dos por separado; ninguna regla está duplicada.
     */
    private void validarSePuedeAceptar(Usuario existente, Integer comercioId) {
        if (existente != null) {
            validarCuentaExistente(existente);
        }
        validarComercioAceptable(comercioId);
    }

    /**
     * Revalida la cuenta existente con su estado de este momento (la invitación pudo crearse cuando todavía
     * estaba en condiciones): primero la matriz de roles, después el estado de la cuenta con el texto de
     * conflicto del login. Quien llegó hasta acá ya probó el código, así que se le puede decir el motivo.
     */
    private void validarCuentaExistente(Usuario existente) {
        if (!matrizRolesService.puedeSerEmpleado(existente.getId())) {
            throw new InvitacionNoAptaException(MENSAJE_NO_SE_PUEDE_ACEPTAR);
        }
        String conflicto = MensajesEstadoCuenta.conflictoDeLogin(existente.getEstado());
        if (conflicto != null) {
            throw new InvitacionNoAptaException(conflicto);
        }
        if (!tieneEdadParaEquipo(existente.getId())) {
            throw new InvitacionNoAptaException(MENSAJE_EDAD_CUENTA_EXISTENTE);
        }
    }

    /**
     * Aptitud por edad de una cuenta existente para ser empleado: la comparten invitar, reenviar, validar y
     * aceptar, para que no diverjan. La edad es la declarada en la persona física, calculada con el reloj del
     * sistema.
     */
    private boolean tieneEdadParaEquipo(Integer usuarioId) {
        PersonaFisica persona = personaFisicaRepository.findById(usuarioId)
                .orElseThrow(() -> new IllegalStateException("La cuenta usuarioId=" + usuarioId + " no tiene persona física"));
        return EdadUtils.cumpleEdadMinima(persona.getFechaNacimiento(), LocalDate.now(clock), EDAD_MINIMA_EMPLEADO);
    }

    private void validarDatosDeCuentaNueva(AceptarInvitacionEmpleadoRequestDTO request) {
        Map<String, String> errores = new LinkedHashMap<>();
        if (request.getCuentaNueva() == null) {
            errores.put("cuentaNueva", MENSAJE_FALTAN_DATOS_DE_CUENTA);
        }
        if (!Boolean.TRUE.equals(request.getAceptaTerminos())) {
            errores.put("aceptaTerminos", MENSAJE_TERMINOS);
        }
        if (request.getCuentaNueva() != null && request.getCuentaNueva().getFechaNacimiento() != null
                && !EdadUtils.cumpleEdadMinima(request.getCuentaNueva().getFechaNacimiento(), LocalDate.now(clock),
                        EDAD_MINIMA_EMPLEADO)) {
            errores.put(CAMPO_FECHA_NACIMIENTO_CUENTA_NUEVA, MENSAJE_EDAD_CUENTA_NUEVA);
        }
        if (!errores.isEmpty()) {
            throw new ValidacionCamposException(errores);
        }
    }

    private void validarComercioAceptable(Integer comercioId) {
        String estado = comercioRepository.leerEstadoConBloqueoCompartido(comercioId)
                .orElseThrow(() -> new InvitacionNoAptaException(MENSAJE_INVITACION_NO_DISPONIBLE))
                .getEstado();
        if (!ESTADOS_ACEPTABLES.contains(EstadoComercio.valueOf(estado))) {
            throw new InvitacionNoAptaException(MENSAJE_INVITACION_NO_DISPONIBLE);
        }
    }

    private void guardarHistorial(Comercio comercio, InvitacionEmpleado invitacion, EmpleadoComercio relacion,
            MotivoHistorialEmpleado motivo, EstadoEmpleadoComercio origen, EstadoEmpleadoComercio destino,
            Integer actorUsuarioId, LocalDateTime fechaHora) {
        historialRepository.save(HistorialEmpleadoComercio.builder()
                .comercio(comercio)
                .empleadoComercio(relacion)
                .invitacion(invitacion)
                .estadoOrigen(origen)
                .estadoDestino(destino)
                .motivo(motivo)
                .actorUsuarioId(actorUsuarioId)
                .fechaHora(fechaHora)
                .build());
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
     * tope; por último, si la cuenta activa declara menos de 18 años no se invita y no se manda nada. En los
     * casos de rechazo que no son el de equipo el Dueño ve el mismo mensaje genérico, sin saber por qué.
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
        if (!tieneEdadParaEquipo(existente.getId())) {
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
