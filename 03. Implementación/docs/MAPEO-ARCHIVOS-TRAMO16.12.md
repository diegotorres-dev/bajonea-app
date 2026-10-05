# Mapeo pantallas ↔ archivos — Tramo 16.12 (seguridad y validaciones críticas)

Tramo de corrección, no un tramo de contenido nuevo de la guía — 8 bugs críticos de seguridad/validación detectados en testing manual post-cierre de Fase 16 (registro de una sesión anterior; esta sesión solo hace el cierre formal). Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO16.11.md`: se mapea punto↔archivos en vez de pantalla↔archivos.

Todo lo documentado acá fue re-verificado contra el estado real del código en esta sesión (lectura directa de cada archivo, `grep` de referencias rotas, `./mvnw compile`), no solo tomado de la memoria de la sesión anterior — ver `docs/DECISIONES.md`, entrada "Tramo 16.12" del 2026-07-28, para el detalle completo de decisiones y bugs encontrados durante la implementación original.

---

## Punto 1/2 — Validaciones de registro-cliente + errores inline (registro y login)

| Archivo | Cambio |
|---|---|
| `backend/.../exceptions/GlobalExceptionHandler.java` | `handleMethodArgumentNotValid` suma un `Map<String, String>` (`{campo: mensaje}`) en el campo `data` de `ApiResponse`, además del `mensaje` concatenado que ya devolvía (se mantiene como fallback). |
| `backend/.../dto/request/DireccionRequestDTO.java` | `calle` suma `@Pattern` exigiendo al menos una letra o dígito (rechaza "solo caracteres especiales"); `numero` suma `@Pattern(regexp="^\\d+$")` (rechaza letras). Compartido con `RegistroComercioRequestDTO` — el fix alcanza a ambos formularios sin tocar el DTO de comercio. |
| `backend/.../dto/request/RegistroClienteRequestDTO.java` | `email` suma `@Pattern` con regex que exige dominio con punto, además del `@Email` de Hibernate Validator (antes dejaba pasar valores como `"0@0"`). |
| `frontend/js/validators.js` | Funciones nuevas: `mostrarErrorCampo`/`limpiarErrorCampo` (errores inline debajo de cada input), `mapearErroresBackend` (traduce el `data` estructurado del backend a los inputs), `esCalleValida`/`esNumeroDireccionValido`/`esCodigoPostalValido` (validación de formato en el cliente, espejo de las reglas del backend). |
| `frontend/registro-cliente.html` / `frontend/js/auth.js` (`initRegistroCliente`) | Nombre/apellido/DNI/fecha de nacimiento/email/calle/número/código postal validados en tiempo real (blur) vía `bindValidacionCampo`, y el botón "Continuar" del step 1 **bloquea el avance real** al step 2 si alguno es inválido (antes solo corría `reportValidity()` + password + términos). Texto de requisitos de password y error de Términos movidos de un banner arriba del formulario a `field__hint`/`field__error` debajo de su campo. |
| `frontend/login.html` / `frontend/js/auth.js` (`initLogin`) | Campos vacíos y credenciales inválidas (`401`) muestran error inline reusando `#error-credenciales` (con `input-shell--error` en los campos), en vez de un banner técnico arriba del formulario. `409` (bloqueo/verificación pendiente/inactivo) sigue usando banner, pero con copy humano vía el mapa `MENSAJES_LOGIN_CONFLICTO` en vez del mensaje crudo del backend. |
| `frontend/registro-comercio.html` | **Sin cambios** — el fix de `calle`/`numero` en `DireccionRequestDTO` lo protege a nivel backend (mismo DTO compartido), pero no se agregó validación inline en el frontend de este formulario; el pedido original (Diego) estaba acotado a registro-cliente. |

---

## Punto 3 — Token de 6 dígitos para los 3 tipos + eliminación de endpoints por link

