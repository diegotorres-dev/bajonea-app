package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.ComercioDatosOperativosRequestDTO;
import com.bajonea.backend.dto.request.ImagenProductoRequestDTO;
import com.bajonea.backend.dto.request.ProductoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.response.ComercioEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.ProductoResponseDTO;
import com.bajonea.backend.enums.ActorCierre;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoProducto;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.RolActorComercio;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.MercadoPagoReembolsoClient.ResultadoReembolsoMp;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Escrituras delegadas al Empleado (E3, bloque A2) contra {@code bajonea_test} con datos confirmados de verdad:
 * revalidación de la relación dentro de la transacción (con una carrera determinista contra una desactivación que
 * toma la relación {@code FOR UPDATE}, como lo hará E4), guard del estado del comercio, actor real en el historial
 * de pedidos y de cierres, y ausencia de interbloqueos en los cruces con el bloqueo de cuenta del Dueño.
 */
@SpringBootTest
@ActiveProfiles("test")
class EscriturasEmpleadoIntegrationTest {

    private static final String[] DIAS = {"LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"};

    @Autowired
    private PedidoService pedidoService;

    @Autowired
    private ProductoService productoService;

    @Autowired
    private ComercioService comercioService;

    @Autowired
    private AdministradorService administradorService;

    @Autowired
    private CierreComercioService cierreComercioService;

    @Autowired
    private RegistroService registroService;

    @Autowired
    private CuentaMercadoPagoService cuentaService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private EmailService emailService;

    @MockitoBean
    private MercadoPagoReembolsoClient reembolsoClient;

    private DatosPruebaEmpleado datos;

    private record Escenario(Dueno dueno, Cuenta empleado, int clienteId) {

        ComercioActivo comoEmpleado(EstadoComercio estado) {
            return new ComercioActivo(dueno.comercioId(), dueno.id(), empleado.id(), RolActorComercio.EMPLEADO, estado);
        }

        ComercioActivo comoDueno(EstadoComercio estado) {
            return ComercioActivo.delDueno(dueno.comercioId(), dueno.id(), estado);
        }
    }

    @BeforeEach
    void preparar() {
        datos = new DatosPruebaEmpleado(registroService, objectMapper, jdbcTemplate);
        reset(reembolsoClient);
        when(reembolsoClient.solicitarReembolsoTotal(anyString(), anyString(), anyString()))
                .thenReturn(ResultadoReembolsoMp.exito("refund-a2"));
    }

    private Escenario escenario(String estadoComercio) {
        Dueno dueno = datos.registrarDuenoAprobado();
        datos.cambiarEstadoComercio(dueno.comercioId(), estadoComercio);
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.vincularEmpleado(empleado.id(), dueno.comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
        int clienteId = datos.registrarCliente();
        cuentaService.vincular(dueno.id(), "MP-A2-" + DatosPruebaEmpleado.sufijo(), "token", "refresh", "pub", true,
                LocalDateTime.now().plusDays(1));
        return new Escenario(dueno, empleado, clienteId);
    }

    private void horarioTodosLosDias(Escenario e) {
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", e.dueno().comercioId());
        for (String dia : DIAS) {
            jdbcTemplate.update("INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, '00:00:00', '23:59:00')",
                    e.dueno().comercioId(), dia);
        }
    }

    private void desactivar(Escenario e) {
        jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?",
                e.empleado().id(), e.dueno().comercioId());
    }

    private int categoria() {
        jdbcTemplate.update("INSERT INTO categoria (nombre) VALUES (?)", "Cat A2 " + DatosPruebaEmpleado.sufijo());
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private int productoDelDueno(Escenario e) {
        ProductoResponseDTO producto = productoService.crearProducto(e.comoDueno(EstadoComercio.APTO_VENTA),
                new ProductoRequestDTO("Producto A2 " + DatosPruebaEmpleado.sufijo(), "desc", new BigDecimal("1500"), categoria(), List.of()));
        return producto.getId();
    }

    private int pedido(Escenario e, String estado) {
        jdbcTemplate.update("INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, "
                + "cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) "
                + "VALUES (?, ?, 'RETIRO', ?, 'PAGADO', 10000, 200, 100, 10200, ?)",
                e.clienteId(), e.dueno().comercioId(), estado, LocalDateTime.now().minusHours(1));
        int id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        historial(id, "PENDIENTE_CONFIRMACION_COMERCIO", "SISTEMA", null, 100);
        if (!estado.equals("PENDIENTE_CONFIRMACION_COMERCIO")) {
            historial(id, "EN_PREPARACION", "DUENO", e.dueno().id(), 50);
        }
        if (estado.equals("EN_CAMINO") || estado.equals("LISTO_PARA_RETIRAR")) {
            historial(id, estado, "DUENO", e.dueno().id(), 10);
        }
        jdbcTemplate.update("INSERT INTO pago (pedido_id, monto, mp_estado, id_transaccion_mp, fecha_creacion, fecha_confirmacion) "
                + "VALUES (?, 10200, 'approved', ?, NOW(), NOW())", id, "a2-" + id);
        return id;
    }

    private void historial(int pedidoId, String estado, String actorRol, Integer actorUsuarioId, int minutosAtras) {
        jdbcTemplate.update("INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?)",
                pedidoId, estado, actorRol, actorUsuarioId, LocalDateTime.now().minusMinutes(minutosAtras));
    }

    private String estadoPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT estado FROM pedido WHERE id = ?", String.class, pedidoId);
    }

