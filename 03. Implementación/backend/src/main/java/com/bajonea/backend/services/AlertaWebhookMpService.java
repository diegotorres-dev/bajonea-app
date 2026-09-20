package com.bajonea.backend.services;

import com.bajonea.backend.entities.AlertaWebhookMp;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.MotivoAlertaWebhookMp;
import com.bajonea.backend.repositories.AlertaWebhookMpRepository;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registro persistente de casos donde un webhook de MercadoPago no se pudo asociar con confianza
 * a un Pedido (ver {@code MercadoPagoPagoService#procesarNotificacion}). Sin Controller propio en
 * este tramo — la consulta queda para cuando se diseñe la pantalla de Admin correspondiente.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AlertaWebhookMpService {

    private final AlertaWebhookMpRepository alertaWebhookMpRepository;

    public void registrarExternalReferenceMismatch(Pedido pedidoReclamado, String mpPaymentId, String mpExternalReference, String ipOrigen) {
        AlertaWebhookMp alerta = AlertaWebhookMp.builder()
                .pedido(pedidoReclamado)
                .mpPaymentId(mpPaymentId)
                .mpExternalReference(mpExternalReference)
                .motivo(MotivoAlertaWebhookMp.EXTERNAL_REFERENCE_MISMATCH)
                .fechaCreacion(LocalDateTime.now())
                .ipOrigen(ipOrigen)
                .build();
        alertaWebhookMpRepository.save(alerta);
    }

    /**
     * Un pago aprobado llegó para un pedido que ya no estaba esperando el pago (cancelado por
     * timeout u otra causa). El pedido no se modifica; queda este rastro para gestión manual.
     * Idempotente por (pedido, pago, motivo).
     */
    public void registrarPagoAprobadoSobrePedidoCancelado(Pedido pedido, String mpPaymentId, String ipOrigen) {
        if (alertaWebhookMpRepository.existsByPedidoIdAndMpPaymentIdAndMotivo(
                pedido.getId(), mpPaymentId, MotivoAlertaWebhookMp.PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO)) {
            return;
        }
        AlertaWebhookMp alerta = AlertaWebhookMp.builder()
                .pedido(pedido)
                .mpPaymentId(mpPaymentId)
                .mpExternalReference(pedido.getId().toString())
                .motivo(MotivoAlertaWebhookMp.PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO)
                .fechaCreacion(LocalDateTime.now())
                .ipOrigen(ipOrigen)
                .build();
        alertaWebhookMpRepository.save(alerta);
    }

    /**
     * Un pago aprobado con un id distinto del ya registrado en {@code pago} llegó para un pedido
     * que ya tenía su pago aprobado. Ni el pedido ni {@code pago} se modifican; el duplicado queda
     * solo en esta alerta (punto de enganche del reembolso futuro). Idempotente por (pedido, pago, motivo).
     */
    public void registrarPagoAprobadoDuplicado(Pedido pedido, String mpPaymentId, String ipOrigen) {
        if (alertaWebhookMpRepository.existsByPedidoIdAndMpPaymentIdAndMotivo(
                pedido.getId(), mpPaymentId, MotivoAlertaWebhookMp.PAGO_APROBADO_DUPLICADO)) {
            return;
        }
        AlertaWebhookMp alerta = AlertaWebhookMp.builder()
                .pedido(pedido)
                .mpPaymentId(mpPaymentId)
                .mpExternalReference(pedido.getId().toString())
                .motivo(MotivoAlertaWebhookMp.PAGO_APROBADO_DUPLICADO)
                .fechaCreacion(LocalDateTime.now())
                .ipOrigen(ipOrigen)
                .build();
        alertaWebhookMpRepository.save(alerta);
    }
}
