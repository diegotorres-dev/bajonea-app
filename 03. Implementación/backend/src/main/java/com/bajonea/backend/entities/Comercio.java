package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoComercio;
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
@Table(name = "comercio")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class Comercio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dueno_id", nullable = false)
    private Dueno dueno;

    @Setter
    @Column(name = "nombre", length = 150, nullable = false)
    private String nombre;

    @Setter
    @Column(name = "descripcion", columnDefinition = "TEXT")
    private String descripcion;

    @Setter
    @Column(name = "foto_perfil_url", length = 500)
    private String fotoPerfilUrl;

    @Setter
    @Column(name = "telefono", length = 30, nullable = false)
    private String telefono;

    @Setter
    @Column(name = "email", length = 150, nullable = false)
    private String email;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_comercio", nullable = false)
    private TipoComercio tipoComercio;

    @Setter
    @Column(name = "acepta_delivery", nullable = false)
    private boolean aceptaDelivery;

    @Setter
    @Column(name = "acepta_retiro", nullable = false)
    private boolean aceptaRetiro;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false)
    private EstadoComercio estado;

    @Setter
    @Column(name = "fecha_registro", nullable = false, updatable = false)
    private LocalDateTime fechaRegistro;

    @Setter
    @Column(name = "fecha_modificacion")
    private LocalDateTime fechaModificacion;
}
