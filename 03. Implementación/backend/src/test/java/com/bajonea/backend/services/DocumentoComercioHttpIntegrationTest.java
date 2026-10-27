package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Los endpoints de documentos del comercio por HTTP, con los filtros de seguridad y la resolución de
 * {@code X-Comercio-Id}: el contrato de cada ruta del Dueño y del Administrador, los códigos de error estables, las
 * cabeceras con que se entrega el archivo y quién no puede entrar (Cliente, Empleado, el otro rol, sin sesión). Dentro de
 * una transacción que se revierte.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DocumentoComercioHttpIntegrationTest {

    private static final String BASE = "/api/v1/comercios/documentos";
    private static final String ADMIN = "/api/v1/administrador";
    private static final byte[] PDF = "%PDF-1.4\n%prueba http\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1};
    private static final byte[] EJECUTABLE = {'M', 'Z', (byte) 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0};

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private TestSupportService testSupportService;

    @Autowired
    private DocumentacionComercioProperties propiedades;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private jakarta.persistence.EntityManager entityManager;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private Dueno dueno;
    private boolean requeridaOriginal;
    private int maxEnRevisionOriginal;
    private int maxTotalOriginal;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        requeridaOriginal = propiedades.isRequerida();
        maxEnRevisionOriginal = propiedades.getMaxEnRevision();
        maxTotalOriginal = propiedades.getMaxTotal();
        propiedades.setRequerida(true);
        dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        entityManager.flush();
        entityManager.clear();
    }

    @AfterEach
    void restaurar() {
        propiedades.setRequerida(requeridaOriginal);
        propiedades.setMaxEnRevision(maxEnRevisionOriginal);
        propiedades.setMaxTotal(maxTotalOriginal);
    }

    private static <T extends MockHttpServletRequestBuilder> T como(T request, RolUsuario rol, int usuarioId) {
        AuthenticatedUser principal = new AuthenticatedUser(usuarioId, 1, rol);
        request.with(authentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + rol.name())))));
        return request;
    }

    private MockHttpServletRequestBuilder delDueno(MockHttpServletRequestBuilder request) {
        return como(request, RolUsuario.DUENO, dueno.id()).header("X-Comercio-Id", dueno.comercioId());
    }

    private MockHttpServletRequestBuilder delAdministrador(MockHttpServletRequestBuilder request) {
        return como(request, RolUsuario.ADMINISTRADOR, administradorId());
    }

    private int administradorId() {
        return jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
    }

    private MockMultipartHttpServletRequestBuilder subida(String nombre, String tipoDeclarado, byte[] bytes, String tipo, String descripcion) {
        MockMultipartHttpServletRequestBuilder request = multipart(BASE);
        if (bytes != null) {
            request.file(new MockMultipartFile("archivo", nombre, tipoDeclarado, bytes));
        }
        if (tipo != null) {
            request.param("tipo", tipo);
        }
        if (descripcion != null) {
            request.param("descripcion", descripcion);
        }
        return request;
    }

    private ResultActions subirPdf() throws Exception {
        return mockMvc.perform(delDueno(subida("libreta.pdf", "application/pdf", PDF, "LIBRETA_SANITARIA", null)));
    }

    private int subirYDevolverId() throws Exception {
        return objectMapper.readTree(subirPdf().andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .path("data").path("id").asInt();
    }

    private JsonNode cuerpo(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    @Test
    void listarSinDocumentosDevuelveLosCuposYLosLimites() throws Exception {
        mockMvc.perform(delDueno(get(BASE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.documentos.length()").value(0))
                .andExpect(jsonPath("$.data.enRevision").value(0))
                .andExpect(jsonPath("$.data.maxEnRevision").value(5))
                .andExpect(jsonPath("$.data.total").value(0))
                .andExpect(jsonPath("$.data.maxTotal").value(20))
                .andExpect(jsonPath("$.data.maxBytes").value(8 * 1024 * 1024));
    }

    @Test
    void losRequisitosDicenQueFaltaParaEmpezarAVender() throws Exception {
        mockMvc.perform(delDueno(get(BASE + "/requisitos")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estadoComercio").value("APROBADO"))
                .andExpect(jsonPath("$.data.comercioAprobado").value(true))
                .andExpect(jsonPath("$.data.cuentaMercadoPagoVinculada").value(false))
                .andExpect(jsonPath("$.data.documentacionRequerida").value(true))
                .andExpect(jsonPath("$.data.aptoVenta").value(false))
                .andExpect(jsonPath("$.data.puedeSubir").value(true))
                .andExpect(jsonPath("$.data.faltan[0]").value("MERCADO_PAGO"))
                .andExpect(jsonPath("$.data.faltan[1]").value("DOCUMENTO_APROBADO"))
                .andExpect(jsonPath("$.data.tipos.length()").value(4))
                .andExpect(jsonPath("$.data.tipos[0].codigo").value("LIBRETA_SANITARIA"))
                .andExpect(jsonPath("$.data.tipos[0].etiqueta").value("Libreta sanitaria"))
                .andExpect(jsonPath("$.data.tipos[1].codigo").value("CARNET_MANIPULACION_ALIMENTOS"))
                .andExpect(jsonPath("$.data.tipos[3].codigo").value("OTRO"))
                .andExpect(jsonPath("$.data.tipos[3].requiereDescripcion").value(true))
                .andExpect(jsonPath("$.data.maxBytes").value(8 * 1024 * 1024))
                .andExpect(jsonPath("$.data.formatosPermitidos[0]").value("PDF"));
    }

    @Test
    void losRequisitosSiguenLasTransicionesDeLosDocumentos() throws Exception {
        testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
        int id = subirYDevolverId();

        mockMvc.perform(delDueno(get(BASE + "/requisitos")))
                .andExpect(jsonPath("$.data.cuentaMercadoPagoVinculada").value(true))
                .andExpect(jsonPath("$.data.documentosPendientes").value(1))
                .andExpect(jsonPath("$.data.faltan[0]").value("DOCUMENTO_APROBADO"))
                .andExpect(jsonPath("$.data.faltan[1]").value("REVISION_PENDIENTE"));

        mockMvc.perform(delAdministrador(put(ADMIN + "/documentos/" + id + "/resolver")
                .contentType(MediaType.APPLICATION_JSON).content("{\"aprobar\":true}"))).andExpect(status().isOk());

        mockMvc.perform(delDueno(get(BASE + "/requisitos")))
                .andExpect(jsonPath("$.data.estadoComercio").value("APTO_VENTA"))
                .andExpect(jsonPath("$.data.aptoVenta").value(true))
                .andExpect(jsonPath("$.data.documentosAprobados").value(1))
                .andExpect(jsonPath("$.data.faltan.length()").value(0));
    }

    @Test
    void subirUnPdfNaceEnRevisionConElTipoReal() throws Exception {
        subirPdf()
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mensaje").value("Documento subido. Lo vamos a revisar a la brevedad"))
                .andExpect(jsonPath("$.data.estado").value("PENDIENTE"))
                .andExpect(jsonPath("$.data.tipo").value("LIBRETA_SANITARIA"))
                .andExpect(jsonPath("$.data.tipoEtiqueta").value("Libreta sanitaria"))
                .andExpect(jsonPath("$.data.tipoMime").value("application/pdf"))
                .andExpect(jsonPath("$.data.nombreOriginal").value("libreta.pdf"))
                .andExpect(jsonPath("$.data.tamanoBytes").value(PDF.length))
                .andExpect(jsonPath("$.data.contenido").doesNotExist());
    }

    @Test
    void elTipoDelArchivoSeDecidePorSusBytesYNoPorLoQueDeclaraElNavegador() throws Exception {
        mockMvc.perform(delDueno(subida("foto.bin", "text/plain", JPEG, "HABILITACION_COMERCIAL", null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.tipoMime").value("image/jpeg"));
    }

    @Test
    void unEjecutableConExtensionPdfSeRechazaConSuCodigo() throws Exception {
        mockMvc.perform(delDueno(subida("libreta.pdf", "application/pdf", EJECUTABLE, "LIBRETA_SANITARIA", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_FORMATO_NO_PERMITIDO"))
                .andExpect(jsonPath("$.mensaje").value("Solo se aceptan archivos PDF, JPG, PNG o WebP"));

        assertEquals(0, documentosEnBase());
    }

    @Test
    void unArchivoVacioSeRechaza() throws Exception {
        mockMvc.perform(delDueno(subida("vacio.pdf", "application/pdf", new byte[0], "LIBRETA_SANITARIA", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_FORMATO_NO_PERMITIDO"))
                .andExpect(jsonPath("$.mensaje").value("El archivo está vacío"));
    }

    @Test
    void unArchivoMasGrandeQueElMaximoDiceCuantoPesaYCuantoSePermite() throws Exception {
        byte[] grande = new byte[(int) (11.4 * 1024 * 1024)];
        System.arraycopy(PDF, 0, grande, 0, PDF.length);

        mockMvc.perform(delDueno(subida("grande.pdf", "application/pdf", grande, "LIBRETA_SANITARIA", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_TAMANO_EXCEDIDO"))
                .andExpect(jsonPath("$.mensaje").value("El archivo pesa 11,4 MB y el máximo es 8 MB"));

        assertEquals(0, documentosEnBase());
    }

    @Test
    void unArchivoDeExactamenteElMaximoSeAcepta() throws Exception {
        byte[] justo = new byte[8 * 1024 * 1024];
        System.arraycopy(PDF, 0, justo, 0, PDF.length);

        mockMvc.perform(delDueno(subida("justo.pdf", "application/pdf", justo, "LIBRETA_SANITARIA", null)))
                .andExpect(status().isCreated());
        mockMvc.perform(delDueno(get(BASE)))
                .andExpect(jsonPath("$.data.documentos[0].tamanoBytes").value(8 * 1024 * 1024));
    }

    @Test
    void elMaximoSePuedeConfigurar() throws Exception {
        int original = propiedades.getMaxBytes();
        propiedades.setMaxBytes(1024 * 1024);
        try {
            byte[] dosMegas = new byte[2 * 1024 * 1024];
            System.arraycopy(PDF, 0, dosMegas, 0, PDF.length);

            mockMvc.perform(delDueno(subida("dos.pdf", "application/pdf", dosMegas, "LIBRETA_SANITARIA", null)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.mensaje").value("El archivo pesa 2 MB y el máximo es 1 MB"));
        } finally {
            propiedades.setMaxBytes(original);
        }
    }

    @Test
    void otroExigeDescripcionYElTipoElArchivoYElLargoSeValidanEnElDto() throws Exception {
        mockMvc.perform(delDueno(subida("a.pdf", "application/pdf", PDF, "OTRO", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.descripcionDeOtroCompleta").value("Contanos qué documento es"));
        mockMvc.perform(delDueno(subida("a.pdf", "application/pdf", PDF, "OTRO", "   ")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(delDueno(subida("a.pdf", "application/pdf", PDF, "OTRO", "x".repeat(101))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.descripcion").value("La descripción puede tener hasta 100 caracteres"));
        mockMvc.perform(delDueno(subida("a.pdf", "application/pdf", PDF, null, null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.tipo").value("Elegí el tipo de documento"));
        mockMvc.perform(delDueno(subida(null, null, null, "LIBRETA_SANITARIA", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.archivo").value("Elegí el archivo que vas a subir"));
        mockMvc.perform(delDueno(subida("a.pdf", "application/pdf", PDF, "TIPO_QUE_NO_EXISTE", null)))
                .andExpect(status().isBadRequest());

        assertEquals(0, documentosEnBase());
    }

    @Test
    void otroConDescripcionSeGuardaYLosDemasTiposIgnoranLaDescripcion() throws Exception {
        mockMvc.perform(delDueno(subida("a.pdf", "application/pdf", PDF, "OTRO", "  Certificado de bomberos ")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.descripcion").value("Certificado de bomberos"));
        mockMvc.perform(delDueno(subida("b.pdf", "application/pdf", PDF, "CARNET_MANIPULACION_ALIMENTOS", "esto se ignora")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.descripcion").doesNotExist());
    }

    @Test
    void elNombreOriginalSeGuardaSinRutasNiCaracteresDeControl() throws Exception {
        mockMvc.perform(delDueno(subida("..\\..\\carpeta/mi libreta\t2026.pdf", "application/pdf", PDF, "LIBRETA_SANITARIA", null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.nombreOriginal").value("mi libreta2026.pdf"));
    }

    @Test
    void elSextoDocumentoEnRevisionSeRechazaConSuCodigoYAlResolverUnoSePuedeSubirOtro() throws Exception {
        List<Integer> ids = new java.util.ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ids.add(subirYDevolverId());
        }

        subirPdf().andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_CUPO_REVISION"));

        mockMvc.perform(delAdministrador(put(ADMIN + "/documentos/" + ids.get(0) + "/resolver")
                .contentType(MediaType.APPLICATION_JSON).content("{\"aprobar\":false,\"motivo\":\"Ilegible\"}")))
                .andExpect(status().isOk());

        subirPdf().andExpect(status().isCreated());
    }

    @Test
    void elTopeTotalCuentaTambienLosRechazados() throws Exception {
        propiedades.setMaxEnRevision(100);
        propiedades.setMaxTotal(3);
        for (int i = 0; i < 3; i++) {
            int id = subirYDevolverId();
            mockMvc.perform(delAdministrador(put(ADMIN + "/documentos/" + id + "/resolver")
                    .contentType(MediaType.APPLICATION_JSON).content("{\"aprobar\":false,\"motivo\":\"No sirve\"}")))
                    .andExpect(status().isOk());
        }

        subirPdf().andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_CUPO_TOTAL"));
    }

    @Test
    void soloSePuedeSubirConElComercioAprobadoAptoParaVenderOCerradoTemporalmente() throws Exception {
        for (EstadoComercio estado : EstadoComercio.values()) {
            datos.cambiarEstadoComercio(dueno.comercioId(), estado.name());
            entityManager.clear();
            boolean permitido = estado == EstadoComercio.APROBADO || estado == EstadoComercio.APTO_VENTA
                    || estado == EstadoComercio.CERRADO_TEMPORALMENTE;
            ResultActions resultado = subirPdf();
            if (permitido) {
                resultado.andExpect(status().isCreated());
            } else {
                resultado.andExpect(status().isConflict())
                        .andExpect(jsonPath("$.data.codigo").value("COMERCIO_ESTADO_NO_PERMITE_DOCUMENTOS"));
            }
        }
    }

    @Test
    void elArchivoSeEntregaIntegroYConLasCabecerasDeSeguridad() throws Exception {
        int id = subirYDevolverId();

        byte[] recibido = mockMvc.perform(delDueno(get(BASE + "/" + id + "/archivo")))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/pdf"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.allOf(org.hamcrest.Matchers.startsWith("inline;"), org.hamcrest.Matchers.containsString("libreta.pdf"))))
                .andReturn().getResponse().getContentAsByteArray();

        assertArrayEquals(PDF, recibido);
    }

    @Test
    void elNombreConAcentosViajaCodificadoEnLaCabecera() throws Exception {
        MockMultipartHttpServletRequestBuilder request = subida("Libreta sanitaria ñandú.pdf", "application/pdf", PDF, "LIBRETA_SANITARIA", null);
        int id = cuerpo(mockMvc.perform(delDueno(request)).andExpect(status().isCreated())).path("data").path("id").asInt();

        String disposicion = mockMvc.perform(delDueno(get(BASE + "/" + id + "/archivo")))
                .andExpect(status().isOk()).andReturn().getResponse().getHeader("Content-Disposition");

        assertTrue(disposicion.startsWith("inline;") && disposicion.contains("filename*=UTF-8''"), disposicion);
        assertTrue(disposicion.contains("%C3%B1and%C3%BA"), disposicion);
    }

    @Test
    void elDuenoSoloPuedeEliminarSusDocumentosEnRevision() throws Exception {
        testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
        int pendiente = subirYDevolverId();
        int aprobado = subirYDevolverId();
        int rechazado = subirYDevolverId();
        resolver(aprobado, "{\"aprobar\":true}");
        resolver(rechazado, "{\"aprobar\":false,\"motivo\":\"Falta firma\"}");

        mockMvc.perform(delDueno(delete(BASE + "/" + aprobado)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_NO_ELIMINABLE"));
        mockMvc.perform(delDueno(delete(BASE + "/" + rechazado)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_NO_ELIMINABLE"));
        mockMvc.perform(delDueno(delete(BASE + "/" + pendiente)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mensaje").value("Documento eliminado"));

        assertEquals(2, documentosEnBase());
        assertEquals(0, archivosDe(pendiente));
        assertEquals(1, archivosDe(aprobado));
        mockMvc.perform(delDueno(delete(BASE + "/" + pendiente))).andExpect(status().isNotFound());
    }

    @Test
    void unDocumentoDeOtroComercioEsUn404IdenticoAlDeUnoInexistente() throws Exception {
        Dueno otro = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(otro.id(), "ACTIVO");
        int ajeno = cuerpo(mockMvc.perform(como(subida("x.pdf", "application/pdf", PDF, "LIBRETA_SANITARIA", null), RolUsuario.DUENO, otro.id())
                .header("X-Comercio-Id", otro.comercioId())).andExpect(status().isCreated())).path("data").path("id").asInt();

        String ajenoCuerpo = mockMvc.perform(delDueno(get(BASE + "/" + ajeno + "/archivo")))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String inexistenteCuerpo = mockMvc.perform(delDueno(get(BASE + "/99999999/archivo")))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        assertEquals(inexistenteCuerpo, ajenoCuerpo);
        mockMvc.perform(delDueno(delete(BASE + "/" + ajeno))).andExpect(status().isNotFound());
        assertEquals(1, archivosDe(ajeno));
        mockMvc.perform(delDueno(get(BASE))).andExpect(jsonPath("$.data.documentos.length()").value(0));
    }

    @Test
    void elDuenoNoPuedeVerDocumentosDeUnComercioQueNoEsSuyoNiConElHeader() throws Exception {
        Dueno otro = datos.registrarDuenoAprobado();

        mockMvc.perform(como(get(BASE), RolUsuario.DUENO, dueno.id()).header("X-Comercio-Id", otro.comercioId()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.codigo").value("COMERCIO_NO_DISPONIBLE"));
        mockMvc.perform(como(get(BASE), RolUsuario.DUENO, dueno.id())).andExpect(status().isBadRequest());
    }

    @Test
    void ElClienteElEmpleadoElAdministradorYQuienNoTieneSesionNoEntranAlasRutasDelDueno() throws Exception {
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(3));
        int id = subirYDevolverId();

        for (String ruta : List.of(BASE, BASE + "/requisitos", BASE + "/" + id + "/archivo")) {
            mockMvc.perform(como(get(ruta), RolUsuario.CLIENTE, empleado.id()).header("X-Comercio-Id", dueno.comercioId()))
                    .andExpect(status().isForbidden());
            mockMvc.perform(como(get(ruta), RolUsuario.CLIENTE, empleado.id())).andExpect(status().isForbidden());
            mockMvc.perform(como(get(ruta), RolUsuario.ADMINISTRADOR, administradorId()).header("X-Comercio-Id", dueno.comercioId()))
                    .andExpect(status().isForbidden());
            mockMvc.perform(get(ruta)).andExpect(status().isUnauthorized());
        }
        mockMvc.perform(como(subida("x.pdf", "application/pdf", PDF, "LIBRETA_SANITARIA", null), RolUsuario.CLIENTE, empleado.id())
                .header("X-Comercio-Id", dueno.comercioId())).andExpect(status().isForbidden());
        mockMvc.perform(como(delete(BASE + "/" + id), RolUsuario.CLIENTE, empleado.id())
                .header("X-Comercio-Id", dueno.comercioId())).andExpect(status().isForbidden());
        assertEquals(1, documentosEnBase());
    }

    @Test
    void laBandejaDelAdministradorVaDelMasAntiguoAlMasNuevoYTrae_comercioYDueno() throws Exception {
        int primero = subirYDevolverId();
        int segundo = subirYDevolverId();
        int tercero = subirYDevolverId();
        jdbcTemplate.update("UPDATE documento_comercio SET fecha_subida = ? WHERE id = ?", LocalDateTime.now().minusDays(1), tercero);
        jdbcTemplate.update("UPDATE documento_comercio SET fecha_subida = ? WHERE id = ?", LocalDateTime.now().minusDays(3), segundo);
        jdbcTemplate.update("UPDATE documento_comercio SET fecha_subida = ? WHERE id = ?", LocalDateTime.now().minusDays(2), primero);
        resolver(primero, "{\"aprobar\":true}");

        JsonNode datosBandeja = cuerpo(mockMvc.perform(delAdministrador(get(ADMIN + "/documentos/pendientes")))
                .andExpect(status().isOk()));

        List<Integer> propios = new java.util.ArrayList<>();
        for (JsonNode fila : datosBandeja.path("data")) {
            if (fila.path("comercioId").asInt() == dueno.comercioId()) {
                propios.add(fila.path("id").asInt());
                assertEquals(dueno.nombreComercio(), fila.path("nombreComercio").asText());
                assertEquals(dueno.id(), fila.path("duenoId").asInt());
                assertFalse(fila.path("nombreDueno").asText().isBlank());
                assertEquals("Libreta sanitaria", fila.path("tipoEtiqueta").asText());
                assertTrue(fila.has("cuentaMercadoPagoVinculada"));
            }
        }
        assertEquals(List.of(segundo, tercero), propios);
        List<LocalDateTime> fechas = jdbcTemplate.query("SELECT fecha_subida FROM documento_comercio WHERE estado = 'PENDIENTE' ORDER BY fecha_subida ASC, id ASC",
                (rs, n) -> rs.getTimestamp(1).toLocalDateTime());
        assertEquals(fechas.size(), datosBandeja.path("data").size());
    }

    @Test
    void elAdministradorAprobaRechazaYRevocaConLosCodigosDeError() throws Exception {
        testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
        int id = subirYDevolverId();

        resolverEsperando(id, "{\"aprobar\":false}", 400)
                .andExpect(jsonPath("$.data.motivoCompletoAlRechazar").value("El motivo es obligatorio al rechazar un documento"));
        resolverEsperando(id, "{\"aprobar\":false,\"motivo\":\"   \"}", 400);
        resolverEsperando(id, "{\"motivo\":\"x\"}", 400)
                .andExpect(jsonPath("$.data.aprobar").value("Indicá si aprobás o rechazás el documento"));
        resolverEsperando(id, "{\"aprobar\":false,\"motivo\":\"" + "m".repeat(256) + "\"}", 400);
        resolverEsperando(id, "{\"aprobar\":true}", 200)
                .andExpect(jsonPath("$.mensaje").value("Documento aprobado"))
                .andExpect(jsonPath("$.data.estado").value("APROBADO"));
        resolverEsperando(id, "{\"aprobar\":true}", 409).andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_YA_RESUELTO"));
        resolverEsperando(id, "{\"aprobar\":false,\"motivo\":\"Venció\"}", 200)
                .andExpect(jsonPath("$.mensaje").value("Documento rechazado"))
                .andExpect(jsonPath("$.data.estado").value("RECHAZADO"))
                .andExpect(jsonPath("$.data.motivoRechazo").value("Venció"));
        resolverEsperando(id, "{\"aprobar\":true}", 409).andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_YA_RESUELTO"));
        resolverEsperando(id, "{\"aprobar\":false,\"motivo\":\"Otra vez\"}", 409).andExpect(jsonPath("$.data.codigo").value("DOCUMENTO_YA_RESUELTO"));
        resolverEsperando(99999999, "{\"aprobar\":true}", 404);

        assertEquals("Venció", jdbcTemplate.queryForObject("SELECT motivo_rechazo FROM documento_comercio WHERE id = ?", String.class, id));
        assertEquals(administradorId(), jdbcTemplate.queryForObject("SELECT administrador_id FROM documento_comercio WHERE id = ?", Integer.class, id));
    }

    @Test
    void alAprobarSeBorraElMotivoYElDuenoVeElMotivoDelRechazo() throws Exception {
        int id = subirYDevolverId();
        resolver(id, "{\"aprobar\":false,\"motivo\":\"Falta la firma\"}");

        mockMvc.perform(delDueno(get(BASE)))
                .andExpect(jsonPath("$.data.documentos[0].estado").value("RECHAZADO"))
                .andExpect(jsonPath("$.data.documentos[0].motivoRechazo").value("Falta la firma"))
                .andExpect(jsonPath("$.data.documentos[0].fechaResolucion").exists());
        String aviso = jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = 'DOCUMENTO_RECHAZADO'",
                String.class, dueno.id());
        assertTrue(aviso.contains("Falta la firma") && aviso.contains("fue rechazado"), aviso);
    }

    @Test
    void elAdministradorVeLosDocumentosYElArchivoDeCualquierComercio() throws Exception {
        int id = subirYDevolverId();

        mockMvc.perform(delAdministrador(get(ADMIN + "/comercios/" + dueno.comercioId() + "/documentos")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(id));
        mockMvc.perform(delAdministrador(get(ADMIN + "/comercios/99999999/documentos"))).andExpect(status().isNotFound());
        byte[] archivo = mockMvc.perform(delAdministrador(get(ADMIN + "/documentos/" + id + "/archivo")))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsByteArray();
        assertArrayEquals(PDF, archivo);
        mockMvc.perform(delAdministrador(get(ADMIN + "/documentos/99999999/archivo"))).andExpect(status().isNotFound());
    }

    @Test
    void lasRutasDelAdministradorNoLasUsanElDuenoNiElClienteNiQuienNoTieneSesion() throws Exception {
        int id = subirYDevolverId();
        for (String ruta : List.of(ADMIN + "/documentos/pendientes", ADMIN + "/comercios/" + dueno.comercioId() + "/documentos",
                ADMIN + "/documentos/" + id + "/archivo")) {
            mockMvc.perform(delDueno(get(ruta))).andExpect(status().isForbidden());
            mockMvc.perform(como(get(ruta), RolUsuario.CLIENTE, dueno.id())).andExpect(status().isForbidden());
            mockMvc.perform(get(ruta)).andExpect(status().isUnauthorized());
        }
        mockMvc.perform(delDueno(put(ADMIN + "/documentos/" + id + "/resolver").contentType(MediaType.APPLICATION_JSON)
                .content("{\"aprobar\":true}"))).andExpect(status().isForbidden());
        mockMvc.perform(put(ADMIN + "/documentos/" + id + "/resolver").contentType(MediaType.APPLICATION_JSON)
                .content("{\"aprobar\":true}")).andExpect(status().isUnauthorized());
        assertEquals("PENDIENTE", jdbcTemplate.queryForObject("SELECT estado FROM documento_comercio WHERE id = ?", String.class, id));
    }

    @Test
    void lasMetricasDelDashboardCuentanLosDocumentosPendientes() throws Exception {
        long antes = cuerpo(mockMvc.perform(delAdministrador(get(ADMIN + "/metricas")))).path("data").path("documentosPendientes").asLong();
        int id = subirYDevolverId();
        subirYDevolverId();

        mockMvc.perform(delAdministrador(get(ADMIN + "/metricas")))
                .andExpect(jsonPath("$.data.documentosPendientes").value(antes + 2));

        resolver(id, "{\"aprobar\":true}");
        mockMvc.perform(delAdministrador(get(ADMIN + "/metricas")))
                .andExpect(jsonPath("$.data.documentosPendientes").value(antes + 1));
    }

    private void resolver(int id, String json) throws Exception {
        resolverEsperando(id, json, 200);
    }

    private ResultActions resolverEsperando(int id, String json, int estado) throws Exception {
        return mockMvc.perform(delAdministrador(put(ADMIN + "/documentos/" + id + "/resolver")
                .contentType(MediaType.APPLICATION_JSON).content(json))).andExpect(status().is(estado));
    }

    private long documentosEnBase() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM documento_comercio WHERE comercio_id = ?", Long.class, dueno.comercioId());
    }

    private long archivosDe(int documentoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM documento_comercio_archivo WHERE documento_id = ?", Long.class, documentoId);
    }
}
