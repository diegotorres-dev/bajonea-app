package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.bajonea.backend.dto.response.ComercioPublicoResponseDTO;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.repositories.InactividadCuentaRepository;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Quién se inactiva por falta de uso y quién no, y qué le pasa a la cuenta, a sus sesiones, a sus comercios y a sus avisos
 * (Fase 5, tramo S6). Los pedidos, comercios y cuentas son datos reales confirmados en la base de prueba.
 */
class InactivacionCuentaIntegrationTest extends InactividadTestBase {

    @Autowired
    private ComercioService comercioService;

    @Autowired
    private InactividadCuentaRepository inactividadRepository;

    // ---------------------------------------------------------------- umbral

    @Test
    void elUmbralEsExactamenteTresMesesCalendarioContadosDesdeElUltimoAcceso() {
        Cuenta justo = cliente();
        Cuenta unSegundoMas = cliente();
        Cuenta unDiaMenos = cliente();
        Cuenta unDiaMas = cliente();
        acceso(justo.id(), corte);
        acceso(unSegundoMas.id(), corte.minusSeconds(1));
        acceso(unDiaMenos.id(), corte.plusDays(1));
        acceso(unDiaMas.id(), corte.minusDays(1));

        correr();

        assertFalse(inactivada(justo.id()), "exactamente 3 meses todavía no vence");
        assertTrue(inactivada(unSegundoMas.id()));
        assertFalse(inactivada(unDiaMenos.id()));
        assertTrue(inactivada(unDiaMas.id()));
    }

    @Test
    void elUmbralUsaMesesCalendarioYNoTreintaDias() {
        LocalDateTime ahoraDeFinDeMes = LocalDateTime.of(2026, 5, 31, 10, 0);
        Cuenta cuenta = cliente();
        acceso(cuenta.id(), LocalDateTime.of(2026, 2, 28, 9, 59, 59));

        inactivacion.inactivarVencidas(ahoraDeFinDeMes);

        assertTrue(inactivada(cuenta.id()), "31/5 menos 3 meses es 28/2: un acceso anterior a esa hora vence");
    }

    @Test
    void unaCuentaConAccesoRecienteNoSeToca() {
        Cuenta reciente = cliente();

        correr();

        assertEquals("ACTIVO", estadoUsuario(reciente.id()));
        assertEquals(0, filasHistorialUsuario(reciente.id(), "INACTIVO"));
    }

    // ---------------------------------------------------------------- exentos

    @Test
    void elAdministradorNuncaSeInactiva() {
        vencida(administradorId);

        correr();

        assertEquals("ACTIVO", estadoUsuario(administradorId));
    }

    @Test
    void lasCuentasSuspendidasPendientesYBloqueadasQuedanExentas() {
        Cuenta suspendida = cliente();
        Cuenta pendiente = cliente();
        Cuenta bloqueada = cliente();
        datos.cambiarEstadoUsuario(suspendida.id(), "SUSPENDIDO");
        datos.cambiarEstadoUsuario(pendiente.id(), "PENDIENTE");
        datos.cambiarEstadoUsuario(bloqueada.id(), "BLOQUEADO");
        vencida(suspendida.id());
        vencida(pendiente.id());
        vencida(bloqueada.id());

        correr();

        assertEquals("SUSPENDIDO", estadoUsuario(suspendida.id()));
        assertEquals("PENDIENTE", estadoUsuario(pendiente.id()));
        assertEquals("BLOQUEADO", estadoUsuario(bloqueada.id()));
    }

    @Test
    void unClienteConUnPedidoEnCursoEnCualquierEstadoQuedaExento() {
        Dueno vendedor = duenoActivo();
        for (String estado : List.of("PENDIENTE_PAGO", "PENDIENTE_CONFIRMACION_COMERCIO", "EN_PREPARACION", "EN_CAMINO", "LISTO_PARA_RETIRAR")) {
            Cuenta cliente = cliente();
            pedido(vendedor.comercioId(), vendedor.id(), cliente.id(), estado);
            vencida(cliente.id());

            correr();

            assertEquals("ACTIVO", estadoUsuario(cliente.id()), "con un pedido en " + estado);
        }
    }

