package com.bajonea.backend.services;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.LoginRequestDTO;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Base de las pruebas de la inactivación automática por falta de uso (Fase 5, tramo S6): los servicios, el reloj fijo de la
 * corrida (siempre "ahora" real, así el último acceso de las demás cuentas de la base de prueba nunca vence), los helpers
 * para envejecer cuentas y pedidos y la restauración del último acceso de las cuentas tocadas al terminar cada prueba.
 */
abstract class InactividadTestBase extends SuspensionDuenoTestBase {

    @Autowired
    protected InactivacionCuentaService inactivacion;

    @Autowired
    protected ReactivacionCuentaAdminService reactivacionAdmin;

    protected LocalDateTime ahora;
    protected LocalDateTime corte;
    private final List<Integer> tocadas = new ArrayList<>();

    @BeforeEach
    void prepararInactividad() {
        ahora = LocalDateTime.now().withNano(0);
        corte = ahora.minusMonths(3);
        when(emailService.enviarCuentaInactivada(anyString(), anyList())).thenReturn(com.bajonea.backend.services.ResultadoEnvioEmail.enviado("id"));
    }

    @AfterEach
    void restaurarUltimoAcceso() {
        for (Integer id : tocadas) {
            jdbcTemplate.update("UPDATE usuario SET fecha_ultimo_acceso = NOW() WHERE id = ?", id);
        }
    }

    protected void acceso(int usuarioId, LocalDateTime fecha) {
        tocadas.add(usuarioId);
        jdbcTemplate.update("UPDATE usuario SET fecha_ultimo_acceso = ? WHERE id = ?", fecha, usuarioId);
    }

    protected void vencida(int usuarioId) {
        acceso(usuarioId, corte.minusDays(1));
    }

    protected LocalDateTime accesoDe(int usuarioId) {
        return jdbcTemplate.queryForObject("SELECT fecha_ultimo_acceso FROM usuario WHERE id = ?", LocalDateTime.class, usuarioId);
    }

    protected boolean inactivada(int usuarioId) {
        return "INACTIVO".equals(estadoUsuario(usuarioId));
    }

    protected InactivacionCuentaService.ResultadoCorrida correr() {
        return inactivacion.inactivarVencidas(ahora);
    }

    protected Cuenta cliente() {
        return datos.registrarClienteConCredenciales();
    }

    protected LoginRequestDTO login(String nombreUsuario, String clave) {
        LoginRequestDTO request = new LoginRequestDTO();
        request.setNombreUsuario(nombreUsuario);
        request.setPassword(clave);
        return request;
    }

    protected LoginRequestDTO login(Dueno dueno) {
        return login(dueno.nombreUsuario(), dueno.clave());
    }

    protected LoginRequestDTO login(Cuenta cuenta) {
        return login(cuenta.nombreUsuario(), cuenta.clave());
    }

    protected void envejecerPedido(int pedidoId, int meses) {
        jdbcTemplate.update("UPDATE pedido SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL ? MONTH) WHERE id = ?", meses, pedidoId);
    }

    protected int avisosPush(int usuarioId, String tipo) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notificacion WHERE usuario_id = ? AND tipo = ? AND canal = 'PUSH'", Integer.class, usuarioId, tipo);
    }

    protected int filasHistorialUsuario(int usuarioId, String destino) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ? AND estado_destino = ?",
                Integer.class, usuarioId, destino);
    }

    protected int filasHistorialComercio(int comercioId, String destino) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ? AND estado_destino = ?",
                Integer.class, comercioId, destino);
    }
}
