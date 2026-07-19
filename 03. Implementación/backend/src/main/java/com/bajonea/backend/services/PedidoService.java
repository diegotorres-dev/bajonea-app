package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.response.DetallePedidoResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.DetallePedido;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Confirmación de pedido desde el carrito, y aceptación/rechazo por el comercio.
 * {@code EstadoPedido} recortado del MVP: {@code PENDIENTE -> EN_PREPARACION / RECHAZADO}
 * (no {@code ACEPTADO} — ver docs/modelo-mvp.md, nota de alcance 9).
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
    private final NotificacionService notificacionService;
    private final CarritoService carritoService;

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

        BigDecimal subtotalPedido = items.stream()
                .map(item -> item.getProducto().getPrecio().multiply(BigDecimal.valueOf(item.getCantidad())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Pedido pedido = Pedido.builder()
                .cliente(cliente)
                .comercio(comercio)
                .direccion(direccion)
                .tipoEntrega(request.getTipoEntrega())
                .estado(EstadoPedido.PENDIENTE)
                .subtotal(subtotalPedido)
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
                    .build();
            detallePedidoRepository.save(detalle);
        }

        carritoService.vaciarCarrito(usuarioId);

        notificacionService.crear(comercio.getPersonaJuridica().getPersona().getUsuario().getId(),
                "Nuevo pedido recibido de " + cliente.getPersonaFisica().getNombre() + ".");

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO aceptarPedido(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercio(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.PENDIENTE) {
            throw new ConflictoDeNegocioException("El pedido ya fue resuelto, no está en estado PENDIENTE");
        }

        pedido.setEstado(EstadoPedido.EN_PREPARACION);
        pedidoRepository.save(pedido);

        notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                "Tu pedido fue aceptado y está en preparación.");

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO rechazarPedido(Integer usuarioId, Integer pedidoId, RechazoPedidoRequestDTO request) {
        Pedido pedido = obtenerPedidoDelComercio(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.PENDIENTE) {
            throw new ConflictoDeNegocioException("El pedido ya fue resuelto, no está en estado PENDIENTE");
        }

        pedido.setEstado(EstadoPedido.RECHAZADO);
        pedido.setMotivoRechazo(request.getMotivo());
        pedido.setComentarioRechazo(request.getComentario());
        pedidoRepository.save(pedido);

        String mensaje = "Tu pedido #" + pedido.getId() + " fue rechazado por el comercio. Motivo: "
                + request.getMotivo().getEtiqueta() + ".";
        if (request.getComentario() != null && !request.getComentario().isBlank()) {
            mensaje += " " + request.getComentario();
        }

        notificacionService.crear(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(), mensaje);

        return aResponseDTO(pedido);
    }

    public List<PedidoResponseDTO> listarPedidosCliente(Integer usuarioId) {
        return pedidoRepository.findByClienteId(usuarioId).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    public List<PedidoResponseDTO> listarPedidosComercio(Integer usuarioId) {
        Comercio comercio = comercioRepository.findByPersonaJuridicaId(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return pedidoRepository.findByComercioId(comercio.getId()).stream()
                .map(this::aResponseDTO)
                .toList();
    }

    private Pedido obtenerPedidoDelComercio(Integer usuarioId, Integer pedidoId) {
        Comercio comercio = comercioRepository.findByPersonaJuridicaId(usuarioId)
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
                pedido.getComercio().getId(),
                pedido.getEstado(),
                pedido.getTipoEntrega(),
                direccionDTO,
                pedido.getMotivoRechazo(),
                pedido.getComentarioRechazo(),
                pedido.getFechaCreacion(),
                detalles,
                pedido.getSubtotal());
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
