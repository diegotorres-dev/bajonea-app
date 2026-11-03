package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.dto.request.SuspensionUsuarioRequestDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteAdminDetalleResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteAdminResumenResponseDTO;
import com.bajonea.backend.dto.response.ConsultaSoporteCreadaResponseDTO;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.services.DatosPruebaEmpleado.Cuenta;
import com.bajonea.backend.services.DatosPruebaEmpleado.Dueno;
import com.bajonea.backend.services.SoporteAdminService.FiltroBandeja;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * La bandeja de Soporte del Administrador (Fase 5, tramo S4): filtros y orden, la marca de cuenta suspendida, la cuenta
 * asociada al email, responder y cerrar, el reenvío manual de un email que no salió y que el listado no hace una consulta
 * por fila.
 */
class SoporteAdminIntegrationTest extends SoporteIntegrationBase {

    @Autowired
    private SuspensionUsuarioService suspensionUsuario;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private List<ConsultaSoporteAdminResumenResponseDTO> buscar(FiltroBandeja filtro, List<Integer> ids) {
        List<ConsultaSoporteAdminResumenResponseDTO> encontradas = new ArrayList<>();
        for (int pagina = 0; encontradas.size() < ids.size(); pagina++) {
            List<ConsultaSoporteAdminResumenResponseDTO> tramo = soporteAdmin.listar(filtro, 200, pagina);
            if (tramo.isEmpty()) {
                break;
            }
            tramo.stream().filter(c -> ids.contains(c.getId())).forEach(encontradas::add);
        }
        return encontradas;
    }

    private List<ConsultaSoporteAdminResumenResponseDTO> propias(FiltroBandeja filtro, List<Integer> ids) {
        return buscar(filtro, ids);
    }

    private void antiguedad(int ticketId, int anio, int segundo) {
        jdbcTemplate.update("UPDATE ticket_soporte SET actualizado_en = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(java.time.LocalDateTime.of(anio, 1, 1, 0, 0, segundo)), ticketId);
    }

    @Test
    void cadaFiltroTraeSoloSuEstadoYLosQueEsperanVanPrimeroConLosMasViejosArriba() {
        ConsultaSoporteCreadaResponseDTO nueva = crear(emailNuevo(), ipNueva());
        ConsultaSoporteCreadaResponseDTO vieja = crear(emailNuevo(), ipNueva());
        ConsultaSoporteCreadaResponseDTO respondida = crear(emailNuevo(), ipNueva());
        ConsultaSoporteCreadaResponseDTO cerrada = crear(emailNuevo(), ipNueva());
        soporteAdmin.responder(respondida.getId(), texto("Te respondemos"));
        soporteAdmin.cerrar(cerrada.getId());
        antiguedad(nueva.getId(), 2001, 5);
        antiguedad(vieja.getId(), 2001, 1);
        List<Integer> mias = List.of(nueva.getId(), vieja.getId(), respondida.getId(), cerrada.getId());

        List<ConsultaSoporteAdminResumenResponseDTO> esperan = buscar(FiltroBandeja.ESPERAN, List.of(nueva.getId(), vieja.getId()));
        List<Integer> enOrden = esperan.stream().map(ConsultaSoporteAdminResumenResponseDTO::getId).toList();

        assertEquals(List.of(vieja.getId(), nueva.getId()), enOrden);
        assertTrue(esperan.stream().allMatch(c -> c.getEstado().name().equals("ESPERA_SOPORTE")));
        assertEquals(List.of(respondida.getId()), propias(FiltroBandeja.RESPONDIDAS, mias).stream().map(ConsultaSoporteAdminResumenResponseDTO::getId).toList());
        assertEquals(List.of(cerrada.getId()), propias(FiltroBandeja.CERRADAS, mias).stream().map(ConsultaSoporteAdminResumenResponseDTO::getId).toList());
        assertEquals(soporteAdmin.listar(FiltroBandeja.ESPERAN, 5, 0).stream().map(ConsultaSoporteAdminResumenResponseDTO::getId).toList(),
                soporteAdmin.listar(null, 5, 0).stream().map(ConsultaSoporteAdminResumenResponseDTO::getId).toList());
    }

    @Test
    void elListadoMarcaLaCuentaSuspendidaYElEmailSinEnviar() {
        Cuenta suspendida = datos.registrarClienteConCredenciales();
        Cuenta normal = datos.registrarClienteConCredenciales();
        ConsultaSoporteCreadaResponseDTO deSuspendida = crear(suspendida.email().toLowerCase(), ipNueva());
        ConsultaSoporteCreadaResponseDTO deNormal = crear(normal.email().toLowerCase(), ipNueva());
        ConsultaSoporteCreadaResponseDTO sinCuenta = crear(emailNuevo(), ipNueva());
        suspensionUsuario.suspender(suspendida.id(), jdbcTemplate.queryForObject("SELECT id FROM administrador LIMIT 1", Integer.class),
                new SuspensionUsuarioRequestDTO("Pedidos falsos reiterados"));
        when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(503, "x"));
        soporteAdmin.responder(deNormal.getId(), texto("Respuesta cuyo email falla"));

        List<ConsultaSoporteAdminResumenResponseDTO> esperan = propias(FiltroBandeja.ESPERAN, List.of(deSuspendida.getId(), sinCuenta.getId()));
        List<ConsultaSoporteAdminResumenResponseDTO> respondidas = propias(FiltroBandeja.RESPONDIDAS, List.of(deNormal.getId()));

        assertTrue(esperan.stream().filter(c -> c.getId().equals(deSuspendida.getId())).findFirst().orElseThrow().isCuentaSuspendida());
        assertFalse(esperan.stream().filter(c -> c.getId().equals(sinCuenta.getId())).findFirst().orElseThrow().isCuentaSuspendida());
        assertFalse(respondidas.get(0).isCuentaSuspendida());
        assertTrue(respondidas.get(0).isEmailPendienteDeReenvio());
        assertFalse(esperan.get(0).isEmailPendienteDeReenvio());
    }

