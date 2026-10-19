package com.bajonea.backend.services;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * El límite por IP de las consultas públicas de disponibilidad está conectado a la cadena de seguridad real: con el
 * límite bajado a 2 por minuto, la tercera consulta desde la misma IP da {@code 429} con el formato de error del
 * proyecto, sea al endpoint de nombre de comercio o al de nombre de usuario (comparten el contador).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "app.rate-limit.disponibilidad-por-minuto=2")
class NombreComercioRateLimitIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void laTerceraConsultaDeLaMismaIpDa429YLosDosEndpointsComparteElContador() throws Exception {
        mockMvc.perform(get("/api/v1/auth/comercio-nombre/disponibilidad").param("nombre", "Limite Uno")).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/auth/nombre-usuario/disponibilidad").param("nombreUsuario", "limiteuno1")).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/auth/comercio-nombre/disponibilidad").param("nombre", "Limite Dos"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.mensaje").value("Demasiadas solicitudes. Esperá un minuto e intentá de nuevo."))
                .andExpect(jsonPath("$.data").doesNotExist());
        mockMvc.perform(get("/api/v1/auth/nombre-usuario/disponibilidad").param("nombreUsuario", "limitedos2"))
                .andExpect(status().isTooManyRequests());
    }
}
