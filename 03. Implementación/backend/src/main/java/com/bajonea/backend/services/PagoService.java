package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.PagoResponseDTO;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.PagoRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persistencia de {@code pago}, 1:1 con {@code Pedido} (tramo MercadoPago 03). Una fila se crea
 * al generar la preferencia de Checkout Pro contra MercadoPago ({@link #crearPreferencia}, antes
 * de que exista ningún pago real) y se completa cuando el webhook confirma el resultado real
 * ({@link #registrarResultado}). La orquestación contra la API de MercadoPago (creación de
 * preferencia, lectura del webhook, elección de {@code access_token}) vive en
 * {@code MercadoPagoPagoService} — este Service solo guarda/lee la fila.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class PagoService {

    private final PagoRepository pagoRepository;

    @PersistenceContext
    private EntityManager entityManager;

    public void refrescar(Pago pago) {
        entityManager.refresh(pago);
    }

    public Optional<Pago> buscarPorPedido(Integer pedidoId) {
        return pagoRepository.findByPedidoId(pedidoId);
    }

    public Optional<Pago> buscarPorPedidoParaActualizar(Integer pedidoId) {
        return pagoRepository.findByPedidoIdParaActualizar(pedidoId);
    }

    public Pago obtenerPorPedido(Integer pedidoId) {
        return buscarPorPedido(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("El pedido no tiene ningún pago asociado"));
    }

    public Pago crearPreferencia(Pedido pedido, String mpPreferenciaId, String initPoint, String sandboxInitPoint) {
        Pago pago = Pago.builder()
                .pedido(pedido)
                .mpPreferenciaId(mpPreferenciaId)
                .mpInitPoint(initPoint)
                .mpSandboxInitPoint(sandboxInitPoint)
                .monto(pedido.getTotal())
                .fechaCreacion(LocalDateTime.now())
                .build();
        return pagoRepository.save(pago);
    }

    /**
     * Persiste el resultado real que devolvió {@code GET /v1/payments/{id}} tras el webhook.
     * {@code aprobado} solo controla si se completa {@code fechaConfirmacion} — la transición de
     * {@code Pedido.estado} la resuelve {@code PedidoService.confirmarPagoAprobado}/
     * {@code marcarPagoRechazado} por separado, este método no toca el Pedido.
     */
    public void registrarResultado(Pago pago, String mpPaymentId, String mpEstado, String metodoPago, boolean aprobado) {
        pago.setIdTransaccionMp(mpPaymentId);
        pago.setMpEstado(mpEstado);
        pago.setMetodoPago(metodoPago);
        if (aprobado && pago.getFechaConfirmacion() == null) {
            pago.setFechaConfirmacion(LocalDateTime.now());
        }
        pagoRepository.save(pago);
    }

    public PagoResponseDTO aResponseDTO(Pago pago, Pedido pedido, boolean esSandbox) {
        String urlPago = esSandbox ? pago.getMpSandboxInitPoint() : pago.getMpInitPoint();
        return new PagoResponseDTO(
                pedido.getId(),
                pedido.getPagoEstado(),
                pago.getMonto(),
                urlPago,
                pago.getFechaCreacion(),
                pago.getFechaConfirmacion(),
                false,
                false);
    }

    public PagoResponseDTO aResponseDTOSinLink(Pago pago, Pedido pedido, boolean yaPagado, boolean enRevision) {
        return new PagoResponseDTO(
                pedido.getId(),
                pedido.getPagoEstado(),
                pago == null ? pedido.getTotal() : pago.getMonto(),
                null,
                pago == null ? null : pago.getFechaCreacion(),
                pago == null ? null : pago.getFechaConfirmacion(),
                yaPagado,
                enRevision);
    }
}
