package com.bajonea.backend.controllers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.CuentaMercadoPagoEnUsoException;
import com.bajonea.backend.exceptions.CuentaMercadoPagoYaVinculadaException;
import com.bajonea.backend.services.MercadoPagoOAuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * El callback de la vinculación nunca devuelve JSON: redirige a {@code comercio-perfil.html} con el resultado en
 * {@code vinculacionMp}. Los dos conflictos de cuenta tienen código propio; todo lo demás sigue siendo {@code error}.
 */
class MercadoPagoOAuthControllerCallbackTest {

    private static final String BASE = "http://frontend.test";

    private MercadoPagoOAuthService service;
    private MercadoPagoOAuthController controller;

    @BeforeEach
    void preparar() {
        service = mock(MercadoPagoOAuthService.class);
        controller = new MercadoPagoOAuthController(service);
        ReflectionTestUtils.setField(controller, "frontendBaseUrl", BASE);
    }

    private String destino(String code, String state) {
        ResponseEntity<?> respuesta = controller.callback(code, state);
        assertEquals(HttpStatus.FOUND, respuesta.getStatusCode());
        return respuesta.getHeaders().getLocation().toString();
    }

    @Test
    void unaVinculacionExitosaRedirigeConExito() {
        assertEquals(BASE + "/comercio-perfil.html?vinculacionMp=exito", destino("codigo", "estado"));
    }

    @Test
    void unaCuentaEnUsoRedirigeConSuCodigoPropio() {
        doThrow(new CuentaMercadoPagoEnUsoException()).when(service).procesarCallback(any(), any());

        assertEquals(BASE + "/comercio-perfil.html?vinculacionMp=cuenta-en-uso", destino("codigo", "estado"));
    }

    @Test
    void unDuenoConCuentaActivaRedirigeConSuCodigoPropio() {
        doThrow(new CuentaMercadoPagoYaVinculadaException()).when(service).procesarCallback(any(), any());

        assertEquals(BASE + "/comercio-perfil.html?vinculacionMp=cuenta-ya-vinculada", destino("codigo", "estado"));
    }

    @Test
    void cualquierOtroErrorSigueSiendoErrorGenerico() {
        doThrow(new ConflictoDeNegocioException("El intento de vinculación no es válido")).when(service).procesarCallback(any(), any());
        assertEquals(BASE + "/comercio-perfil.html?vinculacionMp=error", destino("codigo", "estado"));

        doThrow(new IllegalStateException("falla inesperada")).when(service).procesarCallback(any(), any());
        assertEquals(BASE + "/comercio-perfil.html?vinculacionMp=error", destino("codigo", "estado"));
    }

    @Test
    void sinCodeOSinStateRedirigeConErrorSinLlamarAlServicio() {
        assertEquals(BASE + "/comercio-perfil.html?vinculacionMp=error", destino(null, "estado"));
        assertEquals(BASE + "/comercio-perfil.html?vinculacionMp=error", destino("codigo", " "));

        verifyNoInteractions(service);
    }
}
