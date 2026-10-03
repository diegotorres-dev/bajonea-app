package com.bajonea.backend.services;

import com.bajonea.backend.dto.response.NotaCreditoAdminResponseDTO;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoNotaCredito;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Revisión manual de reembolsos para el Administrador: lista las notas que quedaron sin resolver
 * y dispara su reintento. No lleva {@code @Transactional} de clase a propósito: el reintento
 * llama a MercadoPago y esa llamada no debe correr dentro de una transacción (ver
 * {@link ReembolsoService}), así que las lecturas usan un {@link TransactionTemplate} de solo lectura.
 */
@Service
public class NotaCreditoAdminService {

    private static final List<EstadoNotaCredito> ESTADOS_A_REVISAR =
            List.of(EstadoNotaCredito.PENDIENTE_REVISION_MANUAL, EstadoNotaCredito.FALLIDO);

    private final NotaCreditoService notaCreditoService;
    private final ReembolsoService reembolsoService;
    private final TransactionTemplate lectura;

    public NotaCreditoAdminService(NotaCreditoService notaCreditoService, ReembolsoService reembolsoService,
            PlatformTransactionManager transactionManager) {
        this.notaCreditoService = notaCreditoService;
        this.reembolsoService = reembolsoService;
        this.lectura = new TransactionTemplate(transactionManager);
        this.lectura.setReadOnly(true);
    }

    public List<NotaCreditoAdminResponseDTO> listarPendientesDeRevision() {
        return lectura.execute(status -> notaCreditoService.listarPorEstados(ESTADOS_A_REVISAR).stream()
                .map(this::aResponseDTO)
                .toList());
    }

    public NotaCreditoAdminResponseDTO reintentar(Integer notaCreditoId) {
        reembolsoService.reintentarNotaCredito(notaCreditoId);
        return lectura.execute(status -> aResponseDTO(notaCreditoService.obtener(notaCreditoId)));
    }

    private NotaCreditoAdminResponseDTO aResponseDTO(NotaCredito nota) {
        Pedido pedido = nota.getPago().getPedido();
        return new NotaCreditoAdminResponseDTO(
                nota.getId(),
                String.format("NC-%d-%05d", nota.getFechaEmision().getYear(), nota.getId()),
                pedido.getId(),
                pedido.getCliente().getPersonaFisica().getNombre() + " " + pedido.getCliente().getPersonaFisica().getApellido(),
                pedido.getComercio().getNombre(),
                nota.getMonto(),
                nota.getFechaEmision(),
                nota.getMotivo(),
                nota.getEstado(),
                nota.getUltimoError(),
                nota.getIntentos());
    }
}
