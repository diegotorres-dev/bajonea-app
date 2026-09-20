package com.bajonea.backend.services;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.response.DetallePedidoResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.dto.response.ResumenPedidosHoyResponseDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.ConfiguracionTarifa;
import com.bajonea.backend.entities.DetallePedido;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.CanceladoPor;
import com.bajonea.backend.enums.EstadoDetallePedido;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.FuenteEntrega;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.MotivoTimeoutPedido;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoPedidoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Máquina de estados completa del Pedido (Fase 19, ver CLAUDE.md §6 y docs/DECISIONES.md):
 * {@code PENDIENTE_PAGO -> PENDIENTE_CONFIRMACION_COMERCIO -> EN_PREPARACION -> EN_CAMINO/LISTO_PARA_RETIRAR ->
 * ENTREGADO}, más los 5 estados terminales negativos ({@code RECHAZADO, CANCELADO, ANULADO,
 * CANCELADO_POR_SISTEMA, EXPIRADO}). El pago es real desde el tramo MercadoPago 03 — la
 * transición {@code PENDIENTE_PAGO -> PENDIENTE_CONFIRMACION_COMERCIO}/{@code CANCELADO_POR_SISTEMA}
 * la dispara el webhook de MercadoPago vía {@link #confirmarPagoAprobado} / {@link #marcarPagoRechazado}
 * ({@code MercadoPagoPagoService}), nunca directamente el Cliente.
 * {@code HistorialEstadoPedido} es la fuente canónica de todos los timestamps y actores del
 * ciclo de vida (ver diccionario de datos); {@code Pedido} solo conserva el estado actual.
 * Todo estado terminal negativo con reembolso pendiente queda con un TODO explícito — sin
 * {@code NotaCredito} en este tramo (ver docs/DECISIONES.md).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class PedidoService {

    private final PedidoRepository pedidoRepository;
    private final DetallePedidoRepository detallePedidoRepository;
    private final CarritoRepository carritoRepository;
    private final ItemCarritoRepository itemCarritoRepository;
    private final ClienteRepository clienteRepository;
    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final HistorialEstadoPedidoRepository historialEstadoPedidoRepository;
    private final UsuarioRepository usuarioRepository;
    private final NotificacionService notificacionService;
    private final CarritoService carritoService;
    private final ComercioService comercioService;
    private final ConfiguracionTarifaService configuracionTarifaService;
    private final PedidoTimeoutProperties timeoutProperties;

    @PersistenceContext
    private EntityManager entityManager;

    private static final BigDecimal SUBTOTAL_MAXIMO = new BigDecimal("99999999");

    public PedidoResponseDTO confirmarPedido(Integer usuarioId, PedidoRequestDTO request) {
        Cliente cliente = clienteRepository.findById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Cliente no encontrado"));

        Carrito carrito = carritoRepository.findByClienteId(usuarioId)
                .orElseThrow(() -> new ConflictoDeNegocioException("El carrito está vacío"));
        List<ItemCarrito> items = itemCarritoRepository.findByCarritoId(carrito.getId());
        if (items.isEmpty()) {
            throw new ConflictoDeNegocioException("El carrito está vacío");
        }

        Comercio comercio = carrito.getComercio();
        comercioService.validarAceptaPedidos(comercio);

        if (request.getTipoEntrega() == TipoEntrega.DOMICILIO && !comercio.isAceptaDelivery()) {
            throw new ConflictoDeNegocioException("El comercio no ofrece entrega a domicilio");
        }
        if (request.getTipoEntrega() == TipoEntrega.RETIRO && !comercio.isAceptaRetiro()) {
            throw new ConflictoDeNegocioException("El comercio no permite retiro en el local");
        }

        Direccion direccion = null;
        if (request.getTipoEntrega() == TipoEntrega.DOMICILIO) {
            if (request.getDireccionId() == null) {
                throw new ConflictoDeNegocioException("La dirección es obligatoria para entrega a domicilio");
            }
            direccion = direccionRepository.findById(request.getDireccionId())
                    .orElseThrow(() -> new RecursoNoEncontradoException("Dirección no encontrada"));
            if (direccion.getCliente() == null || !direccion.getCliente().getId().equals(usuarioId) || direccion.isEliminada()) {
                throw new RecursoNoEncontradoException("Dirección no encontrada");
            }
        }

        for (ItemCarrito item : items) {
            BigDecimal subtotalItemValidado = item.getProducto().getPrecio().multiply(BigDecimal.valueOf(item.getCantidad()));
            if (subtotalItemValidado.compareTo(SUBTOTAL_MAXIMO) > 0) {
                throw new ValidacionException(
                        "El subtotal de \"" + item.getProducto().getNombre() + "\" supera el monto máximo permitido ($" + SUBTOTAL_MAXIMO + ")");
            }
        }

        BigDecimal subtotalPedido = items.stream()
                .map(item -> item.getProducto().getPrecio().multiply(BigDecimal.valueOf(item.getCantidad())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        ConfiguracionTarifa tarifaVigente = configuracionTarifaService.obtenerVigente();
        BigDecimal cargoServicioCliente = configuracionTarifaService.calcularCargoCliente(subtotalPedido, tarifaVigente);
        BigDecimal cargoServicioComercio = configuracionTarifaService.calcularCargoComercio(subtotalPedido, tarifaVigente);

        if (subtotalPedido.add(cargoServicioCliente).compareTo(SUBTOTAL_MAXIMO) > 0) {
            throw new ValidacionException(
                    "El total del pedido supera el monto máximo permitido por el sistema ($" + SUBTOTAL_MAXIMO + ")");
        }

        Pedido pedido = Pedido.builder()
                .cliente(cliente)
                .comercio(comercio)
                .direccion(direccion)
                .tipoEntrega(request.getTipoEntrega())
                .estado(EstadoPedido.PENDIENTE_PAGO)
                .pagoEstado(EstadoPagoPedido.PENDIENTE)
                .primerAvisoEmitido(false)
                .subtotal(subtotalPedido)
                .cargoServicioCliente(cargoServicioCliente)
                .cargoServicioComercio(cargoServicioComercio)
                .total(subtotalPedido.add(cargoServicioCliente))
                .fechaCreacion(LocalDateTime.now())
                .build();
        pedidoRepository.save(pedido);

        for (ItemCarrito item : items) {
            BigDecimal subtotalItem = item.getProducto().getPrecio().multiply(BigDecimal.valueOf(item.getCantidad()));
            DetallePedido detalle = DetallePedido.builder()
                    .pedido(pedido)
                    .producto(item.getProducto())
                    .cantidad(item.getCantidad())
                    .precioUnitario(item.getProducto().getPrecio())
                    .nota(item.getNota())
                    .subtotal(subtotalItem)
                    .estado(EstadoDetallePedido.ACTIVO)
                    .build();
            detallePedidoRepository.save(detalle);
        }

        registrarHistorial(pedido, ActorPedido.CLIENTE, usuarioId);

        return aResponseDTO(pedido);
    }

    /**
     * Invocado por {@code MercadoPagoPagoService} cuando el webhook confirma un pago real
     * {@code approved} para este pedido (tramo MercadoPago 03) — reemplaza al viejo
     * {@code confirmarPagoSimulado} manual. Idempotente: si el pedido ya no está en
     * {@code PENDIENTE_PAGO} (notificación repetida de MP, o ya lo venció el job de expiración
     * de pago) no hace nada, no reintenta la transición.
     */
    public void confirmarPagoAprobado(Integer pedidoId) {
        Pedido pedido = pedidoRepository.findById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        if (pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO) {
            return;
        }

        pedido.setPagoEstado(EstadoPagoPedido.PAGADO);
        pedido.setEstado(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.SISTEMA, null);

        Integer clienteId = pedido.getCliente().getId();
        Integer comercioId = pedido.getComercio().getId();
        carritoRepository.findByClienteId(clienteId)
                .filter(carrito -> carrito.getComercio() != null && carrito.getComercio().getId().equals(comercioId))
                .ifPresent(carrito -> carritoService.vaciarCarrito(clienteId));

        notificacionService.crear(pedido.getComercio().getDueno().getPersonaJuridica().getPersona().getUsuario().getId(),
                "Nuevo pedido recibido de " + pedido.getCliente().getPersonaFisica().getNombre() + " "
                        + pedido.getCliente().getPersonaFisica().getApellido() + ".",
                TipoNotificacion.NUEVO_PEDIDO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
    }

    /**
     * Invocado por {@code MercadoPagoPagoService} cuando MercadoPago informa un pago
     * {@code rejected}/{@code cancelled}. El pedido NO se cancela: queda en {@code PENDIENTE_PAGO}
     * con {@code pagoEstado = RECHAZADO} (el cliente puede reintentar sobre la misma preferencia)
     * hasta que se apruebe un pago o lo venza el job de expiración. Nunca degrada un pedido ya
     * pagado ni uno que salió de {@code PENDIENTE_PAGO}.
     */
    public void marcarPagoRechazado(Integer pedidoId) {
        Pedido pedido = pedidoRepository.findById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        if (pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO || pedido.getPagoEstado() == EstadoPagoPedido.PAGADO) {
            return;
        }

        pedido.setPagoEstado(EstadoPagoPedido.RECHAZADO);
        pedidoRepository.save(pedido);
    }

    /**
     * Bloquea la fila del pedido (SELECT ... FOR UPDATE) y recarga su estado, para serializar el
     * webhook y la sincronización que pueden llegar a la vez sobre el mismo pedido.
     */
    Pedido bloquearParaActualizar(Integer pedidoId) {
        Pedido pedido = pedidoRepository.findById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        entityManager.refresh(pedido, LockModeType.PESSIMISTIC_WRITE);
        return pedido;
    }

    public PedidoResponseDTO obtenerDetalleCliente(Pedido pedido) {
        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO aceptarPedido(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercio(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO) {
            throw new ConflictoDeNegocioException("El pedido ya fue resuelto, no está en estado PENDIENTE_CONFIRMACION_COMERCIO");
        }

        pedido.setEstado(EstadoPedido.EN_PREPARACION);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.DUENO, usuarioId);

        notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                "Tu pedido a " + pedido.getComercio().getNombre() + " fue aceptado y está en preparación.",
                TipoNotificacion.PEDIDO_ACEPTADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO rechazarPedido(Integer usuarioId, Integer pedidoId, RechazoPedidoRequestDTO request) {
        Pedido pedido = obtenerPedidoDelComercio(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO) {
            throw new ConflictoDeNegocioException("El pedido ya fue resuelto, no está en estado PENDIENTE_CONFIRMACION_COMERCIO");
        }

        if (request.getMotivo() == MotivoRechazo.OTRO
                && (request.getComentario() == null || request.getComentario().isBlank())) {
            throw new ValidacionException("Ingresá un comentario para especificar el motivo del rechazo.");
        }

        pedido.setEstado(EstadoPedido.RECHAZADO);
        pedido.setCanceladoPor(CanceladoPor.COMERCIO);
        pedido.setMotivoRechazo(request.getMotivo());
        pedido.setComentarioRechazo(request.getComentario());
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.DUENO, usuarioId);
        // TODO: genera reembolso, pendiente de NotaCredito.

        String mensaje = "Tu pedido #" + pedido.getId() + " a " + pedido.getComercio().getNombre()
                + " fue rechazado por el comercio. Motivo: " + request.getMotivo().getEtiqueta() + ".";
        if (request.getComentario() != null && !request.getComentario().isBlank()) {
            mensaje += " " + request.getComentario();
        }

        notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(), mensaje,
                TipoNotificacion.PEDIDO_RECHAZADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO avanzarAEntregaEnCurso(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercio(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION) {
            throw new ConflictoDeNegocioException("El pedido no está en preparación");
        }

        EstadoPedido destino = pedido.getTipoEntrega() == TipoEntrega.DOMICILIO
                ? EstadoPedido.EN_CAMINO
                : EstadoPedido.LISTO_PARA_RETIRAR;
        pedido.setEstado(destino);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.DUENO, usuarioId);

        TipoNotificacion tipo = destino == EstadoPedido.EN_CAMINO
                ? TipoNotificacion.PEDIDO_EN_CAMINO
                : TipoNotificacion.PEDIDO_LISTO_RETIRO;
        String mensaje = destino == EstadoPedido.EN_CAMINO
                ? "Tu pedido de " + pedido.getComercio().getNombre() + " fue despachado y está en camino."
                : "Tu pedido de " + pedido.getComercio().getNombre() + " está listo para retirar en el local.";

        notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(), mensaje,
                tipo, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO confirmarEntregaCliente(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelCliente(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.EN_CAMINO) {
            throw new ConflictoDeNegocioException("El pedido no está en camino");
        }

        marcarEntregado(pedido, FuenteEntrega.CLIENTE);
        registrarHistorial(pedido, ActorPedido.CLIENTE, usuarioId);

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO confirmarEntregaComercio(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercio(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR) {
            throw new ConflictoDeNegocioException("El pedido no está listo para retirar");
        }

        marcarEntregado(pedido, FuenteEntrega.COMERCIO);
        registrarHistorial(pedido, ActorPedido.DUENO, usuarioId);

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO cancelarPedido(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelCliente(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO && pedido.getEstado() != EstadoPedido.EN_PREPARACION) {
            throw new ConflictoDeNegocioException("El pedido ya no se puede cancelar");
        }

        pedido.setEstado(EstadoPedido.CANCELADO);
        pedido.setCanceladoPor(CanceladoPor.CLIENTE);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.CLIENTE, usuarioId);
        // TODO: genera reembolso, pendiente de NotaCredito.

        notificacionService.crear(pedido.getComercio().getDueno().getPersonaJuridica().getPersona().getUsuario().getId(),
                "El cliente canceló el pedido #" + pedido.getId() + ".",
                TipoNotificacion.PEDIDO_CANCELADO_CLIENTE, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO anularPedido(Integer usuarioId, Integer pedidoId, AnulacionPedidoRequestDTO request) {
        Pedido pedido = obtenerPedidoDelComercio(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION) {
            throw new ConflictoDeNegocioException("El pedido no está en preparación");
        }

        pedido.setEstado(EstadoPedido.ANULADO);
        pedido.setCanceladoPor(CanceladoPor.COMERCIO);
        pedido.setMotivo(request.getMotivo());
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.DUENO, usuarioId);
        // TODO: genera reembolso, pendiente de NotaCredito.

        notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                "Tu pedido #" + pedido.getId() + " a " + pedido.getComercio().getNombre()
                        + " fue anulado por el comercio. Motivo: " + request.getMotivo(),
                TipoNotificacion.PEDIDO_ANULADO_COMERCIO, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public List<PedidoResponseDTO> listarPedidosCliente(Integer usuarioId) {
        return pedidoRepository.findByClienteId(usuarioId).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    /**
     * Excluye {@code PENDIENTE_PAGO} — el Comercio no debería ver un pedido antes de que el
     * pago esté confirmado (T1 dispara recién en {@link #confirmarPagoAprobado}); hasta
     * entonces solo el Cliente tiene visibilidad y única acción posible sobre ese pedido.
     */
    public List<PedidoResponseDTO> listarPedidosComercio(Integer usuarioId) {
        Comercio comercio = comercioRepository.findByDuenoId(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return pedidoRepository.findByComercioId(comercio.getId()).stream()
                .filter(pedido -> pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO)
                .map(this::aResponseDTO)
                .toList();
    }

    public ResumenPedidosHoyResponseDTO obtenerResumenHoy(Integer usuarioId) {
        Comercio comercio = comercioRepository.findByDuenoId(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));

        LocalDateTime inicioHoy = LocalDate.now().atStartOfDay();
        LocalDateTime finHoy = inicioHoy.plusDays(1);
        List<Pedido> pedidosHoy = pedidoRepository.findByComercioIdAndFechaCreacionBetween(comercio.getId(), inicioHoy, finHoy)
                .stream()
                .filter(pedido -> pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO)
                .toList();

        BigDecimal totalFacturadoHoy = pedidosHoy.stream()
                .filter(pedido -> pedido.getEstado() == EstadoPedido.EN_PREPARACION)
                .map(Pedido::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int cantidadPedidosHoy = pedidosHoy.size();
        int cantidadPendientes = (int) pedidosHoy.stream()
                .filter(pedido -> pedido.getEstado() == EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)
                .count();

        return new ResumenPedidosHoyResponseDTO(totalFacturadoHoy, cantidadPedidosHoy, cantidadPendientes);
    }

    /**
     * Lógica reactiva del lado de Pedido cuando un Comercio se suspende (invocada por
     * {@code AdministradorService.suspenderComercio}). Los pedidos en curso ({@code PENDIENTE_CONFIRMACION_COMERCIO}/
     * {@code EN_PREPARACION}) se cancelan de inmediato; los {@code LISTO_PARA_RETIRAR} no se
     * tocan todavía — solo se les marca el vencimiento del timer de retiro, que resuelve
     * {@link #autoconfirmarRetirosPorSuspension}.
     */
    public void cancelarPedidosPorSuspensionComercio(Integer comercioId) {
        List<Pedido> activos = pedidoRepository.findByComercioIdAndEstadoIn(comercioId,
                List.of(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, EstadoPedido.EN_PREPARACION));
        for (Pedido pedido : activos) {
            pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);
            pedido.setCanceladoPor(CanceladoPor.SISTEMA);
            pedidoRepository.save(pedido);
            registrarHistorial(pedido, ActorPedido.SISTEMA, null);
            // TODO: genera reembolso, pendiente de NotaCredito.
            notificarCancelacionSistema(pedido, "el comercio fue suspendido");
        }

        List<Pedido> listosParaRetirar = pedidoRepository.findByComercioIdAndEstado(comercioId, EstadoPedido.LISTO_PARA_RETIRAR);
        LocalDateTime expira = LocalDateTime.now().plusMinutes(timeoutProperties.getRetiroSuspensionMinutos());
        for (Pedido pedido : listosParaRetirar) {
            pedido.setSuspensionRetiroExpira(expira);
            pedidoRepository.save(pedido);
        }
    }

    /** Job 1: expiración de pago — {@code PENDIENTE_PAGO} sin confirmar tras el umbral configurado. */
    public void expirarPagosVencidos() {
        LocalDateTime corte = LocalDateTime.now().minusMinutes(timeoutProperties.getPagoMinutos());
        List<Pedido> vencidos = pedidoRepository.findByEstadoAndFechaCreacionBefore(EstadoPedido.PENDIENTE_PAGO, corte);
        for (Pedido pedido : vencidos) {
            pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);
            pedido.setCanceladoPor(CanceladoPor.SISTEMA);
            pedido.setMotivo(pedido.getPagoEstado() == EstadoPagoPedido.RECHAZADO ? "Pago rechazado" : "Pago no confirmado");
            pedidoRepository.save(pedido);
            registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_PAGO);
            notificarCancelacionSistema(pedido, "no se confirmó el pago a tiempo");
        }
    }

    /**
     * Job 2: sobre pedidos {@code EN_CAMINO} — a los {@code avisoEnCaminoMinutos} dispara el
     * aviso preventivo (T7, idempotente vía {@code primerAvisoEmitido}); a los
     * {@code autoconfirmacionEnCaminoMinutos}, si nadie confirmó, autoconfirma {@code ENTREGADO}
     * (T8). Mismo cron para las dos cosas — confirmado con Diego.
     */
    public void avisar75MinYAutoconfirmar() {
        LocalDateTime ahora = LocalDateTime.now();
        for (Pedido pedido : pedidoRepository.findByEstado(EstadoPedido.EN_CAMINO)) {
            LocalDateTime entradaEnCamino = obtenerFechaEntradaAEstado(pedido, EstadoPedido.EN_CAMINO);
            if (entradaEnCamino == null) {
                continue;
            }
            long minutosTranscurridos = Duration.between(entradaEnCamino, ahora).toMinutes();

            if (minutosTranscurridos >= timeoutProperties.getAutoconfirmacionEnCaminoMinutos()) {
                marcarEntregado(pedido, FuenteEntrega.SISTEMA);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_ENTREGA);
                notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                        "Tu pedido #" + pedido.getId()
                                + " fue autoconfirmado como entregado. Si no lo recibiste, podés iniciar un reclamo o contactar al comercio.",
                        TipoNotificacion.PEDIDO_AUTOCONFIRMADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
            } else if (!pedido.isPrimerAvisoEmitido() && minutosTranscurridos >= timeoutProperties.getAvisoEnCaminoMinutos()) {
                pedido.setPrimerAvisoEmitido(true);
                pedidoRepository.save(pedido);
                notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                        "Tu pedido #" + pedido.getId() + " está en camino hace un buen rato. Confirmá la recepción cuando llegue.",
                        TipoNotificacion.AVISO_75MIN_SIN_CONFIRMACION, TipoEntidadNotificacion.PEDIDO, pedido.getId());
            }
        }
    }

    /** Job 3: {@code PENDIENTE_CONFIRMACION_COMERCIO} sin respuesta del comercio tras el umbral configurado -> {@code EXPIRADO}. */
    public void expirarPedidosSinRespuestaComercio() {
        LocalDateTime ahora = LocalDateTime.now();
        for (Pedido pedido : pedidoRepository.findByEstado(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)) {
            LocalDateTime entradaPendiente = obtenerFechaEntradaAEstado(pedido, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
            if (entradaPendiente == null
                    || Duration.between(entradaPendiente, ahora).toMinutes() < timeoutProperties.getRespuestaComercioMinutos()) {
                continue;
            }

            pedido.setEstado(EstadoPedido.EXPIRADO);
            pedido.setCanceladoPor(CanceladoPor.SISTEMA);
            pedidoRepository.save(pedido);
            registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_RESPUESTA_COMERCIO);
            // TODO: genera reembolso, pendiente de NotaCredito.

            notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                    "El comercio no respondió a tiempo tu pedido #" + pedido.getId() + ". Se canceló y el reembolso está en proceso.",
                    TipoNotificacion.PEDIDO_EXPIRADO_CLIENTE, TipoEntidadNotificacion.PEDIDO, pedido.getId());
            notificacionService.crear(pedido.getComercio().getDueno().getPersonaJuridica().getPersona().getUsuario().getId(),
                    "El pedido #" + pedido.getId() + " expiró por falta de respuesta.",
                    TipoNotificacion.PEDIDO_EXPIRADO_COMERCIO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
        }
    }

    /**
     * Job 4: {@code LISTO_PARA_RETIRAR} cuyo timer de suspensión venció -> autoconfirma
     * {@code ENTREGADO}, sin reembolso (ver diccionario: {@code fuente_entrega = SISTEMA}).
     */
    public void autoconfirmarRetirosPorSuspension() {
        for (Pedido pedido : pedidoRepository.findByEstadoAndSuspensionRetiroExpiraLessThan(
                EstadoPedido.LISTO_PARA_RETIRAR, LocalDateTime.now())) {
            marcarEntregado(pedido, FuenteEntrega.SISTEMA);
            registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_RETIRO_SUSPENSION);

            notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                    "Tu pedido #" + pedido.getId() + " se cerró automáticamente: el comercio está suspendido y venció el plazo de retiro.",
                    TipoNotificacion.PEDIDO_CERRADO_TIMER_SUSPENSION, TipoEntidadNotificacion.PEDIDO, pedido.getId());
        }
    }

    private LocalDateTime obtenerFechaEntradaAEstado(Pedido pedido, EstadoPedido estado) {
        return historialEstadoPedidoRepository.findTopByPedidoIdAndEstadoOrderByFechaHoraDesc(pedido.getId(), estado)
                .map(HistorialEstadoPedido::getFechaHora)
                .orElse(null);
    }

    private void marcarEntregado(Pedido pedido, FuenteEntrega fuente) {
        pedido.setEstado(EstadoPedido.ENTREGADO);
        pedido.setFuenteEntrega(fuente);
        pedido.setFechaEntrega(LocalDateTime.now());
        pedidoRepository.save(pedido);
    }

    private void notificarCancelacionSistema(Pedido pedido, String motivo) {
        notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                "Tu pedido #" + pedido.getId() + " fue cancelado automáticamente: " + motivo + ".",
                TipoNotificacion.PEDIDO_CANCELADO_SISTEMA, TipoEntidadNotificacion.PEDIDO, pedido.getId());
    }

    private void registrarHistorial(Pedido pedido, ActorPedido actorRol, Integer actorUsuarioId) {
        registrarHistorial(pedido, actorRol, actorUsuarioId, null);
    }

    private void registrarHistorial(Pedido pedido, ActorPedido actorRol, Integer actorUsuarioId, MotivoTimeoutPedido motivoTimeout) {
        HistorialEstadoPedido historial = HistorialEstadoPedido.builder()
                .pedido(pedido)
                .estado(pedido.getEstado())
                .actorRol(actorRol)
                .actorUsuario(actorUsuarioId == null ? null : usuarioRepository.getReferenceById(actorUsuarioId))
                .motivoTimeout(motivoTimeout)
                .fechaHora(LocalDateTime.now())
                .build();
        historialEstadoPedidoRepository.save(historial);
    }

    /** Sin {@code private}: reusado por {@code MercadoPagoPagoService} (mismo paquete) para resolver el pedido antes de crear/consultar su pago. */
    Pedido obtenerPedidoDelCliente(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = pedidoRepository.findById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        if (!pedido.getCliente().getId().equals(usuarioId)) {
            throw new RecursoNoEncontradoException("Pedido no encontrado");
        }
        return pedido;
    }

    /** Sin {@code private}: mismo motivo que {@link #obtenerPedidoDelCliente}. */
    Pedido obtenerPedidoDelComercio(Integer usuarioId, Integer pedidoId) {
        Comercio comercio = comercioRepository.findByDuenoId(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        Pedido pedido = pedidoRepository.findById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        if (!pedido.getComercio().getId().equals(comercio.getId())) {
            throw new RecursoNoEncontradoException("Pedido no encontrado");
        }
        return pedido;
    }

    private PedidoResponseDTO aResponseDTO(Pedido pedido) {
        List<DetallePedidoResponseDTO> detalles = detallePedidoRepository.findByPedidoId(pedido.getId()).stream()
                .map(this::aResponseDTO)
                .toList();

        DireccionResponseDTO direccionDTO = pedido.getDireccion() == null ? null : new DireccionResponseDTO(
                pedido.getDireccion().getId(),
                pedido.getDireccion().getCalle(),
                pedido.getDireccion().getNumero(),
                pedido.getDireccion().getPisoDepto(),
                pedido.getDireccion().getCodigoPostal(),
                pedido.getDireccion().getLocalidad().getId(),
                pedido.getDireccion().getLocalidad().getNombre(),
                pedido.getDireccion().getLocalidad().getProvincia().getNombre(),
                pedido.getDireccion().isPrincipal());

        return new PedidoResponseDTO(
                pedido.getId(),
                pedido.getCliente().getId(),
                pedido.getCliente().getPersonaFisica().getNombre() + " " + pedido.getCliente().getPersonaFisica().getApellido(),
                pedido.getComercio().getId(),
                pedido.getEstado(),
                pedido.getPagoEstado(),
                pedido.getTipoEntrega(),
                direccionDTO,
                pedido.getMotivoRechazo(),
                pedido.getComentarioRechazo(),
                pedido.getCanceladoPor(),
                pedido.getFuenteEntrega(),
                pedido.getEstado() == EstadoPedido.ANULADO ? pedido.getMotivo() : null,
                pedido.getFechaCreacion(),
                pedido.getFechaEntrega(),
                detalles,
                pedido.getTotal());
    }

    private DetallePedidoResponseDTO aResponseDTO(DetallePedido detalle) {
        return new DetallePedidoResponseDTO(
                detalle.getProducto().getId(),
                detalle.getProducto().getNombre(),
                detalle.getPrecioUnitario(),
                detalle.getCantidad(),
                detalle.getSubtotal(),
                detalle.getNota());
    }
}