| Archivo | Cambio |
|---|---|
| `backend/.../services/AuthService.java` | `generarValorToken` deja de distinguir por tipo — los 3 tipos (`VERIFICACION_EMAIL`, `RECUPERACION_PASSWORD`, `REACTIVACION_CUENTA`) generan siempre un código de 6 dígitos, extendiendo la decisión ya tomada para `VERIFICACION_EMAIL` en el Tramo 16.11. `generarToken` suma reintento ante colisión (`DataIntegrityViolationException`, hasta `MAX_INTENTOS_GENERACION_TOKEN`, relanza si se agotan) — bug real encontrado y corregido en este mismo tramo, sin este fix un choque de código se traducía en un `409` genérico. `obtenerTokenValidoPorCodigo(email, codigo, tipo)` generaliza la lógica de `verificarEmailConCodigo` (Tramo 16.11) para los 3 tipos. `obtenerTokenValido(String token)` (por valor crudo, sin email) queda **solo** para `verificarEmail(String token)` — sin tocar, sigue siendo la excepción de compatibilidad para Postman/`TestSupportService`. |
| `backend/.../dto/request/ConfirmarRecuperacionPasswordRequestDTO.java` | Repuesto in-place: pasa de `{token, nuevaPassword}` a `{email, codigo, nuevaPassword}` — mismo endpoint `POST /auth/recuperar-password/confirmar`, cuerpo distinto (no es un endpoint nuevo en paralelo). |
| `backend/.../dto/request/ConfirmarReactivacionCuentaRequestDTO.java` | Nuevo — `{email, codigo}`, para el `POST /auth/reactivar-cuenta/confirmar` reescrito (antes `GET .../confirmar/{token}`). |
| `backend/.../controllers/AuthController.java` | `reactivarCuenta` cambia de `GET /reactivar-cuenta/confirmar/{token}` a `POST /reactivar-cuenta/confirmar` con `@RequestBody ConfirmarReactivacionCuentaRequestDTO`. `GET /verificar/{token}` (Tramo 16.11) queda sin tocar. |
| `backend/.../config/security/SecurityConfig.java` | `RUTAS_PUBLICAS`: `/api/v1/auth/reactivar-cuenta/confirmar/**` (wildcard, para el path var viejo) pasa a `/api/v1/auth/reactivar-cuenta/confirmar` (exacto, ya no hay path var). |
| `frontend/recuperar-password-confirmar.html` | **Eliminado** — sin otra función más que el flujo por link que dejó de existir. |
| `frontend/reactivar-cuenta-confirmar.html` | **Eliminado** — ídem. |
| `frontend/js/auth.js` | `initRecuperarPasswordConfirmar`/`initReactivarCuentaConfirmar` removidas por completo (reemplazadas por el paso 2 embebido de los puntos 4/5, ver abajo). |

Verificado en esta sesión: `grep` global sobre `backend/`, `frontend/` y `postman/` no encuentra ninguna referencia activa a `recuperar-password-confirmar.html`, `reactivar-cuenta-confirmar.html`, ni a los 2 endpoints viejos por link — las únicas coincidencias de esos 2 nombres de archivo en todo el repo son las entradas históricas de `docs/DECISIONES.md` y `docs/MAPEO-ARCHIVOS-TRAMO1.md` (donde se documentó su creación original en el Tramo 1), no referencias de código.

---

## Puntos 4/5 — Pantallas de ingreso de código embebidas (recuperación y reactivación)

| Archivo | Cambio |
|---|---|
| `frontend/recuperar-password.html` | Suma un paso 2 en la misma página (`#codigo-container`): código de 6 dígitos + nueva contraseña + confirmación, botón "Reenviar código" — mismo patrón multi-estado que `verificar-email.html` desde el Tramo 16.11 (sin `?token=`, sin archivo `-confirmar.html` separado). |
| `frontend/reactivar-cuenta.html` | Suma el mismo paso 2, solo con el campo de código (sin contraseña). |
| `frontend/js/auth.js` (`initRecuperarPasswordSolicitar`, `initReactivarCuentaSolicitar`) | Reescritas: manejan los 2 pasos en una sola función — solicitud de código (`POST /auth/recuperar-password` / `POST /auth/reactivar-cuenta`), reenvío, y confirmación (`POST /auth/recuperar-password/confirmar` / `POST /auth/reactivar-cuenta/confirmar`) con `{email, codigo, ...}`. Input de código filtra a solo dígitos en tiempo real (`/\D/g`). |

