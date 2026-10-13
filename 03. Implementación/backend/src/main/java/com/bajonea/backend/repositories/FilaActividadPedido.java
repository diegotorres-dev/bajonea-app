package com.bajonea.backend.repositories;

import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoTimeoutPedido;
import java.time.LocalDateTime;

public record FilaActividadPedido(Integer id, LocalDateTime fechaHora, Integer usuarioId, ActorPedido actorRol,
        String actorNombre, String actorApellido, Integer pedidoId, EstadoPedido estado, MotivoTimeoutPedido motivoTimeout) {
}
