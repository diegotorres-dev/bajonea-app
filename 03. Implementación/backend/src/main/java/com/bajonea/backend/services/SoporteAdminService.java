package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.MensajeSoporteRequestDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteAdminDetalleResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteAdminResumenResponseDTO;
import com.bajonea.backend.dto.response.CuentaAsociadaSoporteResponseDTO;
import com.bajonea.backend.entities.MensajeSoporte;
import com.bajonea.backend.entities.TicketSoporte;
import com.bajonea.backend.enums.AutorMensajeSoporte;
import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.MensajeSoporteRepository;
import com.bajonea.backend.repositories.TicketSoporteRepository;
import com.bajonea.backend.repositories.TicketSoporteRepository.CuentaPorEmail;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Soporte desde el lado del Administrador: la bandeja de consultas, la conversación con la cuenta asociada al email,
 * responder por turnos, cerrar y reenviar el email de una respuesta que no salió. Responder y cerrar toman primero la fila
 * de la consulta con {@code FOR UPDATE} y revalidan estado y turno sobre esa fila: dos pestañas del Administrador, o una
 * respuesta contra un cierre o contra un mensaje de la persona, no pueden duplicar un turno ni pasar el tope. No toma filas
 * de contador ni de usuario. El listado resuelve las cuentas y los emails sin enviar con una consulta por página, no una por fila.
 */
@Service
public class SoporteAdminService {

    public static final int LIMITE_POR_DEFECTO = 50;
    public static final int LIMITE_MAXIMO = 200;
    public static final String MENSAJE_YA_CERRADA = "Esta consulta ya está cerrada.";
    public static final String MENSAJE_SIN_EMAIL_PENDIENTE = "No hay ningún email fallido para reenviar";

    public enum FiltroBandeja {
        ESPERAN,
        RESPONDIDAS,
        CERRADAS
    }

    private final TicketSoporteRepository ticketRepository;
    private final MensajeSoporteRepository mensajeRepository;
    private final ConversacionSoporte conversacion;
    private final AvisoSoporteService avisos;
    private final Clock clock;
    private final TransactionTemplate transaccion;
    private final TransactionTemplate transaccionDeLectura;

    public SoporteAdminService(TicketSoporteRepository ticketRepository, MensajeSoporteRepository mensajeRepository,
            ConversacionSoporte conversacion, AvisoSoporteService avisos, Clock clock,
            PlatformTransactionManager transactionManager) {
        this.ticketRepository = ticketRepository;
        this.mensajeRepository = mensajeRepository;
        this.conversacion = conversacion;
        this.avisos = avisos;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
        this.transaccionDeLectura = new TransactionTemplate(transactionManager);
        this.transaccionDeLectura.setReadOnly(true);
    }

    public List<ConsultaSoporteAdminResumenResponseDTO> listar(FiltroBandeja filtro, Integer limite, Integer pagina) {
        return listar(filtro, null, limite, pagina);
    }

    /** {@code email}, si viene, limita la bandeja a las consultas de ese email (comparación exacta, sin distinguir mayúsculas). */
    public List<ConsultaSoporteAdminResumenResponseDTO> listar(FiltroBandeja filtro, String email, Integer limite, Integer pagina) {
        String emailBuscado = email == null || email.isBlank() ? null : email.trim().toLowerCase(java.util.Locale.ROOT);
        int tamano = limite == null ? LIMITE_POR_DEFECTO : Math.min(Math.max(limite, 1), LIMITE_MAXIMO);
        int numero = pagina == null ? 0 : Math.max(pagina, 0);
        FiltroBandeja efectivo = filtro == null ? FiltroBandeja.ESPERAN : filtro;
        return transaccionDeLectura.execute(estado -> {
            List<TicketSoporte> tickets = switch (efectivo) {
                case ESPERAN -> ticketRepository.bandejaMasViejasPrimero(EstadoTicketSoporte.ESPERA_SOPORTE, emailBuscado,
                        PageRequest.of(numero, tamano));
                case RESPONDIDAS -> ticketRepository.bandejaMasViejasPrimero(EstadoTicketSoporte.ESPERA_PERSONA, emailBuscado,
                        PageRequest.of(numero, tamano));
                case CERRADAS -> ticketRepository.bandejaMasNuevasPrimero(EstadoTicketSoporte.CERRADO, emailBuscado,
                        PageRequest.of(numero, tamano));
            };
            if (tickets.isEmpty()) {
                return List.<ConsultaSoporteAdminResumenResponseDTO>of();
            }
            Set<String> emails = tickets.stream().map(TicketSoporte::getEmail).collect(Collectors.toSet());
            Set<String> suspendidas = ticketRepository.findCuentasPorEmail(emails).stream()
                    .filter(c -> EstadoUsuario.SUSPENDIDO.name().equals(c.getEstado()))
                    .map(c -> c.getEmail().toLowerCase(java.util.Locale.ROOT))
                    .collect(Collectors.toCollection(HashSet::new));
            Set<Integer> sinEnviar = new HashSet<>(ticketRepository.findIdsConEmailSinEnviar(
                    tickets.stream().map(TicketSoporte::getId).toList()));
            return tickets.stream()
                    .map(t -> new ConsultaSoporteAdminResumenResponseDTO(t.getId(), t.getCodigo(), t.getTipo(), t.getEmail(),
                            t.getEstado(), t.getCantidadMensajes(), t.getCreadoEn(), t.getActualizadoEn(),
                            suspendidas.contains(t.getEmail().toLowerCase(java.util.Locale.ROOT)), sinEnviar.contains(t.getId())))
                    .toList();
        });
    }

