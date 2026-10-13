package com.bajonea.backend.services;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.response.DetallePedidoResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.dto.response.PedidoEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.dto.response.ResumenPedidosHoyEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.ResumenPedidosHoyResponseDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.ConfiguracionTarifa;
import com.bajonea.backend.entities.DetallePedido;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.CanceladoPor;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoDetallePedido;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.FuenteEntrega;
import com.bajonea.backend.enums.MotivoNotaCredito;
import com.bajonea.backend.enums.MotivoRechazo;
import com.bajonea.backend.enums.MotivoTimeoutPedido;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoEntrega;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ComercioNoDisponibleException;
import com.bajonea.backend.exceptions.ConflictoComercioException;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.CarritoRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DetallePedidoRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository;
import com.bajonea.backend.repositories.EmpleadoComercioRepository.EstadoDeRelacion;
import com.bajonea.backend.repositories.EmpleadoComercioRepository.RelacionDeEmpleado;
import com.bajonea.backend.repositories.HistorialEstadoPedidoRepository;
import com.bajonea.backend.repositories.ItemCarritoRepository;
import com.bajonea.backend.repositories.PedidoRepository;
import com.bajonea.backend.repositories.PedidoRepository.ParticipantesPedido;
import com.bajonea.backend.repositories.UsuarioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

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
 * Los estados terminales negativos con reembolso pendiente ({@code RECHAZADO}, {@code EXPIRADO}, {@code ANULADO},
 * {@code CANCELADO} y la cancelación por suspensión de comercio) crean la nota de crédito en la misma transacción
 * del cambio de estado ({@link ReembolsoService#generarNotaYReembolsarTotal}): si la nota no se puede escribir el
 * pedido no cambia de estado, y solo la llamada a MercadoPago va después del commit (ver docs/DECISIONES.md,
 * bloque A0b de E3).
 *
 * <p><b>Concurrencia (bloque A0 de E3):</b> toda transición de estado de un pedido —las acciones del comercio, las
 * del Cliente, el webhook y la sincronización de pago y los procesos automáticos— toma primero las filas de los
 * usuarios involucrados con bloqueo compartido (id ascendente), después la fila del pedido con
 * {@code PESSIMISTIC_WRITE} ({@link #bloquearParaActualizar}), y recién entonces vuelve a validar el estado, calcula
 * la hora de la operación y escribe. La que llega segunda ve el estado ya cambiado y responde {@code 409} (o no
 * hace nada, en los procesos) sin escribir historial, avisos ni reembolsos. El orden global de bloqueos está en
 * docs/CONCURRENCIA-Y-TRANSACCIONES.md.
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
    private final ReembolsoService reembolsoService;
    private final NotaCreditoService notaCreditoService;
    private final PlatformTransactionManager transactionManager;
    private final ComercioActivoService comercioActivoService;
    private final EmpleadoComercioRepository empleadoComercioRepository;
    private final Clock clock;

    private static final Logger log = LoggerFactory.getLogger(PedidoService.class);

    @PersistenceContext
    private EntityManager entityManager;

    private static final BigDecimal SUBTOTAL_MAXIMO = new BigDecimal("99999999");
    private static final List<EstadoPedido> ESTADOS_FACTURADOS = List.of(
            EstadoPedido.EN_PREPARACION, EstadoPedido.EN_CAMINO, EstadoPedido.LISTO_PARA_RETIRAR, EstadoPedido.ENTREGADO);

    public PedidoResponseDTO confirmarPedido(Integer usuarioId, PedidoRequestDTO request) {
        usuarioRepository.leerIdConBloqueoCompartido(usuarioId);
        Cliente cliente = clienteRepository.findById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Cliente no encontrado"));

        Carrito carrito = carritoRepository.findByClienteId(usuarioId)
                .orElseThrow(() -> new ConflictoDeNegocioException("El carrito está vacío"));
        List<ItemCarrito> items = itemCarritoRepository.findByCarritoId(carrito.getId());
        if (items.isEmpty()) {
            throw new ConflictoDeNegocioException("El carrito está vacío");
        }

        Comercio comercio = carrito.getComercio();
        // Estado leído con bloqueo compartido (no una lectura común): es el último confirmado aunque la
        // transacción ya tenga una foto vieja, y mantiene el comercio bloqueado contra escritura hasta el
        // commit. Así la desvinculación de la cuenta de Mercado Pago (que bloquea el comercio FOR UPDATE antes
        // de mirar los pagos pendientes) y esta creación de pedido se serializan: o el pedido ve APROBADO y se
        // rechaza, o la desvinculación ve el pedido nuevo en PENDIENTE_PAGO y se rechaza.
        // La misma lectura trae el cierre manual: cerrar el comercio y crear un pedido también se serializan, o
        // el pedido ve el cierre y se rechaza, o el cierre espera al commit del pedido (que nace antes del cierre).
        ComercioRepository.EstadoYCierreComercio lectura = comercioRepository.leerEstadoConBloqueoCompartido(comercio.getId())
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        comercioService.validarAceptaPedidos(comercio, EstadoComercio.valueOf(lectura.getEstado()),
                lectura.getCerradoManualmente());

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
                .fechaCreacion(LocalDateTime.now(clock))
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
        PedidoBloqueado bloqueado = bloquearParaActualizarConEquipo(pedidoId, null);
        Pedido pedido = bloqueado.pedido();
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

        notificacionService.crearParaEquipo(comercioId, pedido.getComercio().getDueno().getId(), bloqueado.equipo(),
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
        Pedido pedido = bloquearParaActualizar(pedidoId);
        if (pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO || pedido.getPagoEstado() == EstadoPagoPedido.PAGADO) {
            return;
        }

        pedido.setPagoEstado(EstadoPagoPedido.RECHAZADO);
        pedidoRepository.save(pedido);
    }

    /**
     * Punto único de entrada de toda transición de estado de un pedido existente. Toma, en este orden: (1) las
     * filas de los usuarios involucrados (quien actúa, el Cliente del pedido y el usuario del Dueño, cuyas
     * claves foráneas van a tocar el historial y los avisos) con {@code LOCK IN SHARE MODE} y en id ascendente,
     * y (2) la fila del pedido con {@code SELECT ... FOR UPDATE}, recargando su estado confirmado. Los usuarios van
     * primero por la misma regla del login y del cierre manual (quien escribe una fila con clave foránea a un
     * usuario y además bloquea otra fila toma antes el usuario; ver docs/APRENDIZAJES-TECNICOS.md): si el pedido
     * se bloqueara antes, una acción podría quedar con el pedido en la mano esperando un usuario que el login ya
     * pidió con {@code FOR UPDATE}, y cruzarse con otra transacción que sostiene ese usuario y quiere el pedido.
     * Quien llama tiene que volver a validar el estado <b>después</b> de este método y calcular la hora de la
     * operación también después.
     */
    Pedido bloquearParaActualizar(Integer pedidoId) {
        return bloquearParaActualizar(pedidoId, null);
    }

    Pedido bloquearParaActualizar(Integer pedidoId, Integer actorUsuarioId) {
        return bloquearParaActualizar(pedidoId, actorUsuarioId, null, false);
    }

    /**
     * Igual que {@link #bloquearParaActualizar(Integer)} para una acción del comercio. Si el actor es un Empleado,
     * después de los usuarios y antes del pedido revalida con bloqueo compartido que su relación con el comercio siga
     * {@code ACTIVO} (si no, {@code 404} {@code COMERCIO_NO_DISPONIBLE}) y, solo al aceptar un pedido nuevo
     * ({@code aceptaPedidoNuevo}), lee el estado del comercio con bloqueo compartido y responde {@code 409}
     * {@code COMERCIO_SIN_OPERACION} si es {@code SUSPENDIDO} o {@code CERRADO_TEMPORALMENTE}. Rechazar, despachar,
     * entregar y anular no miran el estado del comercio: las permite o no el estado del pedido. El Dueño no cambia:
     * no toma relación ni comercio (orden de bloqueo: usuario, relación, comercio, pedido).
     */
    Pedido bloquearParaActualizar(Integer pedidoId, Integer actorUsuarioId, ComercioActivo comercioActivo, boolean aceptaPedidoNuevo) {
        return bloquear(pedidoId, actorUsuarioId, comercioActivo, aceptaPedidoNuevo, false).pedido();
    }

    /**
     * Igual que {@link #bloquearParaActualizar(Integer, Integer)} para las transiciones que avisan al equipo del
     * comercio (pedido nuevo pagado, cancelación del Cliente y expiración sin respuesta). Además del Cliente, el
     * Dueño y quien actúa, resuelve y bloquea a los destinatarios del aviso: los Empleados {@code ACTIVO} del
     * comercio, sin el Cliente del pedido (un Empleado que compra en su propio comercio recibe solo sus avisos de
     * comprador). Orden de bloqueo: (1) lectura simple de las relaciones activas, (2) los usuarios de todos los
     * involucrados con {@code LOCK IN SHARE MODE} en id ascendente, (3) las relaciones por clave primaria en id
     * ascendente con {@code LOCK IN SHARE MODE}, releyendo el estado confirmado, y (4) el pedido
     * {@code FOR UPDATE}. Los destinatarios son los que siguen {@code ACTIVO} en (3): una desactivación (que toma la
     * relación {@code FOR UPDATE}) espera a esta transacción o ya se confirmó y deja a esa persona afuera; quien se
     * suma entre (1) y (3) no tiene su usuario bloqueado y queda afuera (se sumó después del hecho).
     */
    PedidoBloqueado bloquearParaActualizarConEquipo(Integer pedidoId, Integer actorUsuarioId) {
        return bloquear(pedidoId, actorUsuarioId, null, false, true);
    }

    record PedidoBloqueado(Pedido pedido, List<Integer> equipo) {
    }

    private PedidoBloqueado bloquear(Integer pedidoId, Integer actorUsuarioId, ComercioActivo comercioActivo,
            boolean aceptaPedidoNuevo, boolean conEquipo) {
        ParticipantesPedido participantes = pedidoRepository.findParticipantesById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        List<RelacionDeEmpleado> candidatos = new ArrayList<>();
        if (conEquipo) {
            for (RelacionDeEmpleado relacion : empleadoComercioRepository
                    .findRelacionesByComercioIdAndEstado(participantes.getComercioId(), EstadoEmpleadoComercio.ACTIVO)) {
                if (!relacion.getEmpleadoId().equals(participantes.getClienteId())) {
                    candidatos.add(relacion);
                }
            }
        }
        TreeSet<Integer> usuarios = new TreeSet<>();
        if (actorUsuarioId != null) {
            usuarios.add(actorUsuarioId);
        }
        usuarios.add(participantes.getClienteId());
        usuarios.add(participantes.getDuenoId());
        for (RelacionDeEmpleado candidato : candidatos) {
            usuarios.add(candidato.getEmpleadoId());
        }
        for (Integer usuarioId : usuarios) {
            usuarioRepository.leerIdConBloqueoCompartido(usuarioId);
        }
        if (comercioActivo != null && comercioActivo.esEmpleado()) {
            comercioActivoService.exigirRelacionActiva(comercioActivo);
            if (aceptaPedidoNuevo) {
                EstadoComercio estadoComercio = comercioRepository.leerEstadoConBloqueoCompartido(comercioActivo.comercioId())
                        .map(lectura -> EstadoComercio.valueOf(lectura.getEstado()))
                        .orElseThrow(ComercioNoDisponibleException::new);
                ComercioActivoService.validarComercioAceptaPedidosNuevos(estadoComercio);
            }
        }
        List<Integer> equipo = new ArrayList<>();
        if (!candidatos.isEmpty()) {
            List<Integer> relacionesIds = candidatos.stream().map(RelacionDeEmpleado::getId).toList();
            for (EstadoDeRelacion relacion : empleadoComercioRepository.leerRelacionesConBloqueoCompartido(relacionesIds)) {
                if (EstadoEmpleadoComercio.valueOf(relacion.getEstado()) == EstadoEmpleadoComercio.ACTIVO) {
                    equipo.add(relacion.getEmpleadoId());
                }
            }
        }
        Pedido pedido = pedidoRepository.findById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        entityManager.refresh(pedido, LockModeType.PESSIMISTIC_WRITE);
        return new PedidoBloqueado(pedido, equipo);
    }

    private Pedido obtenerPedidoDelComercioParaActualizar(ComercioActivo comercioActivo, Integer pedidoId) {
        return obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId, false);
    }

    private Pedido obtenerPedidoDelComercioParaActualizar(ComercioActivo comercioActivo, Integer pedidoId, boolean aceptaPedidoNuevo) {
        obtenerPedidoDelComercio(comercioActivo.comercioId(), pedidoId);
        Pedido pedido = bloquearParaActualizar(pedidoId, comercioActivo.actorUsuarioId(), comercioActivo, aceptaPedidoNuevo);
        exigirQueNoSeaPedidoPropio(comercioActivo, pedido.getCliente().getId());
        return pedido;
    }

    /**
     * Un Empleado no gestiona (ni consulta la trazabilidad de) un pedido del que él mismo es el Cliente: {@code 409}
     * {@code PEDIDO_PROPIO}. Se valida por id de usuario, con el cliente leído de la fila del pedido ya bloqueada
     * (en las acciones) o de la lectura consistente (en la trazabilidad). Solo aplica al Empleado: el Dueño nunca
     * es Cliente de su propio comercio.
     */
    public static void exigirQueNoSeaPedidoPropio(ComercioActivo actor, Integer clienteId) {
        if (actor.esEmpleado() && actor.actorUsuarioId().equals(clienteId)) {
            throw new ConflictoComercioException(ConflictoComercioException.PEDIDO_PROPIO,
                    ConflictoComercioException.MENSAJE_PEDIDO_PROPIO);
        }
    }

    private static ActorPedido actorDePedido(ComercioActivo comercioActivo) {
        return comercioActivo.esEmpleado() ? ActorPedido.EMPLEADO : ActorPedido.DUENO;
    }

    private Pedido obtenerPedidoDelClienteParaActualizar(Integer usuarioId, Integer pedidoId) {
        obtenerPedidoDelCliente(usuarioId, pedidoId);
        return bloquearParaActualizar(pedidoId, usuarioId);
    }

    public PedidoResponseDTO obtenerDetalleCliente(Pedido pedido) {
        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO aceptarPedido(ComercioActivo comercioActivo, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId, true);

        if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO) {
            throw new ConflictoDeNegocioException("El pedido ya fue resuelto, no está en estado PENDIENTE_CONFIRMACION_COMERCIO");
        }

        pedido.setEstado(EstadoPedido.EN_PREPARACION);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, actorDePedido(comercioActivo), comercioActivo.actorUsuarioId());

        notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                "Tu pedido a " + pedido.getComercio().getNombre() + " fue aceptado y está en preparación.",
                TipoNotificacion.PEDIDO_ACEPTADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO rechazarPedido(ComercioActivo comercioActivo, Integer pedidoId, RechazoPedidoRequestDTO request) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId);

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
        registrarHistorial(pedido, actorDePedido(comercioActivo), comercioActivo.actorUsuarioId());
        boolean devolucionEnGestion = reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.RECHAZO_COMERCIO);

        String mensaje = "Tu pedido #" + pedido.getId() + " a " + pedido.getComercio().getNombre()
                + " fue rechazado por el comercio. Motivo: " + request.getMotivo().getEtiqueta() + "."
                + (devolucionEnGestion ? " Estamos gestionando la devolución de tu pago." : "");
        if (request.getComentario() != null && !request.getComentario().isBlank()) {
            mensaje += " " + request.getComentario();
        }

        notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(), mensaje,
                TipoNotificacion.PEDIDO_RECHAZADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO avanzarAEntregaEnCurso(ComercioActivo comercioActivo, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId);

        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION) {
            throw new ConflictoDeNegocioException("El pedido no está en preparación");
        }

        EstadoPedido destino = pedido.getTipoEntrega() == TipoEntrega.DOMICILIO
                ? EstadoPedido.EN_CAMINO
                : EstadoPedido.LISTO_PARA_RETIRAR;
        pedido.setEstado(destino);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, actorDePedido(comercioActivo), comercioActivo.actorUsuarioId());

        TipoNotificacion tipo = destino == EstadoPedido.EN_CAMINO
                ? TipoNotificacion.PEDIDO_EN_CAMINO
                : TipoNotificacion.PEDIDO_LISTO_RETIRO;
        String mensaje = destino == EstadoPedido.EN_CAMINO
                ? "Tu pedido de " + pedido.getComercio().getNombre() + " fue despachado y está en camino."
                : "Tu pedido de " + pedido.getComercio().getNombre() + " está listo para retirar en el local.";

        notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(), mensaje,
                tipo, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO confirmarEntregaCliente(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelClienteParaActualizar(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.EN_CAMINO) {
            throw new ConflictoDeNegocioException("El pedido no está en camino");
        }

        marcarEntregado(pedido, FuenteEntrega.CLIENTE);
        registrarHistorial(pedido, ActorPedido.CLIENTE, usuarioId);

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO confirmarEntregaComercio(ComercioActivo comercioActivo, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId);

        if (pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR) {
            throw new ConflictoDeNegocioException("El pedido no está listo para retirar");
        }

        marcarEntregado(pedido, FuenteEntrega.COMERCIO);
        registrarHistorial(pedido, actorDePedido(comercioActivo), comercioActivo.actorUsuarioId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO cancelarPedido(Integer usuarioId, Integer pedidoId) {
        obtenerPedidoDelCliente(usuarioId, pedidoId);
        PedidoBloqueado bloqueado = bloquearParaActualizarConEquipo(pedidoId, usuarioId);
        Pedido pedido = bloqueado.pedido();

        if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO && pedido.getEstado() != EstadoPedido.EN_PREPARACION) {
            throw new ConflictoDeNegocioException("El pedido ya no se puede cancelar");
        }

        pedido.setEstado(EstadoPedido.CANCELADO);
        pedido.setCanceladoPor(CanceladoPor.CLIENTE);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.CLIENTE, usuarioId);
        reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.CANCELACION_CLIENTE);

        notificacionService.crearParaEquipo(pedido.getComercio().getId(), pedido.getComercio().getDueno().getId(), bloqueado.equipo(),
                "El cliente canceló el pedido #" + pedido.getId() + ".",
                TipoNotificacion.PEDIDO_CANCELADO_CLIENTE, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO anularPedido(ComercioActivo comercioActivo, Integer pedidoId, AnulacionPedidoRequestDTO request) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId);

        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION) {
            throw new ConflictoDeNegocioException("El pedido no está en preparación");
        }

        if (request.getMotivo() == MotivoRechazo.OTRO
                && (request.getComentario() == null || request.getComentario().isBlank())) {
            throw new ValidacionException("Ingresá un comentario para especificar el motivo de la anulación.");
        }
        String comentario = request.getComentario() == null || request.getComentario().isBlank() ? null : request.getComentario().trim();
        String motivoTexto = request.getMotivo().getEtiqueta() + (comentario == null ? "" : ". " + comentario);

        pedido.setEstado(EstadoPedido.ANULADO);
        pedido.setCanceladoPor(CanceladoPor.COMERCIO);
        pedido.setMotivoRechazo(request.getMotivo());
        pedido.setComentarioRechazo(comentario);
        pedido.setMotivo(motivoTexto);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, actorDePedido(comercioActivo), comercioActivo.actorUsuarioId());
        boolean devolucionEnGestion = reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.ANULACION_COMERCIO);

        String mensaje = "Tu pedido #" + pedido.getId() + " a " + pedido.getComercio().getNombre()
                + " fue anulado por el comercio"
                + (devolucionEnGestion ? " y estamos gestionando la devolución de tu pago" : "")
                + ". Motivo: " + motivoTexto;
        notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(), mensaje,
                TipoNotificacion.PEDIDO_ANULADO_COMERCIO, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTO(pedido);
    }

    public List<PedidoResponseDTO> listarPedidosCliente(Integer usuarioId) {
        List<Pedido> pedidos = pedidoRepository.findByClienteId(usuarioId);
        Map<Integer, LocalDateTime> fechasPago = fechasPagoAprobado(pedidos);
        Map<Integer, NotaCredito> notas = ultimasNotasCredito(pedidos);
        return pedidos.stream()
                .map(pedido -> aResponseDTO(pedido, fechasPago.get(pedido.getId()), notas.get(pedido.getId())))
                .toList();
    }

    /**
     * Excluye {@code PENDIENTE_PAGO} — el Comercio no debería ver un pedido antes de que el
     * pago esté confirmado (T1 dispara recién en {@link #confirmarPagoAprobado}); hasta
     * entonces solo el Cliente tiene visibilidad y única acción posible sobre ese pedido.
     */
    public List<PedidoResponseDTO> listarPedidosComercio(Integer comercioId) {
        List<Pedido> pedidos = pedidoRepository.findLlegadosPagadosByComercioId(comercioId);
        Map<Integer, LocalDateTime> fechasPago = fechasPagoAprobado(pedidos);
        Map<Integer, NotaCredito> notas = ultimasNotasCredito(pedidos);
        return pedidos.stream()
                .map(pedido -> aResponseDTO(pedido, fechasPago.get(pedido.getId()), notas.get(pedido.getId())))
                .toList();
    }

    public List<PedidoEmpleadoResponseDTO> listarPedidosComercioEmpleado(Integer comercioId, Integer empleadoUsuarioId) {
        return listarPedidosComercio(comercioId).stream()
                .map(pedido -> PedidoEmpleadoResponseDTO.desde(pedido, empleadoUsuarioId))
                .toList();
    }

    public ResumenPedidosHoyResponseDTO obtenerResumenHoy(Integer comercioId) {
        List<Pedido> pedidosHoy = pedidosLlegadosPagadosHoy(comercioId);
        BigDecimal totalFacturadoHoy = pedidosHoy.stream()
                .filter(pedido -> ESTADOS_FACTURADOS.contains(pedido.getEstado()))
                .map(pedido -> pedido.getSubtotal().subtract(pedido.getCargoServicioComercio()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ResumenPedidosHoyResponseDTO(totalFacturadoHoy, pedidosHoy.size(), contarPendientes(pedidosHoy));
    }

    public ResumenPedidosHoyEmpleadoResponseDTO obtenerResumenHoyEmpleado(Integer comercioId) {
        List<Pedido> pedidosHoy = pedidosLlegadosPagadosHoy(comercioId);
        BigDecimal totalFacturadoHoy = pedidosHoy.stream()
                .filter(pedido -> ESTADOS_FACTURADOS.contains(pedido.getEstado()))
                .map(Pedido::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ResumenPedidosHoyEmpleadoResponseDTO(totalFacturadoHoy, pedidosHoy.size(), contarPendientes(pedidosHoy));
    }

    private List<Pedido> pedidosLlegadosPagadosHoy(Integer comercioId) {
        LocalDateTime inicioHoy = LocalDate.now(clock).atStartOfDay();
        LocalDateTime finHoy = inicioHoy.plusDays(1);
        List<Pedido> llegadosPagados = pedidoRepository.findLlegadosPagadosByComercioId(comercioId);
        Map<Integer, LocalDateTime> fechasPago = fechasPagoAprobado(llegadosPagados);
        return llegadosPagados.stream()
                .filter(pedido -> {
                    LocalDateTime fecha = fechasPago.get(pedido.getId());
                    return fecha != null && !fecha.isBefore(inicioHoy) && fecha.isBefore(finHoy);
                })
                .toList();
    }

    private int contarPendientes(List<Pedido> pedidosHoy) {
        return (int) pedidosHoy.stream()
                .filter(pedido -> pedido.getEstado() == EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)
                .count();
    }

    /**
     * Lógica reactiva del lado de Pedido cuando un Comercio se suspende (invocada por
     * {@code AdministradorService.suspenderComercio}). Los pedidos en curso ({@code PENDIENTE_CONFIRMACION_COMERCIO}/
     * {@code EN_PREPARACION}) se cancelan de inmediato; los {@code LISTO_PARA_RETIRAR} no se
     * tocan todavía — solo se les marca el vencimiento del timer de retiro, que resuelve
     * {@link #autoconfirmarRetirosPorSuspension}. Cada pedido se toma con {@link #bloquearParaActualizar} (en id
     * ascendente) y se vuelve a validar su estado: uno que el comercio, el Cliente o un proceso acaba de resolver
     * se salta sin escribir nada.
     */
    public void cancelarPedidosPorSuspensionComercio(Integer comercioId) {
        List<Integer> activos = pedidoRepository.findIdsByComercioIdAndEstadoIn(comercioId,
                List.of(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO, EstadoPedido.EN_PREPARACION));
        for (Integer pedidoId : activos) {
            Pedido pedido = bloquearParaActualizar(pedidoId);
            if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO && pedido.getEstado() != EstadoPedido.EN_PREPARACION) {
                continue;
            }
            pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);
            pedido.setCanceladoPor(CanceladoPor.SISTEMA);
            pedidoRepository.save(pedido);
            registrarHistorial(pedido, ActorPedido.SISTEMA, null);
            if (pedido.getPagoEstado() == EstadoPagoPedido.PAGADO) {
                reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.SUSPENSION_COMERCIO);
            }
            notificarCancelacionSistema(pedido, "el comercio fue suspendido");
        }

        List<Integer> listosParaRetirar = pedidoRepository.findIdsByComercioIdAndEstadoIn(comercioId,
                List.of(EstadoPedido.LISTO_PARA_RETIRAR));
        for (Integer pedidoId : listosParaRetirar) {
            Pedido pedido = bloquearParaActualizar(pedidoId);
            if (pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR) {
                continue;
            }
            pedido.setSuspensionRetiroExpira(LocalDateTime.now(clock).plusMinutes(timeoutProperties.getRetiroSuspensionMinutos()));
            pedidoRepository.save(pedido);
        }
    }

    /**
     * Los 4 procesos automáticos eligen sin bloqueo los ids candidatos y resuelven cada pedido en su propia
     * transacción corta ({@link #enTransaccionPorPedido}): bloquean el pedido, vuelven a validar el estado y la
     * condición de tiempo con el pedido ya bloqueado y recién entonces escriben. Un pedido que otra transacción
     * (el comercio, el Cliente, el webhook de pago) resolvió entre la lectura de los ids y el bloqueo se salta; el
     * aviso y el reembolso salen solo de la transición que ganó. La hora de la decisión se lee con el
     * {@link Supplier} después del bloqueo; las pruebas pasan una hora fija. Un pedido que falla no frena a los
     * demás. {@code SUPPORTS}: no abren una transacción propia (la abre cada pedido).
     */
    @Transactional(propagation = Propagation.SUPPORTS)
    public void expirarPagosVencidos() {
        expirarPagosVencidos(() -> LocalDateTime.now(clock));
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void expirarPagosVencidos(LocalDateTime ahora) {
        expirarPagosVencidos(() -> ahora);
    }

    /** Job 1: expiración de pago — {@code PENDIENTE_PAGO} sin confirmar tras el umbral configurado. */
    private void expirarPagosVencidos(Supplier<LocalDateTime> reloj) {
        LocalDateTime corteInicial = reloj.get().minusMinutes(timeoutProperties.getPagoMinutos());
        for (Integer pedidoId : pedidoRepository.findIdsByEstadoAndFechaCreacionBefore(EstadoPedido.PENDIENTE_PAGO, corteInicial)) {
            enTransaccionPorPedido("expirarPagosVencidos", pedidoId, () -> {
                Pedido pedido = bloquearParaActualizar(pedidoId);
                LocalDateTime corte = reloj.get().minusMinutes(timeoutProperties.getPagoMinutos());
                if (pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO || !pedido.getFechaCreacion().isBefore(corte)) {
                    return;
                }
                pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);
                pedido.setCanceladoPor(CanceladoPor.SISTEMA);
                pedido.setMotivo(pedido.getPagoEstado() == EstadoPagoPedido.RECHAZADO ? "Pago rechazado" : "Pago no confirmado");
                pedidoRepository.save(pedido);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_PAGO);
                notificarCancelacionSistema(pedido, "no se confirmó el pago a tiempo");
            });
        }
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void avisar75MinYAutoconfirmar() {
        avisar75MinYAutoconfirmar(() -> LocalDateTime.now(clock));
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void avisar75MinYAutoconfirmar(LocalDateTime ahora) {
        avisar75MinYAutoconfirmar(() -> ahora);
    }

    /**
     * Job 2: sobre pedidos {@code EN_CAMINO} — a los {@code avisoEnCaminoMinutos} dispara el
     * aviso preventivo (T7, idempotente vía {@code primerAvisoEmitido}); a los
     * {@code autoconfirmacionEnCaminoMinutos}, si nadie confirmó, autoconfirma {@code ENTREGADO}
     * (T8). Mismo cron para las dos cosas — confirmado con Diego.
     */
    private void avisar75MinYAutoconfirmar(Supplier<LocalDateTime> reloj) {
        for (Integer pedidoId : pedidoRepository.findIdsByEstado(EstadoPedido.EN_CAMINO)) {
            enTransaccionPorPedido("avisar75MinYAutoconfirmar", pedidoId, () -> {
                Pedido pedido = bloquearParaActualizar(pedidoId);
                if (pedido.getEstado() != EstadoPedido.EN_CAMINO) {
                    return;
                }
                LocalDateTime entradaEnCamino = obtenerFechaEntradaAEstado(pedido, EstadoPedido.EN_CAMINO);
                if (entradaEnCamino == null) {
                    return;
                }
                long minutosTranscurridos = Duration.between(entradaEnCamino, reloj.get()).toMinutes();

                if (minutosTranscurridos >= timeoutProperties.getAutoconfirmacionEnCaminoMinutos()) {
                    marcarEntregado(pedido, FuenteEntrega.SISTEMA);
                    registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_ENTREGA);
                    notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                            "Tu pedido #" + pedido.getId()
                                    + " fue autoconfirmado como entregado. Si no lo recibiste, podés iniciar un reclamo o contactar al comercio.",
                            TipoNotificacion.PEDIDO_AUTOCONFIRMADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
                } else if (!pedido.isPrimerAvisoEmitido() && minutosTranscurridos >= timeoutProperties.getAvisoEnCaminoMinutos()) {
                    pedido.setPrimerAvisoEmitido(true);
                    pedidoRepository.save(pedido);
                    notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                            "Tu pedido #" + pedido.getId() + " está en camino hace un buen rato. Confirmá la recepción cuando llegue.",
                            TipoNotificacion.AVISO_75MIN_SIN_CONFIRMACION, TipoEntidadNotificacion.PEDIDO, pedido.getId());
                }
            });
        }
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void expirarPedidosSinRespuestaComercio() {
        expirarPedidosSinRespuestaComercio(() -> LocalDateTime.now(clock));
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void expirarPedidosSinRespuestaComercio(LocalDateTime ahora) {
        expirarPedidosSinRespuestaComercio(() -> ahora);
    }

    /** Job 3: {@code PENDIENTE_CONFIRMACION_COMERCIO} sin respuesta del comercio tras el umbral configurado -> {@code EXPIRADO}. */
    private void expirarPedidosSinRespuestaComercio(Supplier<LocalDateTime> reloj) {
        for (Integer pedidoId : pedidoRepository.findIdsByEstado(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)) {
            enTransaccionPorPedido("expirarPedidosSinRespuestaComercio", pedidoId, () -> {
                PedidoBloqueado bloqueado = bloquearParaActualizarConEquipo(pedidoId, null);
                Pedido pedido = bloqueado.pedido();
                if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO) {
                    return;
                }
                LocalDateTime entradaPendiente = obtenerFechaEntradaAEstado(pedido, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
                if (entradaPendiente == null
                        || Duration.between(entradaPendiente, reloj.get()).toMinutes() < timeoutProperties.getRespuestaComercioMinutos()) {
                    return;
                }

                pedido.setEstado(EstadoPedido.EXPIRADO);
                pedido.setCanceladoPor(CanceladoPor.SISTEMA);
                pedidoRepository.save(pedido);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_RESPUESTA_COMERCIO);
                reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.EXPIRACION_SIN_RESPUESTA);

                notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                        "El comercio no respondió en " + timeoutProperties.getRespuestaComercioMinutos() + " minutos tu pedido #" + pedido.getId()
                                + ". Se canceló y estamos gestionando la devolución de tu pago; podés ver su estado en el detalle del pedido.",
                        TipoNotificacion.PEDIDO_EXPIRADO_CLIENTE, TipoEntidadNotificacion.PEDIDO, pedido.getId());
                notificacionService.crearParaEquipo(pedido.getComercio().getId(), pedido.getComercio().getDueno().getId(), bloqueado.equipo(),
                        "El pedido #" + pedido.getId() + " expiró por falta de respuesta.",
                        TipoNotificacion.PEDIDO_EXPIRADO_COMERCIO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
            });
        }
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void autoconfirmarRetirosPorSuspension() {
        autoconfirmarRetirosPorSuspension(() -> LocalDateTime.now(clock));
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void autoconfirmarRetirosPorSuspension(LocalDateTime ahora) {
        autoconfirmarRetirosPorSuspension(() -> ahora);
    }

    /**
     * Job 4: {@code LISTO_PARA_RETIRAR} cuyo timer de suspensión venció -> autoconfirma
     * {@code ENTREGADO}, sin reembolso (ver diccionario: {@code fuente_entrega = SISTEMA}).
     */
    private void autoconfirmarRetirosPorSuspension(Supplier<LocalDateTime> reloj) {
        for (Integer pedidoId : pedidoRepository.findIdsByEstadoAndSuspensionRetiroExpiraLessThan(
                EstadoPedido.LISTO_PARA_RETIRAR, reloj.get())) {
            enTransaccionPorPedido("autoconfirmarRetirosPorSuspension", pedidoId, () -> {
                Pedido pedido = bloquearParaActualizar(pedidoId);
                if (pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR || pedido.getSuspensionRetiroExpira() == null
                        || !pedido.getSuspensionRetiroExpira().isBefore(reloj.get())) {
                    return;
                }
                marcarEntregado(pedido, FuenteEntrega.SISTEMA);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_RETIRO_SUSPENSION);

                notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                        "Tu pedido #" + pedido.getId() + " se cerró automáticamente: el comercio está suspendido y venció el plazo de retiro.",
                        TipoNotificacion.PEDIDO_CERRADO_TIMER_SUSPENSION, TipoEntidadNotificacion.PEDIDO, pedido.getId());
            });
        }
    }

    private void enTransaccionPorPedido(String proceso, Integer pedidoId, Runnable accion) {
        try {
            new TransactionTemplate(transactionManager).executeWithoutResult(status -> accion.run());
        } catch (RuntimeException ex) {
            log.error("El proceso {} falló para el pedidoId={}; sigue con los demás", proceso, pedidoId, ex);
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
        pedido.setFechaEntrega(LocalDateTime.now(clock));
        pedidoRepository.save(pedido);
    }

    private void notificarCancelacionSistema(Pedido pedido, String motivo) {
        notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
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
                .fechaHora(LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS))
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
    Pedido obtenerPedidoDelComercio(Integer comercioId, Integer pedidoId) {
        Pedido pedido = pedidoRepository.findById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        if (!pedido.getComercio().getId().equals(comercioId) || !pedidoRepository.llegoPagado(pedidoId)) {
            throw new RecursoNoEncontradoException("Pedido no encontrado");
        }
        return pedido;
    }

    private Map<Integer, LocalDateTime> fechasPagoAprobado(List<Pedido> pedidos) {
        if (pedidos.isEmpty()) {
            return Map.of();
        }
        List<Integer> ids = pedidos.stream().map(Pedido::getId).toList();
        Map<Integer, LocalDateTime> fechas = new HashMap<>();
        for (Object[] fila : historialEstadoPedidoRepository.findPrimeraEntradaAEstadoPorPedido(ids, EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)) {
            fechas.put((Integer) fila[0], (LocalDateTime) fila[1]);
        }
        return fechas;
    }

    private Map<Integer, NotaCredito> ultimasNotasCredito(List<Pedido> pedidos) {
        Map<Integer, NotaCredito> ultimas = new HashMap<>();
        for (NotaCredito nota : notaCreditoService.listarPorPedidos(pedidos.stream().map(Pedido::getId).toList())) {
            ultimas.merge(nota.getPago().getPedido().getId(), nota,
                    (actual, nueva) -> nueva.getId() > actual.getId() ? nueva : actual);
        }
        return ultimas;
    }

    private PedidoResponseDTO aResponseDTO(Pedido pedido) {
        return aResponseDTO(pedido, fechasPagoAprobado(List.of(pedido)).get(pedido.getId()),
                ultimasNotasCredito(List.of(pedido)).get(pedido.getId()));
    }

    private PedidoResponseDTO aResponseDTO(Pedido pedido, LocalDateTime fechaPagoAprobado, NotaCredito notaCredito) {
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
                fechaPagoAprobado,
                pedido.getFechaEntrega(),
                detalles,
                pedido.getSubtotal(),
                pedido.getCargoServicioCliente(),
                pedido.getCargoServicioComercio(),
                pedido.getTotal(),
                notaCredito == null ? null : notaCredito.getEstado(),
                notaCredito == null ? null : notaCredito.getMonto());
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
