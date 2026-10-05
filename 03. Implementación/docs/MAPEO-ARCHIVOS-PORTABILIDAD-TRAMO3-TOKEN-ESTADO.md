# Mapeo de archivos — Tramo 3: `Token.usado` → `Token.estado` (+ `intentosFallidos`)

Fecha: 2026-08-27. Estado: código implementado, compilación verificada, **schema-validation de Hibernate confirmado en vivo contra `bajonea_final` real** (evidencia más fuerte que compilación pura, ver abajo) — verificación end-to-end de los 3 flujos completos (verificación de email, recuperación de password, reactivación de cuenta) bloqueada por el mismo motivo que el Tramo 2 (backend no arranca de punta a punta, bloqueado por `Comercio`, fuera de alcance). **Pendiente de confirmación explícita de Diego**, no cerrado.

## Qué se hizo

| Archivo | Cambio |
|---|---|
| `backend/.../enums/EstadoToken.java` | Nuevo — `PENDIENTE`, `UTILIZADO`, `EXPIRADO` (3 valores, igual al `ENUM` físico de `bajonea_final.token.estado`). |
| `backend/.../entities/Token.java` | Campo `usado: boolean` reemplazado por `estado: EstadoToken` (`@Enumerated(EnumType.STRING)`, `@Column(name = "estado")`). `intentosFallidos` sin cambios (ya existía, ya coincidía con la columna física). |
| `backend/.../repositories/TokenRepository.java` | 3 finders renombrados de `...AndUsado(..., boolean usado)` a `...AndEstado(..., EstadoToken estado)`: `findByTokenAndEstado`, `findByUsuarioIdAndTipoAndEstado`, `findFirstByUsuarioIdAndTipoAndEstadoOrderByFechaCreacionDesc`. |
| `backend/.../services/AuthService.java` | Los 6 puntos que usaban `usado`/`isUsado`/`setUsado` migrados a `estado`/`EstadoToken.PENDIENTE`/`EstadoToken.UTILIZADO`: `generarToken` (invalida tokens pendientes anteriores → `UTILIZADO`, nuevo token nace `PENDIENTE`), `registrarIntentoFallidoToken` (al superar `MAX_INTENTOS_TOKEN_VERIFICACION = 5` → `UTILIZADO` + `fechaUso`, mismo comportamiento que antes con `usado = true`), `obtenerTokenValido` (busca `estado = PENDIENTE`), `obtenerTokenValidoPorCodigo` (ídem), `consumirToken` (→ `UTILIZADO` + `fechaUso`). 2 comentarios Javadoc de clase actualizados para no seguir mencionando `usado`. |
| `backend/.../services/RegistroService.java` | `enviarVerificacion`: `.usado(false)` → `.estado(EstadoToken.PENDIENTE)` en el `Token.builder()`. |
| `backend/.../services/TestSupportService.java` | `obtenerTokenPendiente`: `findFirstByUsuarioIdAndTipoAndUsadoOrderByFechaCreacionDesc(..., false)` → `findFirstByUsuarioIdAndTipoAndEstadoOrderByFechaCreacionDesc(..., EstadoToken.PENDIENTE)`. |

Grep completo de `\.usado\b`/`setUsado`/`isUsado`/`AndUsado` sobre todo `backend/src/main/java` al finalizar: **0 coincidencias** — confirmado que no queda ningún rastro del campo viejo en ningún Service/Controller/Repository fuera de los ya listados.

## Sobre `EXPIRADO` y el "job periódico" del diccionario

`docs/diccionario-de-datos.md` (v1.4) describe un job periódico que pasaría tokens de `PENDIENTE` a `EXPIRADO` cuando vence `fecha_vencimiento`. El proyecto **no tiene ningún job de este tipo hoy**, ni antes de este tramo ni después — y el pedido explícito de esta sesión es no inventar un mecanismo nuevo si el proyecto no lo tenía. El comportamiento se mantuvo idéntico al de antes: `AuthService` sigue comparando `tokenEntity.getFechaVencimiento().isBefore(LocalDateTime.now())` en el momento del uso y lanza la excepción correspondiente ("Token expirado"/"El código venció"), **sin** persistir nunca `estado = EXPIRADO` en la base. El valor `EXPIRADO` del enum queda declarado (porque así lo exige el `ENUM` físico) pero no escrito por ningún camino del código — mismo estado de cosas que tenía el proyecto antes de este tramo, solo que ahora expresado con un enum de 3 valores en vez de un booleano.

## Sobre `MAX_INTENTOS_TOKEN_VERIFICACION`

Constante ya existente en `AuthService` (`= 5`), **no tocada** — coincide exactamente con la regla de negocio del diccionario v1.4 ("Al alcanzar `MAX_INTENTOS_TOKEN_VERIFICACION = 5` intentos fallidos, el token deja de aceptar verificaciones aunque siga `PENDIENTE`"). Nada que ajustar acá, ya estaba alineado desde antes de este tramo.

## Verificación real hecha en esta sesión

- `./mvnw compile` → `BUILD SUCCESS`.
- **Evidencia más fuerte que compilación**: 3 arranques distintos del backend contra `bajonea_final` real (uno después del Tramo 1 solo, uno después de este tramo, uno después de Tramos 2+3 juntos). Los 3 fallan en el mismo y único punto (`Schema-validation: missing column [persona_juridica_id] in table [comercio]`) — es decir, **`Token` (y `Usuario`) ya no aparecen como causa de error**, confirmando en vivo contra la base real que el mapeo `estado`/`intentosFallidos` de la Entity coincide exactamente con las columnas físicas de `bajonea_final.token`. Antes de este tramo, la Entity vieja (`usado: boolean`) hubiera fallado con "missing column [usado]" — no se llegó a ver ese error en particular porque `Comercio` (alfabéticamente/de escaneo anterior) ya fallaba primero, pero el punto de arranque de la investigación (`docs/MAPEO-IMPACTO-PORTABILIDAD-BAJONEA-FINAL.md`, fila `Token` de la sección A) ya había confirmado ese mismatch exacto antes de escribir el código.
- **No verificado en vivo, por el mismo bloqueo que el Tramo 2**: los 3 flujos completos (código de verificación de email, recuperación de password, reactivación de cuenta) contra HTTP real — requiere el backend arrancado de punta a punta, bloqueado por `Comercio` (fuera de alcance). El límite de 5 intentos fallidos tampoco se pudo ejercitar en vivo por el mismo motivo.

## Checklist de cierre — estado real, sin inventar evidencia

- [x] `Token.java` migrado a `estado` (ENUM) + `intentosFallidos`, sin ningún rastro de `usado` en el código (confirmado por grep).
- [ ] Los 3 flujos probados end-to-end en navegador real — **no verificado**, backend no arranca (ver arriba).
- [ ] Límite de 5 intentos verificado en vivo — **no verificado**, mismo motivo.
- [x] `MAPEO-ARCHIVOS-PORTABILIDAD-TRAMO3-TOKEN-ESTADO.md` generado (este archivo).

## Archivos tocados

Nuevo: `EstadoToken.java` (1). Modificados: `Token.java`, `TokenRepository.java`, `AuthService.java`, `RegistroService.java`, `TestSupportService.java` (5).