    public ConsultaSoporteAdminDetalleResponseDTO detalle(Integer id) {
        return transaccionDeLectura.execute(estado -> armarDetalle(
                ticketRepository.findById(id).orElseThrow(() -> new RecursoNoEncontradoException(SoporteService.MENSAJE_CONSULTA_NO_ENCONTRADA))));
    }

    public ConsultaSoporteAdminDetalleResponseDTO responder(Integer id, MensajeSoporteRequestDTO request) {
        transaccion.execute(estado -> {
            TicketSoporte ticket = ticketRepository.findByIdConBloqueo(id)
                    .orElseThrow(() -> new RecursoNoEncontradoException(SoporteService.MENSAJE_CONSULTA_NO_ENCONTRADA));
            ResultadoSoporte<MensajeSoporte> resultado = conversacion.agregarMensaje(ticket, AutorMensajeSoporte.SOPORTE,
                    request.getTexto(), ahora());
            if (resultado.error() != null) {
                return resultado;
            }
            avisos.avisarRespuesta(ticket.getEmail(), ticket.getCodigo(), resultado.valor().getId());
            return resultado;
        }).obtener();
        return detalle(id);
    }

    public ConsultaSoporteAdminDetalleResponseDTO cerrar(Integer id) {
        transaccion.execute(estado -> {
            TicketSoporte ticket = ticketRepository.findByIdConBloqueo(id)
                    .orElseThrow(() -> new RecursoNoEncontradoException(SoporteService.MENSAJE_CONSULTA_NO_ENCONTRADA));
            if (ticket.getEstado() == EstadoTicketSoporte.CERRADO) {
                return ResultadoSoporte.<Void>error(new ConflictoDeNegocioException(MENSAJE_YA_CERRADA));
            }
            LocalDateTime ahora = ahora();
            ticket.setEstado(EstadoTicketSoporte.CERRADO);
            ticket.setCerradoEn(ahora);
            ticket.setActualizadoEn(ahora);
            return ResultadoSoporte.<Void>ok(null);
        }).obtener();
        return detalle(id);
    }

    /**
     * Reenvía, con un solo intento, el email del último mensaje de Soporte si no salió. El envío no corre dentro de
     * ninguna transacción; el resultado queda marcado en el mensaje.
     */
    public ConsultaSoporteAdminDetalleResponseDTO reenviarEmail(Integer id) {
        record Pendiente(String email, String codigo, Integer mensajeId) {
        }
        Pendiente pendiente = transaccionDeLectura.execute(estado -> {
            TicketSoporte ticket = ticketRepository.findById(id)
                    .orElseThrow(() -> new RecursoNoEncontradoException(SoporteService.MENSAJE_CONSULTA_NO_ENCONTRADA));
            MensajeSoporte ultimo = mensajeRepository.findFirstByTicketIdAndAutorOrderByIdDesc(id, AutorMensajeSoporte.SOPORTE)
                    .filter(m -> !m.isEmailEnviado())
                    .orElseThrow(() -> new ConflictoDeNegocioException(MENSAJE_SIN_EMAIL_PENDIENTE));
            return new Pendiente(ticket.getEmail(), ticket.getCodigo(), ultimo.getId());
        });
        avisos.reenviarRespuesta(pendiente.email(), pendiente.codigo(), pendiente.mensajeId());
        return detalle(id);
    }

    public long contarQueEsperan() {
        return ticketRepository.countByEstado(EstadoTicketSoporte.ESPERA_SOPORTE);
    }

    private ConsultaSoporteAdminDetalleResponseDTO armarDetalle(TicketSoporte ticket) {
        Map<String, CuentaPorEmail> cuentas = ticketRepository.findCuentasPorEmail(List.of(ticket.getEmail())).stream()
                .collect(Collectors.toMap(c -> c.getEmail().toLowerCase(java.util.Locale.ROOT), Function.identity(), (a, b) -> a));
        CuentaPorEmail cuenta = cuentas.get(ticket.getEmail().toLowerCase(java.util.Locale.ROOT));
        CuentaAsociadaSoporteResponseDTO asociada = cuenta == null ? null
                : new CuentaAsociadaSoporteResponseDTO(cuenta.getUsuarioId(), cuenta.getNombre(), cuenta.getApellido(),
                        EstadoUsuario.valueOf(cuenta.getEstado()), RolUsuario.valueOf(cuenta.getRol()), cuenta.getEsEmpleado() != null && cuenta.getEsEmpleado().intValue() != 0);
        boolean sinEnviar = !ticketRepository.findIdsConEmailSinEnviar(List.of(ticket.getId())).isEmpty();
        return new ConsultaSoporteAdminDetalleResponseDTO(ticket.getId(), ticket.getCodigo(), ticket.getTipo(), ticket.getEmail(),
                ticket.getIp(), ticket.getEstado(), ticket.getCantidadMensajes(), ConversacionSoporte.MAX_MENSAJES,
                ticket.getCreadoEn(), ticket.getActualizadoEn(), ticket.getCerradoEn(),
                ticket.getEstado() == EstadoTicketSoporte.ESPERA_SOPORTE, sinEnviar, asociada,
                conversacion.mensajes(ticket.getId(), true));
    }

    private LocalDateTime ahora() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
