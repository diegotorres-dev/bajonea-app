package com.bajonea.backend.repositories;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Consulta de disponibilidad del nombre de comercio por JDBC: usa la misma expresión que la columna generada
 * {@code comercio.nombre_unico} (V37) contra esa columna, de modo que el chequeo previo, la respuesta de
 * disponibilidad en vivo y el {@code UNIQUE} no puedan discrepar (incluida la ñ). JDBC y no una consulta
 * nativa de JPA porque Hibernate toma {@code :space} de {@code [[:space:]]} como parámetro con nombre.
 * Es una lectura simple, sin bloqueos.
 */
@Repository
@RequiredArgsConstructor
public class ComercioNombreRepository {

    private static final String EXPRESION_CLAVE = "TRIM(REGEXP_REPLACE(?, '[[:space:]]+', ' '))";

    private static final String SQL_EXISTE = "SELECT EXISTS(SELECT 1 FROM comercio WHERE nombre_unico = "
            + EXPRESION_CLAVE + ")";

    private static final String SQL_EXISTE_EXCLUYENDO = "SELECT EXISTS(SELECT 1 FROM comercio WHERE nombre_unico = "
            + EXPRESION_CLAVE + " AND id <> ?)";

    private final JdbcTemplate jdbcTemplate;

    public boolean existe(String nombre, Integer excluirComercioId) {
        Integer resultado = excluirComercioId == null
                ? jdbcTemplate.queryForObject(SQL_EXISTE, Integer.class, nombre)
                : jdbcTemplate.queryForObject(SQL_EXISTE_EXCLUYENDO, Integer.class, nombre, excluirComercioId);
        return resultado != null && resultado == 1;
    }
}
