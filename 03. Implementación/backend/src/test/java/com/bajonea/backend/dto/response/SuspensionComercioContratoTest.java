package com.bajonea.backend.dto.response;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.enums.EstadoComercio;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Contrato de lo que ve cada actor de un comercio suspendido: el motivo y la fecha de la suspensión viajan solo al
 * Dueño y al Administrador; el Empleado ve el estado y nunca el motivo.
 */
class SuspensionComercioContratoTest {

    private static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private static final LocalDateTime FECHA = LocalDateTime.of(2026, 10, 29, 10, 0);

    @Test
    void laFilaDelSelectorDelEmpleadoNuncaLlevaElMotivoNiLaFechaDeLaSuspension() throws Exception {
        MiComercioEmpleadoResponseDTO fila = new MiComercioEmpleadoResponseDTO(1, "Comercio", null, EstadoComercio.SUSPENDIDO, FECHA,
                false, 0, false, false, false, null, FECHA);

        JsonNode json = JSON.valueToTree(fila);

        assertEquals("SUSPENDIDO", json.path("estado").asText());
        assertFalse(json.has("motivoSuspension"));
        assertFalse(json.has("suspendidoDesde"));
    }

    @Test
    void laFilaDelSelectorDelDuenoLlevaElMotivoYLaFechaSoloSiEstaSuspendido() throws Exception {
        MiComercioResponseDTO suspendido = new MiComercioResponseDTO(1, "Comercio", null, EstadoComercio.SUSPENDIDO, FECHA, false, 0,
                false, false, false, null, FECHA, "Documentacion vencida");
        MiComercioResponseDTO activo = new MiComercioResponseDTO(2, "Comercio", null, EstadoComercio.APTO_VENTA, FECHA, true, 0,
                false, true, true, null, null, null);

        JsonNode delSuspendido = JSON.valueToTree(suspendido);
        JsonNode delActivo = JSON.valueToTree(activo);

        assertEquals("Documentacion vencida", delSuspendido.path("motivoSuspension").asText());
        assertTrue(delSuspendido.has("suspendidoDesde"));
        assertFalse(delActivo.has("motivoSuspension"));
        assertFalse(delActivo.has("suspendidoDesde"));
    }

    @Test
    void elPerfilReducidoYElPedidoDelEmpleadoNoTienenCamposDeSuspensionNiNombreDelComercio() {
        List<String> prohibidos = List.of("motivoSuspension", "suspendidoDesde", "suspensionOrigen", "comercioNombre", "comercioFotoUrl");
        for (Class<?> tipo : List.of(ComercioEmpleadoResponseDTO.class, PedidoEmpleadoResponseDTO.class)) {
            List<String> campos = Arrays.stream(tipo.getDeclaredFields()).map(Field::getName).toList();
            for (String prohibido : prohibidos) {
                assertFalse(campos.contains(prohibido), tipo.getSimpleName() + " no debe tener " + prohibido);
            }
        }
    }

    @Test
    void elPublicoDelCatalogoNuncaVeElMotivoDeLaSuspension() {
        List<String> campos = Arrays.stream(ComercioPublicoResponseDTO.class.getDeclaredFields()).map(Field::getName).toList();

        assertFalse(campos.contains("motivoSuspension"));
        assertFalse(campos.contains("suspendidoDesde"));
        assertFalse(campos.contains("suspensionOrigen"));
    }

    @Test
    void elPedidoDelClienteYDelDuenoLlevanElNombreYLaFotoDelComercio() {
        List<String> campos = Arrays.stream(PedidoResponseDTO.class.getDeclaredFields()).map(Field::getName).toList();

        assertTrue(campos.contains("comercioNombre"));
        assertTrue(campos.contains("comercioFotoUrl"));
    }
}
