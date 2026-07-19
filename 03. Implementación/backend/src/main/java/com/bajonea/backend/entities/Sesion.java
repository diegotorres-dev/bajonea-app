package com.bajonea.backend.entities;

import com.bajonea.backend.enums.TipoCierreSesion;
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
@Table(name = "sesion")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class Sesion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Setter
    @Column(name = "activa", nullable = false)
    private boolean activa;

    @Setter
    @Column(name = "fecha_inicio", nullable = false, updatable = false)
    private LocalDateTime fechaInicio;

    @Setter
    @Column(name = "fecha_cierre")
    private LocalDateTime fechaCierre;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_cierre")
    private TipoCierreSesion tipoCierre;

    @Setter
    @Column(name = "ip_origen", length = 45, nullable = false)
    private String ipOrigen;

    @Setter
    @Column(name = "navegador", length = 255)
    private String navegador;

    @Setter
    @Column(name = "dispositivo", length = 255)
    private String dispositivo;
}
