package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

/**
 * Las fotos adjuntas a un reclamo (Fase 5, tramo S5): hasta tres de 5 MB, validadas por el contenido del archivo, guardadas
 * junto con el reclamo en una sola transacción, visibles solo para el Administrador.
 */
class ReclamoFotosIntegrationTest extends ReclamoIntegrationBase {

    private static final String CLIENTE = "/api/v1/pedidos/cliente";
    private static final String ADMIN = "/api/v1/administrador/reclamos";
    private static final int CINCO_MB = 5 * 1024 * 1024;

    @Autowired
    private MockMvc mockMvc;

    private static byte[] jpeg(int tamano, int marca) {
        byte[] bytes = new byte[tamano];
        bytes[0] = (byte) 0xFF;
        bytes[1] = (byte) 0xD8;
        bytes[2] = (byte) 0xFF;
        for (int i = 3; i < Math.min(tamano, 16); i++) {
            bytes[i] = (byte) marca;
        }
        return bytes;
    }

    private static byte[] png() {
        byte[] bytes = new byte[64];
        byte[] firma = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        System.arraycopy(firma, 0, bytes, 0, firma.length);
        return bytes;
    }

    private static byte[] webp() {
        byte[] bytes = new byte[64];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, bytes, 0, 4);
        System.arraycopy("WEBP".getBytes(StandardCharsets.US_ASCII), 0, bytes, 8, 4);
        return bytes;
    }

    private static byte[] heic() {
        byte[] bytes = new byte[64];
        System.arraycopy("ftypheic".getBytes(StandardCharsets.US_ASCII), 0, bytes, 4, 8);
        return bytes;
    }

    private static byte[] pdf() {
        return "%PDF-1.4 contenido".getBytes(StandardCharsets.US_ASCII);
    }

    private static MockMultipartFile foto(String nombre, byte[] bytes) {
        return new MockMultipartFile("fotos", nombre, "image/jpeg", bytes);
    }

    private ResultActions enviar(int cliente, int pedidoId, MockMultipartFile... fotos) throws Exception {
        MockMultipartHttpServletRequestBuilder request = multipart(CLIENTE + "/" + pedidoId + "/reclamo");
        request.file(new MockMultipartFile("reclamo", "", "application/json",
                ("{\"motivo\":\"FALTAN_PRODUCTOS\",\"descripcion\":\"" + DESCRIPCION + "\"}").getBytes(StandardCharsets.UTF_8)));
        for (MockMultipartFile foto : fotos) {
            request.file(foto);
        }
        return mockMvc.perform(request.with(como(RolUsuario.CLIENTE, cliente)));
    }

    private JsonNode cuerpo(ResultActions accion) throws Exception {
        return objectMapper.readTree(accion.andReturn().getResponse().getContentAsString());
    }

    private int totalFotos() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo_foto", Integer.class);
    }

    private int totalArchivos() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo_foto_archivo", Integer.class);
    }

    private int reclamosDelPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM reclamo WHERE pedido_id = ?", Integer.class, pedidoId);
    }

    @Test
    void sinFotosElReclamoSeCreaIgualConCeroFotos() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);

        JsonNode respuesta = cuerpo(enviar(cliente, pedidoId).andExpect(status().isCreated()));

        assertEquals(0, respuesta.path("data").path("cantidadFotos").asInt(-1));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM reclamo_foto WHERE reclamo_id = ?", Integer.class, reclamoId(pedidoId)));
    }

    @Test
    void elPedidoJsonSinFotosSigueFuncionandoComoAntes() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);

        JsonNode respuesta = cuerpo(mockMvc.perform(post(CLIENTE + "/" + pedidoId + "/reclamo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"motivo\":\"OTRO\",\"descripcion\":\"" + DESCRIPCION + "\"}")
                        .with(como(RolUsuario.CLIENTE, cliente)))
                .andExpect(status().isCreated()));

        assertEquals(0, respuesta.path("data").path("cantidadFotos").asInt(-1));
    }

    @Test
    void unaDosOTresFotosSeGuardanConSuOrdenTipoYTamano() throws Exception {
        Dueno dueno = duenoConCuenta();
        for (int cantidad = 1; cantidad <= 3; cantidad++) {
            int cliente = datos.registrarCliente();
            int pedidoId = pedidoEntregado(cliente, dueno);
            MockMultipartFile[] fotos = {foto("uno.jpg", jpeg(1000, 1)), new MockMultipartFile("fotos", "dos.png", "image/png", png()),
                    new MockMultipartFile("fotos", "tres.webp", "image/webp", webp())};

            JsonNode respuesta = cuerpo(enviar(cliente, pedidoId, Arrays.copyOf(fotos, cantidad)).andExpect(status().isCreated()));

            assertEquals(cantidad, respuesta.path("data").path("cantidadFotos").asInt());
            List<Map<String, Object>> filas = jdbcTemplate.queryForList(
                    "SELECT orden, nombre_original, tipo_contenido, tamano_bytes FROM reclamo_foto WHERE reclamo_id = ? ORDER BY orden",
                    reclamoId(pedidoId));
            assertEquals(cantidad, filas.size());
            String[] nombres = {"uno.jpg", "dos.png", "tres.webp"};
            String[] tipos = {"image/jpeg", "image/png", "image/webp"};
            int[] tamanos = {1000, 64, 64};
            for (int i = 0; i < cantidad; i++) {
                assertEquals(i + 1, ((Number) filas.get(i).get("orden")).intValue());
                assertEquals(nombres[i], filas.get(i).get("nombre_original"));
                assertEquals(tipos[i], filas.get(i).get("tipo_contenido"));
                assertEquals(tamanos[i], ((Number) filas.get(i).get("tamano_bytes")).intValue());
            }
            assertEquals(cantidad, jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM reclamo_foto_archivo a JOIN reclamo_foto f ON f.id = a.foto_id WHERE f.reclamo_id = ?",
                    Integer.class, reclamoId(pedidoId)));
        }
    }

    @Test
    void laCuartaFotoRechazaTodoElEnvioYNoCreaElReclamo() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        int antes = totalFotos();

        enviar(cliente, pedidoId, foto("1.jpg", jpeg(100, 1)), foto("2.jpg", jpeg(100, 2)), foto("3.jpg", jpeg(100, 3)), foto("4.jpg", jpeg(100, 4)))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.codigo").value("RECLAMO_FOTO_CANTIDAD_EXCEDIDA"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.mensaje").value("Podés adjuntar hasta 3 fotos"));

        assertEquals(0, reclamosDelPedido(pedidoId));
        assertEquals(antes, totalFotos());
    }

    @Test
    void unaFotoDeCincoMbJustosSeAceptaYUnaDeUnByteMasNo() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);

        enviar(cliente, pedidoId, foto("justa.jpg", jpeg(CINCO_MB + 1, 7))).andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.codigo").value("RECLAMO_FOTO_TAMANO_EXCEDIDO"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.mensaje").value("Una foto supera el máximo de 5 MB"));
        assertEquals(0, reclamosDelPedido(pedidoId));

        enviar(cliente, pedidoId, foto("grande.jpg", jpeg(CINCO_MB + 3 * 1024 * 1024, 7))).andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.mensaje").value("Una foto pesa 8 MB y el máximo es 5 MB"));
        assertEquals(0, reclamosDelPedido(pedidoId));

        enviar(cliente, pedidoId, foto("justa.jpg", jpeg(CINCO_MB, 7))).andExpect(status().isCreated());
        assertEquals(1, reclamosDelPedido(pedidoId));
        assertEquals(CINCO_MB, jdbcTemplate.queryForObject(
                "SELECT tamano_bytes FROM reclamo_foto WHERE reclamo_id = ?", Integer.class, reclamoId(pedidoId)));
    }

    @Test
    void losFormatosNoAdmitidosSeRechazanPorElContenidoNoPorLaExtension() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        byte[] texto = "esto no es una imagen".getBytes(StandardCharsets.UTF_8);

        enviar(cliente, pedidoId, foto("disfrazada.jpg", texto)).andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.codigo").value("RECLAMO_FOTO_FORMATO_NO_PERMITIDO"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.mensaje").value("Solo se aceptan fotos en formato JPG, PNG o WebP"));
        enviar(cliente, pedidoId, foto("documento.jpg", pdf())).andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.codigo").value("RECLAMO_FOTO_FORMATO_NO_PERMITIDO"));
        enviar(cliente, pedidoId, foto("iphone.heic", heic())).andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.codigo").value("RECLAMO_FOTO_FORMATO_NO_PERMITIDO"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.mensaje").value(
                        "Las fotos HEIC de iPhone no se pueden adjuntar. Usá una foto en formato JPG, PNG o WebP"));
        enviar(cliente, pedidoId, foto("vacia.jpg", new byte[0])).andExpect(status().isBadRequest());

        assertEquals(0, reclamosDelPedido(pedidoId));
    }

    @Test
    void unaFotoInvalidaEntreFotosValidasNoDejaNadaGuardado() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        int fotosAntes = totalFotos();
        int archivosAntes = totalArchivos();

        enviar(cliente, pedidoId, foto("ok.jpg", jpeg(100, 1)), foto("mala.jpg", pdf())).andExpect(status().isBadRequest());

        assertEquals(0, reclamosDelPedido(pedidoId));
        assertEquals(fotosAntes, totalFotos());
        assertEquals(archivosAntes, totalArchivos());
    }

    @Test
    void unSegundoEnvioParaElMismoPedidoNoDejaFotosHuerfanas() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        enviar(cliente, pedidoId, foto("a.jpg", jpeg(100, 1)), foto("b.jpg", jpeg(100, 2))).andExpect(status().isCreated());
        int fotosAntes = totalFotos();
        int archivosAntes = totalArchivos();

        enviar(cliente, pedidoId, foto("c.jpg", jpeg(100, 3)), foto("d.jpg", jpeg(100, 4)), foto("e.jpg", jpeg(100, 5)))
                .andExpect(status().isConflict());

        assertEquals(fotosAntes, totalFotos());
        assertEquals(archivosAntes, totalArchivos());
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM reclamo_foto WHERE reclamo_id = ?", Integer.class, reclamoId(pedidoId)));
    }

    @Test
    void unPedidoAjenoOInexistenteDaCuatrocientosCuatroAunConFotos() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int otro = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);

        enviar(otro, pedidoId, foto("a.jpg", jpeg(100, 1))).andExpect(status().isNotFound());
        enviar(cliente, 999999999, foto("a.jpg", jpeg(100, 1))).andExpect(status().isNotFound());

        assertEquals(0, reclamosDelPedido(pedidoId));
    }

    @Test
    void soloElAdministradorVeLasFotosYLosDemasSoloLaCantidad() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        int pedidoId = pedidoEntregado(cliente, dueno);
        llegoPagado(pedidoId);
        byte[] contenido = jpeg(2048, 9);
        enviar(cliente, pedidoId, foto("remera rota.jpg", contenido), new MockMultipartFile("fotos", "dos.png", "image/png", png()))
                .andExpect(status().isCreated());
        int reclamoId = reclamoId(pedidoId);
        int fotoId = jdbcTemplate.queryForObject("SELECT id FROM reclamo_foto WHERE reclamo_id = ? AND orden = 1", Integer.class, reclamoId);
        String comercio = String.valueOf(dueno.comercioId());

        JsonNode detalle = cuerpo(mockMvc.perform(get(ADMIN + "/" + reclamoId).with(como(RolUsuario.ADMINISTRADOR, adminId())))
                .andExpect(status().isOk())).path("data");
        assertEquals(2, detalle.path("fotos").size());
        assertEquals(fotoId, detalle.path("fotos").get(0).path("id").asInt());
        assertEquals(1, detalle.path("fotos").get(0).path("orden").asInt());
        assertEquals("remera rota.jpg", detalle.path("fotos").get(0).path("nombre").asText());
        assertEquals(2048, detalle.path("fotos").get(0).path("tamanoBytes").asInt());
        assertFalse(detalle.path("fotos").get(0).has("contenido"));

        JsonNode delCliente = cuerpo(mockMvc.perform(get(CLIENTE).with(como(RolUsuario.CLIENTE, cliente))).andExpect(status().isOk()))
                .path("data").get(0).path("reclamo");
        assertEquals(2, delCliente.path("cantidadFotos").asInt());
        assertFalse(delCliente.has("fotos"));

        JsonNode delDueno = cuerpo(mockMvc.perform(get("/api/v1/pedidos/comercio").header("X-Comercio-Id", comercio)
                .with(como(RolUsuario.DUENO, dueno.id()))).andExpect(status().isOk())).path("data").get(0);
        assertFalse(delDueno.toString().contains("cantidadFotos"));
        assertFalse(delDueno.toString().contains("fotos"));

        JsonNode delEmpleado = cuerpo(mockMvc.perform(get("/api/v1/pedidos/comercio").header("X-Comercio-Id", comercio)
                .with(como(RolUsuario.CLIENTE, empleado.id()))).andExpect(status().isOk())).path("data").get(0);
        assertFalse(delEmpleado.toString().toLowerCase().contains("foto"));
        assertFalse(delEmpleado.has("reclamo"));

        String ruta = ADMIN + "/" + reclamoId + "/fotos/" + fotoId;
        mockMvc.perform(get(ruta).with(como(RolUsuario.CLIENTE, cliente))).andExpect(status().isForbidden());
        mockMvc.perform(get(ruta).with(como(RolUsuario.DUENO, dueno.id()))).andExpect(status().isForbidden());
        mockMvc.perform(get(ruta).with(como(RolUsuario.CLIENTE, empleado.id()))).andExpect(status().isForbidden());
        mockMvc.perform(get(ruta)).andExpect(status().isUnauthorized());
    }

    @Test
    void elAdministradorDescargaLaFotoConSuTipoRealYLosEncabezadosSeguros() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        byte[] contenido = jpeg(3000, 5);
        enviar(cliente, pedidoId, foto("evidencia.jpg", contenido)).andExpect(status().isCreated());
        int reclamoId = reclamoId(pedidoId);
        int fotoId = jdbcTemplate.queryForObject("SELECT id FROM reclamo_foto WHERE reclamo_id = ?", Integer.class, reclamoId);

        MockHttpServletResponse respuesta = mockMvc.perform(get(ADMIN + "/" + reclamoId + "/fotos/" + fotoId)
                        .with(como(RolUsuario.ADMINISTRADOR, adminId())))
                .andExpect(status().isOk()).andReturn().getResponse();

        assertEquals("image/jpeg", respuesta.getContentType());
        assertEquals("nosniff", respuesta.getHeader("X-Content-Type-Options"));
        assertTrue(respuesta.getHeader("Content-Disposition").startsWith("inline"));
        assertTrue(respuesta.getHeader("Cache-Control").contains("no-store"));
        assertArrayEquals(contenido, respuesta.getContentAsByteArray());
    }

    @Test
    void unaFotoDeOtroReclamoOInexistenteDaCuatrocientosCuatro() throws Exception {
        Dueno dueno = duenoConCuenta();
        int primero = datos.registrarCliente();
        int segundo = datos.registrarCliente();
        int pedidoUno = pedidoEntregado(primero, dueno);
        int pedidoDos = pedidoEntregado(segundo, dueno);
        enviar(primero, pedidoUno, foto("uno.jpg", jpeg(100, 1))).andExpect(status().isCreated());
        enviar(segundo, pedidoDos, foto("dos.jpg", jpeg(100, 2))).andExpect(status().isCreated());
        int fotoDelUno = jdbcTemplate.queryForObject("SELECT id FROM reclamo_foto WHERE reclamo_id = ?", Integer.class, reclamoId(pedidoUno));

        mockMvc.perform(get(ADMIN + "/" + reclamoId(pedidoDos) + "/fotos/" + fotoDelUno)
                .with(como(RolUsuario.ADMINISTRADOR, adminId()))).andExpect(status().isNotFound());
        mockMvc.perform(get(ADMIN + "/" + reclamoId(pedidoUno) + "/fotos/999999999")
                .with(como(RolUsuario.ADMINISTRADOR, adminId()))).andExpect(status().isNotFound());
        mockMvc.perform(get(ADMIN + "/999999999/fotos/" + fotoDelUno)
                .with(como(RolUsuario.ADMINISTRADOR, adminId()))).andExpect(status().isNotFound());
    }

    @Test
    void resolverElReclamoNoTocaLasFotos() throws Exception {
        Dueno dueno = duenoConCuenta();
        int cliente = datos.registrarCliente();
        int pedidoId = pedidoEntregado(cliente, dueno);
        enviar(cliente, pedidoId, foto("uno.jpg", jpeg(100, 1))).andExpect(status().isCreated());

        rechazar(pedidoId, "No corresponde el reclamo");

        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM reclamo_foto WHERE reclamo_id = ?", Integer.class, reclamoId(pedidoId)));
        JsonNode delCliente = cuerpo(mockMvc.perform(get(CLIENTE).with(como(RolUsuario.CLIENTE, cliente))).andExpect(status().isOk()))
                .path("data").get(0).path("reclamo");
        assertEquals(1, delCliente.path("cantidadFotos").asInt());
    }
}
