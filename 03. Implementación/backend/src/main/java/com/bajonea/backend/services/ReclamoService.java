package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ReclamoRequestDTO;
import com.bajonea.backend.dto.response.ReclamoPedidoResponseDTO;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.entities.Reclamo;
import com.bajonea.backend.enums.EstadoReclamo;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.ReclamoRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * El Cliente reclama un pedido ya entregado. Un reclamo por pedido ({@code UNIQUE uq_reclamo_pedido}). La creación toma
 * los bloqueos en el orden global: el usuario del Cliente (compartido), el pedido {@code FOR UPDATE} (primera lectura
 * bloqueante, es lo que serializa dos envíos del mismo pedido y la creación contra la autoconfirmación o la entrega) y el
 * pago {@code FOR UPDATE}; recién entonces se revalida todo con las filas ya bloqueadas (estado, plazo, modalidad). No
 * se bloquea el reclamo con una lectura que no encuentra nada: sobre un índice único esa lectura toma un bloqueo de
 * intervalo y dos reclamos de pedidos distintos se interbloquearían al insertar; la que llega segunda choca con el
 * único, la transacción se deshace entera y se traduce al mismo {@code 409} que un reclamo ya existente. El pedido no
 * cambia de estado y no se avisa a nadie: el Administrador lo ve en el contador del panel.
 */
@Service
public class ReclamoService {

    private final PedidoService pedidoService;
    private final PagoService pagoService;
    private final PedidoRepository pedidoRepository;
    private final ReclamoRepository reclamoRepository;
    private final ReclamoVistaService vistaService;
    private final PoliticaReclamo politica;
    private final Clock clock;
    private final TransactionTemplate transaccion;
    private final TransactionTemplate transaccionDeLectura;

    public ReclamoService(PedidoService pedidoService, PagoService pagoService, PedidoRepository pedidoRepository,
            ReclamoRepository reclamoRepository, ReclamoVistaService vistaService, PoliticaReclamo politica, Clock clock,
            PlatformTransactionManager transactionManager) {
        this.pedidoService = pedidoService;
        this.pagoService = pagoService;
        this.pedidoRepository = pedidoRepository;
        this.reclamoRepository = reclamoRepository;
        this.vistaService = vistaService;
        this.politica = politica;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
        this.transaccionDeLectura = new TransactionTemplate(transactionManager);
        this.transaccionDeLectura.setReadOnly(true);
    }

    public ReclamoPedidoResponseDTO crear(Integer usuarioId, Integer pedidoId, ReclamoRequestDTO request) {
        try {
            transaccion.executeWithoutResult(estado -> crearBloqueado(usuarioId, pedidoId, request));
        } catch (DataIntegrityViolationException ex) {
            if (esChoqueDelUnicoPorPedido(ex)) {
                throw new ConflictoDeNegocioException(PoliticaReclamo.MENSAJE_YA_EXISTE);
            }
            throw ex;
        }
        return transaccionDeLectura.execute(estado -> {
            Pedido pedido = pedidoRepository.findById(pedidoId)
                    .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
            return vistaService.paraCliente(List.of(pedido)).get(pedidoId);
        });
    }

    private void crearBloqueado(Integer usuarioId, Integer pedidoId, ReclamoRequestDTO request) {
        pedidoService.obtenerPedidoDelCliente(usuarioId, pedidoId);
        Pedido pedido = pedidoService.bloquearParaActualizar(pedidoId, usuarioId);
        Pago pago = pagoService.buscarPorPedidoParaActualizar(pedidoId).orElse(null);

        if (reclamoRepository.findByPedidoId(pedidoId).isPresent()) {
            throw new ConflictoDeNegocioException(PoliticaReclamo.MENSAJE_YA_EXISTE);
        }
        LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        String noElegible = politica.motivoDeNoElegible(pedido, pago, ahora);
        if (noElegible != null) {
            throw new ConflictoDeNegocioException(noElegible);
        }
        if (request.getMotivo() == MotivoReclamo.NO_RECIBI_PEDIDO && pedido.getTipoEntrega() != TipoEntrega.DOMICILIO) {
            throw new ValidacionCamposException(Map.of("motivo", PoliticaReclamo.MENSAJE_NO_RECIBI_EN_RETIRO));
        }
        reclamoRepository.saveAndFlush(Reclamo.builder()
                .pedidoId(pedidoId)
                .motivo(request.getMotivo())
                .descripcion(request.getDescripcion())
                .fechaCreacion(ahora)
                .estado(EstadoReclamo.PENDIENTE)
                .build());
    }

    private static boolean esChoqueDelUnicoPorPedido(Throwable ex) {
        for (Throwable causa = ex; causa != null; causa = causa.getCause()) {
            String mensaje = causa.getMessage();
            if (mensaje != null && mensaje.contains("uq_reclamo_pedido")) {
                return true;
            }
        }
        return false;
    }
}
