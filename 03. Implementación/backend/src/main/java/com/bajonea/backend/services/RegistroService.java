package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.DireccionRequestDTO;
import com.bajonea.backend.dto.request.RegistroClienteRequestDTO;
import com.bajonea.backend.dto.request.RegistroComercioRequestDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Comercio;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.Localidad;
import com.bajonea.backend.entities.Persona;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.PersonaJuridica;
import com.bajonea.backend.entities.Token;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.enums.EstadoComercio;
import com.bajonea.backend.enums.EstadoUsuario;
import com.bajonea.backend.enums.RolUsuario;
import com.bajonea.backend.enums.TipoToken;
import com.bajonea.backend.exceptions.ConflictoDeNegocioException;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.ComercioRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.LocalidadRepository;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.repositories.PersonaJuridicaRepository;
import com.bajonea.backend.repositories.PersonaRepository;
import com.bajonea.backend.repositories.TokenRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alta de Cliente y Comercio: cadena {@code Usuario → Persona → PersonaFisica/PersonaJuridica
 * → Cliente/Comercio} (`@MapsId` encadenado, Fase 4) + `Direccion` inicial + `Token` de
 * verificación de email. No incluye login — eso es responsabilidad de {@code AuthService}
 * (Fase 7).
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
    private final DireccionRepository direccionRepository;
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

        Usuario usuario = crearUsuario(request.getEmail(), request.getPassword(), RolUsuario.CLIENTE);
        Persona persona = crearPersona(usuario);

        PersonaFisica personaFisica = PersonaFisica.builder()
                .persona(persona)
                .nombre(request.getNombre())
                .apellido(request.getApellido())
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
        Localidad localidad = obtenerLocalidad(request.getDireccion().getLocalidadId());

        Usuario usuario = crearUsuario(request.getEmail(), request.getPassword(), RolUsuario.COMERCIO);
        Persona persona = crearPersona(usuario);

        PersonaJuridica personaJuridica = PersonaJuridica.builder()
                .persona(persona)
                .razonSocial(request.getRazonSocial())
                .cuit(request.getCuit())
                .condicionIva(request.getCondicionIva())
                .tipoSociedad(request.getTipoSociedad())
                .domicilioFiscal(request.getDomicilioFiscal())
                .fechaInicioActividades(request.getFechaInicioActividades())
                .build();
        personaJuridicaRepository.save(personaJuridica);

        Comercio comercio = Comercio.builder()
                .personaJuridica(personaJuridica)
                .nombre(request.getNombre())
                .descripcion(request.getDescripcion())
                .telefono(request.getTelefono())
                .email(request.getEmailContacto())
                .tipoComercio(request.getTipoComercio())
                .aceptaDelivery(request.isAceptaDelivery())
                .aceptaRetiro(request.isAceptaRetiro())
                .estado(EstadoComercio.PENDIENTE)
                .fechaRegistro(LocalDateTime.now())
                .build();
        comercioRepository.save(comercio);

        Direccion direccion = construirDireccion(request.getDireccion(), localidad);
        direccion.setComercio(comercio);
        direccionRepository.save(direccion);

        enviarVerificacion(usuario);

        return aResponseDTO(usuario);
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

    private Usuario crearUsuario(String email, String password, RolUsuario rol) {
        Usuario usuario = Usuario.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .rol(rol)
                .estado(EstadoUsuario.PENDIENTE)
                .intentosFallidos(0)
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
                .calle(request.getCalle())
                .numero(request.getNumero())
                .pisoDepto(request.getPisoDepto())
                .codigoPostal(request.getCodigoPostal())
                .localidad(localidad)
                .eliminada(false)
                .fechaCreacion(LocalDateTime.now())
                .build();
    }

    private void enviarVerificacion(Usuario usuario) {
        Token token = Token.builder()
                .usuario(usuario)
                .tipo(TipoToken.VERIFICACION_EMAIL)
                .token(UUID.randomUUID().toString())
                .fechaCreacion(LocalDateTime.now())
                .fechaVencimiento(LocalDateTime.now().plusHours(EXPIRACION_VERIFICACION_EMAIL_HORAS))
                .usado(false)
                .build();
        tokenRepository.save(token);

        emailService.enviarVerificacion(usuario.getEmail(), token.getToken());
    }

    private UsuarioResponseDTO aResponseDTO(Usuario usuario) {
        return new UsuarioResponseDTO(usuario.getId(), usuario.getEmail(), usuario.getRol(), usuario.getEstado());
    }
}
