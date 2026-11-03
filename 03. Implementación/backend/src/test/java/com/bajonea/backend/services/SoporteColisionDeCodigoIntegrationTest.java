package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.exceptions.ServicioNoDisponibleException;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * La colisión de códigos al crear una consulta (Fase 5, tramo S4): se resuelve reintentando con otro código dentro de la
 * misma transacción, sin abrir otra conexión ni dejar la consulta a medias; si no hay manera de resolverla no queda nada
 * guardado.
 */
class SoporteColisionDeCodigoIntegrationTest extends SoporteIntegrationBase {

    @MockitoBean
    private CodigoConsultaGenerador generador;

    @Test
    void conUnaColisionReintentaConOtroCodigoYLaConsultaQuedaCompleta() {
        String repetido = "CCCC2222";
        String libre = "DDDD3333";
        when(generador.generar()).thenReturn(repetido);
        ConsultaSoporteCreadaResponseDTO primera = crear(emailNuevo(), ipNueva());
        assertEquals(repetido, primera.getCodigo());

        when(generador.generar()).thenReturn(repetido, repetido, libre);
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO segunda = crear(email, ipNueva());

        assertEquals(libre, segunda.getCodigo());
        assertEquals(1, filasDeMensajes(segunda.getId()));
        assertEquals(1, cantidadDeMensajes(segunda.getId()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte WHERE email = ?", Integer.class, email));
    }

    @Test
    void siTodosLosCodigosColisionanNoQuedaNingunaConsultaMediaHecha() {
        String repetido = "EEEE4444";
        when(generador.generar()).thenReturn(repetido);
        crear(emailNuevo(), ipNueva());
        String email = emailNuevo();

        assertThrows(ServicioNoDisponibleException.class, () -> crear(email, ipNueva()));

        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte WHERE email = ?", Integer.class, email));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM soporte_limite WHERE clave = ?", Integer.class, "CREAR_EMAIL|" + email));
    }
}
