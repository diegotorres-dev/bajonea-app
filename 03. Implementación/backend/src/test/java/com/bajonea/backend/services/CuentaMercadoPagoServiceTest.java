package com.bajonea.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.bajonea.backend.entities.CuentaMercadoPago;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.exceptions.CuentaMercadoPagoEnUsoException;
import com.bajonea.backend.exceptions.CuentaMercadoPagoYaVinculadaException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CuentaMercadoPagoRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Reglas de vinculación de la cuenta de Mercado Pago (multi-comercio, tramo 5): una sola cuenta activa por
 * Dueño, una cuenta activa en un solo Dueño, idempotencia al volver a vincular la misma, y traducción de la
 * violación del índice único (carrera) a la misma excepción de cuenta en uso.
 */
class CuentaMercadoPagoServiceTest {

    private static final String INDICE = "uq_cuenta_mp_user_id_activo";

    private CuentaMercadoPagoRepository cuentaRepository;
    private DuenoRepository duenoRepository;
    private CuentaMercadoPagoService service;
    private Dueno duenoA;
    private Dueno duenoB;

    @BeforeEach
    void preparar() {
        cuentaRepository = mock(CuentaMercadoPagoRepository.class);
        duenoRepository = mock(DuenoRepository.class);
        service = new CuentaMercadoPagoService(cuentaRepository, duenoRepository);

        duenoA = mock(Dueno.class);
        when(duenoA.getId()).thenReturn(1);
        duenoB = mock(Dueno.class);
        when(duenoB.getId()).thenReturn(2);
        when(duenoRepository.findById(1)).thenReturn(Optional.of(duenoA));
        when(duenoRepository.findById(2)).thenReturn(Optional.of(duenoB));
        when(cuentaRepository.saveAndFlush(any(CuentaMercadoPago.class))).thenAnswer(inv -> inv.getArgument(0));
        when(cuentaRepository.findByDuenoId(any())).thenReturn(Optional.empty());
        when(cuentaRepository.findByMpUserIdAndActivaTrue(any())).thenReturn(Optional.empty());
    }

    private CuentaMercadoPago cuenta(Dueno dueno, String mpUserId, boolean activa) {
        return CuentaMercadoPago.builder().dueno(dueno).mpUserId(mpUserId).accessToken("a").refreshToken("r")
                .activa(activa).fechaVinculacion(LocalDateTime.now().minusDays(1)).build();
    }

    private CuentaMercadoPago vincular(int duenoId, String mpUserId) {
        return service.vincular(duenoId, mpUserId, "acceso", "refresco", "publica", true, LocalDateTime.now().plusDays(1));
    }

    @Test
    void vincularPrimeraCuentaCreaLaFilaActiva() {
        CuentaMercadoPago guardada = vincular(1, "MP-1");

        assertTrue(guardada.isActiva());
        assertEquals("MP-1", guardada.getMpUserId());
        assertEquals("acceso", guardada.getAccessToken());
    }

    @Test
    void vincularLaMismaCuentaDosVecesEsIdempotenteYRefrescaLosDatos() {
        CuentaMercadoPago existente = cuenta(duenoA, "MP-1", true);
        when(cuentaRepository.findByDuenoId(1)).thenReturn(Optional.of(existente));
        when(cuentaRepository.findByMpUserIdAndActivaTrue("MP-1")).thenReturn(Optional.of(existente));

        CuentaMercadoPago guardada = vincular(1, "MP-1");

        assertSame(existente, guardada);
        assertTrue(guardada.isActiva());
        assertEquals("acceso", guardada.getAccessToken());
        assertEquals("refresco", guardada.getRefreshToken());
    }

    @Test
    void vincularOtraCuentaConUnaActivaDaYaVinculadaYNoEscribeNada() {
        CuentaMercadoPago existente = cuenta(duenoA, "MP-1", true);
        when(cuentaRepository.findByDuenoId(1)).thenReturn(Optional.of(existente));

        CuentaMercadoPagoYaVinculadaException ex =
                assertThrows(CuentaMercadoPagoYaVinculadaException.class, () -> vincular(1, "MP-2"));

        assertEquals("Ya tenés una cuenta de Mercado Pago vinculada. Desvinculala antes de vincular otra.", ex.getMessage());
        assertEquals("MP-1", existente.getMpUserId());
        verify(cuentaRepository, never()).saveAndFlush(any());
    }

