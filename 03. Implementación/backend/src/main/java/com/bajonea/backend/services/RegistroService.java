package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.DireccionRequestDTO;
import com.bajonea.backend.dto.request.HorarioRequestDTO;
import com.bajonea.backend.dto.request.RedSocialRequestDTO;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
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
import com.bajonea.backend.enums.DiaSemana;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoToken;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.exceptions.ValidacionException;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.HorarioRepository;
import com.bajonea.backend.repositories.LocalidadRepository;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.repositories.PersonaJuridicaRepository;
import com.bajonea.backend.repositories.PersonaRepository;
import com.bajonea.backend.repositories.RedSocialRepository;
import com.bajonea.backend.repositories.TokenRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.util.ComercioValidaciones;
import com.bajonea.backend.util.TextoUtils;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
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
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

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
    private final LocalidadRepository localidadRepository;
    private final TokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    public UsuarioResponseDTO registrarCliente(RegistroClienteRequestDTO request) {
        validarEmailUnico(request.getEmail());
        if (personaFisicaRepository.existsByDni(request.getDni())) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese DNI");
        }
        Localidad localidad = obtenerLocalidad(request.getDireccion().getLocalidadId());

        Usuario usuario = crearUsuario(request.getEmail(), request.getPassword(), RolUsuario.CLIENTE, request.getFotoPerfilUrl());
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
        if (personaJuridicaRepository.existsByCuit(request.getCuit())) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese CUIT");
        }
        if (personaFisicaRepository.existsByDni(request.getDniRepresentante())) {
            throw new ConflictoDeNegocioException("Ya existe una cuenta registrada con ese DNI");
        }
        validarHorarios(request.getHorarios());
        validarRedesSociales(request.getRedesSociales());
        ComercioValidaciones.validarModalidadesEntrega(request.isAceptaDelivery(), request.isAceptaRetiro());
        Localidad localidad = obtenerLocalidad(request.getDireccion().getLocalidadId());

        Usuario usuario = crearUsuario(request.getEmail(), request.getPassword(), RolUsuario.DUENO, null);
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

        Comercio comercio = Comercio.builder()
                .dueno(dueno)
                .nombre(TextoUtils.aTitleCase(request.getNombre()))
                .descripcion(request.getDescripcion())
                .telefono(request.getTelefono())
                .email(request.getEmailContacto())
                .tipoComercio(request.getTipoComercio())
                .aceptaDelivery(request.isAceptaDelivery())
                .aceptaRetiro(request.isAceptaRetiro())
                .estado(EstadoComercio.PENDIENTE)
                .fechaRegistro(LocalDateTime.now())
                .fotoPerfilUrl(request.getFotoPerfilUrl())
                .build();
        comercioRepository.save(comercio);

        Direccion direccion = construirDireccion(request.getDireccion(), localidad);
        direccion.setComercio(comercio);
        direccionRepository.save(direccion);

        guardarHorarios(request.getHorarios(), comercio);
        guardarRedesSociales(request.getRedesSociales(), comercio);

        enviarVerificacion(usuario);

        return aResponseDTO(usuario);
    }

    private void validarRedesSociales(List<RedSocialRequestDTO> redesSociales) {
        long tiposUnicos = redesSociales.stream().map(RedSocialRequestDTO::getTipo).distinct().count();
        if (tiposUnicos != redesSociales.size()) {
            throw new ValidacionException("No podés cargar dos redes sociales del mismo tipo");
        }
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

    private static final Map<DiaSemana, String> LABELS_DIA_SEMANA = Map.of(
            DiaSemana.LUNES, "Lunes",
            DiaSemana.MARTES, "Martes",
            DiaSemana.MIERCOLES, "Miércoles",
            DiaSemana.JUEVES, "Jueves",
            DiaSemana.VIERNES, "Viernes",
            DiaSemana.SABADO, "Sábado",
            DiaSemana.DOMINGO, "Domingo");

    private void validarHorarios(List<HorarioRequestDTO> horarios) {
        for (HorarioRequestDTO horario : horarios) {
            if (!horario.getHoraCierre().isAfter(horario.getHoraApertura())) {
                throw new ValidacionException("La hora de cierre debe ser posterior a la hora de apertura");
            }
        }
        for (int i = 0; i < horarios.size(); i++) {
            HorarioRequestDTO actual = horarios.get(i);
            for (int j = i + 1; j < horarios.size(); j++) {
                HorarioRequestDTO otro = horarios.get(j);
                if (actual.getDiaSemana() != otro.getDiaSemana()) {
                    continue;
                }
                boolean seSuperponen = actual.getHoraApertura().isBefore(otro.getHoraCierre())
                        && otro.getHoraApertura().isBefore(actual.getHoraCierre());
                if (seSuperponen) {
                    throw new ValidacionException(String.format(
                            "Ya tenés un horario cargado el %s de %s a %s, que se superpone con este",
                            LABELS_DIA_SEMANA.get(otro.getDiaSemana()), otro.getHoraApertura(), otro.getHoraCierre()));
                }
            }
        }
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
        return localidadRepository.findById(localidadId)
                .orElseThrow(() -> new RecursoNoEncontradoException("La localidad indicada no existe"));
    }

    private Usuario crearUsuario(String email, String password, RolUsuario rol, String fotoPerfilUrl) {
        Usuario usuario = Usuario.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .rol(rol)
                .estado(EstadoUsuario.PENDIENTE)
                .intentosFallidos(0)
                .fotoPerfilUrl(fotoPerfilUrl)
                .fechaRegistro(LocalDateTime.now())
                .build();
        return usuarioRepository.save(usuario);
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
        // Código numérico de 6 dígitos, no UUID — pensado para tipeo manual en la pantalla
        // de verificación (Tramo 16.11, punto 2, ver docs/DECISIONES.md). Mismo formato que
        // genera AuthService.generarValorToken para este mismo TipoToken.
        Token token = Token.builder()
                .usuario(usuario)
                .tipo(TipoToken.VERIFICACION_EMAIL)
                .token(String.format("%06d", SECURE_RANDOM.nextInt(1_000_000)))
                .fechaCreacion(LocalDateTime.now())
                .fechaVencimiento(LocalDateTime.now().plusHours(EXPIRACION_VERIFICACION_EMAIL_HORAS))
                .estado(EstadoToken.PENDIENTE)
                .intentosFallidos(0)
                .build();
        tokenRepository.save(token);

        emailService.enviarVerificacion(usuario.getEmail(), token.getToken());
    }

    private UsuarioResponseDTO aResponseDTO(Usuario usuario) {
        return new UsuarioResponseDTO(
                usuario.getId(), usuario.getEmail(), usuario.getRol(), usuario.getEstado(), usuario.getFotoPerfilUrl());
    }
}
