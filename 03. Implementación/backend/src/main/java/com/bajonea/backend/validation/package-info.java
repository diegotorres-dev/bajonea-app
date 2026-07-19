/**
 * Anotaciones de validación custom (Bean Validation) y sus {@code ConstraintValidator}.
 * <p>
 * Uso exclusivo en los DTOs de request ({@code com.bajonea.backend.dto.request}), nunca en
 * las Entities de JPA. Las Entities representan el dato ya persistido y válido; la
 * validación de entrada ocurre en el borde HTTP, sobre el DTO, disparada por {@code @Valid}
 * en la firma del método del controller (ver
 * {@code com.bajonea.backend.exceptions.GlobalExceptionHandler} para el manejo de
 * {@code MethodArgumentNotValidException}).
 */
package com.bajonea.backend.validation;
