package com.bajonea.backend.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "direccion")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class Direccion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @Column(name = "calle", length = 150, nullable = false)
    private String calle;

    @Setter
    @Column(name = "numero", length = 10, nullable = false)
    private String numero;

    @Setter
    @Column(name = "piso_depto", length = 30)
    private String pisoDepto;

    @Setter
    @Column(name = "codigo_postal", length = 10, nullable = false)
    private String codigoPostal;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "localidad_id", nullable = false)
    private Localidad localidad;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id")
    private Cliente cliente;

    @Setter
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comercio_id", unique = true)
    private Comercio comercio;

    @Setter
    @Column(name = "principal", nullable = false)
    private boolean principal;

    @Setter
    @Column(name = "eliminada", nullable = false)
    private boolean eliminada;

    @Setter
    @Column(name = "fecha_creacion", nullable = false)
    private LocalDateTime fechaCreacion;

    @Setter
    @Column(name = "fecha_modificacion")
    private LocalDateTime fechaModificacion;

    @Setter
    @Column(name = "fecha_baja")
    private LocalDateTime fechaBaja;
}
