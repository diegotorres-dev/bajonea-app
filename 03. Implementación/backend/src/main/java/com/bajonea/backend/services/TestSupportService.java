package com.bajonea.backend.services;

import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoToken;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.TokenRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Atajo de testing exclusivo del perfil {@code test} (Fase 14, ver docs/DECISIONES.md) —
 * expone el token de verificación pendiente de un usuario sin depender de leer un email
 * real, para que la colección de Postman corra rápido y determinística sin depender de
 * una casilla real, aun con el envío de email (Fase 10, Resend) funcionando. El bean no
 * se crea fuera del perfil {@code test} ({@code @Profile}), así que {@code TestController}
 * no tiene a quién inyectar y la ruta ni siquiera se registra en el perfil
 * normal/producción.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Profile("test")
public class TestSupportService {

    private final UsuarioRepository usuarioRepository;
    private final TokenRepository tokenRepository;
    private final ComercioRepository comercioRepository;
    private final ComercioService comercioService;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final CuentaMercadoPagoService cuentaMercadoPagoService;
    private final PedidoService pedidoService;

    public String obtenerTokenVerificacionPendiente(String email) {
        return obtenerTokenPendiente(email, TipoToken.VERIFICACION_EMAIL);
    }

    public String obtenerTokenPendiente(String email, TipoToken tipo) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));
        Token token = tokenRepository
                .findFirstByUsuarioIdAndTipoAndEstadoOrderByFechaCreacionDesc(
                        usuario.getId(), tipo, EstadoToken.PENDIENTE)
                .orElseThrow(() -> new RecursoNoEncontradoException(
                        "No hay token de tipo " + tipo + " pendiente para ese email"));
        return token.getToken();
    }

    /**
     * Atajo de entorno de test: lleva un comercio {@code APROBADO} a {@code APTO_VENTA} por la misma
     * transición automática que dispara la vinculación de Mercado Pago, pero sin vincular ninguna
     * cuenta ni crear {@code CuentaMercadoPago}. No ejercita el flujo OAuth real.
     */
    @Transactional
    public void marcarAptoVenta(Integer comercioId) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        if (comercio.getEstado() != EstadoComercio.APROBADO) {
            throw new ConflictoDeNegocioException(
                    "Solo un comercio APROBADO puede pasar a APTO_VENTA, estado actual: " + comercio.getEstado());
        }
        boolean duenoBloqueado = comercioService.duenoBloqueadoConBloqueo(comercio.getDueno().getId());
        comercioService.activarAptoVenta(comercio, duenoBloqueado, ComercioService.MOTIVO_BLOQUEO_VIGENTE_AL_VINCULAR);
    }

    /**
     * Atajo de entorno de test: confirma el pago de un pedido {@code PENDIENTE_PAGO} por la misma
     * transición que dispara el webhook de Mercado Pago ({@code PedidoService.confirmarPagoAprobado}),
     * sin crear preferencia ni tocar ninguna API de Mercado Pago. No ejercita el flujo de pago real.
     */
    @Transactional
    public void confirmarPagoAprobado(Integer pedidoId) {
        pedidoService.confirmarPagoAprobado(pedidoId);
    }

    /**
     * Atajo de entorno de test para el tramo multi-comercio: mientras no exista el alta de un
     * segundo comercio por Dueño, duplica un comercio existente (mismo Dueño, misma dirección y
     * mismos horarios, nombre propio) para poder probar el aislamiento entre comercios del
     * mismo Dueño. Sin {@code estado} explícito, el clon nace en el mismo estado que el original.
     * No agrega tablas ni columnas: usa las mismas entidades que el registro real.
     */
    @Transactional
    public Integer clonarComercio(Integer comercioId, String nombre, EstadoComercio estado) {
        Comercio origen = comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        LocalDateTime ahora = LocalDateTime.now();

        Comercio clon = comercioRepository.save(Comercio.builder()
                .dueno(origen.getDueno())
                .nombre(nombre)
                .descripcion(origen.getDescripcion())
                .fotoPerfilUrl(origen.getFotoPerfilUrl())
                .telefono(origen.getTelefono())
                .email(origen.getEmail())
                .tipoComercio(origen.getTipoComercio())
                .aceptaDelivery(origen.isAceptaDelivery())
                .aceptaRetiro(origen.isAceptaRetiro())
                .estado(estado != null ? estado : origen.getEstado())
                .fechaRegistro(ahora)
                .build());

        direccionRepository.findByComercioId(origen.getId()).ifPresent(direccion ->
                direccionRepository.save(Direccion.builder()
                        .calle(direccion.getCalle())
                        .numero(direccion.getNumero())
                        .pisoDepto(direccion.getPisoDepto())
                        .codigoPostal(direccion.getCodigoPostal())
                        .localidad(direccion.getLocalidad())
                        .comercio(clon)
                        .principal(direccion.isPrincipal())
                        .fechaCreacion(ahora)
                        .build()));

        List<Horario> horarios = horarioRepository.findByComercioId(origen.getId());
        for (Horario horario : horarios) {
            horarioRepository.save(Horario.builder()
                    .comercio(clon)
                    .diaSemana(horario.getDiaSemana())
                    .horaApertura(horario.getHoraApertura())
                    .horaCierre(horario.getHoraCierre())
                    .build());
        }
        return clon.getId();
    }

    /**
     * Atajo de entorno de test: ejecuta lo que {@code MercadoPagoOAuthService.procesarCallback}
     * hace después del intercambio de código por token (vincular la cuenta y llevar a
     * {@code APTO_VENTA} los comercios del Dueño), con credenciales sintéticas y sin ninguna
     * llamada a Mercado Pago. No ejercita el intercambio OAuth real. {@code mpUserId} es opcional (por defecto
     * {@code test-mp-{duenoId}}) para poder probar la unicidad de la cuenta entre Dueños.
     */
    @Transactional
    public void vincularCuentaMercadoPagoSimulada(Integer duenoId, String mpUserId) {
        String cuentaMp = mpUserId == null || mpUserId.isBlank() ? "test-mp-" + duenoId : mpUserId;
        boolean duenoBloqueado = comercioService.duenoBloqueadoConBloqueo(duenoId);
        cuentaMercadoPagoService.vincular(duenoId, cuentaMp, "TEST-access-token-" + duenoId,
                "TEST-refresh-token-" + duenoId, "TEST-public-key-" + duenoId, true, LocalDateTime.now().plusDays(1));
        comercioService.activarAptoVenta(duenoId, duenoBloqueado);
    }
}
