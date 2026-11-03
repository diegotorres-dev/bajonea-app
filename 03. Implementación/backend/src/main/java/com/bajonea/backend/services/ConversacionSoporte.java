package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.MensajeSoporteResponseDTO;
import com.bajonea.backend.entities.MensajeSoporte;
import com.bajonea.backend.entities.TicketSoporte;
import com.bajonea.backend.enums.AutorMensajeSoporte;
import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.repositories.MensajeSoporteRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Reglas de la conversación por turnos de una consulta de Soporte, compartidas por quien escribe como persona (con o sin
 * sesión) y por Soporte: empieza hablando la persona, cada mensaje pasa el turno al otro lado, nadie escribe fuera de su
 * turno, el mensaje número 20 cierra la consulta sola y una consulta cerrada no acepta nada más. Quien llama tiene que
 * haber tomado antes la fila de la consulta con {@code FOR UPDATE}: el estado y el turno se evalúan sobre esa fila.
 */
@Component
@RequiredArgsConstructor
public class ConversacionSoporte {

    public static final int MAX_MENSAJES = 20;

    public static final String MENSAJE_CERRADA = "Esta consulta está cerrada. Si necesitás algo más, enviá una consulta nueva.";
    public static final String MENSAJE_TOPE = "Llegamos al máximo de mensajes de esta consulta. Si necesitás algo más, enviá una consulta nueva.";
    public static final String MENSAJE_TURNO_PERSONA = "Soporte todavía no respondió. Vas a poder escribir cuando lo haga.";
    public static final String MENSAJE_TURNO_SOPORTE = "Todavía no respondió la persona. Podés escribir cuando lo haga.";

    private final MensajeSoporteRepository mensajeRepository;

    /**
     * Agrega un mensaje si la consulta está abierta y es el turno de quien escribe; si no, devuelve el conflicto en el
     * resultado (nunca lo lanza: el servicio lo lanza después del commit).
     */
    public ResultadoSoporte<MensajeSoporte> agregarMensaje(TicketSoporte ticket, AutorMensajeSoporte autor, String texto,
            LocalDateTime ahora) {
        if (ticket.getEstado() == EstadoTicketSoporte.CERRADO) {
            return ResultadoSoporte.error(new ConflictoDeNegocioException(MENSAJE_CERRADA));
        }
        EstadoTicketSoporte estadoDelTurno = autor == AutorMensajeSoporte.PERSONA
                ? EstadoTicketSoporte.ESPERA_PERSONA
                : EstadoTicketSoporte.ESPERA_SOPORTE;
        if (ticket.getEstado() != estadoDelTurno) {
            return ResultadoSoporte.error(new ConflictoDeNegocioException(
                    autor == AutorMensajeSoporte.PERSONA ? MENSAJE_TURNO_PERSONA : MENSAJE_TURNO_SOPORTE));
        }
        MensajeSoporte mensaje = mensajeRepository.save(MensajeSoporte.builder()
                .ticketId(ticket.getId())
                .autor(autor)
                .texto(texto)
                .creadoEn(ahora)
                .emailEnviado(autor == AutorMensajeSoporte.PERSONA)
                .build());
        int total = ticket.getCantidadMensajes() + 1;
        ticket.setCantidadMensajes(total);
        ticket.setActualizadoEn(ahora);
        if (total >= MAX_MENSAJES) {
            ticket.setEstado(EstadoTicketSoporte.CERRADO);
            ticket.setCerradoEn(ahora);
        } else {
            ticket.setEstado(autor == AutorMensajeSoporte.PERSONA
                    ? EstadoTicketSoporte.ESPERA_SOPORTE
                    : EstadoTicketSoporte.ESPERA_PERSONA);
        }
        return ResultadoSoporte.ok(mensaje);
    }

    public List<MensajeSoporteResponseDTO> mensajes(Integer ticketId, boolean conEstadoDelEmail) {
        return mensajeRepository.findByTicketIdOrderByIdAsc(ticketId).stream()
                .map(m -> new MensajeSoporteResponseDTO(m.getId(), m.getAutor(), m.getTexto(), m.getCreadoEn(),
                        conEstadoDelEmail ? m.isEmailEnviado() : null))
                .toList();
    }

    /** Texto que acompaña a la consulta cuando la persona no puede escribir, o {@code null} si le toca a ella. */
    public String avisoParaLaPersona(TicketSoporte ticket) {
        return switch (ticket.getEstado()) {
            case CERRADO -> ticket.getCantidadMensajes() >= MAX_MENSAJES ? MENSAJE_TOPE : MENSAJE_CERRADA;
            case ESPERA_SOPORTE -> MENSAJE_TURNO_PERSONA;
            case ESPERA_PERSONA -> null;
        };
    }
}
