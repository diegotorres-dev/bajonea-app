package com.bajonea.backend.services;

import com.bajonea.backend.config.DocumentacionComercioProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.SubirDocumentoComercioRequestDTO;
import com.bajonea.backend.dto.response.DocumentoComercioResponseDTO;
import com.bajonea.backend.dto.response.DocumentosComercioResponseDTO;
import com.bajonea.backend.dto.response.RequisitosVentaResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.DocumentoComercio;
import com.bajonea.backend.entities.DocumentoComercioArchivo;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoDocumentoComercio;
import com.bajonea.backend.enums.MotivoRecalculo;
import com.bajonea.backend.enums.TipoDocumentoComercio;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionDocumentoException;
import com.bajonea.backend.repositories.DocumentoComercioArchivoRepository;
import com.bajonea.backend.repositories.DocumentoComercioRepository;
import com.bajonea.backend.util.FirmaArchivo;
import com.bajonea.backend.util.TamanoLegible;
import java.io.IOException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Documentos de habilitación de un comercio: los sube y los ve únicamente el Dueño (el Empleado no tiene acceso) y
 * los revisa el Administrador ({@link RevisionDocumentoService}). El contenido vive en la base, en una tabla aparte
 * de los metadatos para que ningún listado lea el binario.
 * <p>
 * Toda escritura sigue el orden de bloqueo usuario del Dueño, cuenta de Mercado Pago, comercio ({@code FOR UPDATE}),
 * documento ({@code FOR UPDATE}) y termina recalculando la aptitud de venta con {@link AptitudVentaComercioService}.
 * El archivo se valida (tamaño, firma de bytes) antes de abrir la transacción: nada que pueda rechazarse sin
 * mirar la base retiene un bloqueo.
 */
@Service
@RequiredArgsConstructor
public class DocumentoComercioService {

    static final Set<EstadoComercio> ESTADOS_QUE_PERMITEN_SUBIR = Set.of(EstadoComercio.APROBADO,
            EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE);

    private static final Set<EstadoComercio> ESTADOS_CON_COMERCIO_APROBADO = Set.of(EstadoComercio.APROBADO,
            EstadoComercio.APTO_VENTA, EstadoComercio.CERRADO_TEMPORALMENTE, EstadoComercio.SUSPENDIDO,
            EstadoComercio.INACTIVO);

    private static final List<String> FORMATOS_PERMITIDOS = List.of("PDF", "JPG", "PNG", "WebP");
    private static final String MENSAJE_FORMATO = "Solo se aceptan archivos PDF, JPG, PNG o WebP";

    public record ArchivoDescargable(String nombre, String tipoMime, byte[] contenido) {
    }

    private final DocumentoComercioRepository documentoComercioRepository;
    private final DocumentoComercioArchivoRepository documentoComercioArchivoRepository;
    private final AptitudVentaComercioService aptitudVentaComercioService;
    private final CuentaMercadoPagoService cuentaMercadoPagoService;
    private final DocumentacionComercioProperties properties;
    private final PlatformTransactionManager transactionManager;
    private final Clock clock;

    @Transactional(readOnly = true)
    public DocumentosComercioResponseDTO listar(ComercioActivo comercio) {
        List<DocumentoComercio> documentos = documentoComercioRepository.findByComercioIdOrdenados(comercio.comercioId());
        long enRevision = contar(documentos, EstadoDocumentoComercio.PENDIENTE);
        return new DocumentosComercioResponseDTO(
                documentos.stream().map(DocumentoComercioResponseDTO::new).toList(),
                enRevision, properties.getMaxEnRevision(), documentos.size(), properties.getMaxTotal(),
                properties.getMaxBytes());
    }