    @Test
    void unClienteConUnPedidoYaTerminadoSiSeInactiva() {
        Dueno vendedor = duenoActivo();
        Cuenta cliente = cliente();
        pedido(vendedor.comercioId(), vendedor.id(), cliente.id(), "ENTREGADO");
        vencida(cliente.id());

        correr();

        assertTrue(inactivada(cliente.id()));
    }

    @Test
    void unDuenoConUnPedidoEnCursoEnUnoDeSusComerciosQuedaExento() {
        Dueno dueno = duenoActivo();
        int extra = comercioExtra(dueno, EstadoComercio.APROBADO);
        Cuenta comprador = cliente();
        int pedido = pedido(extra, dueno.id(), comprador.id(), "EN_PREPARACION");
        envejecerPedido(pedido, 5);
        vencida(dueno.id());

        correr();

        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
    }

    @Test
    void unDuenoCuyoComercioRecibioUnPedidoEnLosUltimosTresMesesCuentaComoActivo() {
        Dueno dueno = duenoActivo();
        Cuenta comprador = cliente();
        int pedido = pedido(dueno.comercioId(), dueno.id(), comprador.id(), "ENTREGADO");
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = ? WHERE id = ?", corte.plusDays(1), pedido);
        vencida(dueno.id());

        correr();

        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
    }

    @Test
    void unDuenoCuyoUltimoPedidoEsMasViejoQueTresMesesSiSeInactiva() {
        Dueno dueno = duenoActivo();
        Cuenta comprador = cliente();
        int pedido = pedido(dueno.comercioId(), dueno.id(), comprador.id(), "ENTREGADO");
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = ? WHERE id = ?", corte.minusDays(1), pedido);
        vencida(dueno.id());

        correr();

        assertTrue(inactivada(dueno.id()));
    }

    @Test
    void elPedidoRecienteDeCualquierEstadoDelComercioCuenta() {
        Dueno dueno = duenoActivo();
        Cuenta comprador = cliente();
        int pedido = pedido(dueno.comercioId(), dueno.id(), comprador.id(), "PENDIENTE_PAGO");
        jdbcTemplate.update("UPDATE pedido SET estado = 'EXPIRADO' WHERE id = ?", pedido);
        vencida(dueno.id());

        correr();

        assertEquals("ACTIVO", estadoUsuario(dueno.id()));
    }

    // ---------------------------------------------------------------- efectos sobre la cuenta

    @Test
    void inactivarUnClienteDejaElHistorialCierraLaSesionAvisaYMandaElEmailDespuesDelCommit() {
        Cuenta cliente = cliente();
        authService.login(login(cliente), "127.0.0.1", "test");
        assertEquals(1, sesionesActivas(cliente.id()));
        vencida(cliente.id());
        LocalDateTime accesoAntes = accesoDe(cliente.id());

        InactivacionCuentaService.ResultadoCorrida resultado = correr();

        assertTrue(resultado.inactivadas() >= 1);
        assertEquals("INACTIVO", estadoUsuario(cliente.id()));
        Map<String, Object> historial = jdbcTemplate.queryForMap("SELECT estado_origen, estado_destino, motivo, administrador_id "
                + "FROM historial_estado_usuario WHERE usuario_id = ? AND estado_destino = 'INACTIVO'", cliente.id());
        assertEquals("ACTIVO", historial.get("estado_origen"));
        assertEquals("Inactividad", historial.get("motivo"));
        assertEquals(null, historial.get("administrador_id"));
        assertEquals(0, sesionesActivas(cliente.id()));
        assertEquals("INACTIVIDAD", jdbcTemplate.queryForObject("SELECT tipo_cierre FROM sesion WHERE usuario_id = ? ORDER BY id DESC LIMIT 1",
                String.class, cliente.id()));
        assertEquals(accesoAntes, accesoDe(cliente.id()), "inactivar no toca el último acceso");
        assertEquals(1, avisosPush(cliente.id(), "CUENTA_INACTIVADA"));
        verify(emailService).enviarCuentaInactivada(eq(cliente.email()), eq(List.of()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'CUENTA_INACTIVADA' "
                + "AND canal = 'EMAIL' AND estado = 'ENVIADO'", Integer.class, cliente.id()));
    }

