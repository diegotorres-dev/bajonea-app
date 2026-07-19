package com.bajonea.backend.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "persona_fisica")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class PersonaFisica {

    @Id
    @Column(name = "id")
    private Integer id;

    @Setter
    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "id")
    private Persona persona;

    @Setter
    @Column(name = "nombre", length = 100, nullable = false)
    private String nombre;

    @Setter
    @Column(name = "apellido", length = 100, nullable = false)
    private String apellido;

    @Setter
    @Column(name = "dni", length = 10, nullable = false, unique = true)
    private String dni;

    @Setter
    @Column(name = "fecha_nacimiento", nullable = false)
    private LocalDate fechaNacimiento;

    @Setter
    @Column(name = "telefono", length = 30, nullable = false)
    private String telefono;

    @Setter
    @Column(name = "fecha_modificacion")
    private LocalDateTime fechaModificacion;
}