---

## Punto 6 — User enumeration en recuperación/reactivación de cuenta

| Archivo | Cambio |
|---|---|
| `backend/.../services/AuthService.java` | `solicitarRecuperacionPassword`/`solicitarReactivacionCuenta` pasan de `usuarioRepository.findByEmail(...).orElseThrow(...)` a `.ifPresent(...)` — nunca más lanzan `RecursoNoEncontradoException`/`ConflictoDeNegocioException` por email inexistente (antes esas excepciones llegaban a `GlobalExceptionHandler` sin que nada las interceptara, filtrando `404`/`409` reales pese a que el controller ya devolvía un mensaje 200 "genérico" que nunca se alcanzaba en esos casos). `solicitarReactivacionCuenta` distingue dentro del `ifPresent`: `INACTIVO` → genera y envía el código real; `ACTIVO` → dispara `enviarCuentaYaActiva` (nuevo) en vez del código; cualquier otro estado (`BLOQUEADO`/`SUSPENDIDO`/`PENDIENTE`) sin efecto observable. |
| `backend/.../services/EmailService.java` | Método nuevo `enviarCuentaYaActiva` (informa que la cuenta ya está activa, sin código). `enviarRecuperacionPassword`/`enviarReactivacionCuenta` reescritos con lenguaje de "código para tipear", ya no arman ningún link. |
| `backend/.../controllers/AuthController.java` | Los 2 mensajes de respuesta (`solicitarRecuperacionPassword`/`solicitarReactivacionCuenta`) reescritos a neutros de verdad — el de reactivación decía literalmente "...y está inactiva", filtrando el estado en el propio texto "genérico". |
| `frontend/reactivar-cuenta.html` | Pierde el link "¿Te acordaste? Iniciá sesión" (no aplica al contexto de reactivación — confirmado ausente en el archivo actual). `recuperar-password.html` lo conserva (sí tiene sentido ahí, sin cambios). |
| `frontend/js/auth.js` | Campo de email vacío en ambas pantallas muestra error inline (`mostrarErrorCampo('error-email', ...)`) en vez de depender del `reportValidity()` nativo del navegador. |

---

## Punto 7 — Localidad "Tolhuin" ausente del catálogo geográfico

| Archivo | Cambio |
|---|---|
| `backend/src/main/resources/db/migration/V16__seed_localidad_tolhuin.sql` | Nuevo — `INSERT INTO localidad (id, nombre, provincia_id) VALUES ('940021', 'Tolhuin', '94') ON DUPLICATE KEY UPDATE ...`. Excepción puntual: Tolhuin existe en el endpoint `/municipios` de Georef, no en `/localidades` (`0` resultados confirmados contra la API real) — el ETL (`etl-georef.mjs`) solo consulta `/localidades`, así que ninguna reejecución la iba a traer. Se resuelve vía migración Flyway (no por el script) para que se aplique automáticamente en cualquier ambiente, incluido el despliegue real, sin depender de un paso manual adicional. |
| `docs/modelo-mvp.md` | Tabla `localidad` documenta la excepción puntual (Tramo 16.12) con el motivo y el id reutilizado de `/municipios`. |

---

## Punto 8 — `Usuario.fecha_actualizacion` no se actualizaba al editar perfil de Cliente