    @Test
    void siElEmailFallaLaCuentaIgualQuedaInactivaYElFalloQuedaRegistrado() {
        Cuenta cliente = cliente();
        vencida(cliente.id());
        org.mockito.Mockito.when(emailService.enviarCuentaInactivada(eq(cliente.email()), anyList()))
                .thenReturn(ResultadoEnvioEmail.fallido(503, "caído"));

        correr();

        assertTrue(inactivada(cliente.id()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = 'CUENTA_INACTIVADA' "
                + "AND canal = 'EMAIL' AND estado = 'FALLIDO'", Integer.class, cliente.id()));
    }

    @Test
    void unaSegundaCorridaNoHaceNadaSobreLoYaInactivado() {
        Cuenta cliente = cliente();
        vencida(cliente.id());
        correr();
        assertTrue(inactivada(cliente.id()));

        InactivacionCuentaService.ResultadoCorrida segunda = correr();

        assertEquals(1, filasHistorialUsuario(cliente.id(), "INACTIVO"));
        assertEquals(1, avisosPush(cliente.id(), "CUENTA_INACTIVADA"));
        assertEquals(0, segunda.inactivadas());
        verify(emailService, org.mockito.Mockito.times(1)).enviarCuentaInactivada(eq(cliente.email()), anyList());
    }

    @Test
    void siLaTransaccionSeRevierteNoSaleElEmailNiQuedaNadaAMedias() {
        Cuenta cliente = cliente();
        authService.login(login(cliente), "127.0.0.1", "test");
        vencida(cliente.id());
        jdbcTemplate.update("UPDATE usuario SET estado = 'ACTIVO' WHERE id = ?", cliente.id());
        org.springframework.transaction.support.TransactionTemplate plantilla =
                new org.springframework.transaction.support.TransactionTemplate(transactionManager);

        try {
            plantilla.executeWithoutResult(status -> {
                avisoCuentaServiceParaPruebas.avisarInactivacion(cliente.id(), cliente.email(), List.of());
                throw new IllegalStateException("falla provocada");
            });
        } catch (IllegalStateException esperada) {
            assertEquals("falla provocada", esperada.getMessage());
        }

        verify(emailService, never()).enviarCuentaInactivada(anyString(), anyList());
        assertEquals(0, avisosPush(cliente.id(), "CUENTA_INACTIVADA"));
        assertEquals("ACTIVO", estadoUsuario(cliente.id()));
    }

    @Autowired
    private AvisoCuentaService avisoCuentaServiceParaPruebas;

    // ---------------------------------------------------------------- comercios

