package com.bajonea.backend.entities;

import com.bajonea.backend.enums.CondicionIva;
import com.bajonea.backend.enums.TipoPersonaJuridica;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "persona_juridica")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class PersonaJuridica {

    @Id
    @Column(name = "id")
    private Integer id;

    @Setter
    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "id")
    private Persona persona;

    @Setter
    @Column(name = "razon_social", length = 150, nullable = false)
    private String razonSocial;

    @Setter
    @Column(name = "cuit", length = 11, nullable = false, unique = true)
    private String cuit;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "condicion_iva", nullable = false)
    private CondicionIva condicionIva;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_sociedad", nullable = false)
    private TipoPersonaJuridica tipoSociedad;

    @Setter
    @Column(name = "domicilio_fiscal", length = 255, nullable = false)
    private String domicilioFiscal;

    @Setter
    @Column(name = "fecha_inicio_actividades", nullable = false)
    private LocalDate fechaInicioActividades;
}
