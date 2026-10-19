package com.bajonea.backend.exceptions;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

class GlobalExceptionHandlerNombreComercioTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    private static DataIntegrityViolationException duplicado(String indice) {
        return new DataIntegrityViolationException("duplicado",
                new SQLException("Duplicate entry 'x' for key '" + indice + "'", "23000", 1062));
    }

    @Test
    void laViolacionDelIndiceDeNombreDeComercioSeTraduceA409ConElMensajeDelNombre() {
        var respuesta = handler.handleDataIntegrityViolation(duplicado("uq_comercio_nombre_unico"));

        assertEquals(HttpStatus.CONFLICT, respuesta.getStatusCode());
        assertEquals("Ya existe un comercio con ese nombre. Elegí otro.", respuesta.getBody().getMensaje());
    }

    @Test
    void otraViolacionUniqueSigueConElMensajeGenerico() {
        var respuesta = handler.handleDataIntegrityViolation(duplicado("uq_persona_juridica_cuit"));

        assertEquals(HttpStatus.CONFLICT, respuesta.getStatusCode());
        assertEquals("Ya existe un registro con alguno de los datos ingresados", respuesta.getBody().getMensaje());
    }
}
