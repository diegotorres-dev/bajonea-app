package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoUsuario;
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
@Table(name = "historial_estado_usuario")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class HistorialEstadoUsuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "administrador_id")
    private Usuario administrador;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado_origen")
    private EstadoUsuario estadoOrigen;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado_destino", nullable = false)
    private EstadoUsuario estadoDestino;

    @Setter
    @Column(name = "motivo", length = 500)
    private String motivo;

    @Setter
    @Column(name = "fecha_hora", nullable = false)
    private LocalDateTime fechaHora;
}
