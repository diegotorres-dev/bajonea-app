package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.controllers.TestController;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Los atajos de {@code /api/v1/test/**} no existen fuera del perfil {@code test}: con el contexto levantado sin
 * ese perfil (solo la base de pruebas, para poder arrancar) ni {@code TestController} ni
 * {@code TestSupportService} son beans, y las rutas de invitaciones y de emails de regularización responden
 * {@code 404} aunque {@code /api/v1/test/**} figure como pública (sin bean no hay ruta que atender).
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:mysql://localhost:3306/bajonea_test",
        "spring.datasource.username=${DB_USER:root}",
        "spring.datasource.password=${DB_PASSWORD:}",
        "email.envio-habilitado=false"})
@AutoConfigureMockMvc
class AtajosDeTestFueraDelPerfilTest {

    @Autowired
    private ApplicationContext contexto;

    @Autowired
    private Environment entorno;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void sinElPerfilTestNoHayControllerNiServicioDeAtajos() {
        assertFalse(Arrays.asList(entorno.getActiveProfiles()).contains("test"));
        assertEquals(0, contexto.getBeansOfType(TestController.class).size());
        assertEquals(0, contexto.getBeansOfType(TestSupportService.class).size());
    }

    @Test
    void lasRutasDeLosAtajosDeInvitacionesNoExisten() throws Exception {
        mockMvc.perform(get("/api/v1/test/invitaciones-empleado/codigo").param("email", "a@b.com").param("comercioId", "1"))
                .andExpect(status().isNotFound());
        mockMvc.perform(put("/api/v1/test/invitaciones-empleado/1/vencer")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/test/emails-regularizacion/cantidad").param("email", "a@b.com")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/test/token").param("email", "a@b.com").param("tipo", "VERIFICACION_EMAIL"))
                .andExpect(status().isNotFound());
    }
}
