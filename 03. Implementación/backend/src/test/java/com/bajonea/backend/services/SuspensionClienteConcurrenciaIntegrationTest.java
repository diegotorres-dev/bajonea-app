package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.response.LoginResponseDTO;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CuentaSuspendidaException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * La carrera que importa de la suspensión de un Cliente: suspenderlo mientras opera (Fase 5, tramo S1). Contra
 * {@code bajonea_test} con datos confirmados y varios hilos. En todos los cruces el resultado es coherente: el
 * Cliente termina suspendido con una sola fila de historial, no queda ningún pedido sin pagar, ningún pedido nace
 * después de la suspensión y no hay sesión activa.
 */
class SuspensionClienteConcurrenciaIntegrationTest extends CarritoIntegrationBase {

    @Autowired
    private SuspensionUsuarioService suspensionService;

    @Autowired
    private AuthService authService;

    private int administradorId;

    @BeforeEach
    void prepararAdministrador() {
        administradorId = jdbcTemplate.queryForObject("SELECT id FROM administrador ORDER BY id LIMIT 1", Integer.class);
        when(emailService.enviarCuentaSuspendida(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
    }

    private void suspender(int clienteId) {
        suspensionService.suspender(clienteId, administradorId, new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));
    }

    private int filasDeHistorial(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ?", Integer.class, usuarioId);
    }

    private int pedidosSinPagar(int clienteId) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE cliente_id = ? AND estado = 'PENDIENTE_PAGO'", Integer.class, clienteId);
    }

    private static boolean esEsperado(Object resultado) {
        return !(resultado instanceof Exception) || resultado instanceof CuentaSuspendidaException
                || resultado instanceof ConflictoDeNegocioException;
    }

    @RepeatedTest(10)
    void suspenderContraVariosCheckoutsNoDejaPedidosSinPagarNiPedidosNacidosDespues() {
        Dueno dueno = comercioApto(true);
        int cliente = datos.registrarCliente();
        agregar(cliente, producto(dueno));
        PedidoRequestDTO pedido = new PedidoRequestDTO();
        pedido.setTipoEntrega(TipoEntrega.RETIRO);

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(cliente);
            return null;
        });
        for (int i = 0; i < 4; i++) {
            tareas.add(() -> pedidoService.confirmarPedido(cliente, pedido));
        }
        List<Object> resultados = correrAlMismoTiempo(tareas);

        for (Object resultado : resultados) {
            assertTrue(esEsperado(resultado), "Fallo inesperado: " + resultado);
        }
        assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, cliente));
        assertEquals(0, pedidosSinPagar(cliente));
        assertEquals(1, filasDeHistorial(cliente));
        assertEquals(1, items(cliente));
        long nacidos = resultados.stream().filter(r -> r instanceof com.bajonea.backend.dto.response.PedidoResponseDTO).count();
        assertEquals((int) nacidos, (int) jdbcTemplate.queryForObject("SELECT COUNT(*) FROM pedido WHERE cliente_id = ?", Integer.class, cliente));
    }

    @RepeatedTest(5)
    void dosSuspensionesSimultaneasDejanUnaSolaFilaDeHistorialYUnSoloAviso() {
        int cliente = datos.registrarCliente();

        List<Callable<Object>> tareas = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            tareas.add(() -> {
                suspender(cliente);
                return "ok";
            });
        }
        List<Object> resultados = correrAlMismoTiempo(tareas);

        long exitos = resultados.stream().filter("ok"::equals).count();
        assertEquals(1, exitos, resultados.toString());
        for (Object resultado : resultados) {
            assertTrue(!(resultado instanceof Exception) || resultado instanceof ConflictoDeNegocioException, "Fallo inesperado: " + resultado);
        }
        assertEquals(1, filasDeHistorial(cliente));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND canal = 'PUSH' AND tipo = 'CLIENTE_SUSPENDIDO'",
                Integer.class, cliente));
    }

    @Test
    void suspenderContraTreintaLoginsNoDejaNingunaSesionActivaNiUnLoginExitosoPosterior() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();

        List<Callable<Object>> tareas = new ArrayList<>();
        tareas.add(() -> {
            suspender(cuenta.id());
            return "suspendido";
        });
        for (int i = 0; i < 30; i++) {
            tareas.add(() -> {
                LoginRequestDTO request = new LoginRequestDTO();
                request.setNombreUsuario(cuenta.nombreUsuario());
                request.setPassword(cuenta.clave());
                return authService.login(request, "127.0.0.1", "test");
            });
        }
        List<Object> resultados = correrAlMismoTiempo(tareas);

        for (Object resultado : resultados) {
            assertTrue(!(resultado instanceof Exception) || resultado instanceof CuentaSuspendidaException, "Fallo inesperado: " + resultado);
        }
        assertEquals("SUSPENDIDO", jdbcTemplate.queryForObject("SELECT estado FROM usuario WHERE id = ?", String.class, cuenta.id()));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sesion WHERE usuario_id = ? AND activa = 1", Integer.class, cuenta.id()));
        long tokens = resultados.stream().filter(r -> r instanceof LoginResponseDTO).count();
        assertEquals((int) tokens, (int) jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sesion WHERE usuario_id = ? AND (tipo_cierre = 'SUSPENSION' OR tipo_cierre = 'FORZADO')", Integer.class, cuenta.id()));
    }
}