    @Test
    void inactivarAUnDuenoInactivaSusComerciosDisponiblesYNoTocaLosSuspendidosNiLosPendientes() {
        Dueno dueno = duenoActivo();
        int aprobado = comercioExtra(dueno, EstadoComercio.APROBADO);
        int cerrado = comercioExtra(dueno, EstadoComercio.CERRADO_TEMPORALMENTE);
        int suspendido = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        int pendiente = comercioExtra(dueno, EstadoComercio.PENDIENTE);
        vencida(dueno.id());

        correr();

        assertTrue(inactivada(dueno.id()));
        assertEquals("INACTIVO", estadoComercio(dueno.comercioId()));
        assertEquals("INACTIVO", estadoComercio(aprobado));
        assertEquals("INACTIVO", estadoComercio(cerrado));
        assertEquals("SUSPENDIDO", estadoComercio(suspendido));
        assertEquals("PENDIENTE", estadoComercio(pendiente));
        for (int comercio : List.of(dueno.comercioId(), aprobado, cerrado)) {
            assertEquals(1, filasHistorialComercio(comercio, "INACTIVO"));
        }
        assertEquals(0, filasHistorialComercio(suspendido, "INACTIVO"));
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT estado_origen, administrador_id FROM historial_estado_comercio "
                + "WHERE comercio_id = ? AND estado_destino = 'INACTIVO'", dueno.comercioId());
        assertEquals("APTO_VENTA", fila.get("estado_origen"));
        assertEquals(null, fila.get("administrador_id"));
    }

    @Test
    void losComerciosInactivosSalenDelCatalogoYDejanDeAceptarPedidos() {
        Dueno dueno = duenoActivo();
        assertTrue(enCatalogo(dueno.comercioId()));
        vencida(dueno.id());

        correr();

        assertFalse(enCatalogo(dueno.comercioId()));
        assertFalse(ComercioActivoService.esOperativo(EstadoComercio.INACTIVO));
        com.bajonea.backend.exceptions.ConflictoDeNegocioException ex = org.junit.jupiter.api.Assertions.assertThrows(
                com.bajonea.backend.exceptions.ConflictoDeNegocioException.class,
                () -> comercioService.validarAceptaPedidos(comercioRepository().findById(dueno.comercioId()).orElseThrow(),
                        EstadoComercio.INACTIVO, false));
        assertNotNull(ex.getMessage());
    }

    @Test
    void inactivarAUnDuenoAvisaPorCadaComercioYElEmailNombraATodos() {
        Dueno dueno = duenoActivo();
        int otro = comercioExtra(dueno, EstadoComercio.APROBADO);
        String nombreOtro = jdbcTemplate.queryForObject("SELECT nombre FROM comercio WHERE id = ?", String.class, otro);
        vencida(dueno.id());

        correr();

        assertEquals(1, avisosPush(dueno.id(), "CUENTA_INACTIVADA"));
        assertEquals(2, avisosPush(dueno.id(), "COMERCIO_INACTIVADO"));
        verify(emailService).enviarCuentaInactivada(eq(dueno.email()), org.mockito.ArgumentMatchers.argThat(
                nombres -> nombres.size() == 2 && nombres.contains(dueno.nombreComercio()) && nombres.contains(nombreOtro)));
    }

    @Test
    void elEquipoDeUnComercioInactivoLoVeEnSoloLectura() {
        Dueno dueno = duenoActivo();
        int empleadoId = empleado(dueno.comercioId());
        vencida(dueno.id());

        correr();

        assertEquals("INACTIVO", estadoComercio(dueno.comercioId()));
        assertTrue(ComercioActivoService.ESTADOS_ACCESIBLES_EMPLEADO.contains(EstadoComercio.INACTIVO));
        com.bajonea.backend.config.security.ComercioActivo actor = comoEmpleado(dueno, dueno.comercioId(), empleadoId);
        com.bajonea.backend.exceptions.ConflictoComercioException ex = org.junit.jupiter.api.Assertions.assertThrows(
                com.bajonea.backend.exceptions.ConflictoComercioException.class,
                () -> ComercioActivoService.validarComercioModificable(actor, EstadoComercio.INACTIVO));
        assertEquals("COMERCIO_INACTIVO", ex.getData().get("codigo"));
        assertEquals(1, misComerciosEmpleado.listar(empleadoId).size());
        assertTrue(accesoEmpleado.consultar(empleadoId, dueno.comercioId()).isComercioAccesible());
        com.bajonea.backend.exceptions.ConflictoComercioException sinOperar = org.junit.jupiter.api.Assertions.assertThrows(
                com.bajonea.backend.exceptions.ConflictoComercioException.class,
                () -> ComercioActivoService.validarComercioAceptaPedidosNuevos(actor, EstadoComercio.INACTIVO));
        assertEquals("COMERCIO_SIN_OPERACION", sinOperar.getData().get("codigo"));
    }

    @Autowired
    private MisComerciosEmpleadoService misComerciosEmpleado;

    @Autowired
    private AccesoEmpleadoService accesoEmpleado;

    @Autowired
    private com.bajonea.backend.repositories.ComercioRepository comercioRepositoryBean;

    private com.bajonea.backend.repositories.ComercioRepository comercioRepository() {
        return comercioRepositoryBean;
    }

    private boolean enCatalogo(int comercioId) {
        return comercioService.listarAprobados().stream().map(ComercioPublicoResponseDTO::getId).anyMatch(id -> id == comercioId);
    }

    // ---------------------------------------------------------------- datos existentes y repositorio

    @Test
    void todaCuentaTieneUltimoAccesoYLasNuevasNacenConLaFechaDeRegistro() {
        assertEquals("NO", jdbcTemplate.queryForObject("SELECT is_nullable FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name = 'usuario' AND column_name = 'fecha_ultimo_acceso'", String.class));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM usuario WHERE fecha_ultimo_acceso IS NULL", Integer.class));
        Cuenta nueva = cliente();
        LocalDateTime registro = jdbcTemplate.queryForObject("SELECT fecha_registro FROM usuario WHERE id = ?", LocalDateTime.class, nueva.id());
        assertTrue(Math.abs(java.time.Duration.between(registro, accesoDe(nueva.id())).getSeconds()) <= 2);
    }

    @Test
    void despuesDeLaMigracionNadieEsCandidatoSiNoPasaronTresMeses() {
        assertTrue(inactividadRepository.candidatos(ahora.minusMonths(3), 1000).isEmpty()
                || inactividadRepository.candidatos(ahora.minusMonths(3), 1000).stream()
                        .allMatch(c -> accesoDe(c.usuarioId()).isBefore(ahora.minusMonths(3))));
    }

    @Test
    void elTopeLimitaLaCantidadDeCandidatasYTomaPrimeroLasMasViejas() {
        Cuenta masVieja = cliente();
        Cuenta intermedia = cliente();
        Cuenta menosVieja = cliente();
        acceso(masVieja.id(), LocalDateTime.of(2000, 1, 1, 0, 0));
        acceso(intermedia.id(), LocalDateTime.of(2000, 1, 2, 0, 0));
        acceso(menosVieja.id(), LocalDateTime.of(2000, 1, 3, 0, 0));

        List<InactividadCuentaRepository.Candidato> dos = inactividadRepository.candidatos(corte, 2);

        assertEquals(2, dos.size());
        assertEquals(masVieja.id(), dos.get(0).usuarioId());
        assertEquals(intermedia.id(), dos.get(1).usuarioId());
    }

    @Test
    void laCorridaProcesaSoloElTopeConfiguradoYElRestoQuedaParaLaSiguiente() {
        InactivacionCuentaService conTope = new InactivacionCuentaService(inactividadRepository, usuarioRepositoryBean, comercioRepositoryBean,
                sesionRepositoryBean, estadoUsuarioServiceBean, aptitudBean, avisoCuentaServiceParaPruebas, java.time.Clock.systemDefaultZone(),
                transactionManager, 3, 1);
        Cuenta primera = cliente();
        Cuenta segunda = cliente();
        acceso(primera.id(), LocalDateTime.of(2000, 1, 1, 0, 0));
        acceso(segunda.id(), LocalDateTime.of(2000, 1, 2, 0, 0));

        InactivacionCuentaService.ResultadoCorrida resultado = conTope.inactivarVencidas(ahora);

        assertEquals(1, resultado.candidatos());
        assertTrue(inactivada(primera.id()));
        assertFalse(inactivada(segunda.id()));
        conTope.inactivarVencidas(ahora);
        assertTrue(inactivada(segunda.id()));
    }

    @Autowired
    private com.bajonea.backend.repositories.UsuarioRepository usuarioRepositoryBean;

    @Autowired
    private com.bajonea.backend.repositories.SesionRepository sesionRepositoryBean;

    @Autowired
    private EstadoUsuarioService estadoUsuarioServiceBean;

    @Autowired
    private AptitudVentaComercioService aptitudBean;
}
