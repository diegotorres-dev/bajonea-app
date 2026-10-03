package com.bajonea.backend.entities;

import com.bajonea.backend.enums.CampoCambioComercio;
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
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "historial_cambio_comercio")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class HistorialCambioComercio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "historial_estado_comercio_id", nullable = false)
    private HistorialEstadoComercio historialEstadoComercio;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "campo", length = 40, nullable = false)
    private CampoCambioComercio campo;

    @Setter
    @Column(name = "valor_anterior", columnDefinition = "TEXT")
    private String valorAnterior;

    @Setter
    @Column(name = "valor_nuevo", columnDefinition = "TEXT")
    private String valorNuevo;
}
