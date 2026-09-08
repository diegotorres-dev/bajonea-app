package com.bajonea.backend.dto.response;

import java.time.LocalDate;
import lombok.Getter;

/**
 * Datos de la {@code PersonaFisica} que representa a un {@code Comercio} (misma {@code Persona}
 * que su {@code PersonaJuridica}, ver docs/DECISIONES.md — corrección retroactiva a los Tramos
 * 16.1/16.8). Nunca se anida en un DTO alcanzable sin autenticación — solo en
 * {@code ComercioResponseDTO} (perfil propio) y {@code ComercioPendienteResponseDTO}
 * (admin-only). {@code CatalogoService}/{@code CatalogoController} usan
 * {@code ComercioPublicoResponseDTO}, que no tiene este campo.
 */
@Getter
public class RepresentanteResponseDTO {

    private final String nombre;
    private final String apellido;
    private final String dni;
    private final String telefono;
    private final LocalDate fechaNacimiento;

    public RepresentanteResponseDTO(String nombre, String apellido, String dni, String telefono, LocalDate fechaNacimiento) {
        this.nombre = nombre;
        this.apellido = apellido;
        this.dni = dni;
        this.telefono = telefono;
        this.fechaNacimiento = fechaNacimiento;
    }
}
