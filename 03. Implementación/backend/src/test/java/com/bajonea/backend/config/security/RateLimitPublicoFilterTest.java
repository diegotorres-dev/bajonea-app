package com.bajonea.backend.config.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * El límite por IP de los endpoints públicos: un contador por grupo de rutas y por IP, con límite propio por
 * grupo. Validar y aceptar una invitación comparten contador; la firma de fotos del registro tiene el suyo.
 */
class RateLimitPublicoFilterTest {

    private static final String VALIDAR = "/api/v1/auth/invitaciones-empleado/validar";
    private static final String ACEPTAR = "/api/v1/auth/invitaciones-empleado/aceptar";
    private static final String FOTO_CLIENTE = "/api/v1/auth/registro/cliente/foto-firma";
    private static final String FOTO_COMERCIO = "/api/v1/auth/registro/comercio/foto-firma";

    private final RateLimitPublicoFilter filtro = new RateLimitPublicoFilter(2, 3);

    private MockHttpServletResponse llamar(String metodo, String ruta, String ip) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(metodo, ruta);
        request.setRequestURI(ruta);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filtro.doFilter(request, response, new MockFilterChain());
        return response;
    }

    private int estado(String ruta, String ip) throws Exception {
        return llamar("POST", ruta, ip).getStatus();
    }

    @Test
    void validarYAceptarComparteContadorYElCuartoPedidoDeLaMismaIpDa429ConElFormatoDeError() throws Exception {
        assertEquals(200, estado(VALIDAR, "10.0.0.1"));
        assertEquals(200, estado(ACEPTAR, "10.0.0.1"));
        assertEquals(200, estado(VALIDAR, "10.0.0.1"));

        MockHttpServletResponse excedida = llamar("POST", ACEPTAR, "10.0.0.1");

        assertEquals(429, excedida.getStatus());
        assertEquals("application/json", excedida.getContentType());
        assertEquals("{\"mensaje\":\"Demasiadas solicitudes. Esperá un minuto e intentá de nuevo.\",\"data\":null}",
                excedida.getContentAsString());
    }

    @Test
    void cadaIpTieneSuPropioContador() throws Exception {
        for (int i = 0; i < 3; i++) {
            assertEquals(200, estado(VALIDAR, "10.0.0.1"));
        }
        assertEquals(429, estado(VALIDAR, "10.0.0.1"));

        assertEquals(200, estado(VALIDAR, "10.0.0.2"));
    }

    @Test
    void laFirmaDeFotosDelRegistroTieneSuPropioGrupoConSuPropioLimiteYNoPisaElDeLasInvitaciones() throws Exception {
        assertEquals(200, estado(FOTO_CLIENTE, "10.0.0.1"));
        assertEquals(200, estado(FOTO_COMERCIO, "10.0.0.1"));
        assertEquals(429, estado(FOTO_CLIENTE, "10.0.0.1"), "la foto de cliente y la de comercio comparten contador");

        assertEquals(200, estado(VALIDAR, "10.0.0.1"));
        assertEquals(200, estado(VALIDAR, "10.0.0.1"));
        assertEquals(200, estado(VALIDAR, "10.0.0.1"));
        assertEquals(429, estado(VALIDAR, "10.0.0.1"));
    }

    @Test
    void lasDemasRutasYLosPreflightNoSeLimitanNiCuentan() throws Exception {
        for (int i = 0; i < 50; i++) {
            assertEquals(200, estado("/api/v1/auth/login", "10.0.0.1"));
            assertEquals(200, llamar("OPTIONS", VALIDAR, "10.0.0.1").getStatus());
        }
        assertTrue(estado(VALIDAR, "10.0.0.1") == 200, "los OPTIONS de arriba no gastaron el cupo");
    }
}
