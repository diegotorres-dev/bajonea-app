package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoInvitacionEmpleado;
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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "invitacion_empleado")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class InvitacionEmpleado {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comercio_id", nullable = false)
    private Comercio comercio;

    @Setter
    @Column(name = "email", length = 254, nullable = false)
    private String email;

    @Setter
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "codigo", length = 6, nullable = false)
    private String codigo;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false)
    private EstadoInvitacionEmpleado estado;

    @Setter
    @Column(name = "intentos_fallidos", nullable = false)
    private int intentosFallidos;

    @Setter
    @Column(name = "invitado_por_usuario_id", nullable = false)
    private Integer invitadoPorUsuarioId;

    @Setter
    @Column(name = "usuario_aceptante_id")
    private Integer usuarioAceptanteId;

    @Setter
    @Column(name = "fecha_creacion", nullable = false)
    private LocalDateTime fechaCreacion;

    @Setter
    @Column(name = "fecha_vencimiento", nullable = false)
    private LocalDateTime fechaVencimiento;

    @Setter
    @Column(name = "fecha_resolucion")
    private LocalDateTime fechaResolucion;
}
