package com.bajonea.backend.services;

import com.bajonea.backend.config.ComercioResolicitudesProperties;
import com.bajonea.backend.dto.request.AprobacionComercioRequestDTO;
import com.bajonea.backend.dto.response.AdministradorResponseDTO;
import com.bajonea.backend.dto.response.CambioComercioResponseDTO;
import com.bajonea.backend.dto.response.ClienteAdminResponseDTO;
import com.bajonea.backend.dto.response.ComercioAdminResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.dto.response.HorarioResponseDTO;
import com.bajonea.backend.dto.response.MetricasAdminResponseDTO;
import com.bajonea.backend.dto.response.OtroComercioDuenoResponseDTO;
import com.bajonea.backend.dto.response.RedSocialResponseDTO;
import com.bajonea.backend.dto.response.ReSolicitudComercioAdminResponseDTO;
import com.bajonea.backend.dto.response.RepresentanteResponseDTO;
import com.bajonea.backend.entities.Administrador;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.HistorialCambioComercio;
import com.bajonea.backend.entities.HistorialEstadoComercio;
import com.bajonea.backend.entities.HistorialEstadoUsuario;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoDocumentoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.MotivoRecalculo;
import com.bajonea.backend.enums.TipoEntidadNotificacion;
import com.bajonea.backend.enums.TipoNotificacion;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.CategoriaRepository;
import com.bajonea.backend.repositories.DocumentoComercioRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.HistorialCambioComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoComercioRepository;
import com.bajonea.backend.repositories.HistorialEstadoUsuarioRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.NotificacionRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import com.bajonea.backend.repositories.TagRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
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

    @PersistenceContext
    private EntityManager entityManager;

    private final ComercioRepository comercioRepository;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final DisponibilidadComercioService disponibilidadComercioService;
    private final RedSocialRepository redSocialRepository;
    private final AdministradorRepository administradorRepository;
    private final HistorialEstadoComercioRepository historialEstadoComercioRepository;
    private final ClienteRepository clienteRepository;
    private final NotificacionRepository notificacionRepository;
    private final HistorialEstadoUsuarioRepository historialEstadoUsuarioRepository;
    private final CategoriaRepository categoriaRepository;
    private final TagRepository tagRepository;
    private final NotificacionService notificacionService;
    private final AptitudVentaComercioService aptitudVentaComercioService;
    private final DocumentoComercioRepository documentoComercioRepository;
    private final AprobacionPreviaDueno aprobacionPreviaDueno;
    private final HistorialCambioComercioRepository historialCambioComercioRepository;
    private final ComercioResolicitudesProperties resolicitudesProperties;

    /**
     * Solicitudes nuevas pendientes: comercios {@code PENDIENTE} que nunca se re-solicitaron
     * ({@code cantidadResolicitudes = 0}); las re-solicitudes tienen su propia bandeja
     * ({@link #listarResolicitudes}). Además de los datos de cada solicitud, dice si es de un Dueño que ya
     * tuvo otro comercio aprobado ({@code esAdicional}) y lista los demás comercios de ese Dueño. Todo con
     * dos consultas para el listado completo (comercios de los Dueños involucrados + historial de
     * aprobaciones), sin una consulta por comercio pendiente.
     */
    public List<ComercioAdminResponseDTO> listarComerciosPendientes() {
        List<Comercio> pendientes = comercioRepository.findByEstadoAndCantidadResolicitudes(EstadoComercio.PENDIENTE, 0);
        return aAdminResponseDTOConContextoDelDueno(pendientes);
    }

    /**
     * Re-solicitudes pendientes: comercios {@code PENDIENTE} que el Dueño corrigió y volvió a solicitar
     * ({@code cantidadResolicitudes > 0}), la más antigua primero. Cada una trae el comercio completo (con
     * los datos fiscales), el número de intento, el motivo del rechazo que se corrigió y los campos que el
     * Dueño cambió (valor anterior y nuevo).
     */
    public List<ReSolicitudComercioAdminResponseDTO> listarResolicitudes() {
        List<Comercio> resolicitudes = comercioRepository
                .findByEstadoAndCantidadResolicitudesGreaterThan(EstadoComercio.PENDIENTE, 0).stream()
                .sorted(Comparator.comparing(Comercio::getFechaResolicitud, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(Comercio::getId))
                .toList();
        if (resolicitudes.isEmpty()) {
            return List.of();
        }
        List<ComercioAdminResponseDTO> comerciosDTO = aAdminResponseDTOConContextoDelDueno(resolicitudes);

        Map<Integer, HistorialEstadoComercio> filaDeLaResolicitud = new LinkedHashMap<>();
        Map<Integer, String> motivoAnterior = new LinkedHashMap<>();
        for (Comercio comercio : resolicitudes) {
            historialEstadoComercioRepository
                    .findTopByComercioIdAndEstadoDestinoOrderByIdDesc(comercio.getId(), EstadoComercio.PENDIENTE)
                    .ifPresent(fila -> filaDeLaResolicitud.put(comercio.getId(), fila));
            historialEstadoComercioRepository
                    .findTopByComercioIdAndEstadoDestinoOrderByIdDesc(comercio.getId(), EstadoComercio.RECHAZADO)
                    .ifPresent(fila -> motivoAnterior.put(comercio.getId(), fila.getMotivo()));
        }
        Map<Integer, List<CambioComercioResponseDTO>> cambiosPorHistorial = new LinkedHashMap<>();
        if (!filaDeLaResolicitud.isEmpty()) {
            List<Integer> historialIds = filaDeLaResolicitud.values().stream().map(HistorialEstadoComercio::getId).toList();
            for (HistorialCambioComercio cambio : historialCambioComercioRepository.findByHistorialEstadoComercioIdIn(historialIds)) {
                cambiosPorHistorial.computeIfAbsent(cambio.getHistorialEstadoComercio().getId(), id -> new ArrayList<>())
                        .add(new CambioComercioResponseDTO(cambio.getCampo(), cambio.getValorAnterior(), cambio.getValorNuevo()));
            }
        }

        int maximo = resolicitudesProperties.getMax();
        List<ReSolicitudComercioAdminResponseDTO> resultado = new ArrayList<>();
        for (int i = 0; i < resolicitudes.size(); i++) {
            Comercio comercio = resolicitudes.get(i);
            HistorialEstadoComercio fila = filaDeLaResolicitud.get(comercio.getId());
            List<CambioComercioResponseDTO> cambios = fila == null ? List.of() : cambiosPorHistorial.getOrDefault(fila.getId(), List.of());
            String motivo = motivoAnterior.get(comercio.getId());
            resultado.add(new ReSolicitudComercioAdminResponseDTO(comerciosDTO.get(i), comercio.getCantidadResolicitudes(), maximo,
                    comercio.getFechaResolicitud(), motivo == null || motivo.isBlank() ? null : motivo,
                    comercio.getCantidadResolicitudes() >= maximo, cambios));
        }
        return resultado;
    }

    private List<ComercioAdminResponseDTO> aAdminResponseDTOConContextoDelDueno(List<Comercio> comercios) {
        if (comercios.isEmpty()) {
            return List.of();
        }
        Set<Integer> duenoIds = comercios.stream().map(c -> c.getDueno().getId()).collect(Collectors.toSet());
        Map<Integer, List<Comercio>> comerciosPorDueno = comercioRepository.findByDuenoIdIn(duenoIds).stream()
                .sorted(Comparator.comparing(Comercio::getFechaRegistro).thenComparing(Comercio::getId))
                .collect(Collectors.groupingBy(c -> c.getDueno().getId()));
        List<Integer> todosLosIds = comerciosPorDueno.values().stream()
                .flatMap(List::stream).map(Comercio::getId).toList();
        Set<Integer> aprobadosAlgunaVez = aprobacionPreviaDueno.idsAprobadosAlgunaVez(todosLosIds);

        return comercios.stream()
                .map(comercio -> {
                    Integer duenoId = comercio.getDueno().getId();
                    List<Comercio> otros = comerciosPorDueno.getOrDefault(duenoId, List.of()).stream()
                            .filter(otro -> !otro.getId().equals(comercio.getId()))
                            .toList();
                    boolean esAdicional = otros.stream().anyMatch(otro -> aprobacionPreviaDueno.tuvoAprobacion(otro, aprobadosAlgunaVez));
                    List<OtroComercioDuenoResponseDTO> otrosDTO = otros.stream()
                            .map(otro -> new OtroComercioDuenoResponseDTO(
                                    otro.getId(), otro.getNombre(), otro.getEstado(), otro.getFotoPerfilUrl()))
                            .toList();
                    return aAdminResponseDTO(comercio, duenoId, esAdicional, otrosDTO);
                })
                .toList();
    }

    /**
     * Todos los comercios, en cualquier estado ({@code PENDIENTE}, {@code APROBADO}, {@code APTO_VENTA},
     * {@code RECHAZADO}, {@code RECHAZO_DEFINITIVO}, {@code SUSPENDIDO}, {@code CERRADO_TEMPORALMENTE} e
     * {@code INACTIVO}), por id ascendente. El Administrador ve todos sin importar el estado: el filtro anterior
     * (aprobados y suspendidos) dejaba afuera, por ejemplo, a un comercio cerrado temporalmente y no se podía
     * llegar a su equipo desde la lista. Cada fila trae su estado; las pantallas de solicitudes siguen mostrando
     * solo los pendientes.
     */
    @Transactional(readOnly = true)
    public List<ComercioAdminResponseDTO> listarComercios() {
        List<Comercio> comercios = comercioRepository.findAllParaListadoAdmin();
        if (comercios.isEmpty()) {
            return List.of();
        }
        List<Integer> ids = comercios.stream().map(Comercio::getId).toList();
        Map<Integer, Direccion> direcciones = new HashMap<>();
        for (Direccion direccion : direccionRepository.findByComercioIdInConLocalidad(ids)) {
            direcciones.putIfAbsent(direccion.getComercio().getId(), direccion);
        }
        LocalDate hoy = disponibilidadComercioService.ahora().toLocalDate();
        Map<Integer, List<Horario>> horarios = horarioRepository.findVigentesDesdeIn(ids, hoy).stream()
                .filter(h -> DisponibilidadComercioService.vigenteEn(h, hoy))
                .sorted(Comparator.comparing(Horario::getId))
                .collect(Collectors.groupingBy(h -> h.getComercio().getId()));
        Map<Integer, List<RedSocial>> redes = redSocialRepository.findByComercioIdInAndFechaBajaIsNull(ids).stream()
                .sorted(Comparator.comparing(RedSocial::getId))
                .collect(Collectors.groupingBy(r -> r.getComercio().getId()));
        java.util.Set<Integer> sinEmailSuspension = new java.util.HashSet<>(
                notificacionRepository.findComercioIdsConUltimoEmailFallido(TipoNotificacion.COMERCIO_SUSPENDIDO));
        java.util.Set<Integer> sinEmailLevantamiento = new java.util.HashSet<>(
                notificacionRepository.findComercioIdsConUltimoEmailFallido(TipoNotificacion.SUSPENSION_LEVANTADA));
        return comercios.stream()
                .map(comercio -> construirAdminResponseDTO(comercio, direcciones.get(comercio.getId()),
                        horarios.getOrDefault(comercio.getId(), List.of()),
                        redes.getOrDefault(comercio.getId(), List.of()), null, false, List.of(),
                        comercio.getEstado() == EstadoComercio.SUSPENDIDO
                                ? sinEmailSuspension.contains(comercio.getId())
                                : sinEmailLevantamiento.contains(comercio.getId())))
                .toList();
    }

    public List<ClienteAdminResponseDTO> listarClientes() {
        java.util.Set<Integer> sinEmailSuspension = new java.util.HashSet<>(
                notificacionRepository.findUsuarioIdsConUltimoEmailFallido(TipoNotificacion.CLIENTE_SUSPENDIDO));
        java.util.Set<Integer> sinEmailLevantamiento = new java.util.HashSet<>(
                notificacionRepository.findUsuarioIdsConUltimoEmailFallido(TipoNotificacion.SUSPENSION_LEVANTADA));
        return clienteRepository.findAll().stream()
                .map(cliente -> aClienteAdminResponseDTO(cliente, sinEmailSuspension, sinEmailLevantamiento))
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
        long comerciosPendientes = comercioRepository.countByEstadoAndCantidadResolicitudes(EstadoComercio.PENDIENTE, 0);
        long resolicitudesPendientes = comercioRepository
                .countByEstadoAndCantidadResolicitudesGreaterThan(EstadoComercio.PENDIENTE, 0);
        return new MetricasAdminResponseDTO(
                comerciosPendientes,
                resolicitudesPendientes,
                comercioRepository.count(),
                clienteRepository.count(),
                categoriaRepository.countByActivoTrue(),
                tagRepository.countByActivoTrue(),
                documentoComercioRepository.countByEstado(EstadoDocumentoComercio.PENDIENTE));
    }

    /**
     * Aprueba o rechaza una solicitud de comercio (nueva o re-solicitud). Al rechazar, el destino es
     * {@code RECHAZADO} (el Dueño puede corregir y volver a solicitar) o {@code RECHAZO_DEFINITIVO} (sin
     * salida desde la aplicación): definitivo si el Administrador lo pide ({@code definitivo = true}) o si es
     * una re-solicitud y el comercio ya usó todos sus intentos ({@code comercio.resolicitudes.max}); esto
     * último lo decide el servidor, no la pantalla.
     * <p>
     * Concurrencia: orden de bloqueo {@code dueno} → {@code cuenta_mercado_pago} → {@code comercio}. Primero
     * se lee solo el id del Dueño con una consulta escalar (sin cargar ni bloquear el comercio), después, solo
     * al aprobar, se lee el estado de la cuenta del Dueño con bloqueo compartido (si está {@code BLOQUEADO} el
     * comercio no queda a la venta: pasa a {@code CERRADO_TEMPORALMENTE} con una segunda fila automática de
     * historial) y se toma la cuenta de Mercado Pago con bloqueo (decide {@code APROBADO} vs
     * {@code APTO_VENTA}); recién después se bloquea el comercio ({@code FOR UPDATE}) y se revalida su
     * estado. Dos resoluciones simultáneas del mismo comercio se ejecutan una detrás de la otra y la segunda
     * ve que ya no está {@code PENDIENTE} ({@code 409}); una vinculación de Mercado Pago que llegue a mitad
     * de una aprobación espera y después ve el comercio aprobado (ver docs/APRENDIZAJES-TECNICOS.md).
     */
    public void resolverAprobacion(Integer comercioId, Integer administradorId, AprobacionComercioRequestDTO request) {
        boolean aprobar = Boolean.TRUE.equals(request.getAprobar());
        boolean pedidoDefinitivo = Boolean.TRUE.equals(request.getDefinitivo());
        if (!aprobar && (request.getMotivo() == null || request.getMotivo().isBlank())) {
            throw new ValidacionException("El motivo es obligatorio al rechazar un comercio");
        }
        if (aprobar && pedidoDefinitivo) {
            throw new ValidacionException("El rechazo definitivo solo se puede indicar al rechazar un comercio");
        }

        Integer duenoId = comercioRepository.findDuenoIdById(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        Administrador administrador = administradorRepository.findById(administradorId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Administrador no encontrado"));

        AptitudVentaComercioService.EntradasDueno entradasDueno = aprobar ? aptitudVentaComercioService.leerDueno(duenoId) : null;

        Comercio comercio = comercioRepository.findByIdConBloqueo(comercioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Comercio no encontrado"));
        if (comercio.getEstado() != EstadoComercio.PENDIENTE) {
            throw new ConflictoDeNegocioException("El comercio ya fue resuelto");
        }

        boolean definitivo = !aprobar
                && (pedidoDefinitivo || comercio.getCantidadResolicitudes() >= resolicitudesProperties.getMax());
        EstadoComercio estadoOrigen = comercio.getEstado();
        EstadoComercio estadoDestino = aprobar ? EstadoComercio.APROBADO
                : definitivo ? EstadoComercio.RECHAZO_DEFINITIVO : EstadoComercio.RECHAZADO;
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

        EstadoComercio estadoFinal = estadoDestino;
        if (aprobar) {
            estadoFinal = aptitudVentaComercioService.recalcular(comercio, entradasDueno, MotivoRecalculo.COMERCIO_APROBADO,
                    entradasDueno.bloqueado() ? AptitudVentaComercioService.DETALLE_BLOQUEO_VIGENTE_AL_APROBAR : null, false);
        }

        String mensaje;
        if (definitivo) {
            mensaje = "Tu comercio " + comercio.getNombre() + " fue rechazado de forma definitiva. Motivo: " + request.getMotivo();
        } else if (!aprobar) {
            mensaje = "Tu comercio " + comercio.getNombre() + " fue rechazado. Motivo: " + request.getMotivo();
        } else if (estadoFinal == EstadoComercio.APTO_VENTA) {
            mensaje = "Tu comercio " + comercio.getNombre() + " fue aprobado y ya podés vender";
        } else {
            mensaje = "Tu comercio " + comercio.getNombre() + " fue aprobado";
        }
        TipoNotificacion tipo = aprobar ? TipoNotificacion.COMERCIO_APROBADO : TipoNotificacion.COMERCIO_RECHAZADO;

        notificacionService.crearParaDueno(comercio.getDueno().getId(), comercio.getId(), mensaje,
                tipo, TipoEntidadNotificacion.COMERCIO, comercio.getId());
    }

    private ComercioAdminResponseDTO aAdminResponseDTO(Comercio comercio, Integer duenoId, boolean esAdicional,
            List<OtroComercioDuenoResponseDTO> otrosComercios) {
        Direccion direccion = direccionRepository.findByComercioId(comercio.getId()).orElse(null);
        LocalDate hoy = disponibilidadComercioService.ahora().toLocalDate();
        List<Horario> horarios = DisponibilidadComercioService.vigentesEn(
                horarioRepository.findVigentesDesde(comercio.getId(), hoy), hoy);
        List<RedSocial> redes = redSocialRepository.findByComercioIdAndFechaBajaIsNull(comercio.getId());
        return construirAdminResponseDTO(comercio, direccion, horarios, redes, duenoId, esAdicional, otrosComercios, false);
    }

    private ComercioAdminResponseDTO construirAdminResponseDTO(Comercio comercio, Direccion direccion,
            List<Horario> horariosComercio, List<RedSocial> redesComercio, Integer duenoId, boolean esAdicional,
            List<OtroComercioDuenoResponseDTO> otrosComercios, boolean ultimoEmailAvisoFallido) {
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

        List<HorarioResponseDTO> horarios = horariosComercio.stream()
                .map(this::aResponseDTO)
                .toList();

        RepresentanteResponseDTO representante = aRepresentanteResponseDTO(comercio.getDueno().getPersonaFisica());

        List<RedSocialResponseDTO> redesSociales = redesComercio.stream()
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
                comercio.getDueno().getPersonaJuridica().getTipoSociedad(),
                comercio.getDueno().getPersonaJuridica().getDomicilioFiscal(),
                comercio.getDueno().getPersonaJuridica().getFechaInicioActividades(),
                comercio.getFechaRegistro(),
                direccionDTO,
                horarios,
                representante,
                redesSociales,
                duenoId,
                esAdicional,
                otrosComercios,
                comercio.getSuspensionOrigen(),
                comercio.getSuspendidoDesde(),
                comercio.getMotivoSuspension(),
                ultimoEmailAvisoFallido);
    }

    private EstadoUsuario estadoPrevioSuspension(Integer usuarioId) {
        return historialEstadoUsuarioRepository.findTopByUsuarioIdAndEstadoDestinoOrderByIdDesc(usuarioId, EstadoUsuario.SUSPENDIDO)
                .map(HistorialEstadoUsuario::getEstadoOrigen)
                .orElse(null);
    }

    private ClienteAdminResponseDTO aClienteAdminResponseDTO(Cliente cliente, java.util.Set<Integer> sinEmailSuspension,
            java.util.Set<Integer> sinEmailLevantamiento) {
        PersonaFisica personaFisica = cliente.getPersonaFisica();
        Usuario usuario = personaFisica.getPersona().getUsuario();
        boolean emailFallido = usuario.getEstado() == EstadoUsuario.SUSPENDIDO
                ? sinEmailSuspension.contains(usuario.getId())
                : sinEmailLevantamiento.contains(usuario.getId());
        return new ClienteAdminResponseDTO(
                cliente.getId(),
                personaFisica.getNombre(),
                personaFisica.getApellido(),
                personaFisica.getDni(),
                personaFisica.getPersona().getUsuario().getEmail(),
                personaFisica.getPersona().getUsuario().getEstado(),
                personaFisica.getPersona().getUsuario().getFechaRegistro(),
                personaFisica.getPersona().getUsuario().getMotivoSuspension(),
                personaFisica.getPersona().getUsuario().getSuspendidoDesde(),
                emailFallido,
                usuario.getEstado() == EstadoUsuario.SUSPENDIDO ? estadoPrevioSuspension(usuario.getId()) : null);
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
