package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ResolverReclamoRequestDTO;
import com.bajonea.backend.dto.response.DetallePedidoResponseDTO;
import com.bajonea.backend.dto.response.ReclamoAdminResponseDTO;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pago;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.entities.Reclamo;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoNotaCredito;
import com.bajonea.backend.enums.EstadoReclamo;
import com.bajonea.backend.enums.MotivoReclamo;
import com.bajonea.backend.enums.TipoResolucionReclamo;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionCamposException;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.ReclamoRepository;
import com.bajonea.backend.repositories.ReclamoRepository.FilaBandeja;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Los reclamos desde el lado del Administrador: la bandeja, el detalle y la resolución (reembolso total, reembolso parcial
 * o rechazo con motivo). Resolver es final: un reclamo {@code PENDIENTE} se resuelve una sola vez, y el reintento de un
 * reembolso fallido se hace sobre su nota ({@code admin-reembolsos}), nunca sobre el reclamo.
 *
 * <p><b>Bloqueos de la resolución</b> (orden global, ver docs/CONCURRENCIA-Y-TRANSACCIONES.md): el Administrador entra por
 * el id del reclamo, así que primero se lee el id del pedido en una transacción de solo lectura propia, corta, que no
 * sostiene ninguna conexión después; recién en la transacción de negocio se toman los usuarios involucrados con
 * bloqueo compartido en id ascendente, el pedido {@code FOR UPDATE} (primera lectura bloqueante), el pago
 * {@code FOR UPDATE} y por último el reclamo {@code FOR UPDATE}, con una consulta bloqueante que lee lo último confirmado
 * aunque la transacción haya fijado su foto antes de esperar. El reclamo queda después del pago y es una hoja: nadie más lo
 * toma antes que el pedido. Con las filas bloqueadas se revalida el estado del reclamo, se crea la nota de crédito, se
 * actualiza el reclamo y se escriben los avisos; la llamada a Mercado Pago y los emails salen después del commit.
 */
@Service
public class ReclamoAdminService {

    public static final int LIMITE_POR_DEFECTO = 50;
    public static final int LIMITE_MAXIMO = 200;
    public static final String MENSAJE_YA_RESUELTO = "Este reclamo ya fue resuelto.";
    public static final String MENSAJE_NO_ENCONTRADO = "Reclamo no encontrado";

    public enum FiltroBandeja {
        PENDIENTES,
        REEMBOLSO_EN_PROCESO,
        RESUELTOS
    }

    private final ReclamoRepository reclamoRepository;
    private final PedidoRepository pedidoRepository;
    private final DetallePedidoRepository detallePedidoRepository;
    private final PedidoService pedidoService;
    private final PagoService pagoService;
    private final NotaCreditoService notaCreditoService;
    private final ReembolsoService reembolsoService;
    private final AvisoReclamoService avisos;
    private final PoliticaReclamo politica;
    private final Clock clock;
    private final TransactionTemplate transaccion;
    private final TransactionTemplate transaccionDeLectura;

    public ReclamoAdminService(ReclamoRepository reclamoRepository, PedidoRepository pedidoRepository,
            DetallePedidoRepository detallePedidoRepository, PedidoService pedidoService, PagoService pagoService,
            NotaCreditoService notaCreditoService, ReembolsoService reembolsoService, AvisoReclamoService avisos,
            PoliticaReclamo politica, Clock clock, PlatformTransactionManager transactionManager) {
        this.reclamoRepository = reclamoRepository;
        this.pedidoRepository = pedidoRepository;
        this.detallePedidoRepository = detallePedidoRepository;
        this.pedidoService = pedidoService;
        this.pagoService = pagoService;
        this.notaCreditoService = notaCreditoService;
        this.reembolsoService = reembolsoService;
        this.avisos = avisos;
        this.politica = politica;
        this.clock = clock;
        this.transaccion = new TransactionTemplate(transactionManager);
        this.transaccionDeLectura = new TransactionTemplate(transactionManager);
        this.transaccionDeLectura.setReadOnly(true);
    }

