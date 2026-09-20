package com.bajonea.backend.entities;

import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.MotivoTimeoutPedido;
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
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "historial_estado_pedido")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class HistorialEstadoPedido {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pedido_id", nullable = false)
    private Pedido pedido;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false)
    private EstadoPedido estado;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "actor_rol", nullable = false)
    private ActorPedido actorRol;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_usuario_id")
    private Usuario actorUsuario;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "motivo_timeout")
    private MotivoTimeoutPedido motivoTimeout;

    @Setter
    @Column(name = "fecha_hora", nullable = false, updatable = false)
    private LocalDateTime fechaHora;
}
