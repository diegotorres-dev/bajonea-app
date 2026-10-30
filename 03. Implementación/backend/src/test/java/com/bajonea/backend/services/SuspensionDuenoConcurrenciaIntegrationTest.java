package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Las carreras de la suspensión de un Dueño (Fase 5, tramo S3): suspender mientras la cuenta y sus comercios están en uso.
 * Con datos confirmados y varios hilos, la suspensión contra un login, la aprobación de un comercio pendiente, la
 * suspensión del mismo comercio por separado, otro levantamiento o suspensión, las acciones de un Empleado sobre los
 * pedidos, un pago aprobado, una invitación y la suspensión de un Empleado mientras se evalúa quién atiende. Nunca hay un
 * error de bloqueo y el resultado siempre es uno de los órdenes posibles, con cada reembolso una sola vez.
 */
class SuspensionDuenoConcurrenciaIntegrationTest extends SuspensionDuenoTestBase {

    @Autowired
    private InvitacionEmpleadoService invitacionService;

    private static void sinFallosInesperados(List<Object> resultados) {
        for (Object resultado : resultados) {
            assertTrue(!(resultado instanceof Exception) || resultado instanceof ConflictoDeNegocioException, "Fallo inesperado: " + resultado);
        }
    }

    private static long conflictos(List<Object> resultados) {
        return resultados.stream().filter(r -> r instanceof ConflictoDeNegocioException).count();
    }

    private Callable<Object> tareaSuspender(Dueno dueno) {
        return () -> suspender(dueno);
    }

