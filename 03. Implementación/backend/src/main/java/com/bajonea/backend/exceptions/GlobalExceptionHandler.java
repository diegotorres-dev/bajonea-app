package com.bajonea.backend.exceptions;

import com.bajonea.backend.dto.response.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import org.springframework.validation.FieldError;

import java.sql.SQLException;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Todas las respuestas de error del proyecto usan {@link ApiResponse}, sin excepción
 * (regla transversal 3, CLAUDE.md) — nunca un cuerpo suelto ni un string plano.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final int MYSQL_ERROR_DUPLICATE_ENTRY = 1062;

    /**
     * Última línea de defensa contra condiciones de carrera check-then-act sobre validaciones
     * de unicidad (ej. dos registros simultáneos con el mismo DNI/CUIT/email, ver
     * docs/CONCURRENCIA-Y-TRANSACCIONES.md) — el {@code UNIQUE} de la base rechaza el segundo
     * INSERT y esta excepción lo traduce a 409 en vez de dejar pasar un 500 sin manejar.
     *
     * {@code DataIntegrityViolationException} envuelve por igual violaciones de UNIQUE, de
     * NOT NULL y de FK — solo la primera es un conflicto real de datos del usuario. Las otras
     * dos son errores de programación (un campo obligatorio que el Service no completó, una
     * referencia a un id inexistente) y se distinguen mirando el código de error nativo de
     * MySQL en la causa más específica de la excepción (ver docs/DECISIONES.md, bug real de
     * Fase 1 encontrado en {@code DetallePedido.estado}).
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<?>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        Throwable causaRaiz = ex.getMostSpecificCause();
        boolean esViolacionUnique = causaRaiz instanceof SQLException sqlEx
                && sqlEx.getErrorCode() == MYSQL_ERROR_DUPLICATE_ENTRY;

        if (esViolacionUnique) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(new ApiResponse<>("Ya existe un registro con alguno de los datos ingresados", null));
        }

        log.error("Violación de integridad de datos no relacionada a UNIQUE (posible bug de programación)", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiResponse<>("No se pudo procesar la solicitud, intentá nuevamente", null));
    }

    @ExceptionHandler(RecursoNoEncontradoException.class)
    public ResponseEntity<ApiResponse<?>> handleRecursoNoEncontrado(RecursoNoEncontradoException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiResponse<>(ex.getMessage(), null));
    }

    @ExceptionHandler(CredencialesInvalidasException.class)
    public ResponseEntity<ApiResponse<?>> handleCredencialesInvalidas(CredencialesInvalidasException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiResponse<>(ex.getMessage(), ex.getData()));
    }

    @ExceptionHandler(ConflictoDeNegocioException.class)
    public ResponseEntity<ApiResponse<?>> handleConflictoDeNegocio(ConflictoDeNegocioException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiResponse<>(ex.getMessage(), null));
    }

    @ExceptionHandler(ValidacionException.class)
    public ResponseEntity<ApiResponse<?>> handleValidacion(ValidacionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiResponse<>(ex.getMessage(), null));
    }

    private static final List<String> CODIGOS_CAMPO_OBLIGATORIO = List.of("NotBlank", "NotNull", "NotEmpty");

    /**
     * {@code data} suma un mapa {@code {campo: mensaje}} (Tramo 16.12) para que el frontend
     * pueda mostrar cada error debajo de su input sin parsear el string de {@code mensaje} —
     * que se mantiene sin cambios, como fallback, para no romper ningún consumidor existente.
     *
     * <p>Cuando un campo viola dos o más anotaciones a la vez (ej. {@code @NotBlank} +
     * {@code @Pattern} con un valor vacío, que también falla el regex), Hibernate Validator no
     * garantiza en qué orden llegan las violaciones — sin ordenar, el mensaje que gana varía
     * de forma no determinística entre corridas de la misma request. Se ordenan las violaciones
     * de cada campo dejando siempre primero las de "obligatorio" ({@code @NotBlank}/
     * {@code @NotNull}/{@code @NotEmpty}), así el mensaje de "campo obligatorio" gana siempre
     * que el campo esté vacío, sin importar el orden interno de Hibernate Validator. Causa raíz
     * y evidencia real de la no determinicidad documentadas en {@code docs/DECISIONES.md}
     * (mini-tramo de arreglo transversal, tramo "02. Dirección" de registro-cliente.html).</p>
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<?>> handleMethodArgumentNotValid(MethodArgumentNotValidException ex) {
        Map<String, String> errores = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors().stream()
                .sorted(Comparator.comparingInt(GlobalExceptionHandler::prioridadDeCampoObligatorio))
                .forEach(error -> errores.putIfAbsent(error.getField(), error.getDefaultMessage()));
        String mensaje = errores.entrySet().stream()
                .map(entry -> entry.getKey() + ": " + entry.getValue())
                .collect(Collectors.joining("; "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiResponse<>(mensaje, errores));
    }

    private static int prioridadDeCampoObligatorio(FieldError error) {
        String codigo = error.getCode();
        if (codigo == null) {
            return 1;
        }
        boolean esObligatorio = CODIGOS_CAMPO_OBLIGATORIO.stream().anyMatch(codigo::startsWith);
        return esObligatorio ? 0 : 1;
    }

    /**
     * Ej. un {@code fechaNacimiento} con una fecha de calendario inexistente (30/02) en el
     * JSON del body — Jackson rechaza el {@code LocalDate} antes de que Bean Validation
     * llegue a correr, así que sin este handler nunca se dispara
     * {@code MethodArgumentNotValidException}. Mismo motivo que el handler de
     * {@code MissingServletRequestParameterException} de abajo: sin manejar explícitamente,
     * Spring resuelve con un forward interno a {@code /error} que Spring Security puede
     * enmascarar como 401 en una ruta pública.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<?>> handleHttpMessageNotReadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>("El cuerpo de la solicitud contiene datos con formato inválido", null));
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
