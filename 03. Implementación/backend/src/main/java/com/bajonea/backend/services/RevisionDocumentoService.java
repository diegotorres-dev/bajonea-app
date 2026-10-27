package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ResolverDocumentoRequestDTO;
import com.bajonea.backend.dto.response.DocumentoComercioResponseDTO;
import com.bajonea.backend.dto.response.DocumentoPendienteAdminResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.DocumentoComercio;
import com.bajonea.backend.enums.EstadoDocumentoComercio;
import com.bajonea.backend.enums.MotivoRecalculo;
import com.bajonea.backend.enums.TipoDocumentoComercio;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DocumentoComercioRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Revisión de los documentos de los comercios por el Administrador: bandeja de pendientes, documentos de un comercio,
 * archivo y resolución. Aprobar solo sirve sobre un {@code PENDIENTE}; rechazar sirve sobre un {@code PENDIENTE} y
 * sobre un {@code APROBADO} (revocación); un {@code RECHAZADO} no vuelve a resolverse. Misma secuencia de bloqueo
 * que las escrituras del Dueño: usuario del Dueño, cuenta de Mercado Pago, comercio, documento.
 */
@Service
@RequiredArgsConstructor
public class RevisionDocumentoService {

    private final DocumentoComercioRepository documentoComercioRepository;
    private final ComercioRepository comercioRepository;
    private final DocumentoComercioService documentoComercioService;
    private final AptitudVentaComercioService aptitudVentaComercioService;
    private final NotificacionService notificacionService;
    private final PlatformTransactionManager transactionManager;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<DocumentoPendienteAdminResponseDTO> pendientes() {
        return documentoComercioRepository.findPendientesOrdenados().stream()
                .map(DocumentoPendienteAdminResponseDTO::new)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DocumentoComercioResponseDTO> documentosDeComercio(Integer comercioId) {
        if (!comercioRepository.existsById(comercioId)) {
            throw new RecursoNoEncontradoException("Comercio no encontrado");
        }
        return documentoComercioRepository.findByComercioIdOrdenados(comercioId).stream()
                .map(DocumentoComercioResponseDTO::new)
                .toList();
    }

    @Transactional(readOnly = true)
    public DocumentoComercioService.ArchivoDescargable archivo(Integer documentoId) {
        DocumentoComercio documento = documentoComercioRepository.findById(documentoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Documento no encontrado"));
        return documentoComercioService.descargable(documento);
    }

    public DocumentoComercioResponseDTO resolver(Integer documentoId, Integer administradorId,
            ResolverDocumentoRequestDTO request) {
        Integer comercioId = documentoComercioRepository.findComercioIdById(documentoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Documento no encontrado"));
        Integer duenoId = comercioRepository.findDuenoIdById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return new TransactionTemplate(transactionManager)
                .execute(status -> aplicar(documentoId, comercioId, duenoId, administradorId, request));
    }

    private DocumentoComercioResponseDTO aplicar(Integer documentoId, Integer comercioId, Integer duenoId,
            Integer administradorId, ResolverDocumentoRequestDTO request) {
        boolean aprobar = Boolean.TRUE.equals(request.getAprobar());
        AptitudVentaComercioService.EntradasDueno entradas = aptitudVentaComercioService.leerDueno(duenoId);
        Comercio comercio = aptitudVentaComercioService.bloquearComercio(comercioId);
        DocumentoComercio documento = documentoComercioRepository.findByIdConBloqueo(documentoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Documento no encontrado"));
        EstadoDocumentoComercio actual = documento.getEstado();
        boolean puedeResolver = aprobar ? actual == EstadoDocumentoComercio.PENDIENTE
                : actual != EstadoDocumentoComercio.RECHAZADO;
        if (!puedeResolver) {
            throw new ConflictoComercioException(ConflictoComercioException.DOCUMENTO_YA_RESUELTO,
                    "El documento ya fue resuelto");
        }
        boolean revocacion = !aprobar && actual == EstadoDocumentoComercio.APROBADO;

        documento.setEstado(aprobar ? EstadoDocumentoComercio.APROBADO : EstadoDocumentoComercio.RECHAZADO);
        documento.setMotivoRechazo(aprobar ? null : request.getMotivo());
        documento.setFechaResolucion(LocalDateTime.now(clock));
        documento.setAdministradorId(administradorId);
        documentoComercioRepository.saveAndFlush(documento);

        MotivoRecalculo motivo = aprobar ? MotivoRecalculo.DOCUMENTO_APROBADO
                : revocacion ? MotivoRecalculo.DOCUMENTO_REVOCADO : MotivoRecalculo.DOCUMENTO_RECHAZADO;
        aptitudVentaComercioService.recalcular(comercio, entradas, motivo, null);

        String etiqueta = documento.getTipo() == TipoDocumentoComercio.OTRO && documento.getDescripcion() != null
                ? documento.getDescripcion() : documento.getTipo().getEtiqueta();
        if (aprobar) {
            notificacionService.crearParaDueno(duenoId, comercioId,
                    "Tu documento «" + etiqueta + "» de " + comercio.getNombre() + " fue aprobado.",
                    TipoNotificacion.DOCUMENTO_APROBADO, TipoEntidadNotificacion.COMERCIO, comercioId);
        } else {
            String mensaje = revocacion
                    ? "Se revocó la aprobación de tu documento «" + etiqueta + "» de " + comercio.getNombre()
                            + ". Motivo: " + request.getMotivo()
                    : "Tu documento «" + etiqueta + "» de " + comercio.getNombre() + " fue rechazado. Motivo: "
                            + request.getMotivo();
            notificacionService.crearParaDueno(duenoId, comercioId, mensaje, TipoNotificacion.DOCUMENTO_RECHAZADO,
                    TipoEntidadNotificacion.COMERCIO, comercioId);
        }
        return new DocumentoComercioResponseDTO(documento);
    }
}
