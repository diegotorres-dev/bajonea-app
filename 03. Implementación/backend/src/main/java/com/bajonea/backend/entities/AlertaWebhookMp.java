package com.bajonea.backend.entities;

import com.bajonea.backend.enums.MotivoAlertaWebhookMp;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "alerta_webhook_mp")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class AlertaWebhookMp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pedido_id")
    private Pedido pedido;

    @Setter
    @Column(name = "mp_payment_id", length = 50, nullable = false)
    private String mpPaymentId;

    @Setter
    @Column(name = "mp_external_reference", length = 120)
    private String mpExternalReference;

    @Setter
    @Column(name = "monto_esperado", precision = 10, scale = 2)
    private BigDecimal montoEsperado;

    @Setter
    @Column(name = "monto_capturado", precision = 10, scale = 2)
    private BigDecimal montoCapturado;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "motivo", nullable = false)
    private MotivoAlertaWebhookMp motivo;

    @Setter
    @Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime fechaCreacion;

    @Setter
    @Column(name = "ip_origen", length = 45)
    private String ipOrigen;
}
