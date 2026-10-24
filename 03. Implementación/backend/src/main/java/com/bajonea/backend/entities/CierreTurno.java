package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoEmailCierreTurno;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "cierre_turno")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class CierreTurno {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @Column(name = "comercio_id", nullable = false)
    private Integer comercioId;

    @Setter
    @Column(name = "turno_fecha", nullable = false)
    private LocalDate turnoFecha;

    @Setter
    @Column(name = "horario_id", nullable = false)
    private Integer horarioId;

    @Setter
    @Column(name = "inicio", nullable = false)
    private LocalDateTime inicio;

    @Setter
    @Column(name = "fin", nullable = false)
    private LocalDateTime fin;

    @Setter
    @Column(name = "cantidad_pedidos", nullable = false)
    private Integer cantidadPedidos;

    @Setter
    @Column(name = "vendido", nullable = false)
    private BigDecimal vendido;

    @Setter
    @Column(name = "comision", nullable = false)
    private BigDecimal comision;

    @Setter
    @Column(name = "neto", nullable = false)
    private BigDecimal neto;

    @Setter
    @Column(name = "pendientes_al_cierre", nullable = false)
    private Integer pendientesAlCierre;

    @Setter
    @Column(name = "fecha_cierre", nullable = false)
    private LocalDateTime fechaCierre;

    @Setter
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "email_estado", nullable = false)
    private EstadoEmailCierreTurno emailEstado = EstadoEmailCierreTurno.PENDIENTE;

    @Setter
    @Builder.Default
    @Column(name = "email_intentos", nullable = false)
    private Integer emailIntentos = 0;

    @Setter
    @Column(name = "email_proximo_intento")
    private LocalDateTime emailProximoIntento;

    @Setter
    @Column(name = "email_envio_iniciado")
    private LocalDateTime emailEnvioIniciado;

    @Setter
    @Column(name = "email_fecha_envio")
    private LocalDateTime emailFechaEnvio;

    @Setter
    @Column(name = "email_ultimo_error", length = 500)
    private String emailUltimoError;
}
