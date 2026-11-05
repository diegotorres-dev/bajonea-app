package com.bajonea.backend.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

@Entity
@Table(name = "reclamo_foto")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class ReclamoFoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Column(name = "reclamo_id", nullable = false, updatable = false)
    private Integer reclamoId;

    @Column(name = "orden", nullable = false, updatable = false)
    private Integer orden;

    @Column(name = "nombre_original", nullable = false, updatable = false)
    private String nombreOriginal;

    @Column(name = "tipo_contenido", nullable = false, updatable = false, length = 50)
    private String tipoContenido;

    @Column(name = "tamano_bytes", nullable = false, updatable = false)
    private Integer tamanoBytes;

    @Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime fechaCreacion;
}
