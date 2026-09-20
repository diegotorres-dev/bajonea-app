package com.bajonea.backend.repositories;

import com.bajonea.backend.entities.AlertaWebhookMp;
import com.bajonea.backend.enums.MotivoAlertaWebhookMp;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AlertaWebhookMpRepository extends JpaRepository<AlertaWebhookMp, Integer> {

    boolean existsByPedidoIdAndMpPaymentIdAndMotivo(Integer pedidoId, String mpPaymentId, MotivoAlertaWebhookMp motivo);
}
