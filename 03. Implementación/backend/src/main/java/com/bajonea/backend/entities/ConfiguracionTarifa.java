package com.bajonea.backend.entities;

import com.bajonea.backend.enums.TipoCargo;
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
@Table(name = "configuracion_tarifa")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class ConfiguracionTarifa {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "administrador_id", nullable = false)
    private Administrador administrador;

    @Setter
    @Column(name = "cargo_cliente", precision = 10, scale = 2, nullable = false)
    private BigDecimal cargoCliente;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_cargo_cliente", nullable = false)
    private TipoCargo tipoCargoCliente;

    @Setter
    @Column(name = "cargo_comercio", precision = 10, scale = 2, nullable = false)
    private BigDecimal cargoComercio;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_cargo_comercio", nullable = false)
    private TipoCargo tipoCargoComercio;

    @Setter
    @Column(name = "fecha_vigencia", nullable = false)
    private LocalDateTime fechaVigencia;
}
