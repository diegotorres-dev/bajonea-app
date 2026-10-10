package com.bajonea.backend.services;

import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
import com.bajonea.backend.repositories.InvitacionEmpleadoRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Un lote del vencimiento de invitaciones de empleado: una transacción corta que pasa a {@code VENCIDA} las
 * invitaciones {@code PENDIENTE} cuya fecha de vencimiento ya pasó. Lee los ids sin bloqueo y los fija por clave
 * primaria en id ascendente con un único {@code UPDATE}, igual que el resto del tramo (nunca un bloqueo por el
 * rango de estado y fecha, que se interbloquea con aceptar, invitar y reenviar). No toca el historial ni envía
 * notificaciones: vencer no es un evento, es el reflejo en la base de que el plazo terminó.
 */
@Service
@RequiredArgsConstructor
public class InvitacionVencimientoService {

    public static final int TAMANO_LOTE = 500;

    private final InvitacionEmpleadoRepository invitacionRepository;

    public record ResultadoLote(int seleccionadas, int vencidas) {

        public boolean hayMas() {
            return seleccionadas >= TAMANO_LOTE;
        }
    }

    @Transactional
    public ResultadoLote vencerLote(LocalDateTime ahora) {
        List<Integer> ids = invitacionRepository.findIdsVencidasByEstado(EstadoInvitacionEmpleado.PENDIENTE, ahora,
                PageRequest.of(0, TAMANO_LOTE));
        if (ids.isEmpty()) {
            return new ResultadoLote(0, 0);
        }
        int vencidas = invitacionRepository.marcarVencidas(ids, EstadoInvitacionEmpleado.PENDIENTE,
                EstadoInvitacionEmpleado.VENCIDA, ahora);
        return new ResultadoLote(ids.size(), vencidas);
    }
}
