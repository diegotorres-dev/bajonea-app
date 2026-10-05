package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ComercioPerfilRequestDTO;
import com.bajonea.backend.dto.request.FotoPerfilComercioRequestDTO;
import com.bajonea.backend.dto.response.ComercioPublicoResponseDTO;
import com.bajonea.backend.dto.response.ComercioResponseDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.dto.response.HorarioResponseDTO;
import com.bajonea.backend.dto.response.RepresentanteResponseDTO;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.services.DisponibilidadComercioService.Disponibilidad;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.util.ComercioValidaciones;
import com.bajonea.backend.util.TextoUtils;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Autoservicio de perfil del propio Comercio, incluida la foto de perfil vía firma de
 * Cloudinary (Fase 11 — flujo separado del de la galería de {@code ProductoService}, sin
 * límite de cantidad). No incluye CRUD de Producto — ver {@code ProductoService}. Las operaciones
 * de autoservicio reciben el {@code comercioId} ya resuelto y validado por
 * {@code ComercioActivoService} (header {@code X-Comercio-Id}), nunca el id del usuario.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ComercioService {

    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final CloudinaryService cloudinaryService;
    private final DisponibilidadComercioService disponibilidadComercioService;

    public ComercioResponseDTO verPerfil(Integer comercioId) {
        Comercio comercio = obtenerComercio(comercioId);
        return aResponseDTO(comercio);
    }

    public ComercioResponseDTO editarPerfil(Integer comercioId, ComercioPerfilRequestDTO request) {
        ComercioValidaciones.validarModalidadesEntrega(request.isAceptaDelivery(), request.isAceptaRetiro());
        Comercio comercio = obtenerComercio(comercioId);

        comercio.setNombre(TextoUtils.aTitleCase(request.getNombre()));
        comercio.setDescripcion(request.getDescripcion());
        comercio.setTelefono(request.getTelefono());
        comercio.setEmail(request.getEmailContacto());
        comercio.setAceptaDelivery(request.isAceptaDelivery());
        comercio.setAceptaRetiro(request.isAceptaRetiro());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        return aResponseDTO(comercio);
    }

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfil(Integer comercioId) {
        Comercio comercio = obtenerComercio(comercioId);
        return cloudinaryService.generarFirmaFotoPerfilComercio(comercio.getId());
    }

    public ComercioResponseDTO actualizarFotoPerfil(Integer comercioId, FotoPerfilComercioRequestDTO request) {
        Comercio comercio = obtenerComercio(comercioId);
        comercio.setFotoPerfilUrl(request.getUrl());
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);
        return aResponseDTO(comercio);
    }

    public List<ComercioPublicoResponseDTO> listarAprobados() {
        return comercioRepository.findByEstado(EstadoComercio.APTO_VENTA).stream()
                .map(this::aPublicoResponseDTO)
                .toList();
    }

    public void validarAceptaPedidos(Comercio comercio) {
        validarAceptaPedidos(comercio, comercio.getEstado(), comercio.isCerradoManualmente());
    }

    /**
     * Misma validación con el estado y el cierre manual ya leídos por quien llama (por ejemplo bajo bloqueo
     * compartido, en la creación de un pedido) en vez de los que tenga cargados la entidad. Orden: estado,
     * cierre manual y horario.
     */
    public void validarAceptaPedidos(Comercio comercio, EstadoComercio estadoActual, boolean cerradoManualmente) {
        if (estadoActual != EstadoComercio.APTO_VENTA) {
            throw new ConflictoDeNegocioException("Este comercio no está aceptando pedidos en este momento");
        }
        if (cerradoManualmente) {
            throw new ConflictoDeNegocioException("Este comercio está cerrado en este momento");
        }
        List<Horario> horarios = horarioRepository.findByComercioId(comercio.getId());
        if (!disponibilidadComercioService.dentroDeFranja(horarios, disponibilidadComercioService.ahora())) {
            throw new ConflictoDeNegocioException(
                    "Este comercio está cerrado en este momento. Podés hacer tu pedido dentro de su horario de atención.");
        }
    }

    public ComercioPublicoResponseDTO buscarAprobadoPorId(Integer comercioId) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .filter(c -> c.getEstado() == EstadoComercio.APTO_VENTA)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        return aPublicoResponseDTO(comercio);
    }

    /**
     * Transición automática APROBADO -&gt; APTO_VENTA disparada al vincular la cuenta de
     * MercadoPago del Dueño ({@code MercadoPagoOAuthService}). Se aplica a cada comercio del
     * Dueño, y es no-operación (silenciosa) sobre los que no están en APROBADO — por ejemplo,
     * SUSPENDIDO o ya APTO_VENTA por un reintento de vinculación — mismo criterio que
     * {@code AuthService.restaurarComercioSiCorresponde}, que solo actúa "si corresponde".
     * <p>
     * Lee los comercios con bloqueo ({@code findByDuenoIdConBloqueo}) y no con una lectura común: la
     * aprobación de un comercio por el Administrador decide {@code APROBADO} vs {@code APTO_VENTA} bajo
     * bloqueo de {@code cuenta_mercado_pago}, y esta transición tiene que ver un comercio recién
     * aprobado aunque esa aprobación se haya confirmado después de que empezara esta transacción
     * (con {@code REPEATABLE READ} una lectura común vería la foto anterior y lo dejaría en
     * {@code APROBADO} con una cuenta ya vinculada).
     */
    public void activarAptoVenta(Integer duenoId) {
        comercioRepository.findByDuenoIdConBloqueo(duenoId).forEach(this::activarAptoVenta);
    }

    /**
     * Misma transición que {@link #activarAptoVenta(Integer)} pero sobre un único comercio; usada
     * también por el atajo de entorno de test, que no debe arrastrar a los demás comercios del Dueño.
     */
    public void activarAptoVenta(Comercio comercio) {
        if (comercio.getEstado() != EstadoComercio.APROBADO) {
            return;
        }
        registrarTransicionAutomatica(comercio, EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA,
                "Vinculación automática de cuenta de Mercado Pago");
    }

    /**
     * Transición automática APTO_VENTA -&gt; APROBADO disparada al desvincular la cuenta de
     * MercadoPago del Dueño. Se aplica a cada comercio del Dueño; no-operación sobre los que no
     * están en APTO_VENTA. Misma lectura con bloqueo que {@link #activarAptoVenta(Integer)}, por el
     * mismo motivo (un comercio recién aprobado como {@code APTO_VENTA} tiene que verse acá).
     */
    public void desactivarAptoVenta(Integer duenoId) {
        for (Comercio comercio : comercioRepository.findByDuenoIdConBloqueo(duenoId)) {
            if (comercio.getEstado() != EstadoComercio.APTO_VENTA) {
                continue;
            }
            registrarTransicionAutomatica(comercio, EstadoComercio.APTO_VENTA, EstadoComercio.APROBADO,
                    "Desvinculación de cuenta de Mercado Pago");
        }
    }

    /**
     * Cambia el estado del comercio, actualiza {@code fechaModificacion} y deja una fila en
     * {@code historial_estado_comercio} con {@code administrador = null} (la transición la dispara el
     * sistema, no una persona) y el motivo indicado. Compartida por las transiciones de Mercado Pago, por
     * el bloqueo/restauración de cuenta ({@code AuthService}) y por la aprobación que nace
     * {@code APTO_VENTA} ({@code AdministradorService}). Todo sale de datos ya en memoria: no hace
     * ninguna consulta que pueda fallar, así que es segura dentro de las transacciones con
     * {@code noRollbackFor} de {@code AuthService}. Devuelve la fila de historial que dejó, para que quien
     * necesite colgarle algo (la corrección de un comercio rechazado, sus cambios) no tenga que buscarla.
     */
    public HistorialEstadoComercio registrarTransicionAutomatica(Comercio comercio, EstadoComercio estadoOrigen,
            EstadoComercio estadoDestino, String motivo) {
        comercio.setEstado(estadoDestino);
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        HistorialEstadoComercio historial = HistorialEstadoComercio.builder()
                .comercio(comercio)
                .administrador(null)
                .estadoOrigen(estadoOrigen)
                .estadoDestino(estadoDestino)
                .motivo(motivo)
                .fechaHora(LocalDateTime.now())
                .build();
        return historialEstadoComercioRepository.save(historial);
    }

    private Comercio obtenerComercio(Integer comercioId) {
        return comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
    }

    private ComercioResponseDTO aResponseDTO(Comercio comercio) {
        DireccionResponseDTO direccionDTO = aDireccionResponseDTO(comercio);
        List<Horario> horariosEntidad = horarioRepository.findByComercioId(comercio.getId());
        List<HorarioResponseDTO> horarios = horariosEntidad.stream().map(this::aResponseDTO).toList();
        Disponibilidad disponibilidad = disponibilidadComercioService.calcular(comercio, horariosEntidad,
                disponibilidadComercioService.ahora());
        RepresentanteResponseDTO representante = aRepresentanteResponseDTO(comercio.getDueno().getPersonaFisica());
        String motivoRechazo = obtenerMotivoRechazo(comercio);

        return new ComercioResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
                comercio.getEmail(),
                comercio.getTipoComercio(),
                comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(),
                comercio.getEstado(),
                comercio.getDueno().getPersonaJuridica().getRazonSocial(),
                comercio.getDueno().getPersonaJuridica().getCuit(),
                comercio.getDueno().getPersonaJuridica().getCondicionIva(),
                comercio.getDueno().getPersonaJuridica().getTipoSociedad(),
                comercio.getDueno().getPersonaJuridica().getDomicilioFiscal(),
                comercio.getDueno().getPersonaJuridica().getFechaInicioActividades(),
                direccionDTO,
                horarios,
                representante,
                motivoRechazo,
                disponibilidad.cerradoManualmente(),
                disponibilidad.abiertoAhora(),
                disponibilidad.puedeCambiarCierre(),
                disponibilidad.textoReapertura());
    }

    private String obtenerMotivoRechazo(Comercio comercio) {
        if (comercio.getEstado() != EstadoComercio.RECHAZADO && comercio.getEstado() != EstadoComercio.RECHAZO_DEFINITIVO) {
            return null;
        }
        return historialEstadoComercioRepository.findTopByComercioIdOrderByFechaHoraDescIdDesc(comercio.getId())
                .map(historial -> historial.getMotivo() != null && !historial.getMotivo().isBlank() ? historial.getMotivo() : null)
                .orElse(null);
    }

    private ComercioPublicoResponseDTO aPublicoResponseDTO(Comercio comercio) {
        DireccionResponseDTO direccionDTO = aDireccionResponseDTO(comercio);
        List<Horario> horariosEntidad = horarioRepository.findByComercioId(comercio.getId());
        List<HorarioResponseDTO> horarios = horariosEntidad.stream().map(this::aResponseDTO).toList();
        Disponibilidad disponibilidad = disponibilidadComercioService.calcular(comercio, horariosEntidad,
                disponibilidadComercioService.ahora());

        return new ComercioPublicoResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
                comercio.getEmail(),
                comercio.getTipoComercio(),
                comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(),
                comercio.getEstado(),
                comercio.getDueno().getPersonaJuridica().getRazonSocial(),
                comercio.getDueno().getPersonaJuridica().getCuit(),
                direccionDTO,
                horarios,
                disponibilidad.estadoApertura(),
                disponibilidad.textoReapertura());
    }

    private DireccionResponseDTO aDireccionResponseDTO(Comercio comercio) {
        Direccion direccion = direccionRepository.findByComercioId(comercio.getId()).orElse(null);
        return direccion == null ? null : new DireccionResponseDTO(
                direccion.getId(),
                direccion.getCalle(),
                direccion.getNumero(),
                direccion.getPisoDepto(),
                direccion.getCodigoPostal(),
                direccion.getLocalidad().getId(),
                direccion.getLocalidad().getNombre(),
                direccion.getLocalidad().getProvincia().getNombre(),
                direccion.isPrincipal());
    }

    private RepresentanteResponseDTO aRepresentanteResponseDTO(PersonaFisica personaFisica) {
        return new RepresentanteResponseDTO(
                personaFisica.getNombre(),
                personaFisica.getApellido(),
                personaFisica.getDni(),
                personaFisica.getTelefono(),
                personaFisica.getFechaNacimiento());
    }

    private HorarioResponseDTO aResponseDTO(Horario horario) {
        return new HorarioResponseDTO(horario.getId(), horario.getDiaSemana(), horario.getHoraApertura(), horario.getHoraCierre());
    }
}
