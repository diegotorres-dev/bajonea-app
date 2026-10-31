package com.bajonea.backend.services;

import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.NotaCreditoRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persistencia de {@code nota_credito}, N:1 con {@code Pago}. Cuándo se genera una nota y cómo se
 * le pide el reembolso a MercadoPago es lógica de {@link ReembolsoService} — este Service solo
 * guarda/lee el estado que esa capa resuelva. {@code intentos} cuenta únicamente intentos reales
 * de reembolso contra la API de MercadoPago (una nota que nunca llegó a intentarse queda en 0).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class NotaCreditoService {

    private static final int LARGO_MAXIMO_ERROR = 500;
    private static final Set<EstadoNotaCredito> ESTADOS_QUE_CUBREN_EL_PAGO = Set.of(
            EstadoNotaCredito.PENDIENTE,
            EstadoNotaCredito.PROCESADO,
            EstadoNotaCredito.PENDIENTE_REINTENTO,
            EstadoNotaCredito.PENDIENTE_REVISION_MANUAL);

    private final NotaCreditoRepository notaCreditoRepository;

    public NotaCredito crear(Pago pago, BigDecimal monto, MotivoNotaCredito motivo) {
        return guardarNueva(pago, monto, motivo, EstadoNotaCredito.PENDIENTE, null);
    }

    public NotaCredito crearPendienteRevisionManual(Pago pago, BigDecimal monto, MotivoNotaCredito motivo, String motivoRevision) {
        return guardarNueva(pago, monto, motivo, EstadoNotaCredito.PENDIENTE_REVISION_MANUAL, motivoRevision);
    }

    private NotaCredito guardarNueva(Pago pago, BigDecimal monto, MotivoNotaCredito motivo, EstadoNotaCredito estado, String ultimoError) {
        NotaCredito notaCredito = NotaCredito.builder()
                .pago(pago)
                .monto(monto)
                .motivo(motivo)
                .estado(estado)
                .intentos(0)
                .mpPaymentId(pago.getIdTransaccionMp())
                .ultimoError(recortar(ultimoError))
                .fechaEmision(LocalDateTime.now())
                .build();
        return notaCreditoRepository.save(notaCredito);
    }

    public List<NotaCredito> listarPorPago(Integer pagoId) {
        return notaCreditoRepository.findByPagoId(pagoId);
    }

    public List<NotaCredito> listarPorPedidos(Collection<Integer> pedidoIds) {
        if (pedidoIds.isEmpty()) {
            return List.of();
        }
        return notaCreditoRepository.findByPagoPedidoIdIn(pedidoIds);
    }

    public List<NotaCredito> listarPorEstado(EstadoNotaCredito estado) {
        return notaCreditoRepository.findByEstado(estado);
    }

    public List<NotaCredito> listarPorEstados(Collection<EstadoNotaCredito> estados) {
        return notaCreditoRepository.findByEstadoInOrderByFechaEmisionDesc(estados);
    }

    /**
     * Monto ya comprometido de un pago: suma las notas que siguen vivas (pendientes, procesadas o
     * esperando revisión manual). Las {@code FALLIDO} no cuentan — no devolvieron plata, y un
     * reintento posterior tiene que poder crear una nota nueva.
     */
    public BigDecimal montoCubierto(Integer pagoId) {
        return montoCubiertoExcluyendo(pagoId, null);
    }

    public BigDecimal montoCubiertoExcluyendo(Integer pagoId, Integer notaCreditoIdExcluida) {
        return listarPorPago(pagoId).stream()
                .filter(nota -> !nota.getId().equals(notaCreditoIdExcluida))
                .filter(nota -> ESTADOS_QUE_CUBREN_EL_PAGO.contains(nota.getEstado()))
                .map(NotaCredito::getMonto)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Si las demás notas del pago (todas menos {@code notaCreditoIdPropia}) ya cubren el monto completo. Se llama con la
     * nota propia recién insertada y la fila del pago bloqueada, y la lectura es bloqueante a propósito: lee lo último
     * confirmado aunque la transacción que llama haya fijado su foto (REPEATABLE READ) antes de esperar el bloqueo del
     * pago, y una consulta común no vería la nota que otra transacción confirmó mientras tanto. Va después de insertar y
     * no antes porque una lectura bloqueante sobre un pago sin notas toma un bloqueo de intervalo del índice
     * ({@code idx_nota_credito_pago}) que bloquea el insert de las notas de otros pagos que caen en el mismo intervalo, y
     * dos transacciones que lo hacen antes de insertar se interbloquean; con la fila propia ya insertada ese intervalo ya
     * no hace esperar a nadie. No pide ninguna conexión nueva.
     */
    public boolean otrasNotasCubrenElPago(Pago pago, Integer notaCreditoIdPropia) {
        BigDecimal cubierto = notaCreditoRepository.leerOtrasDelPagoConBloqueo(pago.getId(), notaCreditoIdPropia).stream()
                .filter(nota -> ESTADOS_QUE_CUBREN_EL_PAGO.contains(EstadoNotaCredito.valueOf(nota.getEstado())))
                .map(NotaCreditoRepository.EstadoYMonto::getMonto)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return cubierto.compareTo(pago.getMonto()) >= 0;
    }

    public void eliminar(NotaCredito notaCredito) {
        notaCreditoRepository.delete(notaCredito);
        notaCreditoRepository.flush();
    }

    public NotaCredito marcarEnProceso(Integer notaCreditoId) {
        NotaCredito notaCredito = obtener(notaCreditoId);
        notaCredito.setEstado(EstadoNotaCredito.PENDIENTE);
        return notaCreditoRepository.save(notaCredito);
    }

    public NotaCredito registrarReembolsoExitoso(Integer notaCreditoId, String refundIdMp) {
        NotaCredito notaCredito = obtener(notaCreditoId);
        notaCredito.setEstado(EstadoNotaCredito.PROCESADO);
        notaCredito.setIntentos(notaCredito.getIntentos() + 1);
        notaCredito.setRefundIdMp(refundIdMp);
        notaCredito.setUltimoError(null);
        notaCredito.setFechaProceso(LocalDateTime.now());
        return notaCreditoRepository.save(notaCredito);
    }

    public NotaCredito registrarReembolsoFallido(Integer notaCreditoId, String error) {
        NotaCredito notaCredito = obtener(notaCreditoId);
        notaCredito.setEstado(EstadoNotaCredito.FALLIDO);
        notaCredito.setIntentos(notaCredito.getIntentos() + 1);
        notaCredito.setUltimoError(recortar(error));
        notaCredito.setFechaFallido(LocalDateTime.now());
        return notaCreditoRepository.save(notaCredito);
    }

    public NotaCredito obtenerParaActualizar(Integer notaCreditoId) {
        return notaCreditoRepository.findByIdParaActualizar(notaCreditoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Nota de crédito no encontrada"));
    }

    public NotaCredito obtener(Integer notaCreditoId) {
        return notaCreditoRepository.findById(notaCreditoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Nota de crédito no encontrada"));
    }

    private static String recortar(String texto) {
        if (texto == null || texto.length() <= LARGO_MAXIMO_ERROR) {
            return texto;
        }
        return texto.substring(0, LARGO_MAXIMO_ERROR);
    }
}
