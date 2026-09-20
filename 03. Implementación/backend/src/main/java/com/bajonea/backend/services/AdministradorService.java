package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.request.SuspensionComercioRequestDTO;
import com.bajonea.backend.dto.response.AdministradorResponseDTO;
import com.bajonea.backend.dto.response.ClienteAdminResponseDTO;
import com.bajonea.backend.dto.response.ComercioAdminResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.dto.response.HorarioResponseDTO;
import com.bajonea.backend.dto.response.MetricasAdminResponseDTO;
import com.bajonea.backend.dto.response.RedSocialResponseDTO;
import com.bajonea.backend.dto.response.RepresentanteResponseDTO;
import com.bajonea.backend.entities.Administrador;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.CategoriaRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import com.bajonea.backend.repositories.TagRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aprobación/rechazo de Comercio por el Administrador. No incluye gestión de Categoría/Tag —
 * ver {@code docs/DECISIONES.md}, 2026-07-17 (`CategoriaService`/`TagService` son clases
 * separadas por diseño de `CLAUDE.md` §3, tanda propia).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AdministradorService {

    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final RedSocialRepository redSocialRepository;
    private final AdministradorRepository administradorRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final ClienteRepository clienteRepository;
    private final CategoriaRepository categoriaRepository;
    private final TagRepository tagRepository;
    private final NotificacionService notificacionService;
    private final PedidoService pedidoService;

    public List<ComercioAdminResponseDTO> listarComerciosPendientes() {
        return comercioRepository.findByEstado(EstadoComercio.PENDIENTE).stream()
                .map(this::aAdminResponseDTO)
                .toList();
    }

    /**
     * Incluye {@code SUSPENDIDO} además de {@code APROBADO} (Fase 19) — si filtrara
     * exclusivamente por {@code APROBADO}, un comercio recién suspendido desaparecería de este
     * listado y el Administrador no podría verificar el resultado de {@link #suspenderComercio}.
     */
    public List<ComercioAdminResponseDTO> listarComerciosAprobados() {
        return comercioRepository.findByEstadoIn(
                        List.of(EstadoComercio.APROBADO, EstadoComercio.APTO_VENTA, EstadoComercio.SUSPENDIDO)).stream()
                .map(this::aAdminResponseDTO)
                .toList();
    }

    public List<ClienteAdminResponseDTO> listarClientes() {
        return clienteRepository.findAll().stream()
                .map(this::aClienteAdminResponseDTO)
                .toList();
    }

    public AdministradorResponseDTO obtenerPerfil(Integer administradorId) {
        Administrador administrador = administradorRepository.findById(administradorId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));
        PersonaFisica personaFisica = administrador.getPersonaFisica();
        return new AdministradorResponseDTO(
                administrador.getId(),
                personaFisica.getNombre(),
                personaFisica.getApellido(),
                personaFisica.getPersona().getUsuario().getFotoPerfilUrl());
    }

    public MetricasAdminResponseDTO obtenerMetricas() {
        long comerciosPendientes = comercioRepository.findByEstado(EstadoComercio.PENDIENTE).size();
        return new MetricasAdminResponseDTO(
                comerciosPendientes,
                comercioRepository.count(),
                clienteRepository.count(),
                categoriaRepository.countByActivoTrue(),
                tagRepository.countByActivoTrue());
    }

    public void resolverAprobacion(Integer comercioId, Integer administradorId, AprobacionComercioRequestDTO request) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));

        if (comercio.getEstado() != EstadoComercio.PENDIENTE) {
            throw new ConflictoDeNegocioException("El comercio ya fue resuelto, no está en estado PENDIENTE");
        }

        boolean aprobar = Boolean.TRUE.equals(request.getAprobar());
        if (!aprobar && (request.getMotivo() == null || request.getMotivo().isBlank())) {
            throw new ValidacionException("El motivo es obligatorio al rechazar un comercio");
        }

        Administrador administrador = administradorRepository.findById(administradorId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));

        EstadoComercio estadoOrigen = comercio.getEstado();
        EstadoComercio estadoDestino = aprobar ? EstadoComercio.APROBADO : EstadoComercio.RECHAZADO;
        comercio.setEstado(estadoDestino);
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        HistorialEstadoComercio historial = HistorialEstadoComercio.builder()
                .comercio(comercio)
                .administrador(administrador)
                .estadoOrigen(estadoOrigen)
                .estadoDestino(estadoDestino)
                .motivo(request.getMotivo())
                .fechaHora(LocalDateTime.now())
                .build();
        historialEstadoComercioRepository.save(historial);

        String mensaje = aprobar
                ? "Tu comercio fue aprobado."
                : "Tu comercio '" + comercio.getNombre() + "' fue rechazado. Motivo: " + request.getMotivo();
        TipoNotificacion tipo = aprobar ? TipoNotificacion.COMERCIO_APROBADO : TipoNotificacion.COMERCIO_RECHAZADO;

        notificacionService.crear(comercio.getDueno().getPersonaJuridica().getPersona().getUsuario().getId(), mensaje,
                tipo, TipoEntidadNotificacion.COMERCIO, comercio.getId());
    }

    /**
     * Suspensión de Comercio por Administrador (Fase 19, sumada al alcance por pedido explícito
     * de Diego). Solo cubre la dirección Comercio -> {@code SUSPENDIDO} desde
     * {@code APROBADO} — sin "levantar suspensión" en este tramo (no pedido, y reabre
     * decisiones de otro alcance: a qué estado vuelve el comercio, qué pasa con los pedidos ya
     * cancelados). Dispara la lógica reactiva de {@code PedidoService} sobre los pedidos activos
     * de este comercio.
     */
    public void suspenderComercio(Integer comercioId, Integer administradorId, SuspensionComercioRequestDTO request) {
        Comercio comercio = comercioRepository.findById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));

        if (comercio.getEstado() != EstadoComercio.APROBADO && comercio.getEstado() != EstadoComercio.APTO_VENTA) {
            throw new ConflictoDeNegocioException("Solo se puede suspender un comercio aprobado");
        }

        Administrador administrador = administradorRepository.findById(administradorId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));

        EstadoComercio estadoOrigen = comercio.getEstado();
        comercio.setEstado(EstadoComercio.SUSPENDIDO);
        comercio.setFechaModificacion(LocalDateTime.now());
        comercioRepository.save(comercio);

        HistorialEstadoComercio historial = HistorialEstadoComercio.builder()
                .comercio(comercio)
                .administrador(administrador)
                .estadoOrigen(estadoOrigen)
                .estadoDestino(EstadoComercio.SUSPENDIDO)
                .motivo(request.getMotivo())
                .fechaHora(LocalDateTime.now())
                .build();
        historialEstadoComercioRepository.save(historial);

        notificacionService.crear(comercio.getDueno().getPersonaJuridica().getPersona().getUsuario().getId(),
                "Tu comercio '" + comercio.getNombre() + "' fue suspendido. Motivo: " + request.getMotivo(),
                TipoNotificacion.COMERCIO_SUSPENDIDO, TipoEntidadNotificacion.COMERCIO, comercio.getId());

        pedidoService.cancelarPedidosPorSuspensionComercio(comercio.getId());
    }

    private ComercioAdminResponseDTO aAdminResponseDTO(Comercio comercio) {
        Direccion direccion = direccionRepository.findByComercioId(comercio.getId()).orElse(null);
        DireccionResponseDTO direccionDTO = direccion == null ? null : new DireccionResponseDTO(
                direccion.getId(),
                direccion.getCalle(),
                direccion.getNumero(),
                direccion.getPisoDepto(),
                direccion.getCodigoPostal(),
                direccion.getLocalidad().getId(),
                direccion.getLocalidad().getNombre(),
                direccion.getLocalidad().getProvincia().getNombre(),
                direccion.isPrincipal());

        List<HorarioResponseDTO> horarios = horarioRepository.findByComercioId(comercio.getId()).stream()
                .map(this::aResponseDTO)
                .toList();

        RepresentanteResponseDTO representante = aRepresentanteResponseDTO(comercio.getDueno().getPersonaFisica());

        List<RedSocialResponseDTO> redesSociales = redSocialRepository
                .findByComercioIdAndFechaBajaIsNull(comercio.getId()).stream()
                .map(this::aRedSocialResponseDTO)
                .toList();

        return new ComercioAdminResponseDTO(
                comercio.getId(),
                comercio.getNombre(),
                comercio.getDescripcion(),
                comercio.getFotoPerfilUrl(),
                comercio.getTelefono(),
                comercio.getEmail(),
                comercio.getDueno().getPersonaJuridica().getPersona().getUsuario().getEmail(),
                comercio.getTipoComercio(),
                comercio.isAceptaDelivery(),
                comercio.isAceptaRetiro(),
                comercio.getEstado(),
                comercio.getDueno().getPersonaJuridica().getRazonSocial(),
                comercio.getDueno().getPersonaJuridica().getCuit(),
                comercio.getDueno().getPersonaJuridica().getCondicionIva(),
                comercio.getFechaRegistro(),
                direccionDTO,
                horarios,
                representante,
                redesSociales);
    }

    private ClienteAdminResponseDTO aClienteAdminResponseDTO(Cliente cliente) {
        PersonaFisica personaFisica = cliente.getPersonaFisica();
        return new ClienteAdminResponseDTO(
                cliente.getId(),
                personaFisica.getNombre(),
                personaFisica.getApellido(),
                personaFisica.getDni(),
                personaFisica.getPersona().getUsuario().getEmail(),
                personaFisica.getPersona().getUsuario().getEstado(),
                personaFisica.getPersona().getUsuario().getFechaRegistro());
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

    private RedSocialResponseDTO aRedSocialResponseDTO(RedSocial redSocial) {
        return new RedSocialResponseDTO(redSocial.getId(), redSocial.getTipo(), redSocial.getUrl(),
                redSocial.getFechaCreacion(), redSocial.getFechaModificacion());
    }
}
