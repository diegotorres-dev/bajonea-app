package com.bajonea.backend.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.bajonea.backend.dto.response.NotificacionResponseDTO;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class NotificacionResponseDTOTest {

    @Test
    void laRespuestaExponeElTipoDelAvisoParaQueElFrontendLoEnlace() throws Exception {
        NotificacionResponseDTO dto = new NotificacionResponseDTO(1, "Documento aprobado", false,
                LocalDateTime.of(2026, 10, 27, 10, 0), TipoEntidadNotificacion.COMERCIO, 7,
                TipoNotificacion.DOCUMENTO_APROBADO);

        JsonNode json = new ObjectMapper().registerModule(new JavaTimeModule()).valueToTree(dto);

        assertEquals("DOCUMENTO_APROBADO", json.get("tipo").asText());
        assertEquals(7, json.get("entidadId").asInt());
    }
}