    public ReclamoAdminResponseDTO.Bandeja listar(FiltroBandeja filtro, Integer limite, Integer pagina) {
        int tamano = limite == null ? LIMITE_POR_DEFECTO : Math.min(Math.max(limite, 1), LIMITE_MAXIMO);
        int numero = pagina == null ? 0 : Math.max(pagina, 0);
        FiltroBandeja efectivo = filtro == null ? FiltroBandeja.PENDIENTES : filtro;
        return transaccionDeLectura.execute(estado -> {
            PageRequest pageable = PageRequest.of(numero, tamano);
            List<FilaBandeja> filas = switch (efectivo) {
                case PENDIENTES -> reclamoRepository.bandejaPendientes(pageable);
                case REEMBOLSO_EN_PROCESO -> reclamoRepository.bandejaReembolsoEnProceso(pageable);
                case RESUELTOS -> reclamoRepository.bandejaResueltos(pageable);
            };
            ReclamoRepository.Contadores c = reclamoRepository.contarPorFiltro();
            return new ReclamoAdminResponseDTO.Bandeja(
                    new ReclamoAdminResponseDTO.Contadores(c.getPendientes(), c.getEnProceso(), c.getResueltos()),
                    filas.stream().map(ReclamoAdminService::aResumen).toList());
        });
    }

    public long contarPendientes() {
        return reclamoRepository.countByEstado(EstadoReclamo.PENDIENTE);
    }

