package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoNotaCredito;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
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
@Table(name = "nota_credito")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class NotaCredito {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pago_id", nullable = false, unique = true)
    private Pago pago;

    @Setter
    @Column(name = "monto", precision = 10, scale = 2, nullable = false)
    private BigDecimal monto;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false)
    private EstadoNotaCredito estado;

    @Setter
    @Column(name = "intentos", nullable = false)
    private Integer intentos;

    @Setter
    @Column(name = "refund_id_mp", length = 50)
    private String refundIdMp;

    @Setter
    @Column(name = "fecha_emision", nullable = false)
    private LocalDateTime fechaEmision;

    @Setter
    @Column(name = "fecha_proceso")
    private LocalDateTime fechaProceso;

    @Setter
    @Column(name = "fecha_fallido")
    private LocalDateTime fechaFallido;
}
