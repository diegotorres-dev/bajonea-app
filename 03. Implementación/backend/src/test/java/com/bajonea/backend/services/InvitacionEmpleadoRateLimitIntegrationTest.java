package com.bajonea.backend.services;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * El límite por IP está conectado a la cadena de seguridad real: con el límite de invitaciones bajado a 2 por
 * minuto, el tercer pedido a validar o aceptar desde la misma IP da {@code 429} con el formato de error del
 * proyecto, antes de llegar al servicio (no cuenta un intento más ni toca la base).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "app.rate-limit.invitacion-empleado-por-minuto=2")
class InvitacionEmpleadoRateLimitIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void elTercerPedidoDeLaMismaIpDa429ConElFormatoDeErrorYValidarYAceptarComparteElContador() throws Exception {
        String cuerpo = "{\"email\":\"nadie.limite@bajonea.test\",\"codigo\":\"123456\"}";

        mockMvc.perform(post("/api/v1/auth/invitaciones-empleado/validar").contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/invitaciones-empleado/aceptar").contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/invitaciones-empleado/validar").contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.mensaje").value("Demasiadas solicitudes. Esperá un minuto e intentá de nuevo."))
                .andExpect(jsonPath("$.data").doesNotExist());
    }
}
