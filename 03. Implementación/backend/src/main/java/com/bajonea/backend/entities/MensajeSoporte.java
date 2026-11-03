package com.bajonea.backend.entities;

import com.bajonea.backend.enums.AutorMensajeSoporte;
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
@Table(name = "ticket_soporte_mensaje")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class MensajeSoporte {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Column(name = "ticket_id", nullable = false, updatable = false)
    private Integer ticketId;

    @Enumerated(EnumType.STRING)
    @Column(name = "autor", nullable = false, updatable = false)
    private AutorMensajeSoporte autor;

    @Column(name = "texto", nullable = false, length = 1000, updatable = false)
    private String texto;

    @Column(name = "creado_en", nullable = false, updatable = false)
    private LocalDateTime creadoEn;

    @Setter
    @Column(name = "email_enviado", nullable = false)
    private boolean emailEnviado;
}
