package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.ReclamoPedidoResponseDTO;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.entities.Reclamo;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoReclamo;
import com.bajonea.backend.repositories.PagoRepository;
import com.bajonea.backend.repositories.ReclamoRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Arma el bloque {@code reclamo} de las respuestas de pedido, por rol y para una lista de pedidos con tres consultas como
 * máximo (reclamos, notas de los reclamos y pagos de los entregados), nunca una por pedido. El Cliente recibe la
 * elegibilidad calculada por el servidor y su reclamo; el Dueño solo el reclamo de sus pedidos, sin el mensaje del Cliente.
 * No hay vista del Empleado: el DTO del Empleado no tiene el campo.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReclamoVistaService {

    private final ReclamoRepository reclamoRepository;
    private final PagoRepository pagoRepository;
    private final NotaCreditoService notaCreditoService;
    private final PoliticaReclamo politica;
    private final Clock clock;

    public Map<Integer, ReclamoPedidoResponseDTO> paraCliente(List<Pedido> pedidos) {
        List<Integer> ids = pedidos.stream().map(Pedido::getId).toList();
        Map<Integer, Reclamo> reclamos = reclamosPorPedido(ids);
        Map<Integer, NotaCredito> notas = notasPorReclamo(reclamos);
        List<Integer> entregadosSinReclamo = pedidos.stream()
                .filter(p -> p.getEstado() == EstadoPedido.ENTREGADO && !reclamos.containsKey(p.getId()))
                .map(Pedido::getId).toList();
        Map<Integer, Pago> pagos = new HashMap<>();
        if (!entregadosSinReclamo.isEmpty()) {
            pagoRepository.findByPedidoIdIn(entregadosSinReclamo).forEach(pago -> pagos.put(pago.getPedido().getId(), pago));
        }
        LocalDateTime ahora = LocalDateTime.now(clock);
        Map<Integer, ReclamoPedidoResponseDTO> vista = new HashMap<>();
        for (Pedido pedido : pedidos) {
            Reclamo reclamo = reclamos.get(pedido.getId());
            if (reclamo != null) {
                vista.put(pedido.getId(), deCliente(pedido, reclamo, notas.get(reclamo.getId())));
            } else if (pedido.getEstado() == EstadoPedido.ENTREGADO) {
                Pago pago = pagos.get(pedido.getId());
                boolean puede = politica.motivoDeNoElegible(pedido, pago, ahora) == null;
                vista.put(pedido.getId(), new ReclamoPedidoResponseDTO(puede, politica.fechaLimite(pedido),
                        puede ? politica.motivosDisponibles(pedido) : null, null, null, null, null, null, null, null, null, null,
                        politica.avisoPlazoVencido(pedido, pago, ahora)));
            }
        }
        return vista;
    }

    public Map<Integer, ReclamoPedidoResponseDTO> paraDueno(List<Pedido> pedidos) {
        Map<Integer, Reclamo> reclamos = reclamosPorPedido(pedidos.stream().map(Pedido::getId).toList());
        Map<Integer, NotaCredito> notas = notasPorReclamo(reclamos);
        Map<Integer, ReclamoPedidoResponseDTO> vista = new HashMap<>();
        reclamos.forEach((pedidoId, reclamo) -> vista.put(pedidoId, deDueno(reclamo, notas.get(reclamo.getId()))));
        return vista;
    }

    private Map<Integer, Reclamo> reclamosPorPedido(List<Integer> pedidoIds) {
        Map<Integer, Reclamo> reclamos = new HashMap<>();
        if (!pedidoIds.isEmpty()) {
            reclamoRepository.findByPedidoIdIn(pedidoIds).forEach(r -> reclamos.put(r.getPedidoId(), r));
        }
        return reclamos;
    }

    private Map<Integer, NotaCredito> notasPorReclamo(Map<Integer, Reclamo> reclamos) {
        Map<Integer, NotaCredito> notas = new HashMap<>();
        notaCreditoService.listarPorReclamos(reclamos.values().stream().map(Reclamo::getId).toList())
                .forEach(nota -> notas.put(nota.getReclamoId(), nota));
        return notas;
    }

    private ReclamoPedidoResponseDTO deCliente(Pedido pedido, Reclamo reclamo, NotaCredito nota) {
        return new ReclamoPedidoResponseDTO(false, politica.fechaLimite(pedido), null, reclamo.getId(), reclamo.getMotivo(),
                reclamo.getEstado(), reclamo.getFechaCreacion(), reclamo.getTipoResolucion(), reclamo.getMontoAprobado(),
                reclamo.getEstado() == EstadoReclamo.RECHAZADO ? reclamo.getNotaResolucion() : null, reclamo.getFechaResolucion(),
                enProceso(reclamo, nota), null);
    }

    private ReclamoPedidoResponseDTO deDueno(Reclamo reclamo, NotaCredito nota) {
        return new ReclamoPedidoResponseDTO(null, null, null, null, reclamo.getMotivo(), reclamo.getEstado(),
                reclamo.getFechaCreacion(), reclamo.getTipoResolucion(), reclamo.getMontoAprobado(), null,
                reclamo.getFechaResolucion(), enProceso(reclamo, nota), null);
    }

    static Boolean enProceso(Reclamo reclamo, NotaCredito nota) {
        if (reclamo.getEstado() != EstadoReclamo.APROBADO) {
            return null;
        }
        return nota == null || nota.getEstado() != EstadoNotaCredito.PROCESADO;
    }
}