| Archivo | Cambio |
|---|---|
| `backend/.../services/ClienteService.java` | `editarPerfil` suma `usuarioRepository.save(usuario)` con `usuario.setFechaActualizacion(LocalDateTime.now())`, además del `personaFisicaRepository.save(personaFisica)` que ya hacía. Se inyectó `UsuarioRepository` (no estaba presente antes). |

**Fuera de alcance de este punto, dejado como observación (no verificado ni corregido en este tramo):** no se revisó si `ComercioService.editarPerfil` tiene el mismo gap en su propio flujo — el pedido original fue específico a Cliente.

---

## Verificado en esta sesión (cierre formal, sin reimplementar nada)

- `./mvnw compile` → `BUILD SUCCESS` (verificado dos veces: `-q` silencioso y modo verboso para confirmar el mensaje explícito).
- `grep` dirigido sobre `backend/src`, `frontend/` y `postman/` no encontró ningún path/método HTTP viejo (`GET /verificar/{token}` confirmado como la única excepción intencional que sigue viva) ni ninguna referencia a los 2 archivos `.html` eliminados fuera de las entradas históricas de `docs/DECISIONES.md`/`docs/MAPEO-ARCHIVOS-TRAMO1.md`.
- Los 3 DTOs de confirmación por código (`VerificarCodigoRequestDTO`, `ConfirmarRecuperacionPasswordRequestDTO`, `ConfirmarReactivacionCuentaRequestDTO`) confirmados con `@Pattern(regexp = "\\d{6}")` sobre `codigo`.
- `AuthController` leído completo: 12 endpoints, sin ningún `@GetMapping` con `{token}` salvo `/verificar/{token}` (excepción documentada).
- `ClienteService.editarPerfil` confirmado con el `save` de `Usuario` agregado.
- `docs/modelo-mvp.md` confirmado actualizado (tabla `localidad`, tabla `token`) — no se tocó en esta sesión, ya venía correcto de la sesión anterior.
- Cero comentarios (`//`, `/* */`, `<!-- -->`, excluyendo URLs) confirmado sobre los 7 archivos de `frontend/` tocados en este tramo (`verificar-email.html` sin cambios propios de este tramo, incluido igual en el barrido por prolijidad).
- `Token.java` (campo `intentosFallidos`) y `V15__token_intentos_fallidos.sql` confirmados como carryover del Tramo 16.11, **no** de este tramo — no se listan arriba como cambios de 16.12 para no atribuir incorrectamente ese trabajo.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 8 (1 y 2 se documentan combinados por compartir el mismo mecanismo de error estructurado) |
| Archivos backend modificados | 8 (`GlobalExceptionHandler.java`, `DireccionRequestDTO.java`, `RegistroClienteRequestDTO.java`, `ConfirmarRecuperacionPasswordRequestDTO.java`, `AuthController.java`, `AuthService.java`, `SecurityConfig.java`, `EmailService.java`, `ClienteService.java` — 9 en total) |
| Archivos backend nuevos | 2 (`ConfirmarReactivacionCuentaRequestDTO.java`, `V16__seed_localidad_tolhuin.sql`) |
| Endpoints backend con contrato cambiado | 2 (`POST /auth/recuperar-password/confirmar` — mismo path, body distinto; `POST /auth/reactivar-cuenta/confirmar` — antes `GET .../confirmar/{token}`) |
| Bugs reales encontrados y corregidos durante la implementación original (no reportados por el usuario) | 1 (colisión de código de token sin reintento) |
| Archivos frontend modificados | 6 (`registro-cliente.html`, `login.html`, `recuperar-password.html`, `reactivar-cuenta.html`, `js/auth.js`, `js/validators.js`) |
| Archivos frontend eliminados | 2 (`recuperar-password-confirmar.html`, `reactivar-cuenta-confirmar.html`) |

Este tramo queda pendiente del OK final de cierre de Diego (checklist 1-8, presentado aparte en la conversación) antes de poder considerarse parte del cierre global de la Fase 16 y avanzar a la Fase 17.