    private int filasDeHistorialDelPedido(int pedidoId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_pedido WHERE pedido_id = ?", Integer.class, pedidoId);
    }

    private String descripcionDelComercio(Escenario e) {
        return jdbcTemplate.queryForObject("SELECT descripcion FROM comercio WHERE id = ?", String.class, e.dueno().comercioId());
    }

    private static final ComercioDatosOperativosRequestDTO NUEVOS_DATOS = new ComercioDatosOperativosRequestDTO("Descripción nueva A2", "+5492964555555");

    // ---------- revalidación de la relación dentro de la transacción ----------

    @Test
    void conLaRelacionInactivaCadaEscrituraDelCatalogoYDelPerfilResponde404SinEscribirNada() {
        Escenario e = escenario("APTO_VENTA");
        int productoId = productoDelDueno(e);
        String descripcionAntes = descripcionDelComercio(e);
        desactivar(e);
        ComercioActivo actor = e.comoEmpleado(EstadoComercio.APTO_VENTA);

        List<Callable<?>> escrituras = List.of(
                () -> productoService.crearProducto(actor, new ProductoRequestDTO("Nuevo", "d", new BigDecimal("10"), 1, List.of())),
                () -> productoService.editarProducto(actor, productoId, new ProductoRequestDTO("Otro", "d", new BigDecimal("10"), 1, List.of())),
                () -> productoService.cambiarEstado(actor, productoId, EstadoProducto.AGOTADO),
                () -> productoService.agregarImagen(actor, productoId, new ImagenProductoRequestDTO("https://res.cloudinary.com/demo/x.png", 0, true)),
                () -> {
                    productoService.eliminarImagen(actor, productoId, 1);
                    return null;
                },
                () -> productoService.reordenarImagen(actor, productoId, 1, 2),
                () -> productoService.actualizarUrlImagen(actor, productoId, 1, "https://res.cloudinary.com/demo/y.png"),
                () -> comercioService.editarDatosOperativos(actor, NUEVOS_DATOS),
                () -> cierreComercioService.cerrar(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO),
                () -> cierreComercioService.abrir(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO));

        for (int i = 0; i < escrituras.size(); i++) {
            int indice = i;
            assertThrows(ComercioNoDisponibleException.class, () -> escrituras.get(indice).call(), "escritura " + indice);
        }
        assertEquals(descripcionAntes, descripcionDelComercio(e));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM producto WHERE comercio_id = ?", Integer.class, e.dueno().comercioId()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_edicion_comercio WHERE usuario_id = ?", Integer.class, e.empleado().id()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ?", Integer.class, e.dueno().comercioId()));
    }

