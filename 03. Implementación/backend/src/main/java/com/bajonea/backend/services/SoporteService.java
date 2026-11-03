package com.bajonea.backend.services;

import com.bajonea.backend.config.SoporteProperties;
import com.bajonea.backend.dto.request.AccesoConsultaSoporteRequestDTO;
import com.bajonea.backend.dto.request.CrearConsultaSoporteRequestDTO;
import com.bajonea.backend.dto.request.CrearConsultaSoporteSesionRequestDTO;
import com.bajonea.backend.dto.request.MensajeSoporteRequestDTO;
import com.bajonea.backend.dto.request.ReenviarCodigosSoporteRequestDTO;
import com.bajonea.backend.dto.request.ResponderConsultaSoportePublicaRequestDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteResumenResponseDTO;
import com.bajonea.backend.dto.response.ContadorSoporteResponseDTO;
import com.bajonea.backend.entities.TicketSoporte;
import com.bajonea.backend.enums.AutorMensajeSoporte;
import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.TipoTicketSoporte;
import com.bajonea.backend.exceptions.LimiteSoporteException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ServicioNoDisponibleException;
import com.bajonea.backend.repositories.MensajeSoporteRepository;
import com.bajonea.backend.repositories.TicketSoporteInsercionRepository;
import com.bajonea.backend.repositories.TicketSoporteRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.services.SoporteLimiteService.AccesoIntentos;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Consultas a Soporte desde el lado de la persona: crear una consulta, ver su conversación y escribir cuando le toca, con
 * sesión (dentro del Perfil, sin código) o sin sesión (con el email y el código de la consulta). Un usuario con la cuenta
 * suspendida usa exactamente los mismos caminos, que es para quien más sirven.
 *
 * <p>Orden de bloqueos (ver docs/CONCURRENCIA-Y-TRANSACCIONES.md): usuario (compartido, solo al crear con sesión) →
 * filas de contador de {@link SoporteLimiteService} → fila de la consulta ({@code FOR UPDATE}, primera lectura de la
 * consulta) → mensaje. Cada operación es una transacción corta armada con {@link TransactionTemplate}; los errores de
 * negocio (límites, turno, consulta inexistente) se devuelven como resultado y se lanzan después del commit, así la
 * transacción nunca se revierte con filas de contador recién creadas ni pierde el conteo de un intento fallido. Los emails
 * salen después del commit ({@link AvisoSoporteService}).
 */
@Service
public class SoporteService {

    public static final String MENSAJE_NO_ENCONTRADA = "No encontramos una consulta con esos datos. Revisá el email y el código.";
    public static final String MENSAJE_CONSULTA_NO_ENCONTRADA = "Consulta no encontrada";
    public static final String MENSAJE_DEMASIADOS_INTENTOS = "Hiciste demasiados intentos. Probá de nuevo en una hora.";
    public static final String MENSAJE_LIMITE_DIARIO_EMAIL =
            "Ya enviaste 3 consultas hoy. Probá de nuevo mañana o esperá la respuesta de Soporte.";
    public static final String MENSAJE_LIMITE_ABIERTAS =
            "Ya tenés 3 consultas abiertas. Esperá a que Soporte las responda para enviar otra.";
    public static final String MENSAJE_LIMITE_IP =
            "Se enviaron demasiadas consultas desde tu conexión. Probá de nuevo más tarde.";
    public static final String MENSAJE_REENVIO_CODIGOS =
            "Si hay consultas con ese email, te mandamos los códigos. Revisá tu bandeja de entrada.";

    private static final String IP_DESCONOCIDA = "desconocida";

    private final TicketSoporteRepository ticketRepository;
    private final MensajeSoporteRepository mensajeRepository;
    private final TicketSoporteInsercionRepository insercionRepository;
    private final UsuarioRepository usuarioRepository;
    private final SoporteLimiteService limites;
    private final ConversacionSoporte conversacion;
    private final AvisoSoporteService avisos;
    private final CodigoConsultaGenerador generadorDeCodigos;
    private final SoporteProperties propiedades;
    private final Clock clock;
    private final TransactionTemplate transaccion;
    private final TransactionTemplate transaccionDeLectura;

