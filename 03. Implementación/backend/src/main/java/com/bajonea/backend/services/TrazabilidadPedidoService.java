package com.bajonea.backend.services;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.response.PasoTrazabilidadPedidoResponseDTO;
import com.bajonea.backend.dto.response.TrazabilidadPedidoResponseDTO;
import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.FilaActividadPedido;
import com.bajonea.backend.repositories.HistorialEstadoPedidoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.PedidoRepository.DatosTrazabilidadPedido;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recorrido de un pedido para el Dueño y los Empleados del comercio: "quién hizo cada paso". Es una lectura pura, sin
 * bloqueos, en dos consultas dentro de una misma transacción de solo lectura (una lectura consistente: si el pedido
 * cambia de estado mientras se lee, la respuesta muestra el recorrido de antes o el de después, nunca uno a medias):
 * los datos del pedido (que además validan que sea del comercio y que haya llegado pagado) y sus transiciones, con
 * el nombre de quien actuó ya resuelto. Mismas reglas de visibilidad que la actividad: sin el pedido todavía no
 * pagado ni su vencimiento por falta de pago; el sistema va sin nombre. Un Empleado que es el Cliente del pedido
 * recibe {@code 409 PEDIDO_PROPIO}, igual que en las acciones.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TrazabilidadPedidoService {

    private final PedidoRepository pedidoRepository;
    private final HistorialEstadoPedidoRepository historialEstadoPedidoRepository;

    public TrazabilidadPedidoResponseDTO obtener(ComercioActivo comercio, Integer pedidoId) {
        DatosTrazabilidadPedido pedido = pedidoRepository.findDatosTrazabilidad(pedidoId, comercio.comercioId())
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        PedidoService.exigirQueNoSeaPedidoPropio(comercio, pedido.getClienteId());

        List<PasoTrazabilidadPedidoResponseDTO> pasos = historialEstadoPedidoRepository
                .trazabilidadDelPedido(pedidoId, TextosPedidoActividad.ESTADOS_VISIBLES_PARA_EL_COMERCIO).stream()
                .map(fila -> aPaso(fila, pedido))
                .toList();
        return new TrazabilidadPedidoResponseDTO(pedidoId, pasos);
    }

    private static PasoTrazabilidadPedidoResponseDTO aPaso(FilaActividadPedido fila, DatosTrazabilidadPedido pedido) {
        String rol = fila.actorRol().name();
        boolean delSistema = fila.actorRol() == ActorPedido.SISTEMA;
        return new PasoTrazabilidadPedidoResponseDTO(fila.fechaHora(), fila.estado().name(),
                TextosPedidoActividad.textoDePedido(fila.estado(), fila.actorRol(), fila.motivoTimeout(), TextosPedidoActividad.EL_PEDIDO),
                rol, TextosPedidoActividad.textoDeRol(rol),
                delSistema ? null : TextosPedidoActividad.nombreDe(fila.actorNombre(), fila.actorApellido()),
                motivoDe(fila.estado(), pedido));
    }

    private static String motivoDe(EstadoPedido estado, DatosTrazabilidadPedido pedido) {
        if (estado == EstadoPedido.RECHAZADO && pedido.getMotivoRechazo() != null) {
            String comentario = pedido.getComentarioRechazo();
            return pedido.getMotivoRechazo().getEtiqueta() + (comentario == null || comentario.isBlank() ? "" : ". " + comentario.trim());
        }
        if (estado == EstadoPedido.ANULADO) {
            return pedido.getMotivo();
        }
        return null;
    }
}