    @Transactional(readOnly = true)
    public RequisitosVentaResponseDTO requisitos(ComercioActivo comercio) {
        List<DocumentoComercio> documentos = documentoComercioRepository.findByComercioIdOrdenados(comercio.comercioId());
        long aprobados = contar(documentos, EstadoDocumentoComercio.APROBADO);
        long pendientes = contar(documentos, EstadoDocumentoComercio.PENDIENTE);
        long rechazados = contar(documentos, EstadoDocumentoComercio.RECHAZADO);
        boolean mercadoPago = cuentaMercadoPagoService.buscarActivaPorDueno(comercio.duenoId()).isPresent();
        EstadoComercio estado = comercio.estadoComercio();
        boolean requerida = properties.isRequerida();

        List<String> faltan = new ArrayList<>();
        if (estado != EstadoComercio.APTO_VENTA && ESTADOS_CON_COMERCIO_APROBADO.contains(estado)) {
            if (!mercadoPago) {
                faltan.add("MERCADO_PAGO");
            }
            if (requerida) {
                if (aprobados == 0) {
                    faltan.add("DOCUMENTO_APROBADO");
                }
                if (pendientes > 0) {
                    faltan.add("REVISION_PENDIENTE");
                }
            }
        }
        List<RequisitosVentaResponseDTO.TipoDocumentoDTO> tipos = Arrays.stream(TipoDocumentoComercio.values())
                .map(t -> new RequisitosVentaResponseDTO.TipoDocumentoDTO(t.name(), t.getEtiqueta(),
                        t == TipoDocumentoComercio.OTRO))
                .toList();
        return new RequisitosVentaResponseDTO(estado, ESTADOS_CON_COMERCIO_APROBADO.contains(estado),
                mercadoPago, requerida, aprobados, pendientes, rechazados, estado == EstadoComercio.APTO_VENTA,
                ESTADOS_QUE_PERMITEN_SUBIR.contains(estado), faltan, tipos, properties.getMaxBytes(),
                properties.getMaxEnRevision(), properties.getMaxTotal(), FORMATOS_PERMITIDOS);
    }

    public DocumentoComercioResponseDTO subir(ComercioActivo comercio, SubirDocumentoComercioRequestDTO request) {
        MultipartFile archivo = request.getArchivo();
        long tamano = archivo.getSize();
        if (tamano <= 0) {
            throw new ValidacionDocumentoException(ValidacionDocumentoException.FORMATO_NO_PERMITIDO,
                    "El archivo está vacío");
        }
        if (tamano > properties.getMaxBytes()) {
            throw new ValidacionDocumentoException(ValidacionDocumentoException.TAMANO_EXCEDIDO,
                    "El archivo pesa " + TamanoLegible.formatear(tamano) + " y el máximo es "
                            + TamanoLegible.formatear(properties.getMaxBytes()));
        }
        byte[] contenido;
        try {
            contenido = archivo.getBytes();
        } catch (IOException e) {
            throw new ValidacionDocumentoException(ValidacionDocumentoException.FORMATO_NO_PERMITIDO,
                    "No pudimos leer el archivo. Probá de nuevo");
        }
        String tipoMime = FirmaArchivo.detectar(contenido).orElseThrow(
                () -> new ValidacionDocumentoException(ValidacionDocumentoException.FORMATO_NO_PERMITIDO, MENSAJE_FORMATO));
        String nombre = nombreSeguro(archivo.getOriginalFilename());
        TipoDocumentoComercio tipo = request.getTipo();
        String descripcion = tipo == TipoDocumentoComercio.OTRO ? request.getDescripcion() : null;

        return new TransactionTemplate(transactionManager)
                .execute(status -> insertar(comercio, tipo, descripcion, nombre, tipoMime, contenido));
    }

