package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bajonea.backend.config.security.AuthenticatedUser;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * La inactivación y la reactivación por HTTP (Fase 5, tramo S6): el contrato de las rutas, quién puede llamarlas, los
 * atajos del perfil de pruebas y el programa diario con sus dos modos (habilitado y deshabilitado).
 */
@AutoConfigureMockMvc
class InactividadHttpIntegrationTest extends InactividadTestBase {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private InactivacionCuentaJob jobDelContexto;

    private static String cuerpo(String usuario, String clave) {
        return "{\"nombreUsuario\":\"" + usuario + "\",\"password\":\"" + clave + "\"}";
    }

    private MockHttpServletRequestBuilder como(MockHttpServletRequestBuilder request, RolUsuario rol, int usuarioId) {
        AuthenticatedUser principal = new AuthenticatedUser(usuarioId, 1, rol);
        return request.with(authentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + rol.name())))));
    }

    private Cuenta clienteInactivo() {
        Cuenta cuenta = cliente();
        vencida(cuenta.id());
        correr();
        return cuenta;
    }

    @Test
    void elLoginDeUnaCuentaInactivaRespondeConflictoConElCodigoEstable() throws Exception {
        Cuenta cuenta = clienteInactivo();

        mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(cuerpo(cuenta.nombreUsuario(), cuenta.clave())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("CUENTA_INACTIVA"))
                .andExpect(jsonPath("$.mensaje").value("Cuenta inactiva. Solicitá la reactivación de tu cuenta"));
    }

    @Test
    void reactivarConCredencialesEsPublicoYDevuelveElTokenDeLaSesionNueva() throws Exception {
        Cuenta cuenta = clienteInactivo();

        mockMvc.perform(post("/api/v1/auth/reactivar-cuenta/con-credenciales").contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(cuenta.nombreUsuario(), cuenta.clave())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andExpect(jsonPath("$.data.usuario.estado").value("ACTIVO"));

        assertEquals("ACTIVO", estadoUsuario(cuenta.id()));
    }

    @Test
    void reactivarConUnaContrasenaIncorrectaResponde401ConLosIntentosRestantes() throws Exception {
        Cuenta cuenta = clienteInactivo();

        mockMvc.perform(post("/api/v1/auth/reactivar-cuenta/con-credenciales").contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(cuenta.nombreUsuario(), "Incorrecta1")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data.intentosRestantes").value(2));
    }

    @Test
    void elAdministradorReactivaPorHttpYNadieMasPuede() throws Exception {
        Dueno dueno = duenoActivo();
        vencida(dueno.id());
        correr();
        Cuenta cliente = cliente();

        mockMvc.perform(put("/api/v1/administrador/cuentas/" + dueno.id() + "/reactivar"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(como(put("/api/v1/administrador/cuentas/" + dueno.id() + "/reactivar"), RolUsuario.CLIENTE, cliente.id()))
                .andExpect(status().isForbidden());
        mockMvc.perform(como(put("/api/v1/administrador/cuentas/" + dueno.id() + "/reactivar"), RolUsuario.DUENO, dueno.id()))
                .andExpect(status().isForbidden());
        mockMvc.perform(como(put("/api/v1/administrador/cuentas/" + dueno.id() + "/reactivar"), RolUsuario.ADMINISTRADOR, administradorId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estado").value("ACTIVO"));
        mockMvc.perform(como(put("/api/v1/administrador/cuentas/" + dueno.id() + "/reactivar"), RolUsuario.ADMINISTRADOR, administradorId))
                .andExpect(status().isConflict());

        assertEquals("APTO_VENTA", estadoComercio(dueno.comercioId()));
    }

    @Test
    void laVistaPreviaDeReactivarSoloLaVeElAdministradorYTraeLosComercios() throws Exception {
        Dueno dueno = duenoActivo();
        int suspendido = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        vencida(dueno.id());
        correr();
        Cuenta cliente = cliente();
        String ruta = "/api/v1/administrador/cuentas/" + dueno.id() + "/reactivar/previa";

        mockMvc.perform(get(ruta)).andExpect(status().isUnauthorized());
        mockMvc.perform(como(get(ruta), RolUsuario.CLIENTE, cliente.id())).andExpect(status().isForbidden());
        mockMvc.perform(como(get(ruta), RolUsuario.DUENO, dueno.id())).andExpect(status().isForbidden());
        mockMvc.perform(como(get(ruta), RolUsuario.ADMINISTRADOR, administradorId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.estadoActual").value("INACTIVO"))
                .andExpect(jsonPath("$.data.comercios.length()").value(2))
                .andExpect(jsonPath("$.data.comercios[?(@.comercioId==" + suspendido + ")].resultado").value("SIGUE_SUSPENDIDO"));
    }

    @Test
    void elLoginDeUnDuenoInactivoTraeLosComerciosEnLaRespuestaYUnaClaveIncorrectaNo() throws Exception {
        Dueno dueno = duenoActivo();
        int suspendido = comercioExtra(dueno, EstadoComercio.SUSPENDIDO);
        vencida(dueno.id());
        correr();

        mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(cuerpo(dueno.nombreUsuario(), dueno.clave())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.codigo").value("CUENTA_INACTIVA"))
                .andExpect(jsonPath("$.data.comercios.length()").value(2))
                .andExpect(jsonPath("$.data.comercios[?(@.comercioId==" + suspendido + ")].resultado").value("SIGUE_SUSPENDIDO"));
        mockMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(cuerpo(dueno.nombreUsuario(), "Incorrecta1")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data.comercios").doesNotExist());
    }

    @Test
    void losAtajosDelPerfilDePruebasFijanElAccesoEnvejecenPedidosYCorrenLaInactivacion() throws Exception {
        Cuenta cuenta = cliente();
        Dueno vendedor = duenoActivo();
        int pedido = pedido(vendedor.comercioId(), vendedor.id(), cuenta.id(), "ENTREGADO");
        LocalDateTime fijada = ahora.minusMonths(5).withNano(0);

        mockMvc.perform(put("/api/v1/test/usuarios/" + cuenta.id() + "/ultimo-acceso").param("fecha", fijada.toString()))
                .andExpect(status().isOk());
        assertEquals(fijada, accesoDe(cuenta.id()));
        mockMvc.perform(put("/api/v1/test/usuarios/" + cuenta.id() + "/ultimo-acceso").param("meses", "4").param("dias", "2"))
                .andExpect(status().isOk());
        assertTrue(accesoDe(cuenta.id()).isBefore(LocalDateTime.now().minusMonths(4)));
        mockMvc.perform(put("/api/v1/test/usuarios/2000000000/ultimo-acceso")).andExpect(status().isNotFound());

        LocalDateTime antes = jdbcTemplate.queryForObject("SELECT fecha_creacion FROM pedido WHERE id = ?", LocalDateTime.class, pedido);
        mockMvc.perform(put("/api/v1/test/pedidos/" + pedido + "/envejecer-creacion").param("meses", "2").param("dias", "1"))
                .andExpect(status().isOk());
        assertTrue(jdbcTemplate.queryForObject("SELECT fecha_creacion FROM pedido WHERE id = ?", LocalDateTime.class, pedido)
                .isBefore(antes.minusMonths(2)));
        mockMvc.perform(put("/api/v1/test/pedidos/2000000000/envejecer-creacion")).andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/test/jobs/inactivacion-cuentas"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.inactivadas").isNumber());
        assertTrue(inactivada(cuenta.id()));
        acceso(cuenta.id(), LocalDateTime.now());
        mockMvc.perform(post("/api/v1/test/jobs/inactivacion-cuentas").param("ahora", ahora.plusYears(10).toString()))
                .andExpect(status().isOk());
    }

    @Test
    void elProgramaDiarioDeshabilitadoNoHaceNadaYHabilitadoCorreYSobreviveAUnFallo() {
        Cuenta cuenta = cliente();
        vencida(cuenta.id());

        jobDelContexto.programada();
        assertEquals("ACTIVO", estadoUsuario(cuenta.id()), "con inactividad.job-habilitado=false el programa no corre solo");

        InactivacionCuentaService falso = mock(InactivacionCuentaService.class);
        when(falso.ahora()).thenReturn(ahora);
        when(falso.inactivarVencidas(ahora)).thenReturn(new InactivacionCuentaService.ResultadoCorrida(1, 1, 0, 0));
        new InactivacionCuentaJob(falso, true).programada();
        verify(falso).inactivarVencidas(ahora);

        InactivacionCuentaService roto = mock(InactivacionCuentaService.class);
        when(roto.ahora()).thenReturn(ahora);
        when(roto.inactivarVencidas(ahora)).thenThrow(new IllegalStateException("falla provocada"));
        new InactivacionCuentaJob(roto, true).programada();
        verify(roto).inactivarVencidas(ahora);
    }

    @Test
    void elProgramaDiarioHabilitadoInactivaLasCuentasVencidasConElRelojDeLaAplicacion() {
        Cuenta cuenta = cliente();
        vencida(cuenta.id());

        new InactivacionCuentaJob(inactivacion, true).programada();

        assertTrue(inactivada(cuenta.id()));
    }
}
