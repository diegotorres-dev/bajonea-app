package com.bajonea.backend.entities;

import com.bajonea.backend.config.security.MercadoPagoTokenConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
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
@Table(name = "cuenta_mercado_pago")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class CuentaMercadoPago {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dueno_id", nullable = false, unique = true)
    private Dueno dueno;

    @Setter
    @Column(name = "mp_user_id", length = 50, nullable = false)
    private String mpUserId;

    @Setter
    @Convert(converter = MercadoPagoTokenConverter.class)
    @Column(name = "access_token", length = 500, nullable = false)
    private String accessToken;

    @Setter
    @Convert(converter = MercadoPagoTokenConverter.class)
    @Column(name = "refresh_token", length = 500, nullable = false)
    private String refreshToken;

    @Setter
    @Column(name = "public_key", length = 255)
    private String publicKey;

    @Setter
    @Column(name = "activa", nullable = false)
    private boolean activa;

    @Setter
    @Column(name = "es_cuenta_prueba", nullable = false)
    private boolean esCuentaPrueba;

    @Setter
    @Column(name = "fecha_vinculacion", nullable = false)
    private LocalDateTime fechaVinculacion;

    @Setter
    @Column(name = "fecha_desvinculacion")
    private LocalDateTime fechaDesvinculacion;

    @Setter
    @Column(name = "token_expira")
    private LocalDateTime tokenExpira;
}
