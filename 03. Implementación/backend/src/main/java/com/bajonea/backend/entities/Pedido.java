package com.bajonea.backend.entities;

import com.bajonea.backend.enums.CanceladoPor;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.FuenteEntrega;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.TipoEntrega;
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
@Table(name = "pedido")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class Pedido {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id", nullable = false)
    private Cliente cliente;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comercio_id", nullable = false)
    private Comercio comercio;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "direccion_id")
    private Direccion direccion;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "modalidad_entrega", nullable = false)
    private TipoEntrega tipoEntrega;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false)
    private EstadoPedido estado;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "pago_estado", nullable = false)
    private EstadoPagoPedido pagoEstado;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "cancelado_por")
    private CanceladoPor canceladoPor;

    @Setter
    @Column(name = "motivo", length = 500)
    private String motivo;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "fuente_entrega")
    private FuenteEntrega fuenteEntrega;

    @Setter
    @Column(name = "fecha_entrega")
    private LocalDateTime fechaEntrega;

    @Setter
    @Column(name = "suspension_retiro_expira")
    private LocalDateTime suspensionRetiroExpira;

    @Setter
    @Column(name = "primer_aviso_emitido", nullable = false)
    private boolean primerAvisoEmitido;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "motivo_rechazo")
    private MotivoRechazo motivoRechazo;

    @Setter
    @Column(name = "comentario_rechazo", length = 500)
    private String comentarioRechazo;

    @Setter
    @Column(name = "subtotal", precision = 10, scale = 2, nullable = false)
    private BigDecimal subtotal;

    @Setter
    @Column(name = "cargo_servicio_cliente", precision = 10, scale = 2, nullable = false)
    private BigDecimal cargoServicioCliente;

    @Setter
    @Column(name = "cargo_servicio_comercio", precision = 10, scale = 2, nullable = false)
    private BigDecimal cargoServicioComercio;

    @Setter
    @Column(name = "total", precision = 10, scale = 2, nullable = false)
    private BigDecimal total;

    @Setter
    @Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime fechaCreacion;
}