    @Test
    void elDetalleMuestraLaConversacionYLaCuentaAsociadaSoloSiElEmailCoincide() {
        Cuenta cuenta = datos.registrarClienteConCredenciales();
        ConsultaSoporteCreadaResponseDTO conCuenta = crear(cuenta.email().toLowerCase(), ipNueva());
        ConsultaSoporteCreadaResponseDTO sinCuenta = crear(emailNuevo(), ipNueva());

        ConsultaSoporteAdminDetalleResponseDTO detalle = soporteAdmin.detalle(conCuenta.getId());

        assertEquals(cuenta.id(), detalle.getCuentaAsociada().getUsuarioId());
        assertEquals(EstadoUsuario.ACTIVO, detalle.getCuentaAsociada().getEstado());
        assertEquals(RolUsuario.CLIENTE, detalle.getCuentaAsociada().getRol());
        assertFalse(detalle.getCuentaAsociada().isEsEmpleado());
        assertNotNull(detalle.getCuentaAsociada().getNombre());
        assertNotNull(detalle.getCuentaAsociada().getApellido());
        assertEquals(1, detalle.getMensajes().size());
        assertEquals(Boolean.TRUE, detalle.getMensajes().get(0).getEmailEnviado());
        assertTrue(detalle.isPuedeResponder());
        assertNotNull(detalle.getIp());
        assertEquals(20, detalle.getMaxMensajes());
        assertNull(soporteAdmin.detalle(sinCuenta.getId()).getCuentaAsociada());
    }

    @Test
    void laCuentaAsociadaDistingueAlDuenoYAlEmpleado() {
        Dueno dueno = datos.registrarDuenoAprobado();
        ConsultaSoporteCreadaResponseDTO deDueno = crear(dueno.email().toLowerCase(), ipNueva());
        Cuenta empleado = datos.registrarClienteConCredenciales();
        datos.hacerEmpleado(empleado.id());
        ConsultaSoporteCreadaResponseDTO deEmpleado = crear(empleado.email().toLowerCase(), ipNueva());

        ConsultaSoporteAdminDetalleResponseDTO d1 = soporteAdmin.detalle(deDueno.getId());
        ConsultaSoporteAdminDetalleResponseDTO d2 = soporteAdmin.detalle(deEmpleado.getId());

        assertEquals(RolUsuario.DUENO, d1.getCuentaAsociada().getRol());
        assertEquals(dueno.id(), d1.getCuentaAsociada().getUsuarioId());
        assertNotNull(d1.getCuentaAsociada().getNombre());
        assertFalse(d1.getCuentaAsociada().isEsEmpleado());
        assertEquals(RolUsuario.CLIENTE, d2.getCuentaAsociada().getRol());
        assertTrue(d2.getCuentaAsociada().isEsEmpleado());
    }

