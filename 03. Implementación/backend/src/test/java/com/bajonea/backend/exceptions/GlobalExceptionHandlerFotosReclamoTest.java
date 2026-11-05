package com.bajonea.backend.exceptions;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.config.ReclamoFotosProperties;
import com.bajonea.backend.dto.response.ApiResponse;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class GlobalExceptionHandlerFotosReclamoTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler(new DocumentacionComercioProperties());

    @Test
    void unPedidoDeReclamoQueSuperaElTopeHablaDeFotosNoDeDocumentos() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/pedidos/cliente/7/reclamo");

        ResponseEntity<ApiResponse<?>> respuesta = handler.handleMaxUploadSizeExceeded(new MaxUploadSizeExceededException(1), request);

        assertEquals(HttpStatus.BAD_REQUEST, respuesta.getStatusCode());
        assertEquals("Las fotos pesan demasiado. Cada foto puede tener hasta 5 MB", respuesta.getBody().getMensaje());
        assertEquals(Map.of("codigo", "RECLAMO_FOTO_TAMANO_EXCEDIDO"), respuesta.getBody().getData());
    }

    @Test
    void elMaximoDeLaFotoSalePorLaPropiedad() {
        ReclamoFotosProperties propiedades = new ReclamoFotosProperties();
        propiedades.setMaxBytes(2 * 1024 * 1024);
        handler.setReclamoFotosProperties(propiedades);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/pedidos/cliente/7/reclamo");

        ResponseEntity<ApiResponse<?>> respuesta = handler.handleMaxUploadSizeExceeded(new MaxUploadSizeExceededException(1), request);

        assertEquals("Las fotos pesan demasiado. Cada foto puede tener hasta 2 MB", respuesta.getBody().getMensaje());
    }

    @Test
    void laValidacionDeLaFotoLlevaSuCodigoEnData() {
        ResponseEntity<ApiResponse<?>> respuesta = handler.handleValidacionFotoReclamo(new ValidacionFotoReclamoException(
                ValidacionFotoReclamoException.FORMATO_NO_PERMITIDO, "Solo se aceptan fotos en formato JPG, PNG o WebP"));

        assertEquals(HttpStatus.BAD_REQUEST, respuesta.getStatusCode());
        assertEquals(Map.of("codigo", "RECLAMO_FOTO_FORMATO_NO_PERMITIDO"), respuesta.getBody().getData());
    }
}
