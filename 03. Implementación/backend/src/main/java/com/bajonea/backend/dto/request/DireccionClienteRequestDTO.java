package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Dirección que el Cliente guarda en "Mis direcciones". Suma el alias privado ({@code nombre}, repetible) y la
 * referencia de entrega al bloque de dirección compartido. {@code principal} solo lo lee el alta; la edición lo
 * ignora: la dirección predeterminada se cambia únicamente por su endpoint propio.
 */
@Getter
@Setter
@NoArgsConstructor
public class DireccionClienteRequestDTO extends DireccionRequestDTO {

    @Size(max = 40, message = "El nombre no puede superar los 40 caracteres")
    private String nombre;

    @Size(max = 150, message = "La referencia no puede superar los 150 caracteres")
    private String referencia;
}