    public ReclamoAdminResponseDTO.Detalle detalle(Integer id) {
        return transaccionDeLectura.execute(estado -> armarDetalle(reclamoRepository.findById(id)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADO))));
    }

    public ReclamoAdminResponseDTO.Detalle resolver(Integer administradorUsuarioId, Integer reclamoId, ResolverReclamoRequestDTO request) {
        validarForma(request);
        Integer pedidoId = transaccionDeLectura.execute(estado -> reclamoRepository.findPedidoIdById(reclamoId)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADO)));
        transaccion.executeWithoutResult(estado -> resolverBloqueado(administradorUsuarioId, reclamoId, pedidoId, request));
        return detalle(reclamoId);
    }

    private void resolverBloqueado(Integer administradorUsuarioId, Integer reclamoId, Integer pedidoId, ResolverReclamoRequestDTO request) {
        Pedido pedido = pedidoService.bloquearParaActualizar(pedidoId, administradorUsuarioId);
        boolean conReembolso = request.getTipo() != TipoResolucionReclamo.RECHAZO;
        Pago pago = null;
        if (conReembolso) {
            pago = pagoService.buscarPorPedidoParaActualizar(pedidoId)
                    .orElseThrow(() -> new ConflictoDeNegocioException("El pedido no tiene ningún pago para reembolsar"));
        }
        Reclamo reclamo = reclamoRepository.findByIdParaActualizar(reclamoId)
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADO));
        if (reclamo.getEstado() != EstadoReclamo.PENDIENTE) {
            throw new ConflictoDeNegocioException(MENSAJE_YA_RESUELTO);
        }

        LocalDateTime ahora = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        Usuario cliente = pedido.getCliente().getPersonaFisica().getPersona().getUsuario();
        if (!conReembolso) {
            String motivo = request.getMotivo().trim();
            reclamo.setEstado(EstadoReclamo.RECHAZADO);
            reclamo.setTipoResolucion(TipoResolucionReclamo.RECHAZO);
            reclamo.setNotaResolucion(motivo);
            reclamo.setAdministradorId(administradorUsuarioId);
            reclamo.setFechaResolucion(ahora);
            reclamoRepository.saveAndFlush(reclamo);
            avisos.avisarRechazoAlCliente(cliente.getId(), cliente.getEmail(), pedidoId, motivo);
            return;
        }
        BigDecimal montoPedido = request.getMonto() == null ? null : request.getMonto().setScale(2, RoundingMode.HALF_UP);
        NotaCredito nota = reembolsoService.generarNotaDeReclamo(pago, request.getTipo(), montoPedido, reclamoId);
        reclamo.setEstado(EstadoReclamo.APROBADO);
        reclamo.setTipoResolucion(request.getTipo());
        reclamo.setMontoAprobado(nota.getMonto());
        reclamo.setAdministradorId(administradorUsuarioId);
        reclamo.setFechaResolucion(ahora);
        reclamoRepository.saveAndFlush(reclamo);
        avisos.avisarAprobacionAlCliente(cliente.getId(), cliente.getEmail(), pedidoId, nota.getMonto());
        avisos.avisarReembolsoAlDueno(pedido.getComercio().getDueno().getId(), pedido.getComercio().getId(), pedidoId, nota.getMonto());
    }

    private static void validarForma(ResolverReclamoRequestDTO request) {
        Map<String, String> errores = new LinkedHashMap<>();
        TipoResolucionReclamo tipo = request.getTipo();
        if (tipo == TipoResolucionReclamo.RECHAZO) {
            String motivo = request.getMotivo() == null ? "" : request.getMotivo().trim();
            if (motivo.length() < 10 || motivo.length() > 500) {
                errores.put("motivo", "Escribí el motivo del rechazo en entre 10 y 500 caracteres");
            }
            if (request.getMonto() != null) {
                errores.put("monto", "Un rechazo no lleva monto");
            }
        } else if (tipo == TipoResolucionReclamo.REEMBOLSO_PARCIAL) {
            if (request.getMonto() == null) {
                errores.put("monto", "Indicá cuánto devolver");
            } else if (request.getMonto().signum() <= 0) {
                errores.put("monto", "El monto tiene que ser mayor a cero.");
            }
        } else if (request.getMonto() != null) {
            errores.put("monto", "El reembolso total no lleva monto");
        }
        if (!errores.isEmpty()) {
            throw new ValidacionCamposException(errores);
        }
    }

    private ReclamoAdminResponseDTO.Detalle armarDetalle(Reclamo reclamo) {
        Pedido pedido = pedidoRepository.findById(reclamo.getPedidoId())
                .orElseThrow(() -> new RecursoNoEncontradoException(MENSAJE_NO_ENCONTRADO));
        Usuario cliente = pedido.getCliente().getPersonaFisica().getPersona().getUsuario();
        List<DetallePedidoResponseDTO> detalles = detallePedidoRepository.findByPedidoId(pedido.getId()).stream()
                .map(d -> new DetallePedidoResponseDTO(d.getProducto().getId(), d.getProducto().getNombre(), d.getPrecioUnitario(),
                        d.getCantidad(), d.getSubtotal(), d.getNota()))
                .toList();
        Optional<Pago> pago = pagoService.buscarPorPedido(pedido.getId());
        BigDecimal saldo = pago.map(p -> p.getMonto().subtract(notaCreditoService.montoCubierto(p.getId()))).orElse(null);
        NotaCredito nota = notaCreditoService.listarPorReclamos(List.of(reclamo.getId())).stream().findFirst().orElse(null);
        ReclamoAdminResponseDTO.Reembolso reembolso = nota == null ? null
                : new ReclamoAdminResponseDTO.Reembolso(nota.getId(), nota.getEstado(), nota.getMonto(), nota.getIntentos(),
                        nota.getUltimoError());
        ReclamoAdminResponseDTO.PedidoDelReclamo datosPedido = new ReclamoAdminResponseDTO.PedidoDelReclamo(pedido.getId(),
                pedido.getComercio().getId(), pedido.getComercio().getNombre(), cliente.getId(),
                pedido.getCliente().getPersonaFisica().getNombre() + " " + pedido.getCliente().getPersonaFisica().getApellido(),
                cliente.getEmail(), pedido.getTipoEntrega(), pedido.getFechaEntrega(), detalles, pedido.getSubtotal(),
                pedido.getCargoServicioCliente(), pedido.getTotal());
        return new ReclamoAdminResponseDTO.Detalle(reclamo.getId(), reclamo.getEstado(), reclamo.getMotivo(), reclamo.getDescripcion(),
                reclamo.getFechaCreacion(), politica.fechaLimite(pedido), reclamo.getTipoResolucion(), reclamo.getMontoAprobado(),
                reclamo.getNotaResolucion(), reclamo.getFechaResolucion(), ReclamoVistaService.enProceso(reclamo, nota), datosPedido,
                saldo, reembolso);
    }

    private static ReclamoAdminResponseDTO.Resumen aResumen(FilaBandeja fila) {
        boolean aprobado = EstadoReclamo.APROBADO.name().equals(fila.getEstado());
        Boolean enProceso = aprobado ? !EstadoNotaCredito.PROCESADO.name().equals(fila.getEstadoNota()) : null;
        return new ReclamoAdminResponseDTO.Resumen(fila.getId(), fila.getPedidoId(), MotivoReclamo.valueOf(fila.getMotivo()),
                EstadoReclamo.valueOf(fila.getEstado()), fila.getFechaCreacion(), fila.getComercioId(), fila.getComercioNombre(),
                fila.getTotal(), fila.getTipoResolucion() == null ? null : TipoResolucionReclamo.valueOf(fila.getTipoResolucion()),
                fila.getMontoAprobado(), fila.getFechaResolucion(), enProceso);
    }
}
