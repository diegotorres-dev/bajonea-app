package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.ClienteEditarPerfilRequestDTO;
import com.bajonea.backend.dto.response.ClienteResponseDTO;
import com.bajonea.backend.dto.response.DireccionResponseDTO;
import com.bajonea.backend.entities.Cliente;
import com.bajonea.backend.entities.Direccion;
import com.bajonea.backend.entities.PersonaFisica;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.DireccionRepository;
import com.bajonea.backend.repositories.PersonaFisicaRepository;
import com.bajonea.backend.repositories.UsuarioRepository;
import com.bajonea.backend.util.TextoUtils;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Autoservicio de perfil del propio Cliente (Fase 16a). {@code Cliente.id} comparte PK con
 * {@code Usuario.id} vía la cadena {@code @MapsId} (Fase 4: Cliente → PersonaFisica → Persona
 * → Usuario), así que {@code usuarioId} del JWT resuelve directo con
 * {@code clienteRepository.findById}, sin query intermedia — a diferencia de
 * {@code ComercioService}, donde {@code Comercio.id} es autogenerado y distinto de
 * {@code PersonaJuridica.id}. Sin CRUD de direcciones ni baja de cuenta — confirmado fuera de
 * alcance de esta fase. {@code direccion} en la respuesta (Tramo 16.3) es de solo lectura,
 * mismo criterio.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ClienteService {

    private final ClienteRepository clienteRepository;
    private final PersonaFisicaRepository personaFisicaRepository;
    private final DireccionRepository direccionRepository;
    private final UsuarioRepository usuarioRepository;

    public ClienteResponseDTO verPerfil(Integer usuarioId) {
        Cliente cliente = obtenerCliente(usuarioId);
        return aResponseDTO(cliente);
    }

    public ClienteResponseDTO editarPerfil(Integer usuarioId, ClienteEditarPerfilRequestDTO request) {
        Cliente cliente = obtenerCliente(usuarioId);
        PersonaFisica personaFisica = cliente.getPersonaFisica();

        personaFisica.setNombre(TextoUtils.aTitleCase(request.getNombre()));
        personaFisica.setApellido(TextoUtils.aTitleCase(request.getApellido()));
        personaFisica.setTelefono(request.getTelefono());
        personaFisica.setFechaModificacion(LocalDateTime.now());
        personaFisicaRepository.save(personaFisica);

        Usuario usuario = personaFisica.getPersona().getUsuario();
        usuario.setFechaActualizacion(LocalDateTime.now());
        usuarioRepository.save(usuario);

        return aResponseDTO(cliente);
    }

    private Cliente obtenerCliente(Integer usuarioId) {
        return clienteRepository.findById(usuarioId)
                .orElseThrow(() -> new RecursoNoEncontradoException("Cliente no encontrado"));
    }

    private ClienteResponseDTO aResponseDTO(Cliente cliente) {
        PersonaFisica personaFisica = cliente.getPersonaFisica();
        Direccion direccion = direccionRepository.findByClienteId(cliente.getId()).orElse(null);
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

        Usuario usuario = personaFisica.getPersona().getUsuario();
        return new ClienteResponseDTO(
                cliente.getId(),
                personaFisica.getNombre(),
                personaFisica.getApellido(),
                personaFisica.getDni(),
                personaFisica.getFechaNacimiento(),
                personaFisica.getTelefono(),
                usuario.getEmail(),
                direccionDTO,
                usuario.getFotoPerfilUrl());
    }
}
