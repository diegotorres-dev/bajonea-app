package com.bajonea.backend.config.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.bajonea.backend.config.PrecioBloqueoProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Contracara de {@code AtajosDeTestFueraDelPerfilTest}: con el perfil {@code test} activo, {@code /api/v1/test/**}
 * es público (el matcher condicionado de {@link SecurityConfig} se registra) y el atajo responde sin token. El
 * resto de las rutas siguen protegidas igual.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AtajosDeTestEnElPerfilTestTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PrecioBloqueoProperties precioBloqueoProperties;

    @Test
    void conElPerfilTestLosAtajosSonPublicosYUnParametroFaltanteDa400() throws Exception {
        int estado = mockMvc.perform(get("/api/v1/test/token-verificacion")).andReturn().getResponse().getStatus();
        assertEquals(400, estado);
    }

    @Test
    void elAtajoDelBloqueoDePrecioEnciendeYApagaLaPropiedadYSinParametroDa400() throws Exception {
        try {
            assertEquals(200, mockMvc.perform(put("/api/v1/test/precio-bloqueo").param("habilitado", "true")).andReturn().getResponse().getStatus());
            assertTrue(precioBloqueoProperties.isHabilitado());
            assertEquals(200, mockMvc.perform(put("/api/v1/test/precio-bloqueo").param("habilitado", "false")).andReturn().getResponse().getStatus());
            assertFalse(precioBloqueoProperties.isHabilitado());
            assertEquals(400, mockMvc.perform(put("/api/v1/test/precio-bloqueo")).andReturn().getResponse().getStatus());
        } finally {
            precioBloqueoProperties.setHabilitado(false);
        }
    }

    @Test
    void conElPerfilTestElRestoDeLasRutasSigueProtegido() throws Exception {
        int estado = mockMvc.perform(get("/api/v1/comercios/perfil")).andReturn().getResponse().getStatus();
        assertEquals(401, estado);
        assertNotEquals(400, estado);
    }
}
