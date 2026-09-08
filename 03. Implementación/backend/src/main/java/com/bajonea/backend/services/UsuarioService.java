package com.bajonea.backend.services;

import com.bajonea.backend.dto.request.FotoPerfilUsuarioRequestDTO;
import com.bajonea.backend.dto.response.CloudinarySignatureResponseDTO;
import com.bajonea.backend.dto.response.UsuarioResponseDTO;
import com.bajonea.backend.entities.Usuario;
import com.bajonea.backend.exceptions.RecursoNoEncontradoException;
import com.bajonea.backend.repositories.UsuarioRepository;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Autoservicio de foto de perfil genérico sobre {@code Usuario}, válido para cualquier rol
 * autenticado (Cliente, Comercio -aunque no la usa, tiene la suya propia en {@code Comercio}-,
 * Administrador, con vista a Dueño/Empleado a futuro) — un único endpoint en vez de uno por
 * rol. {@code {id}} de path se valida siempre contra el usuario autenticado del JWT: no existe
 * en el proyecto ningún patrón de "un rol actuando en nombre de otro usuario", así que un
 * {@code id} que no coincide con el propio se trata como recurso inexistente (404), mismo
 * criterio de aislamiento por tenant que el resto del proyecto (nunca 403).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class UsuarioService {

    private final UsuarioRepository usuarioRepository;
    private final CloudinaryService cloudinaryService;

    public CloudinarySignatureResponseDTO generarFirmaFotoPerfil(Integer idPath, Integer usuarioIdAutenticado) {
        validarPropioUsuario(idPath, usuarioIdAutenticado);
        return cloudinaryService.generarFirmaFotoPerfilUsuario(usuarioIdAutenticado);
    }

    public UsuarioResponseDTO actualizarFotoPerfil(
            Integer idPath, Integer usuarioIdAutenticado, FotoPerfilUsuarioRequestDTO request) {
        validarPropioUsuario(idPath, usuarioIdAutenticado);

        Usuario usuario = usuarioRepository.findById(usuarioIdAutenticado)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));

        usuario.setFotoPerfilUrl(request.getUrl());
        usuario.setFechaActualizacion(LocalDateTime.now());
        usuarioRepository.save(usuario);

        return aResponseDTO(usuario);
    }

    public UsuarioResponseDTO eliminarFotoPerfil(Integer idPath, Integer usuarioIdAutenticado) {
        validarPropioUsuario(idPath, usuarioIdAutenticado);

        Usuario usuario = usuarioRepository.findById(usuarioIdAutenticado)
                .orElseThrow(() -> new RecursoNoEncontradoException("Usuario no encontrado"));

        usuario.setFotoPerfilUrl(null);
        usuario.setFechaActualizacion(LocalDateTime.now());
        usuarioRepository.save(usuario);

        return aResponseDTO(usuario);
    }

    private void validarPropioUsuario(Integer idPath, Integer usuarioIdAutenticado) {
        if (!idPath.equals(usuarioIdAutenticado)) {
            throw new RecursoNoEncontradoException("Usuario no encontrado");
        }
    }

    private UsuarioResponseDTO aResponseDTO(Usuario usuario) {
        return new UsuarioResponseDTO(
                usuario.getId(), usuario.getEmail(), usuario.getRol(), usuario.getEstado(), usuario.getFotoPerfilUrl());
    }
}
