package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.DatosNegocioComercioRequestDTO;
import com.bajonea.backend.dto.request.DireccionRequestDTO;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.DisponibilidadNombreUsuarioResponseDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Dueno;
import com.bajonea.backend.entities.Horario;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.Persona;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.PersonaJuridica;
import com.bajonea.backend.entities.RedSocial;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.repositories.PersonaJuridicaRepository;
import com.bajonea.backend.repositories.PersonaRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import com.bajonea.backend.validation.NombreUsuarioPolicy;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.util.TextoUtils;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alta de Cliente y Comercio: cadena {@code Usuario → Persona → PersonaFisica/PersonaJuridica
 * → Cliente/Comercio} (`@MapsId` encadenado, Fase 4) + `Direccion` inicial + `Token` de
 * verificación de email. No incluye login — eso es responsabilidad de {@code AuthService}
 * (Fase 7). El alta de Comercio persiste además la lista de {@code Horario} recibida (Fase
 * 16a) — al menos una franja obligatoria, sin endpoint de edición todavía — y la lista de
 * {@code RedSocial} recibida (Fase B del lote de ajustes post-migración): al menos una
 * obligatoria, hasta 5 como máximo, sin tipos repetidos dentro del mismo alta.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class RegistroService {

    private static final long EXPIRACION_VERIFICACION_EMAIL_HORAS = 24;

    private final UsuarioRepository usuarioRepository;
    private final PersonaRepository personaRepository;
    private final PersonaFisicaRepository personaFisicaRepository;
    private final PersonaJuridicaRepository personaJuridicaRepository;
    private final ClienteRepository clienteRepository;
    private final ComercioRepository comercioRepository;
    private final DuenoRepository duenoRepository;
    private final DireccionRepository direccionRepository;
    private final HorarioRepository horarioRepository;
    private final RedSocialRepository redSocialRepository;
    private final TokenService tokenService;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final ValidadorDatosNegocioComercio validadorDatosNegocio;

    public UsuarioResponseDTO registrarCliente(RegistroClienteRequestDTO request) {
        validarEmailUnico(request.getEmail());
        validarNombreUsuarioDisponible(request.getNombreUsuario());
        if (personaFisicaRepository.existsByDni(request.getDni())) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese DNI");
        }
        Localidad localidad = obtenerLocalidad(request.getDireccion().getLocalidadId());

        Usuario usuario = crearUsuario(request.getNombreUsuario(), request.getEmail(), request.getPassword(), RolUsuario.CLIENTE, request.getFotoPerfilUrl());
        Persona persona = crearPersona(usuario);

        PersonaFisica personaFisica = PersonaFisica.builder()
                .persona(persona)
                .nombre(TextoUtils.aTitleCase(request.getNombre()))
                .apellido(TextoUtils.aTitleCase(request.getApellido()))
                .dni(request.getDni())
                .fechaNacimiento(request.getFechaNacimiento())
                .telefono(request.getTelefono())
                .build();
        personaFisicaRepository.save(personaFisica);

        Cliente cliente = Cliente.builder().personaFisica(personaFisica).build();
        clienteRepository.save(cliente);

        Direccion direccion = construirDireccion(request.getDireccion(), localidad);
        direccion.setCliente(cliente);
        direccion.setPrincipal(true);
        direccionRepository.save(direccion);

        enviarVerificacion(usuario);

        return aResponseDTO(usuario);
    }

    public UsuarioResponseDTO registrarComercio(RegistroComercioRequestDTO request) {
        validarEmailUnico(request.getEmail());
        validarNombreUsuarioDisponible(request.getNombreUsuario());
        if (personaJuridicaRepository.existsByCuit(request.getCuit())) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese CUIT");
        }
        if (personaFisicaRepository.existsByDni(request.getDniRepresentante())) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese DNI");
        }
        Localidad localidad = validarDatosNegocio(request);

        Usuario usuario = crearUsuario(request.getNombreUsuario(), request.getEmail(), request.getPassword(), RolUsuario.DUENO, null);
        Persona persona = crearPersona(usuario);

        PersonaFisica personaFisica = PersonaFisica.builder()
                .persona(persona)
                .nombre(TextoUtils.aTitleCase(request.getNombreRepresentante()))
                .apellido(TextoUtils.aTitleCase(request.getApellidoRepresentante()))
                .dni(request.getDniRepresentante())
                .fechaNacimiento(request.getFechaNacimientoRepresentante())
                .telefono(request.getTelefonoRepresentante())
                .build();
        personaFisicaRepository.save(personaFisica);

        PersonaJuridica personaJuridica = PersonaJuridica.builder()
                .persona(persona)
                .razonSocial(TextoUtils.aTitleCase(request.getRazonSocial()))
                .cuit(request.getCuit())
                .condicionIva(request.getCondicionIva())
                .tipoSociedad(request.getTipoSociedad())
                .domicilioFiscal(request.getDomicilioFiscal())
                .fechaInicioActividades(request.getFechaInicioActividades())
                .build();
        personaJuridicaRepository.save(personaJuridica);

        Dueno dueno = Dueno.builder()
                .personaJuridica(personaJuridica)
                .personaFisica(personaFisica)
                .fechaCreacion(LocalDateTime.now())
                .build();
        duenoRepository.save(dueno);

        crearComercio(dueno, request, localidad);

        enviarVerificacion(usuario);

        return aResponseDTO(usuario);
    }

    /**
     * Crea un comercio {@code PENDIENTE} del Dueño con su dirección, horarios y redes sociales, tras
     * validar los datos del negocio (superposición de horarios, redes repetidas, modalidades de entrega
     * y localidad existente). Lo usa el alta del primer comercio ({@link #registrarComercio}) y el alta
     * de un comercio adicional; no escribe historial de estado (un comercio nace sin transiciones), no
     * envía emails ni toca ningún dato del Dueño. Corre dentro de la transacción del llamador.
     */
    public Comercio crearComercio(Dueno dueno, DatosNegocioComercioRequestDTO datos) {
        return crearComercio(dueno, datos, validarDatosNegocio(datos));
    }

    private Localidad validarDatosNegocio(DatosNegocioComercioRequestDTO datos) {
        return validadorDatosNegocio.validar(datos);
    }

    private Comercio crearComercio(Dueno dueno, DatosNegocioComercioRequestDTO datos, Localidad localidad) {
        Comercio comercio = Comercio.builder()
                .dueno(dueno)
                .nombre(TextoUtils.aTitleCase(datos.getNombre()))
                .descripcion(datos.getDescripcion())
                .telefono(datos.getTelefono())
                .email(datos.getEmailContacto())
                .tipoComercio(datos.getTipoComercio())
                .aceptaDelivery(datos.isAceptaDelivery())
                .aceptaRetiro(datos.isAceptaRetiro())
                .estado(EstadoComercio.PENDIENTE)
                .fechaRegistro(LocalDateTime.now())
                .fotoPerfilUrl(datos.getFotoPerfilUrl())
                .build();
        comercioRepository.save(comercio);

        Direccion direccion = construirDireccion(datos.getDireccion(), localidad);
        direccion.setComercio(comercio);
        direccionRepository.save(direccion);

        guardarHorarios(datos.getHorarios(), comercio);
        guardarRedesSociales(datos.getRedesSociales(), comercio);
        return comercio;
    }

    private void guardarRedesSociales(List<RedSocialRequestDTO> redesSociales, Comercio comercio) {
        List<RedSocial> entidades = redesSociales.stream()
                .map(r -> RedSocial.builder()
                        .comercio(comercio)
                        .tipo(r.getTipo())
                        .url(r.getUrl())
                        .fechaCreacion(LocalDateTime.now())
                        .build())
                .toList();
        redSocialRepository.saveAll(entidades);
    }

    private void guardarHorarios(List<HorarioRequestDTO> horarios, Comercio comercio) {
        List<Horario> entidades = horarios.stream()
                .map(h -> Horario.builder()
                        .comercio(comercio)
                        .diaSemana(h.getDiaSemana())
                        .horaApertura(h.getHoraApertura())
                        .horaCierre(h.getHoraCierre())
                        .build())
                .toList();
        horarioRepository.saveAll(entidades);
    }

    private void validarEmailUnico(String email) {
        if (usuarioRepository.existsByEmail(email)) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese email");
        }
    }

    private Localidad obtenerLocalidad(String localidadId) {
        return validadorDatosNegocio.obtenerLocalidad(localidadId);
    }

    @Transactional(readOnly = true)
    public DisponibilidadNombreUsuarioResponseDTO consultarDisponibilidadNombreUsuario(String nombreUsuario) {
        String normalizado = NombreUsuarioPolicy.normalizar(nombreUsuario);
        String mensaje = NombreUsuarioPolicy.mensajeDeFormatoInvalido(normalizado);
        if (mensaje != null) {
            throw new ValidacionException(mensaje);
        }
        boolean disponible = !NombreUsuarioPolicy.esReservado(normalizado)
                && !usuarioRepository.existsByNombreUsuario(normalizado);
        return new DisponibilidadNombreUsuarioResponseDTO(disponible);
    }

    private void validarNombreUsuarioDisponible(String nombreUsuario) {
        if (NombreUsuarioPolicy.esReservado(nombreUsuario) || usuarioRepository.existsByNombreUsuario(nombreUsuario)) {
            throw new ConflictoDeNegocioException(NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE);
        }
    }

    private Usuario crearUsuario(String nombreUsuario, String email, String password, RolUsuario rol, String fotoPerfilUrl) {
        Usuario usuario = Usuario.builder()
                .nombreUsuario(nombreUsuario)
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .rol(rol)
                .estado(EstadoUsuario.PENDIENTE)
                .intentosFallidos(0)
                .fotoPerfilUrl(fotoPerfilUrl)
                .fechaRegistro(LocalDateTime.now())
                .build();
        try {
            return usuarioRepository.saveAndFlush(usuario);
        } catch (DataIntegrityViolationException ex) {
            String detalle = String.valueOf(ex.getMostSpecificCause().getMessage());
            if (detalle.contains("uq_usuario_nombre_usuario")) {
                throw new ConflictoDeNegocioException(NombreUsuarioPolicy.MENSAJE_NO_DISPONIBLE);
            }
            if (detalle.contains("uq_usuario_email")) {
                throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese email");
            }
            throw ex;
        }
    }

    private Persona crearPersona(Usuario usuario) {
        Persona persona = Persona.builder().usuario(usuario).build();
        return personaRepository.save(persona);
    }

    private Direccion construirDireccion(DireccionRequestDTO request, Localidad localidad) {
        return Direccion.builder()
                .calle(TextoUtils.aTitleCase(request.getCalle()))
                .numero(request.getNumero())
                .pisoDepto(request.getPisoDepto())
                .codigoPostal(TextoUtils.normalizarCodigoPostal(request.getCodigoPostal()))
                .localidad(localidad)
                .eliminada(false)
                .fechaCreacion(LocalDateTime.now())
                .build();
    }

    private void enviarVerificacion(Usuario usuario) {
        Token token = tokenService.crear(usuario, TipoToken.VERIFICACION_EMAIL,
                LocalDateTime.now().plusHours(EXPIRACION_VERIFICACION_EMAIL_HORAS));

        emailService.enviarVerificacion(usuario.getEmail(), token.getToken());
    }

    private UsuarioResponseDTO aResponseDTO(Usuario usuario) {
        return new UsuarioResponseDTO(
                usuario.getId(), usuario.getEmail(), usuario.getRol(), usuario.getEstado(), usuario.getFotoPerfilUrl());
    }
}