    @Test
    void conLaRelacionInactivaLasCincoAccionesDePedidoRespondenElMismo404SinCambiarElPedido() {
        Escenario e = escenario("APTO_VENTA");
        int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO");
        int enPreparacion = pedido(e, "EN_PREPARACION");
        int listo = pedido(e, "LISTO_PARA_RETIRAR");
        desactivar(e);
        ComercioActivo actor = e.comoEmpleado(EstadoComercio.APTO_VENTA);

        assertThrows(ComercioNoDisponibleException.class, () -> pedidoService.aceptarPedido(actor, pendiente));
        assertThrows(ComercioNoDisponibleException.class,
                () -> pedidoService.rechazarPedido(actor, pendiente, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
        assertThrows(ComercioNoDisponibleException.class, () -> pedidoService.avanzarAEntregaEnCurso(actor, enPreparacion));
        assertThrows(ComercioNoDisponibleException.class,
                () -> pedidoService.anularPedido(actor, enPreparacion, new AnulacionPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
        assertThrows(ComercioNoDisponibleException.class, () -> pedidoService.confirmarEntregaComercio(actor, listo));

        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoPedido(pendiente));
        assertEquals("EN_PREPARACION", estadoPedido(enPreparacion));
        assertEquals("LISTO_PARA_RETIRAR", estadoPedido(listo));
        assertEquals(1, filasDeHistorialDelPedido(pendiente));
    }

    @Test
    void siLaDesactivacionGanaLaCarreraLaEscrituraEsperaYResponde404ySiNoLaEscrituraTerminaAntes() throws Exception {
        for (int ronda = 0; ronda < 3; ronda++) {
            Escenario e = escenario("APTO_VENTA");
            ComercioActivo actor = e.comoEmpleado(EstadoComercio.APTO_VENTA);
            ExecutorService hilos = Executors.newFixedThreadPool(2);
            CountDownLatch relacionTomada = new CountDownLatch(1);
            CountDownLatch escrituraLanzada = new CountDownLatch(1);
            try {
                Future<?> desactivacion = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    jdbcTemplate.queryForList("SELECT id FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ? FOR UPDATE",
                            e.empleado().id(), e.dueno().comercioId());
                    relacionTomada.countDown();
                    esperar(escrituraLanzada);
                    pausa(700);
                    jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?",
                            e.empleado().id(), e.dueno().comercioId());
                }));
                assertTrue(relacionTomada.await(15, TimeUnit.SECONDS));

                Future<Object> escritura = hilos.submit(() -> {
                    escrituraLanzada.countDown();
                    return comercioService.editarDatosOperativos(actor, NUEVOS_DATOS);
                });

                desactivacion.get(30, TimeUnit.SECONDS);
                Exception fallo = assertThrows(java.util.concurrent.ExecutionException.class, () -> escritura.get(30, TimeUnit.SECONDS));
                assertInstanceOf(ComercioNoDisponibleException.class, fallo.getCause(), "ronda " + ronda);
            } finally {
                hilos.shutdownNow();
            }
            assertTrue(!NUEVOS_DATOS.getDescripcion().equals(descripcionDelComercio(e)), "la edición no tiene que haberse aplicado");
            assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_edicion_comercio WHERE usuario_id = ?", Integer.class,
                    e.empleado().id()));
        }
    }

    @Test
    void siLaDesactivacionGanaLaCarreraAceptarYCerrarTambienEsperanYRespondenElMismo404() throws Exception {
        Escenario e = escenario("APTO_VENTA");
        horarioTodosLosDias(e);
        int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO");
        ComercioActivo actor = e.comoEmpleado(EstadoComercio.APTO_VENTA);
        ExecutorService hilos = Executors.newFixedThreadPool(3);
        CountDownLatch relacionTomada = new CountDownLatch(1);
        CountDownLatch escriturasLanzadas = new CountDownLatch(2);
        try {
            Future<?> desactivacion = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbcTemplate.queryForList("SELECT id FROM empleado_comercio WHERE empleado_id = ? AND comercio_id = ? FOR UPDATE",
                        e.empleado().id(), e.dueno().comercioId());
                relacionTomada.countDown();
                esperar(escriturasLanzadas);
                pausa(700);
                jdbcTemplate.update("UPDATE empleado_comercio SET estado = 'INACTIVO', fecha_baja = NOW() WHERE empleado_id = ? AND comercio_id = ?",
                        e.empleado().id(), e.dueno().comercioId());
            }));
            assertTrue(relacionTomada.await(15, TimeUnit.SECONDS));

            Future<Object> aceptar = hilos.submit(() -> {
                escriturasLanzadas.countDown();
                return pedidoService.aceptarPedido(actor, pendiente);
            });
            Future<Object> cerrar = hilos.submit(() -> {
                escriturasLanzadas.countDown();
                return cierreComercioService.cerrar(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO);
            });

            desactivacion.get(30, TimeUnit.SECONDS);
            assertInstanceOf(ComercioNoDisponibleException.class,
                    assertThrows(java.util.concurrent.ExecutionException.class, () -> aceptar.get(30, TimeUnit.SECONDS)).getCause());
            assertInstanceOf(ComercioNoDisponibleException.class,
                    assertThrows(java.util.concurrent.ExecutionException.class, () -> cerrar.get(30, TimeUnit.SECONDS)).getCause());
        } finally {
            hilos.shutdownNow();
        }
        assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoPedido(pendiente));
        assertEquals(1, filasDeHistorialDelPedido(pendiente));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ?", Integer.class,
                e.dueno().comercioId()));
    }

    // ---------- guard del estado del comercio ----------

    @Test
    void conElComercioSuspendidoElEmpleadoNoEditaNadaYRecibeComercioSuspendido() {
        Escenario e = escenario("APTO_VENTA");
        int productoId = productoDelDueno(e);
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "SUSPENDIDO");
        ComercioActivo actor = e.comoEmpleado(EstadoComercio.SUSPENDIDO);
        String descripcionAntes = descripcionDelComercio(e);

        List<Callable<?>> escrituras = List.of(
                () -> productoService.crearProducto(actor, new ProductoRequestDTO("Nuevo", "d", new BigDecimal("10"), 1, List.of())),
                () -> productoService.editarProducto(actor, productoId, new ProductoRequestDTO("Otro", "d", new BigDecimal("10"), 1, List.of())),
                () -> productoService.cambiarEstado(actor, productoId, EstadoProducto.AGOTADO),
                () -> productoService.agregarImagen(actor, productoId, new ImagenProductoRequestDTO("https://res.cloudinary.com/demo/x.png", 0, true)),
                () -> {
                    productoService.eliminarImagen(actor, productoId, 1);
                    return null;
                },
                () -> productoService.reordenarImagen(actor, productoId, 1, 2),
                () -> productoService.actualizarUrlImagen(actor, productoId, 1, "https://res.cloudinary.com/demo/y.png"),
                () -> productoService.generarFirmaImagen(actor, productoId),
                () -> productoService.generarFirmaRecorteImagen(actor, productoId, 1),
                () -> comercioService.editarDatosOperativos(actor, NUEVOS_DATOS));

        for (int i = 0; i < escrituras.size(); i++) {
            int indice = i;
            ConflictoComercioException ex = assertThrows(ConflictoComercioException.class, () -> escrituras.get(indice).call(), "escritura " + indice);
            assertEquals(ConflictoComercioException.SUSPENDIDO, ex.getCodigo());
        }
        assertEquals(descripcionAntes, descripcionDelComercio(e));
        assertEquals("DISPONIBLE", jdbcTemplate.queryForObject("SELECT estado FROM producto WHERE id = ?", String.class, productoId));
    }

    @Test
    void conElComercioCerradoTemporalmenteElEmpleadoEditaYDejaElRegistroConSuRolYSuUsuario() {
        Escenario e = escenario("APTO_VENTA");
        int productoId = productoDelDueno(e);
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "CERRADO_TEMPORALMENTE");
        ComercioActivo actor = e.comoEmpleado(EstadoComercio.CERRADO_TEMPORALMENTE);

        Object respuesta = comercioService.editarDatosOperativos(actor, NUEVOS_DATOS);
        productoService.cambiarEstado(actor, productoId, EstadoProducto.AGOTADO);

        assertInstanceOf(ComercioEmpleadoResponseDTO.class, respuesta);
        assertEquals(NUEVOS_DATOS.getDescripcion(), descripcionDelComercio(e));
        assertEquals("AGOTADO", jdbcTemplate.queryForObject("SELECT estado FROM producto WHERE id = ?", String.class, productoId));
        List<String> registro = jdbcTemplate.queryForList(
                "SELECT CONCAT(actor_rol, ':', usuario_id, ':', entidad_tipo, ':', accion) FROM historial_edicion_comercio WHERE usuario_id = ? ORDER BY id",
                String.class, e.empleado().id());
        assertEquals(List.of("EMPLEADO:" + e.empleado().id() + ":COMERCIO:EDITAR", "EMPLEADO:" + e.empleado().id() + ":PRODUCTO:CAMBIAR_ESTADO"), registro);
    }

    @Test
    void editarDatosOperativosCambiaSoloDescripcionYTelefonoYElDuenoRecibeSuPerfilCompleto() {
        Escenario e = escenario("APTO_VENTA");
        String nombreAntes = jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class, e.dueno().comercioId());
        String emailAntes = jdbcTemplate.queryForObject("SELECT email FROM comercio WHERE id = ?", String.class, e.dueno().comercioId());

        Object delEmpleado = comercioService.editarDatosOperativos(e.comoEmpleado(EstadoComercio.APTO_VENTA), NUEVOS_DATOS);
        Object delDueno = comercioService.editarDatosOperativos(e.comoDueno(EstadoComercio.APTO_VENTA),
                new ComercioDatosOperativosRequestDTO("Otra del Dueño", "+5492964666666"));

        assertInstanceOf(ComercioEmpleadoResponseDTO.class, delEmpleado);
        assertInstanceOf(ComercioResponseDTO.class, delDueno);
        assertEquals(nombreAntes, jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class, e.dueno().comercioId()));
        assertEquals(emailAntes, jdbcTemplate.queryForObject("SELECT email FROM comercio WHERE id = ?", String.class, e.dueno().comercioId()));
        assertEquals("Otra del Dueño", descripcionDelComercio(e));
        assertEquals("EDITAR", jdbcTemplate.queryForObject("SELECT accion FROM historial_edicion_comercio WHERE usuario_id = ? ORDER BY id LIMIT 1",
                String.class, e.empleado().id()));
    }

    @Test
    void elDuenoSigueEditandoConElComercioSuspendidoYAceptandoConCierreTemporal() {
        Escenario e = escenario("APTO_VENTA");
        datos.cambiarEstadoComercio(e.dueno().comercioId(), "SUSPENDIDO");
        comercioService.editarDatosOperativos(e.comoDueno(EstadoComercio.SUSPENDIDO), NUEVOS_DATOS);
        assertEquals(NUEVOS_DATOS.getDescripcion(), descripcionDelComercio(e));

        datos.cambiarEstadoComercio(e.dueno().comercioId(), "CERRADO_TEMPORALMENTE");
        int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO");
        pedidoService.aceptarPedido(e.comoDueno(EstadoComercio.CERRADO_TEMPORALMENTE), pendiente);
        assertEquals("EN_PREPARACION", estadoPedido(pendiente));
    }

    @Test
    void matrizDePedidosConElComercioSuspendidoOCerradoTemporalmente() {
        for (String estadoComercio : List.of("SUSPENDIDO", "CERRADO_TEMPORALMENTE")) {
            EstadoComercio estado = EstadoComercio.valueOf(estadoComercio);
            Escenario e = escenario("APTO_VENTA");
            datos.cambiarEstadoComercio(e.dueno().comercioId(), estadoComercio);
            ComercioActivo actor = e.comoEmpleado(estado);

            int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO");
            ConflictoComercioException sinOperacion = assertThrows(ConflictoComercioException.class,
                    () -> pedidoService.aceptarPedido(actor, pendiente), estadoComercio);
            assertEquals(ConflictoComercioException.SIN_OPERACION, sinOperacion.getCodigo());
            assertEquals("PENDIENTE_CONFIRMACION_COMERCIO", estadoPedido(pendiente));
            assertEquals(1, filasDeHistorialDelPedido(pendiente));
            pedidoService.rechazarPedido(actor, pendiente, new RechazoPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));
            assertEquals("RECHAZADO", estadoPedido(pendiente), estadoComercio);
            assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM nota_credito nc JOIN pago p ON p.id = nc.pago_id WHERE p.pedido_id = ?",
                    Integer.class, pendiente));

            int enPreparacion = pedido(e, "EN_PREPARACION");
            pedidoService.avanzarAEntregaEnCurso(actor, enPreparacion);
            assertEquals("LISTO_PARA_RETIRAR", estadoPedido(enPreparacion), estadoComercio);
            pedidoService.confirmarEntregaComercio(actor, enPreparacion);
            assertEquals("ENTREGADO", estadoPedido(enPreparacion), estadoComercio);

            int aAnular = pedido(e, "EN_PREPARACION");
            pedidoService.anularPedido(actor, aAnular, new AnulacionPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null));
            assertEquals("ANULADO", estadoPedido(aAnular), estadoComercio);

            int enCamino = pedido(e, "EN_CAMINO");
            assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.avanzarAEntregaEnCurso(actor, enCamino));
            assertThrows(ConflictoDeNegocioException.class, () -> pedidoService.confirmarEntregaComercio(actor, enCamino));
            assertThrows(ConflictoDeNegocioException.class,
                    () -> pedidoService.anularPedido(actor, enCamino, new AnulacionPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
            assertEquals("EN_CAMINO", estadoPedido(enCamino), estadoComercio);
        }
    }

    @Test
    void conCierreManualElEmpleadoAceptaPedidosPendientesYElHistorialGuardaAlEmpleado() {
        Escenario e = escenario("APTO_VENTA");
        jdbcTemplate.update("UPDATE comercio SET cerrado_manualmente = 1 WHERE id = ?", e.dueno().comercioId());
        int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO");

        pedidoService.aceptarPedido(e.comoEmpleado(EstadoComercio.APTO_VENTA), pendiente);

        assertEquals("EN_PREPARACION", estadoPedido(pendiente));
        assertEquals("EMPLEADO:" + e.empleado().id(), jdbcTemplate.queryForObject(
                "SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1",
                String.class, pendiente));
    }

    @Test
    void conElComercioAprobadoSinCuentaDeCobroElEmpleadoAcepta() {
        Escenario e = escenario("APROBADO");
        int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO");

        pedidoService.aceptarPedido(e.comoEmpleado(EstadoComercio.APROBADO), pendiente);

        assertEquals("EN_PREPARACION", estadoPedido(pendiente));
    }

    @Test
    void lasCincoAccionesDelDuenoSiguenGuardandoAlDuenoComoActor() {
        Escenario e = escenario("APTO_VENTA");
        int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO");

        pedidoService.aceptarPedido(e.comoDueno(EstadoComercio.APTO_VENTA), pendiente);

        assertEquals("DUENO:" + e.dueno().id(), jdbcTemplate.queryForObject(
                "SELECT CONCAT(actor_rol, ':', actor_usuario_id) FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1",
                String.class, pendiente));
    }

    // ---------- cerrar y abrir ----------

    @Test
    void elEmpleadoCierraYAbreDentroDeLaFranjaYElHistorialDeCierresGuardaSuRol() {
        Escenario e = escenario("APTO_VENTA");
        horarioTodosLosDias(e);

        cierreComercioService.cerrar(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO);
        assertEquals(1, jdbcTemplate.queryForObject("SELECT cerrado_manualmente FROM comercio WHERE id = ?", Integer.class, e.dueno().comercioId()));
        cierreComercioService.abrir(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO);
        assertEquals(0, jdbcTemplate.queryForObject("SELECT cerrado_manualmente FROM comercio WHERE id = ?", Integer.class, e.dueno().comercioId()));

        List<String> filas = jdbcTemplate.queryForList(
                "SELECT CONCAT(accion, ':', actor_rol, ':', actor_usuario_id) FROM historial_cierre_comercio WHERE comercio_id = ? ORDER BY id",
                String.class, e.dueno().comercioId());
        assertEquals(List.of("CERRADO:EMPLEADO:" + e.empleado().id(), "REABIERTO:EMPLEADO:" + e.empleado().id()), filas);
    }

    @Test
    void elEmpleadoPuedeAbrirUnCierreManualQueHizoElDueno() {
        Escenario e = escenario("APTO_VENTA");
        horarioTodosLosDias(e);
        cierreComercioService.cerrar(e.dueno().comercioId(), e.dueno().id(), ActorCierre.DUENO);

        cierreComercioService.abrir(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO);

        assertEquals(0, jdbcTemplate.queryForObject("SELECT cerrado_manualmente FROM comercio WHERE id = ?", Integer.class, e.dueno().comercioId()));
    }

    @Test
    void abrirConLaBanderaApagadaEsIdempotenteYNoEscribeOtraFila() {
        Escenario e = escenario("APTO_VENTA");
        horarioTodosLosDias(e);

        cierreComercioService.abrir(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO);

        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_cierre_comercio WHERE comercio_id = ?", Integer.class,
                e.dueno().comercioId()));
    }

    @Test
    void cerrarYAbrirFueraDeEstadoOperativoOFueraDeHorarioTienenSuCodigoEstable() {
        for (String estado : List.of("SUSPENDIDO", "CERRADO_TEMPORALMENTE")) {
            Escenario e = escenario("APTO_VENTA");
            horarioTodosLosDias(e);
            datos.cambiarEstadoComercio(e.dueno().comercioId(), estado);
            ConflictoComercioException alCerrar = assertThrows(ConflictoComercioException.class,
                    () -> cierreComercioService.cerrar(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO));
            ConflictoComercioException alAbrir = assertThrows(ConflictoComercioException.class,
                    () -> cierreComercioService.abrir(e.dueno().comercioId(), e.empleado().id(), ActorCierre.EMPLEADO));
            assertEquals(ConflictoComercioException.NO_OPERATIVO, alCerrar.getCodigo(), estado);
            assertEquals(ConflictoComercioException.NO_OPERATIVO, alAbrir.getCodigo(), estado);
            assertEquals("Este comercio no está operativo", alAbrir.getMessage());
        }

        Escenario e = escenario("APTO_VENTA");
        jdbcTemplate.update("DELETE FROM horario WHERE comercio_id = ?", e.dueno().comercioId());
        ConflictoComercioException fuera = assertThrows(ConflictoComercioException.class,
                () -> cierreComercioService.cerrar(e.dueno().comercioId(), e.dueno().id(), ActorCierre.DUENO));
        assertEquals(ConflictoComercioException.FUERA_DE_HORARIO, fuera.getCodigo());
        assertEquals("Solo podés abrir o cerrar dentro de tu horario", fuera.getMessage());
    }

    // ---------- concurrencia ----------

    @Test
    void edicionesDeVariosEmpleadosYDelDuenoALaVezNoSeInterbloquean() throws Exception {
        Escenario e = escenario("APTO_VENTA");
        List<Cuenta> empleados = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Cuenta otro = datos.registrarClienteConCredenciales();
            datos.vincularEmpleado(otro.id(), e.dueno().comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
            empleados.add(otro);
        }
        int hilos = 5;
        int rondas = 5;
        ExecutorService pool = Executors.newFixedThreadPool(hilos);
        List<Throwable> fallos = new CopyOnWriteArrayList<>();
        try {
            for (int ronda = 0; ronda < rondas; ronda++) {
                CyclicBarrier largada = new CyclicBarrier(hilos);
                List<Future<?>> tareas = new ArrayList<>();
                for (int i = 0; i < hilos; i++) {
                    ComercioActivo actor = i == 0 ? e.comoDueno(EstadoComercio.APTO_VENTA)
                            : new ComercioActivo(e.dueno().comercioId(), e.dueno().id(), empleados.get(i - 1).id(), RolActorComercio.EMPLEADO,
                                    EstadoComercio.APTO_VENTA);
                    String telefono = "+549296" + (2_000_000 + ronda * 100 + i);
                    tareas.add(pool.submit(() -> {
                        try {
                            largada.await(10, TimeUnit.SECONDS);
                            comercioService.editarDatosOperativos(actor, new ComercioDatosOperativosRequestDTO("Concurrente", telefono));
                        } catch (Exception ex) {
                            fallos.add(ex);
                        }
                        return null;
                    }));
                }
                for (Future<?> tarea : tareas) {
                    tarea.get(60, TimeUnit.SECONDS);
                }
            }
        } finally {
            pool.shutdownNow();
        }
        assertTrue(fallos.isEmpty(), "Ediciones concurrentes fallaron: " + fallos);
    }

    @Test
    void laEdicionDelEmpleadoNoSeInterbloqueaConQuienTomaElUsuarioDelDuenoYDespuesElComercio() throws Exception {
        Escenario e = escenario("APTO_VENTA");
        ComercioActivo actor = e.comoEmpleado(EstadoComercio.APTO_VENTA);
        ExecutorService hilos = Executors.newFixedThreadPool(2);
        CountDownLatch usuarioTomado = new CountDownLatch(1);
        CountDownLatch escrituraLanzada = new CountDownLatch(1);
        try {
            Future<?> bloqueoDeCuenta = hilos.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                jdbcTemplate.queryForList("SELECT id FROM usuario WHERE id = ? FOR UPDATE", e.dueno().id());
                usuarioTomado.countDown();
                esperar(escrituraLanzada);
                pausa(600);
                jdbcTemplate.queryForList("SELECT id FROM comercio WHERE id = ? FOR UPDATE", e.dueno().comercioId());
            }));
            assertTrue(usuarioTomado.await(15, TimeUnit.SECONDS));
            Future<?> escritura = hilos.submit(() -> {
                escrituraLanzada.countDown();
                comercioService.editarDatosOperativos(actor, NUEVOS_DATOS);
            });
            bloqueoDeCuenta.get(30, TimeUnit.SECONDS);
            escritura.get(30, TimeUnit.SECONDS);
        } finally {
            hilos.shutdownNow();
        }
        assertEquals(NUEVOS_DATOS.getDescripcion(), descripcionDelComercio(e));
        assertNotNull(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_edicion_comercio WHERE usuario_id = ?", Integer.class, e.empleado().id()));
    }

    @Test
    void dosEmpleadosYElDuenoAceptandoElMismoPedidoALaVezDejanUnSoloGanador() throws Exception {
        for (int ronda = 0; ronda < 4; ronda++) {
            Escenario e = escenario("APTO_VENTA");
            Cuenta otro = datos.registrarClienteConCredenciales();
            datos.vincularEmpleado(otro.id(), e.dueno().comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
            int pendiente = pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO");
            ComercioActivo a = e.comoEmpleado(EstadoComercio.APTO_VENTA);
            ComercioActivo b = new ComercioActivo(e.dueno().comercioId(), e.dueno().id(), otro.id(), RolActorComercio.EMPLEADO, EstadoComercio.APTO_VENTA);
            ComercioActivo d = e.comoDueno(EstadoComercio.APTO_VENTA);

            ExecutorService pool = Executors.newFixedThreadPool(3);
            CyclicBarrier largada = new CyclicBarrier(3);
            List<Future<Object>> tareas = new ArrayList<>();
            for (ComercioActivo actor : List.of(a, b, d)) {
                tareas.add(pool.submit(() -> {
                    largada.await(10, TimeUnit.SECONDS);
                    try {
                        pedidoService.aceptarPedido(actor, pendiente);
                        return "ok";
                    } catch (ConflictoDeNegocioException ex) {
                        return "409";
                    }
                }));
            }
            long exitos = 0;
            for (Future<Object> tarea : tareas) {
                if ("ok".equals(tarea.get(60, TimeUnit.SECONDS))) {
                    exitos++;
                }
            }
            pool.shutdownNow();
            assertEquals(1, exitos, "ronda " + ronda);
            assertEquals(2, filasDeHistorialDelPedido(pendiente));
        }
    }

    @Test
    void laSuspensionDelAdministradorContraEdicionesYAceptacionesDeEmpleadosNoSeInterbloquea() throws Exception {
        Cuenta administrador = datos.registrarClienteConCredenciales();
        datos.hacerAdministrador(administrador.id());
        for (int ronda = 0; ronda < 8; ronda++) {
            Escenario e = escenario("APTO_VENTA");
            List<ComercioActivo> actores = new ArrayList<>(List.of(e.comoEmpleado(EstadoComercio.APTO_VENTA)));
            for (int i = 0; i < 2; i++) {
                Cuenta otro = datos.registrarClienteConCredenciales();
                datos.vincularEmpleado(otro.id(), e.dueno().comercioId(), "ACTIVO", LocalDateTime.now().minusDays(1));
                actores.add(new ComercioActivo(e.dueno().comercioId(), e.dueno().id(), otro.id(), RolActorComercio.EMPLEADO, EstadoComercio.APTO_VENTA));
            }
            List<Integer> pedidos = List.of(pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO"), pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO"),
                    pedido(e, "PENDIENTE_CONFIRMACION_COMERCIO"));
            ExecutorService pool = Executors.newFixedThreadPool(7);
            CyclicBarrier largada = new CyclicBarrier(7);
            List<Future<Throwable>> tareas = new ArrayList<>();
            tareas.add(pool.submit(() -> {
                largada.await(10, TimeUnit.SECONDS);
                try {
                    administradorService.suspenderComercio(e.dueno().comercioId(), administrador.id(),
                            new com.bajonea.backend.dto.request.SuspensionComercioRequestDTO("Suspension de la prueba"));
                    return null;
                } catch (Throwable ex) {
                    return ex;
                }
            }));
            for (int i = 0; i < 3; i++) {
                ComercioActivo actor = actores.get(i);
                int pedidoId = pedidos.get(i);
                tareas.add(pool.submit(() -> {
                    largada.await(10, TimeUnit.SECONDS);
                    try {
                        comercioService.editarDatosOperativos(actor, new ComercioDatosOperativosRequestDTO("Concurrente", "+549296" + (3_000_000 + aleatorio())));
                        return null;
                    } catch (ConflictoDeNegocioException ex) {
                        return null;
                    } catch (Throwable ex) {
                        return ex;
                    }
                }));
                tareas.add(pool.submit(() -> {
                    largada.await(10, TimeUnit.SECONDS);
                    try {
                        pedidoService.aceptarPedido(actor, pedidoId);
                        return null;
                    } catch (ConflictoDeNegocioException ex) {
                        return null;
                    } catch (Throwable ex) {
                        return ex;
                    }
                }));
            }
            List<Throwable> fallos = new ArrayList<>();
            for (Future<Throwable> tarea : tareas) {
                Throwable resultado = tarea.get(60, TimeUnit.SECONDS);
                if (resultado != null) {
                    fallos.add(resultado);
                }
            }
            pool.shutdownNow();
            assertTrue(fallos.isEmpty(), "ronda " + ronda + ": " + fallos);
            assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM comercio WHERE id = ?", String.class, e.dueno().comercioId()));
            for (int pedidoId : pedidos) {
                assertEquals(estadoPedido(pedidoId), jdbcTemplate.queryForObject(
                        "SELECT estado FROM historial_estado_pedido WHERE pedido_id = ? ORDER BY id DESC LIMIT 1", String.class, pedidoId));
            }
        }
    }

    private static int aleatorio() {
        return java.util.concurrent.ThreadLocalRandom.current().nextInt(1_000_000);
    }

    private static void esperar(CountDownLatch latch) {
        try {
            latch.await(15, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    private static void pausa(long milisegundos) {
        try {
            Thread.sleep(milisegundos);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
