package com.bajonea.backend.entities;

import com.bajonea.backend.enums.AccionCierre;
import com.bajonea.backend.enums.ActorCierre;
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
@Table(name = "historial_cierre_comercio")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class HistorialCierreComercio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comercio_id", nullable = false)
    private Comercio comercio;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "accion", nullable = false)
    private AccionCierre accion;

    @Setter
    @Column(name = "actor_usuario_id")
    private Integer actorUsuarioId;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "actor_rol", nullable = false)
    private ActorCierre actorRol;

    @Setter
    @Column(name = "fecha_hora", nullable = false)
    private LocalDateTime fechaHora;
}