    public SoporteService(TicketSoporteRepository ticketRepository, MensajeSoporteRepository mensajeRepository,
            TicketSoporteInsercionRepository insercionRepository, UsuarioRepository usuarioRepository,
            SoporteLimiteService limites, ConversacionSoporte conversacion, AvisoSoporteService avisos,
            CodigoConsultaGenerador generadorDeCodigos, SoporteProperties propiedades, Clock clock,
            PlatformTransactionManager transactionManager) {
        this.ticketRepository = ticketRepository;
        this.mensajeRepository = mensajeRepository;
        this.insercionRepository = insercionRepository;
        this.usuarioRepository = usuarioRepository;
        this.limites = limites;
        this.conversacion = conversacion;
        this.avisos = avisos;
        this.generadorDeCodigos = generadorDeCodigos;
        this.propiedades = propiedades;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
        this.transaccionDeLectura = new TransactionTemplate(transactionManager);
        this.transaccionDeLectura.setReadOnly(true);
    }

    // ---------------------------------------------------------------- sin sesión

    public ConsultaSoporteCreadaResponseDTO crearSinSesion(CrearConsultaSoporteRequestDTO request, String ip) {
        return crear(request.getEmail(), null, request.getTipo(), request.getMensaje(), ip);
    }

    public ConsultaSoporteResponseDTO verSinSesion(AccesoConsultaSoporteRequestDTO request, String ip) {
        String codigo = CodigoConsultaGenerador.normalizar(request.getCodigo());
        String email = request.getEmail();
        String ipLimpia = ip(ip);
        return transaccion.execute(estado -> {
            LocalDateTime ahora = ahora();
            AccesoIntentos acceso = limites.bloquearIntentos(email, ipLimpia, ahora);
            if (acceso.bloqueado()) {
                return ResultadoSoporte.<ConsultaSoporteResponseDTO>error(new LimiteSoporteException(MENSAJE_DEMASIADOS_INTENTOS));
            }
            Optional<TicketSoporte> ticket = codigoConFormato(codigo)
                    ? ticketRepository.findByEmailAndCodigo(email, codigo)
                    : Optional.empty();
            if (ticket.isEmpty()) {
                limites.registrarFallo(acceso, ahora);
                return ResultadoSoporte.<ConsultaSoporteResponseDTO>error(new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));
            }
            return ResultadoSoporte.ok(detalle(ticket.get()));
        }).obtener();
    }

    public ConsultaSoporteResponseDTO responderSinSesion(ResponderConsultaSoportePublicaRequestDTO request, String ip) {
        String codigo = CodigoConsultaGenerador.normalizar(request.getCodigo());
        String email = request.getEmail();
        String ipLimpia = ip(ip);
        return transaccion.execute(estado -> {
            LocalDateTime ahora = ahora();
            AccesoIntentos acceso = limites.bloquearIntentos(email, ipLimpia, ahora);
            if (acceso.bloqueado()) {
                return ResultadoSoporte.<ConsultaSoporteResponseDTO>error(new LimiteSoporteException(MENSAJE_DEMASIADOS_INTENTOS));
            }
            Optional<Integer> id = codigoConFormato(codigo)
                    ? ticketRepository.findIdByEmailAndCodigo(email, codigo)
                    : Optional.empty();
            if (id.isEmpty()) {
                limites.registrarFallo(acceso, ahora);
                return ResultadoSoporte.<ConsultaSoporteResponseDTO>error(new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADA));
            }
            return escribirComoPersona(id.get(), request.getTexto(), ahora);
        }).obtener();
    }

    /**
     * Manda por email los códigos de las consultas no cerradas de ese email. La respuesta es siempre la misma, haya o no
     * consultas; cada pedido cuenta contra el límite de reenvíos del email y de la IP, existan o no consultas.
     */
    public String reenviarCodigos(ReenviarCodigosSoporteRequestDTO request, String ip) {
        String email = request.getEmail();
        String ipLimpia = ip(ip);
        transaccion.execute(estado -> {
            LocalDateTime ahora = ahora();
            if (!limites.intentarReenvio(email, ipLimpia, ahora)) {
                return ResultadoSoporte.<Void>error(new LimiteSoporteException(MENSAJE_DEMASIADOS_INTENTOS));
            }
            List<String> codigos = ticketRepository.findByEmailAndEstadoNotOrderByIdAsc(email, EstadoTicketSoporte.CERRADO)
                    .stream().map(TicketSoporte::getCodigo).toList();
            if (!codigos.isEmpty()) {
                avisos.enviarCodigos(email, codigos);
            }
            return ResultadoSoporte.<Void>ok(null);
        }).obtener();
        return MENSAJE_REENVIO_CODIGOS;
    }

    // ---------------------------------------------------------------- con sesión

    public ConsultaSoporteCreadaResponseDTO crearConSesion(Integer usuarioId, CrearConsultaSoporteSesionRequestDTO request, String ip) {
        return crear(emailDe(usuarioId), usuarioId, request.getTipo(), request.getMensaje(), ip);
    }

    public List<ConsultaSoporteResumenResponseDTO> misConsultas(Integer usuarioId) {
        String email = emailDe(usuarioId);
        return transaccionDeLectura.execute(estado -> ticketRepository.findDelUsuario(usuarioId, email).stream()
                .map(t -> new ConsultaSoporteResumenResponseDTO(t.getId(), t.getCodigo(), t.getTipo(), t.getEstado(),
                        t.getCantidadMensajes(), t.getCreadoEn(), t.getActualizadoEn()))
                .toList());
    }

    public ConsultaSoporteResponseDTO miConsulta(Integer usuarioId, Integer id) {
        String email = emailDe(usuarioId);
        return transaccionDeLectura.execute(estado -> detalle(ticketRepository.findDelUsuarioPorId(id, usuarioId, email)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_CONSULTA_NO_ENCONTRADA))));
    }

    public ConsultaSoporteResponseDTO responderConSesion(Integer usuarioId, Integer id, MensajeSoporteRequestDTO request) {
        String email = emailDe(usuarioId);
        return transaccion.execute(estado -> {
            Optional<Integer> propio = ticketRepository.findIdDelUsuarioPorId(id, usuarioId, email);
            if (propio.isEmpty()) {
                return ResultadoSoporte.<ConsultaSoporteResponseDTO>error(new RecursoNoEncontradoException(MENSAJE_CONSULTA_NO_ENCONTRADA));
            }
            return escribirComoPersona(propio.get(), request.getTexto(), ahora());
        }).obtener();
    }

    public ContadorSoporteResponseDTO contador(Integer usuarioId) {
        String email = emailDe(usuarioId);
        return new ContadorSoporteResponseDTO(transaccionDeLectura.execute(estado ->
                ticketRepository.contarDelUsuarioPorEstado(EstadoTicketSoporte.ESPERA_PERSONA, usuarioId, email)));
    }

    // ---------------------------------------------------------------- común

    private ConsultaSoporteCreadaResponseDTO crear(String email, Integer usuarioId, TipoTicketSoporte tipo, String mensaje, String ip) {
        String ipLimpia = ip(ip);
        return transaccion.execute(estado -> {
            if (usuarioId != null && usuarioRepository.leerIdConBloqueoCompartido(usuarioId).isEmpty()) {
                return ResultadoSoporte.<ConsultaSoporteCreadaResponseDTO>error(new RecursoNoEncontradoException("Usuario no encontrado"));
            }
            LocalDateTime ahora = ahora();
            limites.bloquearCreacion(email, ipLimpia, ahora);
            LocalDateTime desde = ahora.minusHours(propiedades.getVentanaConsultasHoras());
            if (ticketRepository.countByEmailAndCreadoEnAfter(email, desde) >= propiedades.getConsultasPorDiaEmail()) {
                return ResultadoSoporte.<ConsultaSoporteCreadaResponseDTO>error(new LimiteSoporteException(MENSAJE_LIMITE_DIARIO_EMAIL));
            }
            if (ticketRepository.countByEmailAndEstadoNot(email, EstadoTicketSoporte.CERRADO) >= propiedades.getConsultasAbiertasEmail()) {
                return ResultadoSoporte.<ConsultaSoporteCreadaResponseDTO>error(new LimiteSoporteException(MENSAJE_LIMITE_ABIERTAS));
            }
            if (ticketRepository.countByIpAndCreadoEnAfter(ipLimpia, desde) >= propiedades.getConsultasPorDiaIp()) {
                return ResultadoSoporte.<ConsultaSoporteCreadaResponseDTO>error(new LimiteSoporteException(MENSAJE_LIMITE_IP));
            }
            String codigo = null;
            Integer id = null;
            for (int intento = 0; intento < propiedades.getCodigoMaxIntentosColision() && id == null; intento++) {
                String candidato = generadorDeCodigos.generar();
                try {
                    id = insercionRepository.insertar(candidato, email, usuarioId, tipo, ipLimpia, ahora);
                    codigo = candidato;
                } catch (DuplicateKeyException colision) {
                    id = null;
                }
            }
            if (id == null) {
                throw new ServicioNoDisponibleException("No pudimos crear tu consulta. Probá de nuevo en unos minutos.");
            }
            mensajeRepository.save(com.bajonea.backend.entities.MensajeSoporte.builder()
                    .ticketId(id)
                    .autor(AutorMensajeSoporte.PERSONA)
                    .texto(mensaje)
                    .creadoEn(ahora)
                    .emailEnviado(true)
                    .build());
            avisos.avisarConsultaRecibida(email, codigo);
            return ResultadoSoporte.ok(new ConsultaSoporteCreadaResponseDTO(id, codigo, EstadoTicketSoporte.ESPERA_SOPORTE));
        }).obtener();
    }

    private ResultadoSoporte<ConsultaSoporteResponseDTO> escribirComoPersona(Integer ticketId, String texto, LocalDateTime ahora) {
        TicketSoporte ticket = ticketRepository.findByIdConBloqueo(ticketId)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_CONSULTA_NO_ENCONTRADA));
        ResultadoSoporte<?> resultado = conversacion.agregarMensaje(ticket, AutorMensajeSoporte.PERSONA, texto, ahora);
        if (resultado.error() != null) {
            return ResultadoSoporte.error(resultado.error());
        }
        return ResultadoSoporte.ok(detalle(ticket));
    }

    private ConsultaSoporteResponseDTO detalle(TicketSoporte ticket) {
        return new ConsultaSoporteResponseDTO(ticket.getId(), ticket.getCodigo(), ticket.getTipo(), ticket.getEstado(),
                ticket.getCantidadMensajes(), ConversacionSoporte.MAX_MENSAJES, ticket.getCreadoEn(), ticket.getActualizadoEn(),
                ticket.getCerradoEn(), ticket.getEstado() == EstadoTicketSoporte.ESPERA_PERSONA,
                conversacion.avisoParaLaPersona(ticket), conversacion.mensajes(ticket.getId(), false));
    }

    private String emailDe(Integer usuarioId) {
        return usuarioRepository.findById(usuarioId)
                .map(usuario -> usuario.getEmail().toLowerCase(Locale.ROOT))
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
    }

    private static boolean codigoConFormato(String codigo) {
        return codigo.length() == CodigoConsultaGenerador.LONGITUD;
    }

    private static String ip(String ip) {
        if (ip == null || ip.isBlank()) {
            return IP_DESCONOCIDA;
        }
        return ip.length() > 45 ? ip.substring(0, 45) : ip;
    }

    private LocalDateTime ahora() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
