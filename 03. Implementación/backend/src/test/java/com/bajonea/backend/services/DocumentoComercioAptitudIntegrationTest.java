package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.ConfirmarRecuperacionPasswordRequestDTO;
import com.bajonea.backend.dto.request.ResolverDocumentoRequestDTO;
import com.bajonea.backend.dto.request.SubirDocumentoComercioRequestDTO;
import com.bajonea.backend.dto.response.DocumentoComercioResponseDTO;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoDocumentoComercio;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.CredencialesInvalidasException;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * La regla de aptitud de venta con documentos, escenario por escenario (tabla de la sección 3.4 de
 * docs/AUDITORIA-FASE4-DOCUMENTOS.md), contra {@code bajonea_test}, con la exigencia de documentación encendida
 * (en el perfil de test viene apagada). Todo corre dentro de una transacción que se revierte. Las carreras reales
 * viven en {@code DocumentoComercioConcurrenciaIntegrationTest}.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DocumentoComercioAptitudIntegrationTest {

    private static final byte[] PDF = "%PDF-1.4\n%contenido de prueba\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);

    @Autowired
    private RegistroService registroService;

    @Autowired
    private DocumentoComercioService documentoComercioService;

    @Autowired
    private RevisionDocumentoService revisionDocumentoService;

    @Autowired
    private AdministradorService administradorService;

    @Autowired
    private MercadoPagoOAuthService mercadoPagoOAuthService;

    @Autowired
    private TestSupportService testSupportService;

    @Autowired
    private AuthService authService;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private DocumentacionComercioProperties propiedades;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EntityManager entityManager;

    @MockitoBean
    private EmailService emailService;

    private DatosPruebaEmpleado datos;
    private boolean requeridaOriginal;

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        requeridaOriginal = propiedades.isRequerida();
        propiedades.setRequerida(true);
    }

    @AfterEach
    void restaurar() {
        propiedades.setRequerida(requeridaOriginal);
    }

    private Dueno duenoAprobado() {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        entityManager.flush();
        entityManager.clear();
        return dueno;
    }

    private Dueno duenoConMercadoPago() {
        Dueno dueno = duenoAprobado();
        testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
        return dueno;
    }

    private ComercioActivo activo(Dueno dueno) {
        return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.valueOf(estado(dueno)));
    }

    private DocumentoComercioResponseDTO subir(Dueno dueno) {
        return subir(dueno, TipoDocumentoComercio.LIBRETA_SANITARIA, null);
    }

    private DocumentoComercioResponseDTO subir(Dueno dueno, TipoDocumentoComercio tipo, String descripcion) {
        SubirDocumentoComercioRequestDTO request = new SubirDocumentoComercioRequestDTO();
        request.setTipo(tipo);
        request.setDescripcion(descripcion);
        request.setArchivo(new MockMultipartFile("archivo", "documento.pdf", "application/pdf", PDF));
        DocumentoComercioResponseDTO documento = documentoComercioService.subir(activo(dueno), request);
        entityManager.flush();
        entityManager.clear();
        return documento;
    }

    private void aprobar(int documentoId) {
        resolver(documentoId, true, null);
    }

    private void rechazar(int documentoId) {
        resolver(documentoId, false, "No se lee bien");
    }

    private void resolver(int documentoId, boolean aprobar, String motivo) {
        ResolverDocumentoRequestDTO request = new ResolverDocumentoRequestDTO();
        request.setAprobar(aprobar);
        request.setMotivo(motivo);
        revisionDocumentoService.resolver(documentoId, administradorId(), request);
        entityManager.flush();
        entityManager.clear();
    }

    private int administradorId() {
        return jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
    }

    private String estado(Dueno dueno) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, dueno.comercioId());
    }

    private List<String> transiciones(Dueno dueno) {
        entityManager.flush();
        return jdbcTemplate.query("SELECT CONCAT(estado_origen, '>', estado_destino, '|', COALESCE(motivo, '')) "
                + "FROM historial_estado_comercio WHERE comercio_id = ? ORDER BY id", (rs, n) -> rs.getString(1), dueno.comercioId());
    }

    private int avisos(Dueno dueno, String tipo) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND comercio_id = ? AND tipo = ?",
                Integer.class, dueno.id(), dueno.comercioId(), tipo);
    }

    private void bloquear(Dueno dueno) {
        LoginRequestDTO login = new LoginRequestDTO();
        login.setNombreUsuario(dueno.nombreUsuario());
        login.setPassword("ClaveIncorrecta1");
        for (int intento = 1; intento <= 3; intento++) {
            assertThrows(CredencialesInvalidasException.class, () -> authService.login(login, "127.0.0.1", "test"));
        }
        entityManager.flush();
        entityManager.clear();
    }

    private void recuperarPassword(Dueno dueno) {
        entityManager.flush();
        Usuario usuario = usuarioRepository.findById(dueno.id()).orElseThrow();
        Token token = tokenService.crear(usuario, TipoToken.RECUPERACION_PASSWORD, LocalDateTime.now().plusMinutes(30));
        authService.confirmarRecuperacionPassword(new ConfirmarRecuperacionPasswordRequestDTO(dueno.email(), token.getToken(), "Testing456"));
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void escenarios1y2_unPrimerDocumentoEnRevisionNoAlcanzaYAlAprobarloElComercioPasaAVender() {
        Dueno dueno = duenoConMercadoPago();
        assertEquals("APROBADO", estado(dueno));

        DocumentoComercioResponseDTO documento = subir(dueno);

        assertEquals("APROBADO", estado(dueno));
        assertEquals(0, avisos(dueno, "COMERCIO_APTO_VENTA"));

        aprobar(documento.getId());

        assertEquals("APTO_VENTA", estado(dueno));
        assertEquals("APROBADO>APTO_VENTA|Documento aprobado por el Administrador", transiciones(dueno).get(transiciones(dueno).size() - 1));
        assertEquals(1, avisos(dueno, "COMERCIO_APTO_VENTA"));
        assertEquals(1, avisos(dueno, "DOCUMENTO_APROBADO"));
    }

    @Test
    void escenarios3a5_unComercioQueYaVendeSigueVendiendoSiSubeOSeLeRechazaUnDocumentoExtra() {
        Dueno dueno = duenoConMercadoPago();
        aprobar(subir(dueno).getId());
        assertEquals("APTO_VENTA", estado(dueno));

        DocumentoComercioResponseDTO segundo = subir(dueno, TipoDocumentoComercio.HABILITACION_COMERCIAL, null);
        assertEquals("APTO_VENTA", estado(dueno));

        rechazar(segundo.getId());
        assertEquals("APTO_VENTA", estado(dueno));
        assertEquals(0, avisos(dueno, "COMERCIO_SIN_APTITUD"));

        DocumentoComercioResponseDTO tercero = subir(dueno, TipoDocumentoComercio.OTRO, "Certificado de bomberos");
        aprobar(tercero.getId());
        assertEquals("APTO_VENTA", estado(dueno));
    }

    @Test
    void escenario6_revocarElUnicoAprobadoSacaAlComercioDelCatalogoYLoAvisa() {
        Dueno dueno = duenoConMercadoPago();
        DocumentoComercioResponseDTO documento = subir(dueno);
        aprobar(documento.getId());

        resolver(documento.getId(), false, "Documento vencido");

        assertEquals("APROBADO", estado(dueno));
        assertEquals(1, avisos(dueno, "COMERCIO_SIN_APTITUD"));
        assertEquals(1, avisos(dueno, "DOCUMENTO_RECHAZADO"));
        String texto = jdbcTemplate.queryForObject("SELECT mensaje FROM notificacion WHERE usuario_id = ? AND tipo = 'DOCUMENTO_RECHAZADO'",
                String.class, dueno.id());
        assertTrue(texto.contains("Se revocó la aprobación") && texto.contains("Documento vencido"), texto);
        assertEquals("APTO_VENTA>APROBADO|Documento revocado por el Administrador", transiciones(dueno).get(transiciones(dueno).size() - 1));
    }

    @Test
    void escenario7_revocarUnoDeDosAprobadosNoCortaLasVentas() {
        Dueno dueno = duenoConMercadoPago();
        DocumentoComercioResponseDTO primero = subir(dueno);
        DocumentoComercioResponseDTO segundo = subir(dueno, TipoDocumentoComercio.HABILITACION_COMERCIAL, null);
        aprobar(primero.getId());
        aprobar(segundo.getId());
        assertEquals("APTO_VENTA", estado(dueno));

        resolver(primero.getId(), false, "Se ve borroso");

        assertEquals("APTO_VENTA", estado(dueno));
        assertEquals(0, avisos(dueno, "COMERCIO_SIN_APTITUD"));
    }

    @Test
    void escenarios8y9_desvincularMercadoPagoCortaYVolverAVincularConDocumentosVuelveAVender() {
        Dueno dueno = duenoConMercadoPago();
        aprobar(subir(dueno).getId());
        assertEquals("APTO_VENTA", estado(dueno));

        mercadoPagoOAuthService.desvincular(dueno.id());
        entityManager.flush();
        entityManager.clear();

        assertEquals("APROBADO", estado(dueno));
        assertEquals(1, avisos(dueno, "COMERCIO_SIN_APTITUD"));

        testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);

        assertEquals("APTO_VENTA", estado(dueno));
        assertEquals("APROBADO>APTO_VENTA|Vinculación automática de cuenta de Mercado Pago",
                transiciones(dueno).get(transiciones(dueno).size() - 1));
    }

    @Test
    void escenarios10y11_eliminarUnPendienteRecalculaYPuedeDejarAVender() {
        Dueno dueno = duenoConMercadoPago();
        DocumentoComercioResponseDTO aprobado = subir(dueno);
        aprobar(aprobado.getId());
        assertEquals("APTO_VENTA", estado(dueno));
        DocumentoComercioResponseDTO pendiente = subir(dueno, TipoDocumentoComercio.HABILITACION_COMERCIAL, null);
        assertEquals("APTO_VENTA", estado(dueno));

        documentoComercioService.eliminar(activo(dueno), pendiente.getId());
        entityManager.flush();
        entityManager.clear();

        assertEquals("APTO_VENTA", estado(dueno));

        Dueno otro = duenoConMercadoPago();
        DocumentoComercioResponseDTO primero = subir(otro);
        aprobar(primero.getId());
        mercadoPagoOAuthService.desvincular(otro.id());
        DocumentoComercioResponseDTO enRevision = subir(otro, TipoDocumentoComercio.HABILITACION_COMERCIAL, null);
        testSupportService.vincularCuentaMercadoPagoSimulada(otro.id(), null);
        assertEquals("APROBADO", estado(otro));
        documentoComercioService.eliminar(activo(otro), enRevision.getId());
        entityManager.flush();
        entityManager.clear();
        assertEquals("APTO_VENTA", estado(otro));
    }

    @Test
    void escenarios12y13_faltaDocumentacionOFaltaMercadoPagoDejaElComercioAprobado() {
        Dueno soloMercadoPago = duenoConMercadoPago();
        assertEquals("APROBADO", estado(soloMercadoPago));
        rechazar(subir(soloMercadoPago).getId());
        assertEquals("APROBADO", estado(soloMercadoPago));

        Dueno soloDocumento = duenoAprobado();
        aprobar(subir(soloDocumento).getId());
        assertEquals("APROBADO", estado(soloDocumento));
        assertEquals(0, avisos(soloDocumento, "COMERCIO_APTO_VENTA"));
    }

    @Test
    void escenarios14a16_conLaCuentaBloqueadaNadaQuedaALaVentaYAlRestaurarSeEvaluaLaReglaDeSeguirVendiendo() {
        Dueno dueno = duenoConMercadoPago();
        DocumentoComercioResponseDTO documento = subir(dueno);
        aprobar(documento.getId());
        assertEquals("APTO_VENTA", estado(dueno));

        bloquear(dueno);
        assertEquals("CERRADO_TEMPORALMENTE", estado(dueno));

        resolver(documento.getId(), false, "Documento vencido");
        assertEquals("CERRADO_TEMPORALMENTE", estado(dueno));

        recuperarPassword(dueno);

        assertEquals("APROBADO", estado(dueno));
        assertEquals("CERRADO_TEMPORALMENTE>APROBADO|Restauración por recuperación de contraseña",
                transiciones(dueno).get(transiciones(dueno).size() - 1));
        assertEquals(1, avisos(dueno, "COMERCIO_SIN_APTITUD"));
    }

    @Test
    void escenarioDeRestauracionConLaDocumentacionIntactaVuelveAVender() {
        Dueno dueno = duenoConMercadoPago();
        aprobar(subir(dueno).getId());
        bloquear(dueno);

        recuperarPassword(dueno);

        assertEquals("APTO_VENTA", estado(dueno));
        assertEquals(0, avisos(dueno, "COMERCIO_SIN_APTITUD"));
    }

    @Test
    void escenario17_aprobarElUltimoDocumentoConLaCuentaBloqueadaDejaElComercioCerradoSinPasarPorAptoVenta() {
        Dueno dueno = duenoConMercadoPago();
        DocumentoComercioResponseDTO documento = subir(dueno);
        jdbcTemplate.update("UPDATE usuario SET estado = 'BLOQUEADO' WHERE id = ?", dueno.id());
        entityManager.clear();

        aprobar(documento.getId());

        assertEquals("CERRADO_TEMPORALMENTE", estado(dueno));
        assertEquals("APROBADO>CERRADO_TEMPORALMENTE|Bloqueo de cuenta vigente al revisar la documentación",
                transiciones(dueno).get(transiciones(dueno).size() - 1));
        assertTrue(transiciones(dueno).stream().noneMatch(t -> t.contains(">APTO_VENTA")));
    }

    @Test
    void escenario18_unComercioSuspendidoNoCambiaAunqueSeResuelvaUnDocumentoSuyo() {
        Dueno dueno = duenoConMercadoPago();
        DocumentoComercioResponseDTO documento = subir(dueno);
        datos.cambiarEstadoComercio(dueno.comercioId(), "SUSPENDIDO");
        entityManager.clear();

        aprobar(documento.getId());

        assertEquals("SUSPENDIDO", estado(dueno));
        assertEquals(0, transiciones(dueno).size());
    }

    @Test
    void conLaExigenciaApagadaSoloImportaMercadoPagoComoHastaAhora() {
        propiedades.setRequerida(false);
        Dueno dueno = duenoAprobado();

        testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);

        assertEquals("APTO_VENTA", estado(dueno));
        mercadoPagoOAuthService.desvincular(dueno.id());
        entityManager.flush();
        entityManager.clear();
        assertEquals("APROBADO", estado(dueno));
        assertEquals(List.of("APROBADO>APTO_VENTA|Vinculación automática de cuenta de Mercado Pago",
                "APTO_VENTA>APROBADO|Desvinculación de cuenta de Mercado Pago"), transiciones(dueno));
    }

    @Test
    void conLaExigenciaApagadaUnDocumentoRechazadoNoQuitaLaAptitud() {
        propiedades.setRequerida(false);
        Dueno dueno = duenoConMercadoPago();
        assertEquals("APTO_VENTA", estado(dueno));
        DocumentoComercioResponseDTO documento = subir(dueno);

        rechazar(documento.getId());

        assertEquals("APTO_VENTA", estado(dueno));
    }

    @Test
    void elAtajoDeTestQueApruebaLaDocumentacionCumpleLaReglaPorElMismoCamino() {
        Dueno dueno = duenoConMercadoPago();
        assertEquals("APROBADO", estado(dueno));

        testSupportService.aprobarDocumentacion(dueno.comercioId());
        entityManager.flush();
        entityManager.clear();

        assertEquals("APTO_VENTA", estado(dueno));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM documento_comercio WHERE comercio_id = ? AND estado = 'APROBADO'", Integer.class, dueno.comercioId()));
    }

    @Test
    void aprobarUnComercioPendienteConMercadoPagoYSinDocumentosNoLoDejaALaVenta() {
        Dueno dueno = duenoConMercadoPago();
        int pendiente = testSupportService.clonarComercio(dueno.comercioId(), "Pendiente " + DatosPruebaEmpleado.sufijo(), EstadoComercio.PENDIENTE);
        entityManager.flush();
        entityManager.clear();

        administradorService.resolverAprobacion(pendiente, administradorId(), new AprobacionComercioRequestDTO(true, null));
        entityManager.flush();

        assertEquals("APROBADO", jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, pendiente));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND comercio_id = ? AND mensaje LIKE '%fue aprobado'",
                Integer.class, dueno.id(), pendiente));
    }

    @Test
    void aprobarUnComercioPendienteConMercadoPagoYLaExigenciaApagadaLoDejaALaVentaComoSiempre() {
        propiedades.setRequerida(false);
        Dueno dueno = duenoConMercadoPago();
        int pendiente = testSupportService.clonarComercio(dueno.comercioId(), "Pendiente " + DatosPruebaEmpleado.sufijo(), EstadoComercio.PENDIENTE);
        entityManager.flush();
        entityManager.clear();

        administradorService.resolverAprobacion(pendiente, administradorId(), new AprobacionComercioRequestDTO(true, null));
        entityManager.flush();

        assertEquals("APTO_VENTA", jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, pendiente));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND comercio_id = ? AND mensaje LIKE '%fue aprobado y ya podés vender'",
                Integer.class, dueno.id(), pendiente));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notificacion WHERE comercio_id = ? AND tipo = 'COMERCIO_APTO_VENTA'", Integer.class, pendiente));
    }
}
