package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.ResolverDocumentoRequestDTO;
import com.bajonea.backend.dto.request.SubirDocumentoComercioRequestDTO;
import com.bajonea.backend.dto.response.DocumentoComercioResponseDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoDocumentoComercio;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Carreras reales de los documentos del comercio contra {@code bajonea_test}, con datos confirmados y varios hilos que
 * largan a la vez. Solo las que tienen dos actores distintos: el Administrador es uno solo, así que no se prueban
 * carreras entre acciones suyas. Cada prueba tiene su mutación (ver docs/DECISIONES.md): sin el bloqueo del comercio
 * dos subidas superan el cupo; sin el bloqueo del documento la baja y la aprobación se pisan; sin el bloqueo de la
 * cuenta de Mercado Pago el comercio queda a la venta sin cuenta.
 */
@SpringBootTest
@ActiveProfiles("test")
class DocumentoComercioConcurrenciaIntegrationTest {

    private static final byte[] PDF = "%PDF-1.4\n%carrera\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
    private static final int RONDAS = 6;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private DocumentoComercioService documentoComercioService;

    @Autowired
    private RevisionDocumentoService revisionDocumentoService;

    @Autowired
    private MercadoPagoOAuthService mercadoPagoOAuthService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private TestSupportService testSupportService;

    @Autowired
    private DocumentacionComercioProperties propiedades;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

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

    private Dueno duenoConMercadoPago() {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
        return dueno;
    }

