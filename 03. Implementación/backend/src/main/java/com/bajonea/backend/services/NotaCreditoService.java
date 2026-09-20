package com.bajonea.backend.services;

import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.NotaCreditoRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persistencia mínima de {@code nota_credito}, 1:1 con {@code Pago}. Cuándo se genera una nota
 * de crédito y cómo/cuándo se decide reintentar un refund fallido contra la API de MercadoPago
 * es lógica de negocio de una sesión futura — este Service solo guarda/lee el estado que esa
 * capa resuelva.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class NotaCreditoService {

    private final NotaCreditoRepository notaCreditoRepository;

    public NotaCredito crear(Pago pago, BigDecimal monto) {
        NotaCredito notaCredito = NotaCredito.builder()
                .pago(pago)
                .monto(monto)
                .estado(EstadoNotaCredito.PENDIENTE)
                .intentos(0)
                .fechaEmision(LocalDateTime.now())
                .build();
        return notaCreditoRepository.save(notaCredito);
    }

    public NotaCredito obtenerPorPago(Integer pagoId) {
        return notaCreditoRepository.findByPagoId(pagoId)
                .orElseThrow(
                        () -> new RecursoNoEncontradoException("El pago no tiene ninguna nota de crédito asociada"));
    }

    public List<NotaCredito> listarPorEstado(EstadoNotaCredito estado) {
        return notaCreditoRepository.findByEstado(estado);
    }

    /**
     * Actualiza el estado de una nota de crédito ya existente e incrementa {@code intentos}
     * (todo cambio de estado posterior a la creación representa un intento real de refund).
     * Completa {@code fechaProceso}/{@code fechaFallido} según corresponda; {@code refundIdMp}
     * se persiste solo si se recibe (no nulo).
     */
    public NotaCredito actualizarEstado(Integer notaCreditoId, EstadoNotaCredito nuevoEstado, String refundIdMp) {
        NotaCredito notaCredito = notaCreditoRepository.findById(notaCreditoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Nota de crédito no encontrada"));

        notaCredito.setEstado(nuevoEstado);
        notaCredito.setIntentos(notaCredito.getIntentos() + 1);
        if (refundIdMp != null) {
            notaCredito.setRefundIdMp(refundIdMp);
        }
        if (nuevoEstado == EstadoNotaCredito.PROCESADO) {
            notaCredito.setFechaProceso(LocalDateTime.now());
        } else if (nuevoEstado == EstadoNotaCredito.FALLIDO) {
            notaCredito.setFechaFallido(LocalDateTime.now());
        }

        return notaCreditoRepository.save(notaCredito);
    }
}
