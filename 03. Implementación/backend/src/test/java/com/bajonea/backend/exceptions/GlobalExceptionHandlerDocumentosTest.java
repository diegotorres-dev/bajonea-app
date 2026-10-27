package com.bajonea.backend.exceptions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.dto.response.ApiResponse;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class GlobalExceptionHandlerDocumentosTest {

    private final DocumentacionComercioProperties propiedades = new DocumentacionComercioProperties();
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler(propiedades);

    @Test
    void unArchivoQueSuperaElTopeDuroDicePesoRealYMaximoConElCodigoEstable() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContent(new byte[(int) (20.3 * 1024 * 1024)]);

        ResponseEntity<ApiResponse<?>> respuesta = handler.handleMaxUploadSizeExceeded(
                new MaxUploadSizeExceededException(16L * 1024 * 1024), request);

        assertEquals(HttpStatus.BAD_REQUEST, respuesta.getStatusCode());
        assertEquals("El archivo pesa 20,3 MB y el máximo es 8 MB", respuesta.getBody().getMensaje());
        assertEquals(Map.of("codigo", "DOCUMENTO_TAMANO_EXCEDIDO"), respuesta.getBody().getData());
    }

    @Test
    void sinContentLengthDiceSoloElMaximo() {
        ResponseEntity<ApiResponse<?>> respuesta = handler.handleMaxUploadSizeExceeded(
                new MaxUploadSizeExceededException(16L * 1024 * 1024), new MockHttpServletRequest());

        assertEquals("El archivo supera el máximo de 8 MB", respuesta.getBody().getMensaje());
    }

    @Test
    void elMaximoSalePorLaPropiedad() {
        propiedades.setMaxBytes(3 * 1024 * 1024);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContent(new byte[5 * 1024 * 1024]);

        ResponseEntity<ApiResponse<?>> respuesta = handler.handleMaxUploadSizeExceeded(
                new MaxUploadSizeExceededException(1), request);

        assertEquals("El archivo pesa 5 MB y el máximo es 3 MB", respuesta.getBody().getMensaje());
    }

    @Test
    void laValidacionDelDocumentoLlevaSuCodigoEnData() {
        ResponseEntity<ApiResponse<?>> respuesta = handler.handleValidacionDocumento(new ValidacionDocumentoException(
                ValidacionDocumentoException.FORMATO_NO_PERMITIDO, "Solo se aceptan archivos PDF, JPG, PNG o WebP"));

        assertEquals(HttpStatus.BAD_REQUEST, respuesta.getStatusCode());
        assertTrue(respuesta.getBody().getData().toString().contains("DOCUMENTO_FORMATO_NO_PERMITIDO"));
    }
}
