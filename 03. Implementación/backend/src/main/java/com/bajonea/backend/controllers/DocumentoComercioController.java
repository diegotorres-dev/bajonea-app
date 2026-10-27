package com.bajonea.backend.controllers;

import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.SubirDocumentoComercioRequestDTO;
import com.bajonea.backend.dto.response.ApiResponse;
import com.bajonea.backend.dto.response.DocumentoComercioResponseDTO;
import com.bajonea.backend.dto.response.DocumentosComercioResponseDTO;
import com.bajonea.backend.dto.response.RequisitosVentaResponseDTO;
import com.bajonea.backend.services.DocumentoComercioService;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Documentos de habilitación del comercio activo. Exclusivos del Dueño: no figuran en la lista de rutas delegables
 * al Empleado. El archivo se entrega por esta misma API con la sesión (nunca con un enlace ni un token en la
 * URL) y con las cabeceras que impiden que el navegador lo interprete como otra cosa o lo guarde en caché.
 */
@RestController
@RequestMapping("/api/v1/comercios/documentos")
@RequiredArgsConstructor
public class DocumentoComercioController {

    private final DocumentoComercioService documentoComercioService;

    @GetMapping
    public ResponseEntity<ApiResponse<DocumentosComercioResponseDTO>> listar(ComercioActivo comercio) {
        return ResponseEntity.ok(new ApiResponse<>("Documentos obtenidos correctamente",
                documentoComercioService.listar(comercio)));
    }

    @GetMapping("/requisitos")
    public ResponseEntity<ApiResponse<RequisitosVentaResponseDTO>> requisitos(ComercioActivo comercio) {
        return ResponseEntity.ok(new ApiResponse<>("Requisitos obtenidos correctamente",
                documentoComercioService.requisitos(comercio)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<DocumentoComercioResponseDTO>> subir(ComercioActivo comercio,
            @Valid @ModelAttribute SubirDocumentoComercioRequestDTO request) {
        DocumentoComercioResponseDTO documento = documentoComercioService.subir(comercio, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ApiResponse<>("Documento subido. Lo vamos a revisar a la brevedad", documento));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> eliminar(ComercioActivo comercio, @PathVariable Integer id) {
        documentoComercioService.eliminar(comercio, id);
        return ResponseEntity.ok(new ApiResponse<>("Documento eliminado", null));
    }

    @GetMapping("/{id}/archivo")
    public ResponseEntity<byte[]> archivo(ComercioActivo comercio, @PathVariable Integer id) {
        return respuestaDeArchivo(documentoComercioService.archivo(comercio, id));
    }

    static ResponseEntity<byte[]> respuestaDeArchivo(DocumentoComercioService.ArchivoDescargable archivo) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(archivo.tipoMime()))
                .contentLength(archivo.contenido().length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(archivo.nombre(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(archivo.contenido());
    }
}
