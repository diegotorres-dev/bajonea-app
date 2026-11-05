package com.bajonea.backend.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "reclamo_foto_archivo")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class ReclamoFotoArchivo {

    @Id
    @Column(name = "foto_id")
    private Integer id;

    @JdbcTypeCode(SqlTypes.LONGVARBINARY)
    @Column(name = "contenido", nullable = false, updatable = false)
    private byte[] contenido;
}