    private ComercioActivo activo(Dueno dueno) {
        return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), EstadoComercio.APROBADO);
    }

    private DocumentoComercioResponseDTO subir(Dueno dueno) {
        SubirDocumentoComercioRequestDTO request = new SubirDocumentoComercioRequestDTO();
        request.setTipo(TipoDocumentoComercio.LIBRETA_SANITARIA);
        request.setArchivo(new MockMultipartFile("archivo", "doc.pdf", "application/pdf", PDF));
        return documentoComercioService.subir(activo(dueno), request);
    }

    private void resolver(int documentoId, boolean aprobar) {
        ResolverDocumentoRequestDTO request = new ResolverDocumentoRequestDTO();
        request.setAprobar(aprobar);
        request.setMotivo(aprobar ? null : "No se lee");
        revisionDocumentoService.resolver(documentoId, administradorId(), request);
    }

    private int administradorId() {
        return jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
    }

    private String estado(Dueno dueno) {
        return jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, dueno.comercioId());
    }

    private long contar(Dueno dueno, String estadoDocumento) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM documento_comercio WHERE comercio_id = ? AND estado = ?",
                Long.class, dueno.comercioId(), estadoDocumento);
    }

    private boolean cuentaActiva(Dueno dueno) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cuenta_mercado_pago WHERE dueno_id = ? AND activa = 1",
                Integer.class, dueno.id()) > 0;
    }

    private int avisos(Dueno dueno, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND comercio_id = ? AND tipo = ?",
                Integer.class, dueno.id(), dueno.comercioId(), tipo);
    }

    private static List<Object> correrJuntas(List<Callable<Object>> tareas) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tareas.size());
        CyclicBarrier largada = new CyclicBarrier(tareas.size());
        List<Future<Object>> futuros = new ArrayList<>();
        for (Callable<Object> tarea : tareas) {
            futuros.add(pool.submit(() -> {
                largada.await(15, TimeUnit.SECONDS);
                try {
                    Object resultado = tarea.call();
                    return resultado == null ? "ok" : resultado;
                } catch (Throwable ex) {
                    return ex;
                }
            }));
        }
        List<Object> resultados = new ArrayList<>();
        for (Future<Object> futuro : futuros) {
            resultados.add(futuro.get(60, TimeUnit.SECONDS));
        }
        pool.shutdownNow();
        return resultados;
    }

    private static List<Throwable> fallos(List<Object> resultados) {
        return resultados.stream().filter(Throwable.class::isInstance).map(Throwable.class::cast).toList();
    }

    private static void sinErroresInesperados(List<Object> resultados) {
        for (Throwable fallo : fallos(resultados)) {
            assertTrue(fallo instanceof ConflictoComercioException || fallo instanceof RecursoNoEncontradoException,
                    "fallo inesperado: " + fallo);
        }
    }

    @Test
    void dosSubidasSimultaneasConCuatroEnRevisionDejanEntrarSoloUna() throws Exception {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            Dueno dueno = duenoConMercadoPago();
            for (int i = 0; i < 4; i++) {
                subir(dueno);
            }

            List<Object> resultados = correrJuntas(List.of(() -> subir(dueno), () -> subir(dueno)));

            List<Throwable> fallos = fallos(resultados);
            assertEquals(1, fallos.size(), "ronda " + ronda + ": " + resultados);
            ConflictoComercioException conflicto = assertInstanceOf(ConflictoComercioException.class, fallos.get(0));
            assertEquals(ConflictoComercioException.DOCUMENTO_CUPO_REVISION, conflicto.getCodigo());
            assertEquals(5, contar(dueno, "PENDIENTE"), "ronda " + ronda);
        }
    }

    private Dueno duenoSinMercadoPago() {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        return dueno;
    }

    @Test
    void sinCuentaDeMercadoPagoDosSubidasSimultaneasConCuatroEnRevisionDejanEntrarSoloUna() throws Exception {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            Dueno dueno = duenoSinMercadoPago();
            for (int i = 0; i < 4; i++) {
                subir(dueno);
            }

            List<Object> resultados = correrJuntas(List.of(() -> subir(dueno), () -> subir(dueno), () -> subir(dueno)));

            List<Throwable> fallos = fallos(resultados);
            assertEquals(2, fallos.size(), "ronda " + ronda + ": " + resultados);
            for (Throwable fallo : fallos) {
                ConflictoComercioException conflicto = assertInstanceOf(ConflictoComercioException.class, fallo);
                assertEquals(ConflictoComercioException.DOCUMENTO_CUPO_REVISION, conflicto.getCodigo());
            }
            assertEquals(5, contar(dueno, "PENDIENTE"), "ronda " + ronda);
        }
    }

    @Test
    void sinCuentaDeMercadoPagoLaBajaYLaAprobacionSimultaneasDejanUnEstadoCoherente() throws Exception {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            Dueno dueno = duenoSinMercadoPago();
            int documentoId = subir(dueno).getId();

            List<Object> resultados = correrJuntas(List.of(
                    () -> {
                        documentoComercioService.eliminar(activo(dueno), documentoId);
                        return null;
                    },
                    () -> {
                        resolver(documentoId, true);
                        return null;
                    }));

            sinErroresInesperados(resultados);
            assertEquals(1, fallos(resultados).size(), "ronda " + ronda + ": " + resultados);
            long existentes = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM documento_comercio WHERE id = ?", Long.class, documentoId);
            assertEquals("APROBADO", estado(dueno), "ronda " + ronda + ": sin cuenta de cobro nunca vende");
            assertEquals(existentes, contar(dueno, "APROBADO") + contar(dueno, "PENDIENTE"), "ronda " + ronda);
            assertEquals(existentes == 0 ? 0 : 1, avisos(dueno, "DOCUMENTO_APROBADO"), "ronda " + ronda);
        }
    }

    @Test
    void muchasSubidasSimultaneasNuncaSuperanElCupoDeRevision() throws Exception {
        Dueno dueno = duenoConMercadoPago();
        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            tareas.add(() -> subir(dueno));
        }

        List<Object> resultados = correrJuntas(tareas);

        sinErroresInesperados(resultados);
        assertEquals(5, contar(dueno, "PENDIENTE"));
        assertEquals(3, fallos(resultados).size());
    }

    @Test
    void elDuenoQueEliminaUnPendienteMientrasElAdministradorLoApruebaDejaUnEstadoCoherente() throws Exception {
        int gananEliminacion = 0;
        int ganaAprobacion = 0;
        for (int ronda = 0; ronda < RONDAS * 2; ronda++) {
            Dueno dueno = duenoConMercadoPago();
            int documentoId = subir(dueno).getId();

            List<Object> resultados = correrJuntas(List.of(
                    () -> {
                        documentoComercioService.eliminar(activo(dueno), documentoId);
                        return null;
                    },
                    () -> {
                        resolver(documentoId, true);
                        return null;
                    }));

            sinErroresInesperados(resultados);
            assertEquals(1, fallos(resultados).size(), "ronda " + ronda + ": " + resultados);
            long existentes = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM documento_comercio WHERE id = ?", Long.class, documentoId);
            if (existentes == 0) {
                gananEliminacion++;
                assertInstanceOf(RecursoNoEncontradoException.class, fallos(resultados).get(0));
                assertEquals("APROBADO", estado(dueno));
                assertEquals(0, avisos(dueno, "DOCUMENTO_APROBADO"));
                assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM documento_comercio_archivo WHERE documento_id = ?", Integer.class, documentoId));
            } else {
                ganaAprobacion++;
                ConflictoComercioException conflicto = assertInstanceOf(ConflictoComercioException.class, fallos(resultados).get(0));
                assertEquals(ConflictoComercioException.DOCUMENTO_NO_ELIMINABLE, conflicto.getCodigo());
                assertEquals(1, contar(dueno, "APROBADO"));
                assertEquals("APTO_VENTA", estado(dueno));
                assertEquals(1, avisos(dueno, "DOCUMENTO_APROBADO"));
            }
        }
        assertEquals(RONDAS * 2, gananEliminacion + ganaAprobacion);
    }

    @Test
    void desvincularMercadoPagoMientrasSeApruebaElUltimoDocumentoNuncaDejaElComercioALaVentaSinCuenta() throws Exception {
        for (int ronda = 0; ronda < RONDAS * 2; ronda++) {
            Dueno dueno = duenoConMercadoPago();
            int documentoId = subir(dueno).getId();

            List<Object> resultados = correrJuntas(List.of(
                    () -> {
                        mercadoPagoOAuthService.desvincular(dueno.id());
                        return null;
                    },
                    () -> {
                        resolver(documentoId, true);
                        return null;
                    }));

            assertEquals(0, fallos(resultados).size(), "ronda " + ronda + ": " + resultados);
            assertEquals(false, cuentaActiva(dueno));
            assertEquals("APROBADO", estado(dueno), "ronda " + ronda + ": sin cuenta de cobro el comercio no puede vender");
            assertEquals(1, contar(dueno, "APROBADO"));
        }
    }

    @Test
    void vincularMercadoPagoMientrasSeApruebaElUltimoDocumentoDejaElComercioALaVentaSeaCualSeaElOrden() throws Exception {
        for (int ronda = 0; ronda < RONDAS * 2; ronda++) {
            Dueno dueno = datos.registrarDuenoAprobado();
            datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
            int documentoId = subir(dueno).getId();

            List<Object> resultados = correrJuntas(List.of(
                    () -> {
                        testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
                        return null;
                    },
                    () -> {
                        resolver(documentoId, true);
                        return null;
                    }));

            assertEquals(0, fallos(resultados).size(), "ronda " + ronda + ": " + resultados);
            assertEquals("APTO_VENTA", estado(dueno), "ronda " + ronda);
            assertEquals(1, avisos(dueno, "COMERCIO_APTO_VENTA"), "ronda " + ronda);
        }
    }

    @Test
    void subirUnDocumentoMientrasElAdministradorRevocaElUnicoAprobadoDejaElComercioCoherente() throws Exception {
        for (int ronda = 0; ronda < RONDAS; ronda++) {
            Dueno dueno = duenoConMercadoPago();
            int aprobadoId = subir(dueno).getId();
            resolver(aprobadoId, true);
            assertEquals("APTO_VENTA", estado(dueno));

            List<Object> resultados = correrJuntas(List.of(
                    () -> subir(dueno),
                    () -> {
                        resolver(aprobadoId, false);
                        return null;
                    }));

            assertEquals(0, fallos(resultados).size(), "ronda " + ronda + ": " + resultados);
            assertEquals("APROBADO", estado(dueno), "ronda " + ronda + ": sin aprobados el comercio no vende");
            assertEquals(1, contar(dueno, "PENDIENTE"));
            assertEquals(1, avisos(dueno, "COMERCIO_SIN_APTITUD"));
        }
    }

    @Test
    void desvincularMercadoPagoMientrasUnaTransaccionTieneElUsuarioDelDuenoExclusivoNoSeInterbloquea() throws Exception {
        for (int ronda = 0; ronda < 3; ronda++) {
            Dueno dueno = duenoConMercadoPago();
            resolver(subir(dueno).getId(), true);
            assertEquals("APTO_VENTA", estado(dueno));
            CountDownLatch usuarioTomado = new CountDownLatch(1);
            ExecutorService hilos = Executors.newFixedThreadPool(2);
            try {
                Future<?> bloqueo = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    jdbcTemplate.queryForList("SELECT id FROM usuario WHERE id = ? FOR UPDATE", dueno.id());
                    usuarioTomado.countDown();
                    try {
                        Thread.sleep(1500);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    jdbcTemplate.queryForList("SELECT id FROM comercio WHERE id = ? FOR UPDATE", dueno.comercioId());
                }));
                assertTrue(usuarioTomado.await(15, TimeUnit.SECONDS));
                Future<?> desvinculacion = hilos.submit(() -> mercadoPagoOAuthService.desvincular(dueno.id()));

                bloqueo.get(60, TimeUnit.SECONDS);
                desvinculacion.get(60, TimeUnit.SECONDS);
            } finally {
                hilos.shutdownNow();
            }

            assertEquals(false, cuentaActiva(dueno), "ronda " + ronda);
            assertEquals("APROBADO", estado(dueno), "ronda " + ronda);
            assertEquals(1, avisos(dueno, "COMERCIO_SIN_APTITUD"), "ronda " + ronda);
        }
    }

    @Test
    void vincularMercadoPagoVeUnComercioQueSeConfirmoDespuesDeAbrirLaTransaccion() throws Exception {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoUsuario(dueno.id(), "ACTIVO");
        propiedades.setRequerida(false);
        ExecutorService hilo = Executors.newSingleThreadExecutor();
        int[] nuevo = new int[1];

        try {
            new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbcTemplate.queryForObject("SELECT COUNT(*) FROM comercio WHERE dueno_id = ?", Integer.class, dueno.id());
                try {
                    nuevo[0] = hilo.submit(() -> testSupportService.clonarComercio(dueno.comercioId(),
                            "Confirmado despues " + DatosPruebaEmpleado.sufijo(), EstadoComercio.APROBADO)).get(30, TimeUnit.SECONDS);
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
                testSupportService.vincularCuentaMercadoPagoSimulada(dueno.id(), null);
            });
        } finally {
            hilo.shutdownNow();
        }

        assertEquals("APTO_VENTA", estado(dueno));
        assertEquals("APTO_VENTA", jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, nuevo[0]));
    }
}
