package com.bajonea.backend.entities;

import com.bajonea.backend.enums.EstadoDocumentoComercio;
import com.bajonea.backend.enums.TipoDocumentoComercio;
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
@Table(name = "documento_comercio")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class DocumentoComercio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Setter
    @Column(name = "comercio_id", nullable = false)
    private Integer comercioId;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "tipo", nullable = false)
    private TipoDocumentoComercio tipo;

    @Setter
    @Column(name = "descripcion", length = 100)
    private String descripcion;

    @Setter
    @Column(name = "nombre_original", nullable = false)
    private String nombreOriginal;

    @Setter
    @Column(name = "tipo_mime", nullable = false, length = 100)
    private String tipoMime;

    @Setter
    @Column(name = "tamano_bytes", nullable = false)
    private Integer tamanoBytes;

    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "estado", nullable = false)
    private EstadoDocumentoComercio estado;

    @Setter
    @Column(name = "motivo_rechazo", length = 255)
    private String motivoRechazo;

    @Setter
    @Column(name = "fecha_subida", nullable = false)
    private LocalDateTime fechaSubida;

    @Setter
    @Column(name = "fecha_resolucion")
    private LocalDateTime fechaResolucion;

    @Setter
    @Column(name = "administrador_id")
    private Integer administradorId;

    @Setter
    @Column(name = "subido_por_usuario_id", nullable = false)
    private Integer subidoPorUsuarioId;
}
