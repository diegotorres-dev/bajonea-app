package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoTicketSoporte;
import com.bajonea.backend.enums.TipoTicketSoporte;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "ticket_soporte")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class TicketSoporte {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Column(name = "codigo", nullable = false, length = 8, updatable = false)
    private String codigo;

    @Column(name = "email", nullable = false, length = 254, updatable = false)
    private String email;

    @Column(name = "usuario_id", updatable = false)
    private Integer usuarioId;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false, updatable = false)
    private TipoTicketSoporte tipo;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false)
    private EstadoTicketSoporte estado;

    @Column(name = "ip", nullable = false, length = 45, updatable = false)
    private String ip;

    @Setter
    @Column(name = "cantidad_mensajes", nullable = false)
    private int cantidadMensajes;

    @Column(name = "creado_en", nullable = false, updatable = false)
    private LocalDateTime creadoEn;

    @Setter
    @Column(name = "actualizado_en", nullable = false)
    private LocalDateTime actualizadoEn;

    @Setter
    @Column(name = "cerrado_en")
    private LocalDateTime cerradoEn;
}
