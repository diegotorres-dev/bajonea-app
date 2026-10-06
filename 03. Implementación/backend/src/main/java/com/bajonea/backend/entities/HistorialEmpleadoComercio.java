package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.MotivoHistorialEmpleado;
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
@Table(name = "historial_empleado_comercio")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class HistorialEmpleadoComercio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comercio_id", nullable = false)
    private Comercio comercio;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "empleado_comercio_id")
    private EmpleadoComercio empleadoComercio;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invitacion_id")
    private InvitacionEmpleado invitacion;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado_origen")
    private EstadoEmpleadoComercio estadoOrigen;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado_destino")
    private EstadoEmpleadoComercio estadoDestino;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "motivo", nullable = false)
    private MotivoHistorialEmpleado motivo;

    @Setter
    @Column(name = "actor_usuario_id")
    private Integer actorUsuarioId;

    @Setter
    @Column(name = "fecha_hora", nullable = false)
    private LocalDateTime fechaHora;
}
