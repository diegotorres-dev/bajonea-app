package com.bajonea.backend.exceptions;

import com.bajonea.backend.dto.response.ApiResponse;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

/**
 * Todas las respuestas de error del proyecto usan {@link ApiResponse}, sin excepción
 * (regla transversal 3, CLAUDE.md) — nunca un cuerpo suelto ni un string plano.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Última línea de defensa contra condiciones de carrera check-then-act sobre validaciones
     * de unicidad (ej. dos registros simultáneos con el mismo DNI/CUIT/email, ver
     * docs/CONCURRENCIA-Y-TRANSACCIONES.md) — el {@code UNIQUE} de la base rechaza el segundo
     * INSERT y esta excepción lo traduce a 409 en vez de dejar pasar un 500 sin manejar.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<?>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiResponse<>("Ya existe un registro con alguno de los datos ingresados", null));
    }

    @ExceptionHandler(RecursoNoEncontradoException.class)
    public ResponseEntity<ApiResponse<?>> handleRecursoNoEncontrado(RecursoNoEncontradoException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiResponse<>(ex.getMessage(), null));
    }

    @ExceptionHandler(CredencialesInvalidasException.class)
    public ResponseEntity<ApiResponse<?>> handleCredencialesInvalidas(CredencialesInvalidasException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiResponse<>(ex.getMessage(), null));
    }

    @ExceptionHandler(ConflictoDeNegocioException.class)
    public ResponseEntity<ApiResponse<?>> handleConflictoDeNegocio(ConflictoDeNegocioException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiResponse<>(ex.getMessage(), null));
    }

    @ExceptionHandler(ValidacionException.class)
    public ResponseEntity<ApiResponse<?>> handleValidacion(ValidacionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiResponse<>(ex.getMessage(), null));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<?>> handleMethodArgumentNotValid(MethodArgumentNotValidException ex) {
        String mensaje = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiResponse<>(mensaje, null));
    }

    /**
     * Ej. {@code GET /geografia/localidades} sin {@code provinciaId}. Sin este handler, Spring
     * resuelve la excepción con {@code response.sendError(...)}, que dispara un forward interno
     * a {@code /error} — enmascarado como {@code 401} por Spring Security si esa ruta no es
     * pública (ver el javadoc de {@code RUTAS_PUBLICAS} en {@code SecurityConfig}, agregado en
     * la misma sesión que este handler). Este handler evita el forward por completo, escribiendo
     * la respuesta directo.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<?>> handleMissingServletRequestParameter(MissingServletRequestParameterException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(ex.getParameterName() + ": parámetro requerido ausente", null));
    }
}
