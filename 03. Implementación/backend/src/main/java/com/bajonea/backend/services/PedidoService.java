package com.bajonea.backend.services;

import com.bajonea.backend.config.PedidoTimeoutProperties;
import com.bajonea.backend.config.security.ComercioActivo;
import com.bajonea.backend.dto.request.AnulacionPedidoRequestDTO;
import com.bajonea.backend.dto.request.PedidoRequestDTO;
import com.bajonea.backend.dto.request.RechazoPedidoRequestDTO;
import com.bajonea.backend.dto.response.DetallePedidoResponseDTO;
import com.bajonea.backend.dto.response.DireccionEntregaResponseDTO;
import com.bajonea.backend.dto.response.ItemCarritoResponseDTO;
import com.bajonea.backend.dto.response.PedidoEmpleadoResponseDTO;
import com.bajonea.backend.dto.response.PedidoResponseDTO;
import com.bajonea.backend.entities.Carrito;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.ConfiguracionTarifa;
import com.bajonea.backend.entities.DetallePedido;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.HistorialEstadoPedido;
import com.bajonea.backend.entities.ItemCarrito;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.NotaCredito;
import com.bajonea.backend.entities.Pedido;
import com.bajonea.backend.enums.ActorPedido;
import com.bajonea.backend.enums.CanceladoPor;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoDetallePedido;
import com.bajonea.backend.enums.EstadoEmpleadoComercio;
import com.bajonea.backend.enums.EstadoPagoPedido;
import com.bajonea.backend.enums.EstadoPedido;
import com.bajonea.backend.enums.EstadoUsuario;
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
import com.bajonea.backend.exceptions.CuentaSuspendidaException;
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
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
    private final TurnoPedidoService turnoPedidoService;
    private final EstadoUsuarioService estadoUsuarioService;
    private final Clock clock;

    private static final Logger log = LoggerFactory.getLogger(PedidoService.class);

    @PersistenceContext
    private EntityManager entityManager;

    private static final BigDecimal SUBTOTAL_MAXIMO = new BigDecimal("99999999");
    private static final DateTimeFormatter HORA_MINUTO = DateTimeFormatter.ofPattern("HH:mm");
    private static final String MENSAJE_AUTOCONFIRMADO_COMERCIO = "El pedido #%d se confirmó automáticamente como entregado "
            + "porque el cliente no respondió en %d minutos.";
    private static final String MENSAJE_NO_RETIRADO = "Tu pedido #%d no fue retirado y el comercio lo cerró. "
            + "Como ya estaba preparado, no hay devolución del pago.";
    static final String MENSAJE_PEDIDO_RESUELTO = "El pedido ya fue resuelto";
    static final String MENSAJE_PRIMERO_ACEPTAR = "Primero tenés que aceptar el pedido";
    static final String MENSAJE_NO_SE_ANULA_SIN_ACEPTAR = "Un pedido sin aceptar no se anula, se rechaza";
    static final String MENSAJE_NO_SE_PUEDE_ANULAR = "El pedido ya no se puede anular";
    static final String MENSAJE_EN_PREPARACION = "El pedido todavía está en preparación";
    static final String MENSAJE_EN_CAMINO_LO_CONFIRMA_EL_CLIENTE = "El pedido está en camino: lo confirma el cliente";
    static final String MENSAJE_CLIENTE_TODAVIA_NO_EN_CAMINO = "Tu pedido todavía no está en camino";
    static final String MENSAJE_YA_ENTREGADO = "Este pedido ya figura como entregado";

    public PedidoResponseDTO confirmarPedido(Integer usuarioId, PedidoRequestDTO request) {
        estadoUsuarioService.exigirNoSuspendido(usuarioId);
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
        DireccionRepository.DireccionParaEntrega entrega = null;
        if (request.getTipoEntrega() == TipoEntrega.DOMICILIO) {
            if (request.getDireccionId() == null) {
                throw new ConflictoDeNegocioException("La dirección es obligatoria para entrega a domicilio");
            }
            entrega = direccionRepository.leerParaEntregaConBloqueoCompartido(request.getDireccionId())
                    .orElseThrow(() -> new RecursoNoEncontradoException("Dirección no encontrada"));
            if (entrega.getClienteId() == null || !entrega.getClienteId().equals(usuarioId) || Boolean.TRUE.equals(entrega.getEliminada())) {
                throw new RecursoNoEncontradoException("Dirección no encontrada");
            }
            direccion = direccionRepository.getReferenceById(entrega.getId());
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

        BigDecimal totalPedido = subtotalPedido.add(cargoServicioCliente);
        if (request.getTotalEsperado() != null && request.getTotalEsperado().compareTo(totalPedido) != 0) {
            Map<String, Object> montosNuevos = new LinkedHashMap<>();
            montosNuevos.put("subtotal", subtotalPedido);
            montosNuevos.put("cargoServicioCliente", cargoServicioCliente);
            montosNuevos.put("total", totalPedido);
            montosNuevos.put("items", items.stream().map(ItemCarritoResponseDTO::de).toList());
            throw new ConflictoComercioException(ConflictoComercioException.PRECIO_CAMBIO,
                    ConflictoComercioException.MENSAJE_PRECIO_CAMBIO, montosNuevos);
        }

        Pedido pedido = Pedido.builder()
                .cliente(cliente)
                .comercio(comercio)
                .direccion(direccion)
                .entregaCalle(entrega == null ? null : entrega.getCalle())
                .entregaNumero(entrega == null ? null : entrega.getNumero())
                .entregaPisoDepto(entrega == null ? null : entrega.getPisoDepto())
                .entregaCodigoPostal(entrega == null ? null : entrega.getCodigoPostal())
                .entregaLocalidadId(entrega == null ? null : entrega.getLocalidadId())
                .entregaLocalidad(entrega == null ? null : entityManager.getReference(Localidad.class, entrega.getLocalidadId()))
                .entregaReferencia(entrega == null ? null : entrega.getReferencia())
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
        confirmarPagoAprobado(pedidoId, null);
    }

    /**
     * Igual que {@link #confirmarPagoAprobado(Integer)} con un instante de pago elegido: solo lo usan los atajos de
     * test para probar turnos que no coinciden con la hora real. Con {@code null} toma la hora del reloj de la
     * aplicación después del bloqueo del pedido. Esa única hora es la del historial, la de
     * {@code fecha_pago_confirmado} y la que decide el turno del pedido.
     */
    public void confirmarPagoAprobado(Integer pedidoId, LocalDateTime instanteDelPago) {
        PedidoBloqueado bloqueado = bloquearParaPago(pedidoId);
        if (bloqueado.pedido().getEstado() != EstadoPedido.PENDIENTE_PAGO) {
            return;
        }
        confirmarOCancelarPagoAprobado(bloqueado, instanteDelPago);
    }

    /**
     * Resuelve un pago aprobado sobre un pedido que sigue en {@code PENDIENTE_PAGO}, con el pedido ya bloqueado por
     * {@link #bloquearParaPago}: lo confirma, salvo que el Cliente haya sido suspendido antes de que el pago llegara,
     * en cuyo caso el pedido se cancela y el pago se devuelve entero en el acto (la suspensión no tiene que dejar un
     * pedido nuevo para el comercio ni plata retenida).
     */
    void confirmarOCancelarPagoAprobado(PedidoBloqueado bloqueado, LocalDateTime instanteDelPago) {
        Pedido pedido = bloqueado.pedido();
        if (bloqueado.estadoCliente() == EstadoUsuario.SUSPENDIDO) {
            cancelarPagoAprobadoPorSuspension(pedido, MotivoTimeoutPedido.SUSPENSION_CLIENTE, MotivoNotaCredito.SUSPENSION_CLIENTE,
                    "tu cuenta fue suspendida");
            return;
        }
        if (bloqueado.estadoComercio() == EstadoComercio.SUSPENDIDO) {
            cancelarPagoAprobadoPorSuspension(pedido, null, MotivoNotaCredito.SUSPENSION_COMERCIO, "el comercio fue suspendido");
            return;
        }

        Integer clienteId = pedido.getCliente().getId();
        Integer comercioId = pedido.getComercio().getId();
        LocalDateTime instante = (instanteDelPago != null ? instanteDelPago : LocalDateTime.now(clock))
                .truncatedTo(ChronoUnit.SECONDS);

        pedido.setPagoEstado(EstadoPagoPedido.PAGADO);
        pedido.setEstado(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO);
        pedido.setFechaPagoConfirmado(instante);
        turnoPedidoService.asignar(comercioId, instante).ifPresent(asignacion -> {
            pedido.setTurnoFecha(asignacion.fecha());
            pedido.setTurnoHorarioId(asignacion.horarioId());
        });
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.SISTEMA, null, null, instante);

        notificacionService.crearParaEquipo(comercioId, pedido.getComercio().getDueno().getId(), bloqueado.equipo(),
                "Nuevo pedido recibido de " + pedido.getCliente().getPersonaFisica().getNombre() + " "
                        + pedido.getCliente().getPersonaFisica().getApellido() + ".",
                TipoNotificacion.NUEVO_PEDIDO, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        // El carrito es la última hoja del orden de bloqueos: va después de todo lo demás de esta transacción.
        carritoService.vaciarSiEsDelComercio(clienteId, comercioId);
    }

    private void cancelarPagoAprobadoPorSuspension(Pedido pedido, MotivoTimeoutPedido motivoTimeout, MotivoNotaCredito motivoNota,
            String causa) {
        pedido.setPagoEstado(EstadoPagoPedido.PAGADO);
        pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);
        pedido.setCanceladoPor(CanceladoPor.SISTEMA);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, ActorPedido.SISTEMA, null, motivoTimeout);
        boolean devolucionEnGestion = reembolsoService.generarNotaYReembolsarTotal(pedido, motivoNota);
        notificarCancelacionSistema(pedido, devolucionEnGestion
                ? causa + " y estamos gestionando la devolución de tu pago"
                : causa);
    }

    /**
     * Un pago aprobado que llega sobre un pedido que ya no está esperando el pago (vencido, cancelado por la suspensión
     * del Cliente o por cualquier otra causa) nunca deja la plata retenida: se crea la nota de crédito por el total en
     * esta misma transacción, con el pedido ya bloqueado, y la devolución a Mercado Pago sale después del commit. Es
     * idempotente: si el pago ya tiene reembolso por el monto completo no se duplica. El motivo es
     * {@code SUSPENSION_CLIENTE} si el Cliente está suspendido, {@code SUSPENSION_COMERCIO} si lo está el comercio y
     * {@code PAGO_TARDIO} en cualquier otro caso (por ejemplo, un pedido vencido).
     */
    void reembolsarPagoTardio(PedidoBloqueado bloqueado) {
        MotivoNotaCredito motivo;
        if (bloqueado.estadoCliente() == EstadoUsuario.SUSPENDIDO) {
            motivo = MotivoNotaCredito.SUSPENSION_CLIENTE;
        } else if (bloqueado.estadoComercio() == EstadoComercio.SUSPENDIDO) {
            motivo = MotivoNotaCredito.SUSPENSION_COMERCIO;
        } else {
            motivo = MotivoNotaCredito.PAGO_TARDIO;
        }
        reembolsoService.generarNotaYReembolsarTotal(bloqueado.pedido(), motivo);
    }

    /**
     * Cancela, uno por transacción, los pedidos del Cliente que todavía no se pagaron cuando el Administrador lo
     * suspende. Se ejecuta después del commit de la suspensión (nunca dentro de ella: cada pedido toma las filas de
     * los usuarios con bloqueo compartido y esperaría a la transacción de la suspensión, que sostiene la fila del
     * Cliente de forma exclusiva). Un pedido que otra transacción resolvió entre la lectura de los ids y el bloqueo se
     * salta. No hay pago aprobado que devolver; si MercadoPago confirma un pago después, el webhook lo devuelve
     * ({@link #reembolsarPagoTardio}). Devuelve cuántos canceló.
     */
    @Transactional(propagation = Propagation.SUPPORTS)
    public int cancelarPedidosSinPagarPorSuspensionCliente(Integer clienteId) {
        int[] cancelados = {0};
        for (Integer pedidoId : pedidoRepository.findIdsByClienteIdAndEstado(clienteId, EstadoPedido.PENDIENTE_PAGO)) {
            enTransaccionPorPedido("cancelarPedidosSinPagarPorSuspensionCliente", pedidoId, () -> {
                Pedido pedido = bloquearParaActualizar(pedidoId);
                if (pedido.getEstado() != EstadoPedido.PENDIENTE_PAGO) {
                    return;
                }
                pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);
                pedido.setCanceladoPor(CanceladoPor.SISTEMA);
                pedido.setMotivo("Cuenta suspendida");
                pedidoRepository.save(pedido);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.SUSPENSION_CLIENTE);
                cancelados[0]++;
            });
        }
        return cancelados[0];
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
        return bloquear(pedidoId, actorUsuarioId, comercioActivo, aceptaPedidoNuevo, false, false).pedido();
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
        return bloquear(pedidoId, actorUsuarioId, null, false, true, false);
    }

    /**
     * Bloqueo para aplicar un pago aprobado (webhook, sincronización y atajos de test). Igual que
     * {@link #bloquearParaActualizarConEquipo} pero además lee el estado del Cliente (en la misma lectura de su
     * usuario) y el estado del comercio con {@code LOCK IN SHARE MODE} <b>antes</b> de bloquear el pedido, respetando
     * el orden global (usuario, relaciones, comercio, pedido): quien decide qué hacer con un pago que llega mientras
     * el Cliente o el comercio se suspende lee los estados confirmados, sin tomar el comercio después del pedido
     * (invertiría el orden y se interbloquea con la desvinculación de Mercado Pago, que toma el comercio y después
     * los pedidos sin pagar).
     */
    PedidoBloqueado bloquearParaPago(Integer pedidoId) {
        return bloquear(pedidoId, null, null, false, true, true);
    }

    /**
     * Bloqueo de los procesos que aplican los topes de la suspensión del comercio: igual que {@link #bloquearParaPago}
     * pero sin el equipo (el aviso va solo al Cliente). Lee el estado del comercio y su {@code suspendido_desde} con
     * bloqueo compartido antes del pedido, así el proceso decide sobre lo último confirmado y no se cruza con quien
     * levanta la suspensión (que toma el comercio {@code FOR UPDATE}).
     */
    PedidoBloqueado bloquearParaTopeDeSuspension(Integer pedidoId) {
        return bloquear(pedidoId, null, null, false, false, true);
    }

    /**
     * {@code estadoCliente}, {@code estadoComercio} y {@code suspendidoDesde} (la fecha de la suspensión, solo con el
     * comercio {@code SUSPENDIDO}) solo vienen completos desde {@link #bloquearParaPago} y
     * {@link #bloquearParaTopeDeSuspension}; en los demás caminos son {@code null}.
     */
    record PedidoBloqueado(Pedido pedido, List<Integer> equipo, EstadoUsuario estadoCliente, EstadoComercio estadoComercio,
            LocalDateTime suspendidoDesde, EstadoUsuario estadoDueno, List<Integer> empleadosActivos) {

        PedidoBloqueado(Pedido pedido, List<Integer> equipo) {
            this(pedido, equipo, null, null, null, null, List.of());
        }
    }

    /**
     * Para decidir si un pedido de un comercio suspendido quedó sin atención: bloquea con el equipo (los usuarios del
     * Cliente, el Dueño y los Empleados candidatos, sus relaciones), lee el estado del comercio y bloquea el pedido.
     * {@code estadoDueno} y {@code empleadosActivos} (relación activa y cuenta {@code ACTIVO}, sin el Cliente del
     * pedido, que no puede gestionar el suyo) vienen completos solo desde acá.
     */
    PedidoBloqueado bloquearParaSinAtencion(Integer pedidoId) {
        return bloquear(pedidoId, null, null, false, true, true);
    }

    private PedidoBloqueado bloquear(Integer pedidoId, Integer actorUsuarioId, ComercioActivo comercioActivo,
            boolean aceptaPedidoNuevo, boolean conEquipo, boolean leerEstados) {
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
        Map<Integer, EstadoUsuario> estadosUsuarios = new HashMap<>();
        for (Integer usuarioId : usuarios) {
            usuarioRepository.leerEstadoCuentaConBloqueoCompartido(usuarioId)
                    .ifPresent(cuenta -> estadosUsuarios.put(usuarioId, EstadoUsuario.valueOf(cuenta.getEstado())));
        }
        if (actorUsuarioId != null && estadosUsuarios.get(actorUsuarioId) == EstadoUsuario.SUSPENDIDO) {
            throw new CuentaSuspendidaException(usuarioRepository.leerEstadoCuentaConBloqueoCompartido(actorUsuarioId)
                    .map(UsuarioRepository.EstadoCuenta::getMotivoSuspension).orElse(null));
        }
        if (comercioActivo != null) {
            if (comercioActivo.esEmpleado()) {
                comercioActivoService.exigirRelacionActiva(comercioActivo);
            }
            if (aceptaPedidoNuevo) {
                EstadoComercio estadoComercio = comercioRepository.leerEstadoConBloqueoCompartido(comercioActivo.comercioId())
                        .map(lectura -> EstadoComercio.valueOf(lectura.getEstado()))
                        .orElseThrow(ComercioNoDisponibleException::new);
                ComercioActivoService.validarComercioAceptaPedidosNuevos(comercioActivo, estadoComercio);
            }
        }
        List<Integer> equipo = new ArrayList<>();
        List<Integer> empleadosActivos = new ArrayList<>();
        if (!candidatos.isEmpty()) {
            List<Integer> relacionesIds = candidatos.stream().map(RelacionDeEmpleado::getId).toList();
            for (EstadoDeRelacion relacion : empleadoComercioRepository.leerRelacionesConBloqueoCompartido(relacionesIds)) {
                boolean activa = EstadoEmpleadoComercio.valueOf(relacion.getEstado()) == EstadoEmpleadoComercio.ACTIVO;
                EstadoUsuario estadoEmpleado = estadosUsuarios.get(relacion.getEmpleadoId());
                if (activa && estadoEmpleado != EstadoUsuario.SUSPENDIDO) {
                    equipo.add(relacion.getEmpleadoId());
                }
                if (activa && estadoEmpleado == EstadoUsuario.ACTIVO) {
                    empleadosActivos.add(relacion.getEmpleadoId());
                }
            }
        }
        EstadoComercio estadoComercio = null;
        LocalDateTime suspendidoDesde = null;
        if (leerEstados) {
            ComercioRepository.EstadoYCierreComercio lectura = comercioRepository
                    .leerEstadoConBloqueoCompartido(participantes.getComercioId()).orElse(null);
            if (lectura != null) {
                estadoComercio = EstadoComercio.valueOf(lectura.getEstado());
                suspendidoDesde = lectura.getSuspendidoDesde();
            }
        }
        Pedido pedido = pedidoRepository.findById(pedidoId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Pedido no encontrado"));
        entityManager.refresh(pedido, LockModeType.PESSIMISTIC_WRITE);
        return new PedidoBloqueado(pedido, equipo, estadosUsuarios.get(participantes.getClienteId()), estadoComercio,
                suspendidoDesde, estadosUsuarios.get(participantes.getDuenoId()), empleadosActivos);
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
            throw new ConflictoDeNegocioException(MENSAJE_PEDIDO_RESUELTO);
        }

        pedido.setEstado(EstadoPedido.EN_PREPARACION);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, actorDePedido(comercioActivo), comercioActivo.actorUsuarioId());

        notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                "Tu pedido a " + pedido.getComercio().getNombre() + " fue aceptado y está en preparación.",
                TipoNotificacion.PEDIDO_ACEPTADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());

        return aResponseDTOParaComercio(pedido);
    }

    public PedidoResponseDTO rechazarPedido(ComercioActivo comercioActivo, Integer pedidoId, RechazoPedidoRequestDTO request) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId);

        if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO) {
            throw new ConflictoDeNegocioException(MENSAJE_PEDIDO_RESUELTO);
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

        return aResponseDTOParaComercio(pedido);
    }

    public PedidoResponseDTO avanzarAEntregaEnCurso(ComercioActivo comercioActivo, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId);

        if (pedido.getEstado() != EstadoPedido.EN_PREPARACION) {
            throw new ConflictoDeNegocioException(pedido.getEstado() == EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO
                    ? MENSAJE_PRIMERO_ACEPTAR
                    : MENSAJE_PEDIDO_RESUELTO);
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

        return aResponseDTOParaComercio(pedido);
    }

    public PedidoResponseDTO confirmarEntregaCliente(Integer usuarioId, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelClienteParaActualizar(usuarioId, pedidoId);

        if (pedido.getEstado() != EstadoPedido.EN_CAMINO) {
            throw new ConflictoDeNegocioException(mensajeEntregaDelCliente(pedido.getEstado()));
        }

        marcarEntregado(pedido, FuenteEntrega.CLIENTE);
        registrarHistorial(pedido, ActorPedido.CLIENTE, usuarioId);

        return aResponseDTO(pedido);
    }

    public PedidoResponseDTO confirmarEntregaComercio(ComercioActivo comercioActivo, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId);

        if (pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR) {
            throw new ConflictoDeNegocioException(mensajeCierreDelComercio(pedido.getEstado()));
        }

        marcarEntregado(pedido, FuenteEntrega.COMERCIO);
        registrarHistorial(pedido, actorDePedido(comercioActivo), comercioActivo.actorUsuarioId());

        return aResponseDTOParaComercio(pedido);
    }

    /**
     * Cierra como {@code NO_RETIRADO} un pedido de retiro que el Cliente no pasó a buscar. Mismo camino de bloqueo
     * que {@link #confirmarEntregaComercio} (usuarios, relación del Empleado, pedido {@code FOR UPDATE}, pedido
     * propio), y recién entonces valida estado, modalidad y la espera mínima desde que el pedido quedó
     * {@code LISTO_PARA_RETIRAR}, con la hora calculada después del bloqueo. No mira el estado del comercio, no
     * genera nota de crédito ni reembolso (el comercio se queda el pago porque el pedido ya estaba preparado) y
     * avisa solo al Cliente (T36), en la misma transacción.
     */
    public PedidoResponseDTO cerrarComoNoRetirado(ComercioActivo comercioActivo, Integer pedidoId) {
        Pedido pedido = obtenerPedidoDelComercioParaActualizar(comercioActivo, pedidoId);

        if (pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR) {
            throw new ConflictoDeNegocioException(mensajeCierreDelComercio(pedido.getEstado()));
        }
        if (pedido.getTipoEntrega() != TipoEntrega.RETIRO) {
            throw new ConflictoDeNegocioException("Solo se puede cerrar como no retirado un pedido de retiro");
        }
        exigirEsperaMinimaDeRetiro(pedido, LocalDateTime.now(clock));

        pedido.setEstado(EstadoPedido.NO_RETIRADO);
        pedidoRepository.save(pedido);
        registrarHistorial(pedido, actorDePedido(comercioActivo), comercioActivo.actorUsuarioId());
        avisarPedidoNoRetirado(pedido);

        return aResponseDTOParaComercio(pedido);
    }

    private static String mensajeEntregaDelCliente(EstadoPedido estado) {
        return switch (estado) {
            case PENDIENTE_CONFIRMACION_COMERCIO, EN_PREPARACION -> MENSAJE_CLIENTE_TODAVIA_NO_EN_CAMINO;
            case ENTREGADO -> MENSAJE_YA_ENTREGADO;
            default -> MENSAJE_PEDIDO_RESUELTO;
        };
    }

    private static String mensajeCierreDelComercio(EstadoPedido estado) {
        return switch (estado) {
            case PENDIENTE_CONFIRMACION_COMERCIO -> MENSAJE_PRIMERO_ACEPTAR;
            case EN_PREPARACION -> MENSAJE_EN_PREPARACION;
            case EN_CAMINO -> MENSAJE_EN_CAMINO_LO_CONFIRMA_EL_CLIENTE;
            default -> MENSAJE_PEDIDO_RESUELTO;
        };
    }

    private void exigirEsperaMinimaDeRetiro(Pedido pedido, LocalDateTime ahora) {
        LocalDateTime listoDesde = obtenerFechaEntradaAEstado(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
        if (listoDesde == null) {
            throw new ConflictoDeNegocioException(
                    "No se puede cerrar como no retirado: no se encontró cuándo quedó listo para retirar");
        }
        LocalDateTime disponibleDesde = listoDesde.plusMinutes(timeoutProperties.getNoRetiradoEsperaMinutos());
        if (ahora.isBefore(disponibleDesde)) {
            long minutosRestantes = minutosHasta(ahora, disponibleDesde);
            Map<String, Object> datos = new HashMap<>();
            datos.put("minutosRestantes", minutosRestantes);
            datos.put("disponibleDesde", disponibleDesde.toString());
            throw new ConflictoComercioException(ConflictoComercioException.RETIRO_EN_ESPERA,
                    "Todavía no podés cerrar este pedido como no retirado. Esperá " + minutosRestantes
                            + (minutosRestantes == 1 ? " minuto más" : " minutos más") + " (desde las "
                            + disponibleDesde.format(HORA_MINUTO) + ").",
                    datos);
        }
    }

    private long minutosHasta(LocalDateTime ahora, LocalDateTime disponibleDesde) {
        return (Duration.between(ahora, disponibleDesde).getSeconds() + 59) / 60;
    }

    private EsperaNoRetirado esperaNoRetirado(Pedido pedido, LocalDateTime listoDesde, LocalDateTime ahora) {
        if (pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR || pedido.getTipoEntrega() != TipoEntrega.RETIRO || listoDesde == null) {
            return null;
        }
        LocalDateTime disponibleDesde = listoDesde.plusMinutes(timeoutProperties.getNoRetiradoEsperaMinutos());
        long minutosRestantes = ahora.isBefore(disponibleDesde) ? minutosHasta(ahora, disponibleDesde) : 0;
        return new EsperaNoRetirado(disponibleDesde, minutosRestantes);
    }

    private Map<Integer, LocalDateTime> fechasListoParaRetirar(List<Pedido> pedidos) {
        List<Integer> ids = pedidos.stream()
                .filter(pedido -> pedido.getEstado() == EstadoPedido.LISTO_PARA_RETIRAR)
                .map(Pedido::getId)
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Integer, LocalDateTime> fechas = new HashMap<>();
        for (Object[] fila : historialEstadoPedidoRepository.findUltimaEntradaAEstadoPorPedido(ids, EstadoPedido.LISTO_PARA_RETIRAR)) {
            fechas.put((Integer) fila[0], (LocalDateTime) fila[1]);
        }
        return fechas;
    }

    private record EsperaNoRetirado(LocalDateTime disponibleDesde, long minutosRestantes) {
    }

    private void avisarPedidoNoRetirado(Pedido pedido) {
        notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                String.format(MENSAJE_NO_RETIRADO, pedido.getId()),
                TipoNotificacion.PEDIDO_NO_RETIRADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
    }

    public PedidoResponseDTO cancelarPedido(Integer usuarioId, Integer pedidoId) {
        obtenerPedidoDelCliente(usuarioId, pedidoId);
        PedidoBloqueado bloqueado = bloquearParaActualizarConEquipo(pedidoId, usuarioId);
        Pedido pedido = bloqueado.pedido();

        EstadoPedido estadoOrigen = pedido.getEstado();
        if (estadoOrigen != EstadoPedido.PENDIENTE_PAGO && estadoOrigen != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO
                && estadoOrigen != EstadoPedido.EN_PREPARACION) {
            throw new ConflictoDeNegocioException("El pedido ya no se puede cancelar");
        }

        pedido.setEstado(EstadoPedido.CANCELADO);
        pedido.setCanceladoPor(CanceladoPor.CLIENTE);
        pedidoRepository.save(pedido);
        if (estadoOrigen == EstadoPedido.PENDIENTE_PAGO) {
            registrarHistorial(pedido, ActorPedido.CLIENTE, usuarioId, MotivoTimeoutPedido.CANCELACION_SIN_PAGO);
            return aResponseDTO(pedido);
        }
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
            throw new ConflictoDeNegocioException(pedido.getEstado() == EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO
                    ? MENSAJE_NO_SE_ANULA_SIN_ACEPTAR
                    : MENSAJE_NO_SE_PUEDE_ANULAR);
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

        return aResponseDTOParaComercio(pedido);
    }

    public List<PedidoResponseDTO> listarPedidosCliente(Integer usuarioId) {
        List<Pedido> pedidos = pedidoRepository.findByClienteId(usuarioId);
        Map<Integer, LocalDateTime> fechasPago = fechasPagoAprobado(pedidos);
        Map<Integer, NotaCredito> notas = ultimasNotasCredito(pedidos);
        return pedidos.stream()
                .map(pedido -> aResponseDTO(pedido, fechasPago.get(pedido.getId()), notas.get(pedido.getId()), null, null))
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
        Map<Integer, LocalDateTime> listoDesde = fechasListoParaRetirar(pedidos);
        LocalDateTime ahora = LocalDateTime.now(clock);
        return pedidos.stream()
                .map(pedido -> aResponseDTO(pedido, fechasPago.get(pedido.getId()), notas.get(pedido.getId()),
                        esperaNoRetirado(pedido, listoDesde.get(pedido.getId()), ahora),
                        limiteDeResolucionPorSuspension(pedido, listoDesde.get(pedido.getId()))))
                .toList();
    }

    public List<PedidoEmpleadoResponseDTO> listarPedidosComercioEmpleado(Integer comercioId, Integer empleadoUsuarioId) {
        return listarPedidosComercio(comercioId).stream()
                .map(pedido -> PedidoEmpleadoResponseDTO.desde(pedido, empleadoUsuarioId))
                .toList();
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
     * (T8) y avisa al equipo del comercio (T30: el Dueño y los Empleados {@code ACTIVO}, sin el Cliente del pedido
     * si es Empleado del comercio), todo en la misma transacción. Se toma el equipo en cada pasada (igual que la
     * expiración sin respuesta) porque el bloqueo se toma antes de saber si el pedido ya vence. Mismo cron para las
     * dos cosas — confirmado con Diego.
     */
    private void avisar75MinYAutoconfirmar(Supplier<LocalDateTime> reloj) {
        for (Integer pedidoId : pedidoRepository.findIdsByEstado(EstadoPedido.EN_CAMINO)) {
            enTransaccionPorPedido("avisar75MinYAutoconfirmar", pedidoId, () -> {
                PedidoBloqueado bloqueado = bloquearParaActualizarConEquipo(pedidoId, null);
                Pedido pedido = bloqueado.pedido();
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
                    notificacionService.crearParaEquipo(pedido.getComercio().getId(), pedido.getComercio().getDueno().getId(), bloqueado.equipo(),
                            String.format(MENSAJE_AUTOCONFIRMADO_COMERCIO, pedido.getId(), timeoutProperties.getAutoconfirmacionEnCaminoMinutos()),
                            TipoNotificacion.PEDIDO_AUTOCONFIRMADO_COMERCIO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
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
     * Job 4: {@code LISTO_PARA_RETIRAR} de un comercio suspendido, a los {@code retiroSuspensionMinutos} (90) contados
     * desde que el pedido quedó listo o desde que se suspendió el comercio, lo que haya pasado después ->
     * cierra como {@code NO_RETIRADO} (nadie confirmó el retiro, así que no corresponde {@code ENTREGADO}), sin
     * reembolso y sin la espera mínima del cierre manual. Avisa al Cliente con el mismo T36 que el cierre manual.
     * Si se levanta la suspensión antes, el comercio ya no está {@code SUSPENDIDO} y no hace nada. Cada pedido
     * se resuelve en su transacción, con el comercio y el pedido bloqueados y todo revalidado.
     */
    private void autoconfirmarRetirosPorSuspension(Supplier<LocalDateTime> reloj) {
        long minutos = timeoutProperties.getRetiroSuspensionMinutos();
        LocalDateTime corteInicial = reloj.get().minusMinutes(minutos);
        for (Integer pedidoId : pedidoRepository.findIdsDeComerciosSuspendidosDesde(EstadoPedido.LISTO_PARA_RETIRAR, corteInicial)) {
            enTransaccionPorPedido("autoconfirmarRetirosPorSuspension", pedidoId, () -> {
                PedidoBloqueado bloqueado = bloquearParaTopeDeSuspension(pedidoId);
                Pedido pedido = bloqueado.pedido();
                if (pedido.getEstado() != EstadoPedido.LISTO_PARA_RETIRAR || !comercioSuspendido(bloqueado)) {
                    return;
                }
                LocalDateTime listoDesde = obtenerFechaEntradaAEstado(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
                LocalDateTime base = listoDesde != null && listoDesde.isAfter(bloqueado.suspendidoDesde())
                        ? listoDesde
                        : bloqueado.suspendidoDesde();
                if (base.plusMinutes(minutos).isAfter(reloj.get())) {
                    return;
                }
                pedido.setEstado(EstadoPedido.NO_RETIRADO);
                pedidoRepository.save(pedido);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_RETIRO_SUSPENSION);
                avisarPedidoNoRetirado(pedido);
            });
        }
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void cancelarPreparacionPorSuspension() {
        cancelarPreparacionPorSuspension(() -> LocalDateTime.now(clock));
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    public void cancelarPreparacionPorSuspension(LocalDateTime ahora) {
        cancelarPreparacionPorSuspension(() -> ahora);
    }

    /**
     * Job 5: {@code EN_PREPARACION} de un comercio suspendido que el equipo no despachó ni anuló a los
     * {@code preparacionSuspensionMinutos} (90) de la suspensión -> {@code CANCELADO_POR_SISTEMA} con reembolso total
     * (nota {@code SUSPENSION_COMERCIO}, motivo {@code TIMEOUT_PREPARACION_SUSPENSION}) y aviso al Cliente (T11). Si se
     * levanta la suspensión antes el proceso se detiene. Cada pedido se resuelve en su transacción; uno que falla no
     * frena a los demás.
     */
    private void cancelarPreparacionPorSuspension(Supplier<LocalDateTime> reloj) {
        long minutos = timeoutProperties.getPreparacionSuspensionMinutos();
        LocalDateTime corteInicial = reloj.get().minusMinutes(minutos);
        for (Integer pedidoId : pedidoRepository.findIdsDeComerciosSuspendidosDesde(EstadoPedido.EN_PREPARACION, corteInicial)) {
            enTransaccionPorPedido("cancelarPreparacionPorSuspension", pedidoId, () -> {
                PedidoBloqueado bloqueado = bloquearParaTopeDeSuspension(pedidoId);
                Pedido pedido = bloqueado.pedido();
                if (pedido.getEstado() != EstadoPedido.EN_PREPARACION || !comercioSuspendido(bloqueado)
                        || bloqueado.suspendidoDesde().plusMinutes(minutos).isAfter(reloj.get())) {
                    return;
                }
                pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);
                pedido.setCanceladoPor(CanceladoPor.SISTEMA);
                pedidoRepository.save(pedido);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.TIMEOUT_PREPARACION_SUSPENSION);
                boolean devolucionEnGestion = reembolsoService.generarNotaYReembolsarTotal(pedido,
                        MotivoNotaCredito.SUSPENSION_COMERCIO);
                notificarCancelacionSistema(pedido, devolucionEnGestion
                        ? "el comercio fue suspendido y estamos gestionando la devolución de tu pago"
                        : "el comercio fue suspendido");
            });
        }
    }

    static final String TEXTO_RECHAZO_POR_SUSPENSION =
            "Tu pedido se canceló porque el comercio no está disponible. Te devolvemos el dinero.";

    /**
     * Rechaza y reembolsa, uno por uno, los pedidos {@code PENDIENTE_CONFIRMACION_COMERCIO} de un comercio que acaba de
     * suspenderse. Se llama después de confirmada la transacción de la suspensión y recibe un solo comercio, así que la
     * suspensión de un Dueño la puede llamar una vez por cada uno de sus comercios. Devuelve cuántos rechazó.
     */
    @Transactional(propagation = Propagation.SUPPORTS)
    public int rechazarPendientesDelComercioSuspendido(Integer comercioId) {
        int rechazados = 0;
        for (Integer pedidoId : pedidoRepository.findIdsByComercioIdAndEstadoIn(comercioId,
                List.of(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO))) {
            if (rechazarPendientePorSuspension(pedidoId)) {
                rechazados++;
            }
        }
        return rechazados;
    }

    /** Job 6: barrido de los pendientes de cualquier comercio suspendido que hayan quedado sin procesar. */
    @Transactional(propagation = Propagation.SUPPORTS)
    public void rechazarPendientesDeComerciosSuspendidos() {
        for (Integer pedidoId : pedidoRepository.findIdsDeComerciosSuspendidos(EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO)) {
            rechazarPendientePorSuspension(pedidoId);
        }
    }

    /**
     * Una transacción por pedido: bloqueo del orden global (usuarios, comercio compartido, pedido) y todo revalidado con
     * las filas bloqueadas. Si el pedido ya no está pendiente (lo resolvió alguien antes) o el comercio ya no está
     * suspendido (se levantó), no hace nada; así dos ejecuciones simultáneas generan una sola nota. Un fallo en un
     * pedido se registra y no frena a los demás.
     */
    private boolean rechazarPendientePorSuspension(Integer pedidoId) {
        boolean[] rechazado = {false};
        enTransaccionPorPedido("rechazarPendientesPorSuspension", pedidoId, () -> {
            PedidoBloqueado bloqueado = bloquearParaTopeDeSuspension(pedidoId);
            Pedido pedido = bloqueado.pedido();
            if (pedido.getEstado() != EstadoPedido.PENDIENTE_CONFIRMACION_COMERCIO || !comercioSuspendido(bloqueado)) {
                return;
            }
            pedido.setEstado(EstadoPedido.RECHAZADO);
            pedido.setCanceladoPor(CanceladoPor.SISTEMA);
            pedidoRepository.save(pedido);
            registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.SUSPENSION_COMERCIO);
            reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.SUSPENSION_COMERCIO);
            notificacionService.crearParaCliente(pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId(),
                    TEXTO_RECHAZO_POR_SUSPENSION, TipoNotificacion.PEDIDO_RECHAZADO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
            rechazado[0] = true;
        });
        return rechazado[0];
    }

    static final String MOTIVO_SIN_ATENCION = "El comercio no está disponible";

    private static final List<EstadoPedido> ESTADOS_QUE_NECESITAN_ATENCION =
            List.of(EstadoPedido.EN_PREPARACION, EstadoPedido.LISTO_PARA_RETIRAR);

    /**
     * Procesa los pedidos {@code EN_PREPARACION} y {@code LISTO_PARA_RETIRAR} de un comercio {@code SUSPENDIDO} cuyo Dueño
     * tiene la cuenta suspendida y que no tiene ningún Empleado activo (los pedidos sin atención): los de preparación se
     * anulan y los listos para retirar se cancelan, siempre con reembolso total, uno por transacción. Se llama después de
     * confirmada la suspensión del Dueño. Devuelve cuántos procesó.
     */
    @Transactional(propagation = Propagation.SUPPORTS)
    public int procesarPedidosSinAtencionDelComercio(Integer comercioId) {
        int procesados = 0;
        for (Integer pedidoId : pedidoRepository.findIdsByComercioIdAndEstadoIn(comercioId, ESTADOS_QUE_NECESITAN_ATENCION)) {
            if (procesarPedidoSinAtencion(pedidoId)) {
                procesados++;
            }
        }
        return procesados;
    }

    /**
     * Job 7: barrido de seguridad de los pedidos sin atención de todos los comercios suspendidos con el Dueño suspendido.
     * La condición se vuelve a evaluar entera en cada corrida (un Empleado que deja de estar activo después, o un comercio
     * suspendido por separado antes que su Dueño, también cuentan) y es idempotente.
     */
    @Transactional(propagation = Propagation.SUPPORTS)
    public void procesarPedidosSinAtencion() {
        for (Integer pedidoId : pedidoRepository.findIdsDeComerciosSuspendidosConDuenoSuspendido(ESTADOS_QUE_NECESITAN_ATENCION)) {
            procesarPedidoSinAtencion(pedidoId);
        }
    }

    /**
     * Una transacción por pedido: bloqueo del orden global (usuarios, relaciones, comercio compartido, pedido) y todo
     * revalidado con las filas bloqueadas. Si el pedido ya cambió de estado, el comercio ya no está suspendido, el Dueño ya
     * no lo está o hay un Empleado activo que lo pueda atender, no hace nada: dos ejecuciones simultáneas generan una sola
     * nota. Un fallo en un pedido se registra y no frena a los demás.
     */
    private boolean procesarPedidoSinAtencion(Integer pedidoId) {
        boolean[] procesado = {false};
        enTransaccionPorPedido("procesarPedidosSinAtencion", pedidoId, () -> {
            PedidoBloqueado bloqueado = bloquearParaSinAtencion(pedidoId);
            Pedido pedido = bloqueado.pedido();
            if (!comercioSuspendido(bloqueado) || bloqueado.estadoDueno() != EstadoUsuario.SUSPENDIDO
                    || !bloqueado.empleadosActivos().isEmpty()) {
                return;
            }
            Integer clienteId = pedido.getCliente().getPersonaFisica().getPersona().getUsuario().getId();
            if (pedido.getEstado() == EstadoPedido.EN_PREPARACION) {
                pedido.setEstado(EstadoPedido.ANULADO);
                pedido.setCanceladoPor(CanceladoPor.SISTEMA);
                pedido.setMotivo(MOTIVO_SIN_ATENCION);
                pedidoRepository.save(pedido);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.SUSPENSION_DUENO_SIN_ATENCION);
                reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.SUSPENSION_COMERCIO);
                notificacionService.crearParaCliente(clienteId, TEXTO_RECHAZO_POR_SUSPENSION,
                        TipoNotificacion.PEDIDO_ANULADO_COMERCIO, TipoEntidadNotificacion.PEDIDO, pedido.getId());
            } else if (pedido.getEstado() == EstadoPedido.LISTO_PARA_RETIRAR) {
                pedido.setEstado(EstadoPedido.CANCELADO_POR_SISTEMA);
                pedido.setCanceladoPor(CanceladoPor.SISTEMA);
                pedidoRepository.save(pedido);
                registrarHistorial(pedido, ActorPedido.SISTEMA, null, MotivoTimeoutPedido.SUSPENSION_DUENO_SIN_ATENCION);
                reembolsoService.generarNotaYReembolsarTotal(pedido, MotivoNotaCredito.SUSPENSION_COMERCIO);
                notificacionService.crearParaCliente(clienteId, TEXTO_RECHAZO_POR_SUSPENSION,
                        TipoNotificacion.PEDIDO_CANCELADO_SISTEMA, TipoEntidadNotificacion.PEDIDO, pedido.getId());
            } else {
                return;
            }
            procesado[0] = true;
        });
        return procesado[0];
    }

    private static boolean comercioSuspendido(PedidoBloqueado bloqueado) {
        return bloqueado.estadoComercio() == EstadoComercio.SUSPENDIDO && bloqueado.suspendidoDesde() != null;
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
        registrarHistorial(pedido, actorRol, actorUsuarioId, motivoTimeout, LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS));
    }

    private void registrarHistorial(Pedido pedido, ActorPedido actorRol, Integer actorUsuarioId, MotivoTimeoutPedido motivoTimeout,
            LocalDateTime fechaHora) {
        HistorialEstadoPedido historial = HistorialEstadoPedido.builder()
                .pedido(pedido)
                .estado(pedido.getEstado())
                .actorRol(actorRol)
                .actorUsuario(actorUsuarioId == null ? null : usuarioRepository.getReferenceById(actorUsuarioId))
                .motivoTimeout(motivoTimeout)
                .fechaHora(fechaHora)
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
                ultimasNotasCredito(List.of(pedido)).get(pedido.getId()), null, null);
    }

    private static DireccionEntregaResponseDTO direccionEntrega(Pedido pedido) {
        if (pedido.getEntregaCalle() == null) {
            return null;
        }
        Localidad localidad = pedido.getEntregaLocalidad();
        return new DireccionEntregaResponseDTO(
                pedido.getEntregaCalle(),
                pedido.getEntregaNumero(),
                pedido.getEntregaPisoDepto(),
                pedido.getEntregaCodigoPostal(),
                pedido.getEntregaLocalidadId(),
                localidad == null ? null : localidad.getNombre(),
                localidad == null ? null : localidad.getProvincia().getNombre(),
                pedido.getEntregaReferencia());
    }

    private PedidoResponseDTO aResponseDTOParaComercio(Pedido pedido) {
        LocalDateTime listoDesde = obtenerFechaEntradaAEstado(pedido, EstadoPedido.LISTO_PARA_RETIRAR);
        return aResponseDTO(pedido, fechasPagoAprobado(List.of(pedido)).get(pedido.getId()),
                ultimasNotasCredito(List.of(pedido)).get(pedido.getId()),
                esperaNoRetirado(pedido, listoDesde, LocalDateTime.now(clock)),
                limiteDeResolucionPorSuspension(pedido, listoDesde));
    }

    /**
     * Hora en que el proceso de los topes de una suspensión resuelve el pedido, solo para las respuestas del lado
     * del comercio: {@code EN_PREPARACION} a los {@code preparacionSuspensionMinutos} de la suspensión y
     * {@code LISTO_PARA_RETIRAR} a los {@code retiroSuspensionMinutos} contados desde el posterior entre que quedó
     * listo y la suspensión (la misma cuenta de {@link #autoconfirmarRetirosPorSuspension}). Cualquier otro estado, o
     * un comercio que no está suspendido, da {@code null}.
     */
    private LocalDateTime limiteDeResolucionPorSuspension(Pedido pedido, LocalDateTime listoDesde) {
        Comercio comercio = pedido.getComercio();
        LocalDateTime suspendidoDesde = comercio.getSuspendidoDesde();
        if (comercio.getEstado() != EstadoComercio.SUSPENDIDO || suspendidoDesde == null) {
            return null;
        }
        if (pedido.getEstado() == EstadoPedido.EN_PREPARACION) {
            return suspendidoDesde.plusMinutes(timeoutProperties.getPreparacionSuspensionMinutos());
        }
        if (pedido.getEstado() == EstadoPedido.LISTO_PARA_RETIRAR) {
            LocalDateTime base = listoDesde != null && listoDesde.isAfter(suspendidoDesde) ? listoDesde : suspendidoDesde;
            return base.plusMinutes(timeoutProperties.getRetiroSuspensionMinutos());
        }
        return null;
    }

    private PedidoResponseDTO aResponseDTO(Pedido pedido, LocalDateTime fechaPagoAprobado, NotaCredito notaCredito,
            EsperaNoRetirado espera, LocalDateTime limiteResolucionSuspension) {
        List<DetallePedidoResponseDTO> detalles = detallePedidoRepository.findByPedidoId(pedido.getId()).stream()
                .map(this::aResponseDTO)
                .toList();

        DireccionEntregaResponseDTO direccionDTO = direccionEntrega(pedido);

        return new PedidoResponseDTO(
                pedido.getId(),
                pedido.getCliente().getId(),
                pedido.getCliente().getPersonaFisica().getNombre() + " " + pedido.getCliente().getPersonaFisica().getApellido(),
                pedido.getComercio().getId(),
                pedido.getComercio().getNombre(),
                pedido.getComercio().getFotoPerfilUrl(),
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
                notaCredito == null ? null : notaCredito.getMonto(),
                espera == null ? null : espera.disponibleDesde(),
                espera == null ? null : espera.minutosRestantes(),
                limiteResolucionSuspension,
                pedido.getEstado() == EstadoPedido.PENDIENTE_PAGO && pedido.getComercio().getEstado() == EstadoComercio.SUSPENDIDO,
                notaCredito == null ? null : notaCredito.getMotivo());
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