    private void sinComerciosOperativosConElDuenoSuspendido(Dueno dueno) {
        if (estadoUsuario(dueno.id()).equals("SUSPENDIDO")) {
            Integer operativos = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM comercio WHERE dueno_id = ? AND estado IN ('APROBADO','APTO_VENTA','CERRADO_TEMPORALMENTE')",
                    Integer.class, dueno.id());
            assertEquals(0, operativos, "Con el Dueño suspendido no puede quedar ningún comercio operativo");
        }
    }

    @RepeatedTest(8)
    void suspenderContraVariosLoginsNoDejaSesionesAbiertasNiInterbloqueos() {
        Dueno dueno = duenoActivo();
        LoginRequestDTO login = new LoginRequestDTO();
        login.setNombreUsuario(dueno.nombreUsuario());
        login.setPassword(dueno.clave());

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(tareaSuspender(dueno));
        for (int i = 0; i < 3; i++) {
            tareas.add(() -> authService.login(login, "127.0.0.1", "test"));
        }
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoUsuario(dueno.id()));
        assertEquals(0, sesionesActivas(dueno.id()));
        assertEquals("SUSPENDIDO", estadoComercio(dueno.comercioId()));
    }

    @RepeatedTest(8)
    void suspenderContraAprobarUnComercioPendienteNuncaDejaUnComercioOperativoConElDuenoSuspendido() {
        Dueno dueno = duenoActivo();
        int pendiente = comercioExtra(dueno, EstadoComercio.PENDIENTE);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(tareaSuspender(dueno));
        tareas.add(() -> {
            administradorService.resolverAprobacion(pendiente, administradorId, new AprobacionComercioRequestDTO(true, null));
            return null;
        });
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        String estado = estadoComercio(pendiente);
        assertTrue(estado.equals("SUSPENDIDO") || estado.equals("PENDIENTE"), estado);
        sinComerciosOperativosConElDuenoSuspendido(dueno);
        if (estado.equals("SUSPENDIDO")) {
            assertEquals("DUENO", origenSuspension(pendiente));
        }
    }

    @RepeatedTest(8)
    void suspenderContraSuspenderElMismoComercioPorSeparadoDejaAmbosSuspendidosSinInterbloqueos() {
        Dueno dueno = duenoActivo();
        int extra = comercioExtra(dueno, EstadoComercio.APROBADO);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(tareaSuspender(dueno));
        tareas.add(() -> suspensionComercio.suspender(extra, administradorId, new SuspensionComercioRequestDTO("Documentacion vencida y quejas")));
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoUsuario(dueno.id()));
        assertEquals("SUSPENDIDO", estadoComercio(extra));
        assertEquals("SUSPENDIDO", estadoComercio(dueno.comercioId()));
        assertEquals("DUENO", origenSuspension(dueno.comercioId()));
        assertTrue(List.of("DUENO", "INDIVIDUAL").contains(origenSuspension(extra)));
    }

    @RepeatedTest(8)
    void suspenderDosVecesALaVezTieneUnSoloGanadorUnaFilaDeHistorialYUnEmail() {
        Dueno dueno = duenoActivo();

        List<Object> resultados = correrAlMismoTiempo(List.of(tareaSuspender(dueno), tareaSuspender(dueno), tareaSuspender(dueno)));

        sinFallosInesperados(resultados);
        assertEquals(2, conflictos(resultados));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ?", Integer.class, dueno.id()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ? AND estado_destino = 'SUSPENDIDO'",
                Integer.class, dueno.comercioId()));
        verify(emailService, times(1)).enviarDuenoSuspendido(org.mockito.ArgumentMatchers.eq(dueno.email()), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyList());
    }

    @RepeatedTest(8)
    void levantarDosVecesALaVezTieneUnSoloGanadorYRestauraUnaSolaVez() {
        Dueno dueno = duenoActivo();
        suspender(dueno);

        List<Object> resultados = correrAlMismoTiempo(List.of(
                (Callable<Object>) () -> levantar(dueno, null), () -> levantar(dueno, null)));

        sinFallosInesperados(resultados);
        assertEquals(1, conflictos(resultados));
        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ? AND estado_origen = 'SUSPENDIDO'",
                Integer.class, dueno.comercioId()));
    }

    @RepeatedTest(8)
    void suspenderContraLevantarDejaLaCuentaYSusComerciosSiempreCoherentes() {
        Dueno dueno = duenoActivo();

        List<Object> resultados = correrAlMismoTiempo(List.of(tareaSuspender(dueno), () -> levantar(dueno, null)));

        sinFallosInesperados(resultados);
        String cuenta = estadoUsuario(dueno.id());
        if (cuenta.equals("SUSPENDIDO")) {
            assertEquals("SUSPENDIDO", estadoComercio(dueno.comercioId()));
        } else {
            assertEquals("ACTIVO", cuenta);
            assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
        }
    }

    @RepeatedTest(8)
    void suspenderContraLasAccionesDeUnEmpleadoSobreLosPedidosNoPierdeNingunaNiRepiteReembolsos() {
        Dueno dueno = duenoActivo();
        int empleado = empleado(dueno.comercioId());
        int cliente = datos.registrarCliente();
        int aDespachar = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        int aAnular = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        int aAceptar = pedido(dueno.comercioId(), dueno.id(), cliente, "PENDIENTE_CONFIRMACION_COMERCIO");
        var actor = comoEmpleado(dueno, dueno.comercioId(), empleado);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(tareaSuspender(dueno));
        tareas.add(() -> pedidoService.avanzarAEntregaEnCurso(actor, aDespachar));
        tareas.add(() -> pedidoService.anularPedido(actor, aAnular, new AnulacionPedidoRequestDTO(MotivoRechazo.SIN_STOCK, null)));
        tareas.add(() -> pedidoService.aceptarPedido(actor, aAceptar));
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoUsuario(dueno.id()));
        assertTrue(List.of("LISTO_PARA_RETIRAR", "EN_PREPARACION").contains(estadoDelPedido(aDespachar)), estadoDelPedido(aDespachar));
        assertEquals("ANULADO", estadoDelPedido(aAnular));
        assertEquals(1, notas(aAnular));
        String aceptado = estadoDelPedido(aAceptar);
        assertTrue(List.of("EN_PREPARACION", "RECHAZADO").contains(aceptado), aceptado);
        assertEquals(aceptado.equals("RECHAZADO") ? 1 : 0, notas(aAceptar));
        assertEquals(0, notas(aDespachar));
    }

    @RepeatedTest(8)
    void suspenderContraUnPagoAprobadoDejaElPedidoDevueltoUnaSolaVez() {
        Dueno dueno = duenoActivo();
        int cliente = datos.registrarCliente();
        int pedido = pedidoPendientePago(cliente, dueno);
        filaDePago(pedido);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(tareaSuspender(dueno));
        tareas.add(() -> {
            pedidoService.confirmarPagoAprobado(pedido);
            return null;
        });
        sinFallosInesperados(correrAlMismoTiempo(tareas));
        schedulerService.ejecutar("rechazar-pendientes-suspension", LocalDateTime.now());

        String estado = estadoDelPedido(pedido);
        assertTrue(List.of("RECHAZADO", "CANCELADO_POR_SISTEMA").contains(estado), estado);
        assertTrue(notas(pedido) <= 1, "Más de una nota de crédito para el mismo pago");
        assertEquals(1, filasDeHistorialDePedido(pedido, estado));
    }

    @RepeatedTest(8)
    void suspenderContraInvitarAUnEmpleadoNoSeInterbloquea() {
        Dueno dueno = duenoActivo();
        Cuenta invitado = datos.registrarClienteConCredenciales();
        var actor = actor(dueno);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(tareaSuspender(dueno));
        tareas.add(() -> invitacionService.invitar(actor, invitado.email()));
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        assertEquals("SUSPENDIDO", estadoUsuario(dueno.id()));
        assertEquals("SUSPENDIDO", estadoComercio(dueno.comercioId()));
    }

    @RepeatedTest(8)
    void suspenderAlDuenoContraLaSuspensionDeSuUnicoEmpleadoTerminaConElPedidoAnuladoUnaSolaVez() {
        Dueno dueno = duenoActivo();
        int empleado = empleado(dueno.comercioId());
        int cliente = datos.registrarCliente();
        int enPreparacion = pedido(dueno.comercioId(), dueno.id(), cliente, "EN_PREPARACION");
        int listo = pedido(dueno.comercioId(), dueno.id(), cliente, "LISTO_PARA_RETIRAR");

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(tareaSuspender(dueno));
        tareas.add(() -> suspensionUsuario.suspender(empleado, administradorId, new SuspensionUsuarioRequestDTO("Suspension del empleado de prueba")));
        sinFallosInesperados(correrAlMismoTiempo(tareas));
        schedulerService.ejecutar("procesar-sin-atencion-suspension-dueno", LocalDateTime.now());

        assertEquals("SUSPENDIDO", estadoUsuario(empleado));
        assertEquals("ANULADO", estadoDelPedido(enPreparacion));
        assertEquals("CANCELADO_POR_SISTEMA", estadoDelPedido(listo));
        assertEquals(1, notas(enPreparacion));
        assertEquals(1, notas(listo));
    }

    @RepeatedTest(8)
    void dosBarridosAlMismoTiempoProcesanCadaPedidoUnaSolaVez() {
        Dueno dueno = duenoActivo();
        int cliente = datos.registrarCliente();
        suspender(dueno);
        List<Integer> pedidos = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            pedidos.add(pedido(dueno.comercioId(), dueno.id(), cliente, i % 2 == 0 ? "EN_PREPARACION" : "LISTO_PARA_RETIRAR"));
        }

        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            tareas.add(() -> {
                schedulerService.ejecutar("procesar-sin-atencion-suspension-dueno", LocalDateTime.now());
                return null;
            });
        }
        sinFallosInesperados(correrAlMismoTiempo(tareas));

        for (int id : pedidos) {
            assertEquals(1, notas(id));
            String estado = estadoDelPedido(id);
            assertEquals(1, filasDeHistorialDePedido(id, estado));
        }
    }
}
