package com.bajonea.backend.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "pago")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class Pago {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pedido_id", nullable = false, unique = true)
    private Pedido pedido;

    @Setter
    @Column(name = "mp_preferencia_id", length = 120)
    private String mpPreferenciaId;

    @Setter
    @Column(name = "mp_init_point", length = 500)
    private String mpInitPoint;

    @Setter
    @Column(name = "mp_sandbox_init_point", length = 500)
    private String mpSandboxInitPoint;

    @Setter
    @Column(name = "monto", precision = 10, scale = 2, nullable = false)
    private BigDecimal monto;

    @Setter
    @Column(name = "metodo_pago", length = 30)
    private String metodoPago;

    @Setter
    @Column(name = "mp_estado", length = 30)
    private String mpEstado;

    @Setter
    @Column(name = "id_transaccion_mp", length = 50)
    private String idTransaccionMp;

    @Setter
    @Column(name = "fecha_creacion", nullable = false)
    private LocalDateTime fechaCreacion;

    @Setter
    @Column(name = "fecha_confirmacion")
    private LocalDateTime fechaConfirmacion;
}