    @Test
    void vincularUnaCuentaActivaEnOtroDuenoDaEnUsoSinRevelarQuienLaTiene() {
        when(cuentaRepository.findByMpUserIdAndActivaTrue("MP-1")).thenReturn(Optional.of(cuenta(duenoB, "MP-1", true)));

        CuentaMercadoPagoEnUsoException ex =
                assertThrows(CuentaMercadoPagoEnUsoException.class, () -> vincular(1, "MP-1"));

        assertEquals("Esa cuenta de Mercado Pago ya está en uso por otro Dueño. Usá otra cuenta, o pedí que la desvinculen primero.",
                ex.getMessage());
        verify(cuentaRepository, never()).saveAndFlush(any());
    }

    @Test
    void unaFilaInactivaDeOtroDuenoNoCuentaComoVinculada() {
        when(cuentaRepository.findByMpUserIdAndActivaTrue("MP-1")).thenReturn(Optional.empty());

        CuentaMercadoPago guardada = vincular(1, "MP-1");

        assertTrue(guardada.isActiva());
    }

    @Test
    void revincularConUnaCuentaDistintaTrasDesvincularEsValido() {
        CuentaMercadoPago inactiva = cuenta(duenoA, "MP-1", false);
        when(cuentaRepository.findByDuenoId(1)).thenReturn(Optional.of(inactiva));

        CuentaMercadoPago guardada = vincular(1, "MP-2");

        assertSame(inactiva, guardada);
        assertTrue(guardada.isActiva());
        assertEquals("MP-2", guardada.getMpUserId());
        assertEquals(null, guardada.getFechaDesvinculacion());
    }

    @Test
    void laViolacionDelIndiceUnicoDeCuentaActivaSeTraduceAEnUso() {
        when(cuentaRepository.saveAndFlush(any(CuentaMercadoPago.class))).thenThrow(new DataIntegrityViolationException(
                "no se pudo guardar", new SQLException("Duplicate entry 'MP-1' for key '" + INDICE + "'", "23000", 1062)));

        assertThrows(CuentaMercadoPagoEnUsoException.class, () -> vincular(1, "MP-1"));
    }

    @Test
    void otraViolacionDeIntegridadNoSeDisfrazaDeCuentaEnUso() {
        DataIntegrityViolationException otra = new DataIntegrityViolationException("no se pudo guardar",
                new SQLException("Duplicate entry '1' for key 'uq_cuenta_mp_dueno'", "23000", 1062));
        when(cuentaRepository.saveAndFlush(any(CuentaMercadoPago.class))).thenThrow(otra);

        assertSame(otra, assertThrows(DataIntegrityViolationException.class, () -> vincular(1, "MP-1")));
    }

    @Test
    void desvincularLiberaLaCuentaSinBorrarLosTokens() {
        CuentaMercadoPago activa = cuenta(duenoA, "MP-1", true);

        service.desvincular(activa);

        assertFalse(activa.isActiva());
        assertEquals("a", activa.getAccessToken());
        assertEquals("r", activa.getRefreshToken());
        assertTrue(activa.getFechaDesvinculacion() != null);
        verify(cuentaRepository).saveAndFlush(activa);
    }

    @Test
    void obtenerActivaConBloqueoSinCuentaOInactivaDa404ConElTextoCorregido() {
        when(cuentaRepository.findByDuenoIdConBloqueo(1)).thenReturn(Optional.empty());
        when(cuentaRepository.findByDuenoIdConBloqueo(2)).thenReturn(Optional.of(cuenta(duenoB, "MP-1", false)));

        RecursoNoEncontradoException sinCuenta = assertThrows(RecursoNoEncontradoException.class,
                () -> service.obtenerActivaConBloqueo(1));
        assertThrows(RecursoNoEncontradoException.class, () -> service.obtenerActivaConBloqueo(2));

        assertEquals("El Dueño no tiene ninguna cuenta de Mercado Pago vinculada", sinCuenta.getMessage());
    }
}
