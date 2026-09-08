package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * No incluye {@code estado}: nace {@code DISPONIBLE} por decisión del Service, y se cambia
 * después con {@code PATCH /productos/{id}/estado}, no editando el producto completo.
 * Tampoco incluye imágenes: la galería se gestiona aparte, vía firma de Cloudinary
 * ({@code POST /productos/{id}/cloudinary/firma}) y sus propios endpoints — no es un campo
 * de este DTO. {@code tagIds} sí va acá: la relación N:M con Tag no tiene endpoint propio,
 * se administra como parte del alta/edición del producto.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ProductoRequestDTO {

    @NotBlank(message = "No debe estar vacío")
    @Pattern(regexp = "^[\\p{L}0-9][\\p{L}0-9 ]*$", message = "Ingresá un nombre de producto válido (letras, números y espacios)")
    @Size(max = 150)
    private String nombre;

    @Size(max = 2000)
    private String descripcion;

    @NotNull(message = "No debe estar vacío")
    @Positive(message = "El precio debe ser mayor a $0")
    @Digits(integer = 8, fraction = 0, message = "El precio no puede tener más de 8 dígitos y no admite centavos")
    private BigDecimal precio;

    @NotNull
    private Integer categoriaId;

    @Size(max = 5, message = "No podés seleccionar más de 5 tags")
    private List<Integer> tagIds;
}
