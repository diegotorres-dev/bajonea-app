package com.bajonea.backend.config.security;

/**
 * Comercio sobre el que opera el Dueño autenticado en la request actual, resuelto en un único
 * punto por {@link ComercioActivoArgumentResolver} (header {@code X-Comercio-Id}). Los controllers
 * de operaciones del Comercio lo declaran como parámetro en vez de leer {@code AuthenticatedUser}
 * y buscar el comercio a mano. {@code duenoId} es el id del usuario Dueño (mismo id que
 * {@code Usuario}/{@code Dueno}), necesario donde el actor queda registrado (ej. historial de pedido).
 */
public record ComercioActivo(Integer comercioId, Integer duenoId) {
}
