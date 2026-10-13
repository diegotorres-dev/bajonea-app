package com.bajonea.backend.entities;

import com.bajonea.backend.enums.AccionEdicion;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.enums.TipoEntidadEdicion;
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
@Table(name = "historial_edicion_comercio")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class HistorialEdicionComercio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comercio_id", nullable = false)
    private Comercio comercio;

    @Setter
    @Column(name = "usuario_id", nullable = false)
    private Integer usuarioId;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "actor_rol", nullable = false)
    private RolActorComercio actorRol;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "entidad_tipo", nullable = false)
    private TipoEntidadEdicion entidadTipo;

    @Setter
    @Column(name = "entidad_id")
    private Integer entidadId;

    @Setter
    @Column(name = "entidad_nombre", length = 150)
    private String entidadNombre;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "accion", nullable = false)
    private AccionEdicion accion;

    @Setter
    @Column(name = "detalle", length = 255)
    private String detalle;

    @Setter
    @Column(name = "fecha_hora", nullable = false)
    private LocalDateTime fechaHora;
}
