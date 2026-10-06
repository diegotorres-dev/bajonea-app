package com.bajonea.backend.services;

import com.bajonea.backend.repositories.AdministradorRepository;
import com.bajonea.backend.repositories.ClienteRepository;
import com.bajonea.backend.repositories.DuenoRepository;
import com.bajonea.backend.repositories.EmpleadoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Matriz de roles del proyecto: Administrador = Administrador o Cliente, Dueño = Dueño o Cliente y
 * Empleado = Empleado o Cliente. No hay multirol físico ({@code usuario.rol} es una sola columna), así que
 * las capacidades de una cuenta son las filas de subtipo que existen para su id. El id del usuario es el
 * mismo en {@code administrador}, {@code dueno}, {@code cliente} y {@code empleado} (una sola persona cuelga
 * de todas las ramas), por lo que alcanza un {@code existsById} por tabla, sin joins. Por ahora solo se
 * construye y se hace cumplir "Empleado + Cliente" y que un Empleado nunca sea Dueño ni Administrador.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MatrizRolesService {

    private final AdministradorRepository administradorRepository;
    private final DuenoRepository duenoRepository;
    private final ClienteRepository clienteRepository;
    private final EmpleadoRepository empleadoRepository;

    public record Capacidades(boolean administrador, boolean dueno, boolean cliente, boolean empleado) {

        /**
         * Una cuenta puede ser a lo sumo una de las tres identidades principales (Administrador, Dueño o
         * Empleado); {@code Cliente} se combina con cualquiera de ellas.
         */
        public boolean esCombinacionValida() {
            int principales = (administrador ? 1 : 0) + (dueno ? 1 : 0) + (empleado ? 1 : 0);
            return principales <= 1;
        }

        public boolean puedeSerEmpleado() {
            return !administrador && !dueno;
        }
    }

    public Capacidades capacidadesDe(Integer usuarioId) {
        return new Capacidades(
                administradorRepository.existsById(usuarioId),
                duenoRepository.existsById(usuarioId),
                clienteRepository.existsById(usuarioId),
                empleadoRepository.existsById(usuarioId));
    }

    public boolean puedeSerEmpleado(Integer usuarioId) {
        return capacidadesDe(usuarioId).puedeSerEmpleado();
    }
}
