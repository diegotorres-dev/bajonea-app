package com.bajonea.backend.dto.response;

import java.time.LocalDate;
import lombok.Getter;

/**
 * Datos de {@code Cliente} atravesando la cadena {@code Cliente → PersonaFisica → Persona →
 * Usuario} (mismo patrón de acceso ya usado en {@code AdministradorService} para
 * {@code Comercio → PersonaJuridica}). {@code dni}/{@code fechaNacimiento}/{@code email}
 * quedan de solo lectura acá — no hay endpoint que los edite (Fase 16a).
 * <p>
 * {@code direccion} se suma en el Tramo 16.3 (ver docs/DECISIONES.md, ampliación formal
 * mismo criterio que {@code Sesion}/{@code Horario}): de solo lectura, expone la única
 * dirección del Cliente para que el checkout de delivery (C14) pueda mostrarla y mandar su
 * {@code id} en {@code PedidoRequestDTO}. No implica CRUD de direcciones — eso sigue fuera de
 * alcance (gap que bloquea C41).
 */
@Getter
public class ClienteResponseDTO {

    private final Integer id;
    private final String nombre;
    private final String apellido;
    private final String dni;
    private final LocalDate fechaNacimiento;
    private final String telefono;
    private final String email;
    private final DireccionResponseDTO direccion;
    private final String fotoPerfilUrl;

    public ClienteResponseDTO(
            Integer id, String nombre, String apellido, String dni, LocalDate fechaNacimiento, String telefono,
            String email, DireccionResponseDTO direccion, String fotoPerfilUrl) {
        this.id = id;
        this.nombre = nombre;
        this.apellido = apellido;
        this.dni = dni;
        this.fechaNacimiento = fechaNacimiento;
        this.telefono = telefono;
        this.email = email;
        this.direccion = direccion;
        this.fotoPerfilUrl = fotoPerfilUrl;
    }
}