    private DocumentoComercioResponseDTO insertar(ComercioActivo activo, TipoDocumentoComercio tipo, String descripcion,
            String nombre, String tipoMime, byte[] contenido) {
        AptitudVentaComercioService.EntradasDueno entradas = aptitudVentaComercioService.leerDueno(activo.duenoId());
        Comercio comercio = aptitudVentaComercioService.bloquearComercio(activo.comercioId());
        if (!ESTADOS_QUE_PERMITEN_SUBIR.contains(comercio.getEstado())) {
            throw new ConflictoComercioException(ConflictoComercioException.COMERCIO_ESTADO_NO_PERMITE_DOCUMENTOS,
                    "Tu comercio no puede recibir documentos en este momento");
        }
        AptitudVentaComercioService.Conteo conteo = aptitudVentaComercioService.contarDocumentos(comercio.getId());
        if (conteo.total() >= properties.getMaxTotal()) {
            throw new ConflictoComercioException(ConflictoComercioException.DOCUMENTO_CUPO_TOTAL,
                    "Llegaste al máximo de " + properties.getMaxTotal() + " documentos por comercio");
        }
        if (conteo.pendientes() >= properties.getMaxEnRevision()) {
            throw new ConflictoComercioException(ConflictoComercioException.DOCUMENTO_CUPO_REVISION,
                    "Ya tenés " + properties.getMaxEnRevision()
                            + " documentos en revisión. Esperá a que los revisemos para subir otro");
        }
        DocumentoComercio documento = documentoComercioRepository.saveAndFlush(DocumentoComercio.builder()
                .comercioId(comercio.getId())
                .tipo(tipo)
                .descripcion(descripcion)
                .nombreOriginal(nombre)
                .tipoMime(tipoMime)
                .tamanoBytes(contenido.length)
                .estado(EstadoDocumentoComercio.PENDIENTE)
                .fechaSubida(LocalDateTime.now(clock))
                .subidoPorUsuarioId(activo.actorUsuarioId())
                .build());
        documentoComercioArchivoRepository.saveAndFlush(
                DocumentoComercioArchivo.builder().id(documento.getId()).contenido(contenido).build());
        aptitudVentaComercioService.recalcular(comercio, entradas, MotivoRecalculo.DOCUMENTO_SUBIDO, null);
        return new DocumentoComercioResponseDTO(documento);
    }

    public void eliminar(ComercioActivo activo, Integer documentoId) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            AptitudVentaComercioService.EntradasDueno entradas = aptitudVentaComercioService.leerDueno(activo.duenoId());
            Comercio comercio = aptitudVentaComercioService.bloquearComercio(activo.comercioId());
            DocumentoComercio documento = documentoComercioRepository.findByIdConBloqueo(documentoId)
                    .filter(d -> d.getComercioId().equals(comercio.getId()))
                    .orElseThrow(() -> new RecursoNoEncontradoException("Documento no encontrado"));
            if (documento.getEstado() != EstadoDocumentoComercio.PENDIENTE) {
                throw new ConflictoComercioException(ConflictoComercioException.DOCUMENTO_NO_ELIMINABLE,
                        "Solo podés eliminar documentos que todavía están en revisión");
            }
            documentoComercioArchivoRepository.borrarPorDocumentoId(documento.getId());
            documentoComercioRepository.delete(documento);
            documentoComercioRepository.flush();
            aptitudVentaComercioService.recalcular(comercio, entradas, MotivoRecalculo.DOCUMENTO_ELIMINADO, null);
        });
    }

    @Transactional(readOnly = true)
    public ArchivoDescargable archivo(ComercioActivo comercio, Integer documentoId) {
        DocumentoComercio documento = documentoComercioRepository.findByIdAndComercioId(documentoId, comercio.comercioId())
                .orElseThrow(() -> new RecursoNoEncontradoException("Documento no encontrado"));
        return descargable(documento);
    }

    ArchivoDescargable descargable(DocumentoComercio documento) {
        DocumentoComercioArchivo archivo = documentoComercioArchivoRepository.findById(documento.getId())
                .orElseThrow(() -> new RecursoNoEncontradoException("Documento no encontrado"));
        return new ArchivoDescargable(documento.getNombreOriginal(), documento.getTipoMime(), archivo.getContenido());
    }

    private static long contar(List<DocumentoComercio> documentos, EstadoDocumentoComercio estado) {
        return documentos.stream().filter(d -> d.getEstado() == estado).count();
    }

    private static String nombreSeguro(String original) {
        if (original == null || original.isBlank()) {
            return "documento";
        }
        String base = original.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").trim();
        if (base.isEmpty()) {
            return "documento";
        }
        return base.length() > 255 ? base.substring(base.length() - 255) : base;
    }
}
