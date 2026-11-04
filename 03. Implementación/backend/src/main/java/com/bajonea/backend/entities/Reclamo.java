package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoReclamo;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoResolucionReclamo;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
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
@Table(name = "reclamo")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class Reclamo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Column(name = "pedido_id", nullable = false, updatable = false)
    private Integer pedidoId;

    @Enumerated(EnumType.STRING)
    @Column(name = "motivo", nullable = false, updatable = false)
    private MotivoReclamo motivo;

    @Column(name = "descripcion", nullable = false, updatable = false, columnDefinition = "text")
    private String descripcion;

    @Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime fechaCreacion;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false)
    private EstadoReclamo estado;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_resolucion")
    private TipoResolucionReclamo tipoResolucion;

    @Setter
    @Column(name = "monto_aprobado", precision = 10, scale = 2)
    private BigDecimal montoAprobado;

    @Setter
    @Column(name = "administrador_id")
    private Integer administradorId;

    @Setter
    @Column(name = "nota_resolucion", length = 500)
    private String notaResolucion;

    @Setter
    @Column(name = "fecha_resolucion")
    private LocalDateTime fechaResolucion;
}