    @Test
    void siFallaElEmailDeUnaRespuestaQuedaMarcadoYElReenvioManualLoCorrige() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO creada = crear(email, ipNueva());
        when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.fallido(503, "x"));

        ConsultaSoporteAdminDetalleResponseDTO tras = soporteAdmin.responder(creada.getId(), texto("Respuesta cuyo email falla"));

        assertTrue(tras.isEmailPendienteDeReenvio());
        assertEquals(Boolean.FALSE, tras.getMensajes().get(1).getEmailEnviado());
        verify(emailService, times(1)).enviarSoporteRespuesta(email, creada.getCodigo());

        ConsultaSoporteAdminDetalleResponseDTO otraVezFalla = soporteAdmin.reenviarEmail(creada.getId());
        assertTrue(otraVezFalla.isEmailPendienteDeReenvio());

        when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenReturn(ResultadoEnvioEmail.enviado("id"));
        ConsultaSoporteAdminDetalleResponseDTO corregido = soporteAdmin.reenviarEmail(creada.getId());
        assertFalse(corregido.isEmailPendienteDeReenvio());
        assertEquals(Boolean.TRUE, corregido.getMensajes().get(1).getEmailEnviado());

        ConflictoDeNegocioException ninguno = assertThrows(ConflictoDeNegocioException.class, () -> soporteAdmin.reenviarEmail(creada.getId()));
        assertEquals("No hay ningún email fallido para reenviar", ninguno.getMessage());
        verify(emailService, times(3)).enviarSoporteRespuesta(email, creada.getCodigo());
    }

    @Test
    void sinRespuestasDeSoporteNoHayEmailQueReenviar() {
        ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());

        assertThrows(ConflictoDeNegocioException.class, () -> soporteAdmin.reenviarEmail(creada.getId()));
        verify(emailService, times(0)).enviarSoporteRespuesta(anyString(), anyString());
    }

    @Test
    void siUnaExcepcionInesperadaCortaElEnvioElMensajeQuedaSinEnviar() {
        ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());
        when(emailService.enviarSoporteRespuesta(anyString(), anyString())).thenThrow(new IllegalStateException("explotó el cliente de email"));

        ConsultaSoporteAdminDetalleResponseDTO tras = soporteAdmin.responder(creada.getId(), texto("Respuesta"));

        assertTrue(tras.isEmailPendienteDeReenvio());
        assertEquals("ESPERA_PERSONA", estadoDeLaConsulta(creada.getId()));
    }

    @Test
    void elListadoNoHaceUnaConsultaPorFila() {
        List<Integer> ids = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            Cuenta cuenta = datos.registrarClienteConCredenciales();
            ConsultaSoporteCreadaResponseDTO creada = crear(cuenta.email().toLowerCase(), ipNueva());
            antiguedad(creada.getId(), 2002, i);
            ids.add(creada.getId());
        }
        Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estadisticas.setStatisticsEnabled(true);
        try {
            soporteAdmin.listar(FiltroBandeja.ESPERAN, 2, 0);
            estadisticas.clear();
            soporteAdmin.listar(FiltroBandeja.ESPERAN, 2, 0);
            long conDos = estadisticas.getPrepareStatementCount();
            estadisticas.clear();
            List<ConsultaSoporteAdminResumenResponseDTO> doce = soporteAdmin.listar(FiltroBandeja.ESPERAN, 12, 0);
            long conDoce = estadisticas.getPrepareStatementCount();

            assertEquals(12, doce.size());
            assertEquals(conDos, conDoce);
            assertTrue(conDoce <= 4, "sentencias del listado: " + conDoce);
        } finally {
            estadisticas.setStatisticsEnabled(false);
        }
    }

    @Test
    void laPaginacionDevuelveTramosDistintos() {
        List<Integer> ids = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            ConsultaSoporteCreadaResponseDTO creada = crear(emailNuevo(), ipNueva());
            antiguedad(creada.getId(), 2003, i);
            ids.add(creada.getId());
        }

        List<Integer> primera = soporteAdmin.listar(FiltroBandeja.ESPERAN, 2, 0).stream().map(ConsultaSoporteAdminResumenResponseDTO::getId).toList();
        List<Integer> segunda = soporteAdmin.listar(FiltroBandeja.ESPERAN, 2, 1).stream().map(ConsultaSoporteAdminResumenResponseDTO::getId).toList();

        assertEquals(2, primera.size());
        assertEquals(2, segunda.size());
        assertTrue(primera.stream().noneMatch(segunda::contains));
        assertEquals(1, soporteAdmin.listar(FiltroBandeja.ESPERAN, 0, -3).size());
    }

    @Test
    void elListadoSePuedeLimitarAUnEmailSinDistinguirMayusculas() {
        String email = emailNuevo();
        ConsultaSoporteCreadaResponseDTO propia = crear(email, ipNueva());
        crear(emailNuevo(), ipNueva());

        List<ConsultaSoporteAdminResumenResponseDTO> filtradas = soporteAdmin.listar(FiltroBandeja.ESPERAN, "  " + email.toUpperCase() + " ", 50, 0);

        assertEquals(List.of(propia.getId()), filtradas.stream().map(ConsultaSoporteAdminResumenResponseDTO::getId).toList());
        assertTrue(soporteAdmin.listar(FiltroBandeja.RESPONDIDAS, email, 50, 0).isEmpty());
        assertEquals(1, soporteAdmin.listar(FiltroBandeja.ESPERAN, "   ", 5, 0).size() > 0 ? 1 : 0);
    }

    @Test
    void contarQueEsperanSumaSoloLasConsultasEnEsperaDeSoporte() {
        long antes = soporteAdmin.contarQueEsperan();
        ConsultaSoporteCreadaResponseDTO uno = crear(emailNuevo(), ipNueva());
        crear(emailNuevo(), ipNueva());
        assertEquals(antes + 2, soporteAdmin.contarQueEsperan());

        soporteAdmin.responder(uno.getId(), texto("Respuesta"));

        assertEquals(antes + 1, soporteAdmin.contarQueEsperan());
        assertEquals(antes + 1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM ticket_soporte WHERE estado = 'ESPERA_SOPORTE'", Long.class));
    }
}
