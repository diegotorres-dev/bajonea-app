# Mapeo pantallas ↔ archivos — Perfeccionamiento de validaciones: edición de perfil de Cliente y de Comercio

Continuación directa del tramo de perfeccionamiento de validaciones (mismo criterio ya aplicado a
los dos wizards de registro, `registro-cliente.html`/`registro-comercio.html`). Implementa lo
relevado en `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (secciones 1 y 2 de la Parte 1, y Parte 3
puntos 1 y 2) para `ClienteEditarPerfilRequestDTO` (`perfil.html`) y `ComercioPerfilRequestDTO`
(`comercio-perfil.html`).

**Discrepancia real encontrada en la auditoría previa (antes de escribir código), resuelta con
Diego:** el punto 2.5 del prompt (validar "al menos una modalidad de entrega" en el backend de
`editarPerfil`) describía un gap de backend que **ya estaba resuelto** — `ComercioValidaciones`
(`backend/src/main/java/com/bajonea/backend/util/ComercioValidaciones.java`) ya existía, extraída
de `RegistroService`, y `ComercioService.editarPerfil` ya la invocaba. Confirmado con Diego:
sin tocar ese código, solo verificar con evidencia real (ver Punto 5 abajo).

**Nota de entorno — descubrimiento durante la sesión:** el perfil Spring `test` apunta a
`bajonea_test` (`application-test.properties`), no a `bajonea_final` — una base separada usada
para los specs de Playwright (Fase 17), que se resetea sola en cada corrida de esa suite. La
primera ronda de pruebas de este tramo corrió sin querer contra `bajonea_test` (necesitaba
`TestController`, exclusivo del perfil `test`, para leer códigos de verificación/recuperación).
Detectado y corregido antes de dar nada por probado: el backend se reinició con el perfil por
defecto (`bajonea_final` real) y los códigos de verificación/recuperación se leyeron con `mysql.exe`
directo contra la tabla `token`, sin depender de `TestController`. Toda la evidencia de este
documento es contra `bajonea_final`.

---

## Punto 1.1 — `perfil.html` / `ClienteEditarPerfilRequestDTO`: `nombre`/`apellido`

| Archivo | Cambio |
|---|---|
| `backend/.../dto/request/ClienteEditarPerfilRequestDTO.java` | `@NotBlank` de `nombre`/`apellido` pasa de mensaje genérico ("No debe estar vacío") a específico por campo ("El nombre es obligatorio"/"El apellido es obligatorio"). `@ValidarNombrePropio` sin cambios (ya daba mensaje de formato distinto). |
| `frontend/js/validators.js` | Nueva función exportada `validarCamposRequeridosSilencioso(campos)` — variante de `validarCamposSilencioso` que separa `mensajeVacio`/`mensajeInvalido` por campo (mismo patrón que `validarCampoRequeridoYValido` de `auth.js`, pero reutilizable y exportado en vez de duplicado). |
| `frontend/js/cliente.js` | `initPerfil`: import de `esNombrePropioValido` y `validarCamposRequeridosSilencioso`; validación de `nombre`/`apellido` en el submit de `form-editar-datos` pasa a usar el validador con mensajes separados (vacío: "El nombre/apellido es obligatorio."; formato: "Debe contener solo letras, espacios y guiones", igual al mensaje default del backend). |
| `frontend/perfil.html` | `maxlength="100"` agregado a `#editar-nombre` y `#editar-apellido` (faltaba, backend ya limitaba a 100). |

## Punto 1.2 — `perfil.html` / `ClienteEditarPerfilRequestDTO`: `telefono`

| Archivo | Cambio |
|---|---|
| `backend/.../dto/request/ClienteEditarPerfilRequestDTO.java` | Sin cambios (ya separaba vacío/formato vía el fix transversal de `GlobalExceptionHandler`). |
| `frontend/js/cliente.js` | Mensaje único ("Ingresá un teléfono argentino válido...") separado en `mensajeVacio: 'Ingresá tu teléfono.'` / `mensajeInvalido` (el texto ya existente). Nuevo listener `input` en `#editar-telefono` que filtra a solo dígitos y trunca a 10 (`replace(/\D/g,'').slice(0,10)`), mismo patrón ya usado en `auth.js` para los wizards. |

## Punto 2.1 — `comercio-perfil.html` / `ComercioPerfilRequestDTO`: `nombre`

| Archivo | Cambio |
|---|---|
| `backend/.../dto/request/ComercioPerfilRequestDTO.java` | Sin cambios (ya separaba vacío/formato). |
| `frontend/js/comercio.js` | Mensaje único ("Ingresá el nombre de tu comercio.") separado en `mensajeVacio` (mismo texto) / `mensajeInvalido: 'El nombre no puede contener solo caracteres especiales.'`. `maxlength="150"` ya estaba en `comercio-perfil.html` (confirmado, sin cambio). |

## Punto 2.2 — `comercio-perfil.html` / `ComercioPerfilRequestDTO`: `descripcion`

| Archivo | Cambio |
|---|---|
| `backend/.../dto/request/ComercioPerfilRequestDTO.java` | `@Size(max = 2000)` suma mensaje en español: "La descripción no puede superar los 2000 caracteres." |
| `frontend/comercio-perfil.html` | Sin cambio — `maxlength="2000"` ya estaba presente en el `<textarea>`. |

## Punto 2.3 — `comercio-perfil.html` / `ComercioPerfilRequestDTO`: `telefono`

Mismo tratamiento que el Punto 1.2 (Cliente): backend sin cambios, `js/comercio.js` separa
`mensajeVacio: 'Ingresá tu teléfono.'` de `mensajeInvalido`, y suma el mismo listener de bloqueo
de teclado numérico en `#editar-telefono`.

## Punto 2.4 — `comercio-perfil.html` / `ComercioPerfilRequestDTO`: `emailContacto`

| Archivo | Cambio |
|---|---|
| `backend/.../dto/request/ComercioPerfilRequestDTO.java` | `@Email` + `@Pattern` redundante reemplazados por `@ValidarFormatoEmail(message = "Ingresá un email de contacto con formato válido")` (anotación custom blanco-tolerante ya existente en el proyecto, no reusada hasta ahora en este DTO). `@NotBlank` sin cambio de mensaje. |
| `frontend/js/comercio.js` | Mensaje único separado en `mensajeVacio: 'El email de contacto es obligatorio.'` / `mensajeInvalido` (el texto ya existente). |

## Punto 2.5 — `ComercioPerfilRequestDTO`: al menos una modalidad de entrega

**Sin cambios de código** — verificado que ya estaba resuelto (ver nota al inicio del documento).
`ComercioService.editarPerfil` invoca `ComercioValidaciones.validarModalidadesEntrega(...)` desde
antes de este tramo.

---

## Verificado en esta sesión (evidencia real, contra `bajonea_final`)

Cuentas de prueba registradas por API contra `bajonea_final` (no reutilizadas de las cuentas demo
persistentes, para no alterar sus datos): Cliente `e2e.validaciones.cliente@bajonea.test` (id 140)
y Comercio/Dueño `e2e.validaciones.comercio@bajonea.test` (id 141, comercio id 50) — ambas
verificadas con el código real leído de la tabla `token` vía `mysql.exe`, no con `TestController`.

**Backend (`curl` contra el backend real):**

- Cliente — `nombre` vacío → `"El nombre es obligatorio"`; `nombre` con dígitos → `"Debe contener solo letras, espacios y guiones"`; `apellido` vacío → `"El apellido es obligatorio"`; `telefono` vacío → `"No debe estar vacío"`; `telefono` con formato inválido → `"Ingresá un número de teléfono válido (cod. área + número)"`. Caso válido (`PUT /clientes/perfil`) → `200`, confirmado con `SELECT` directo contra `persona_fisica` (nombre/apellido/teléfono actualizados).
- Comercio — `nombre` vacío → `"No debe estar vacío"`; `nombre` con solo caracteres especiales (`"###"`) → `"Ingresá un nombre de comercio válido"`; `telefono` vacío → `"No debe estar vacío"`; `telefono` inválido → mensaje de formato específico; `emailContacto` vacío → `"No debe estar vacío"`; `emailContacto` inválido → `"Ingresá un email de contacto con formato válido"`; `descripcion` de 2001 caracteres → `"La descripción no puede superar los 2000 caracteres."`. Caso válido → `200`, confirmado con `SELECT` directo contra `comercio` (nombre/descripción/teléfono/email/modalidades actualizados).
- Punto 2.5 — `PUT /comercios/perfil` directo con `aceptaDelivery=false, aceptaRetiro=false` → rechazado con `"El comercio debe ofrecer al menos una modalidad de entrega (delivery o retiro)"`, sin persistir el cambio (confirmado: el `SELECT` posterior muestra el valor del último `PUT` válido, no el rechazado).

**Frontend (navegador real, `perfil.html` y `comercio-perfil.html`):**

- `perfil.html`: campo `Nombre` vacío → "El nombre es obligatorio." cerca del campo; `"Ana123"` → "Debe contener solo letras, espacios y guiones"; `Teléfono` vacío → "Ingresá tu teléfono."; tecleo de `abc12de3` en `Teléfono` → el campo retiene solo `123` (bloqueo de teclado confirmado); teléfono `123` → "Ingresá un teléfono argentino válido (código de área + número)."; guardado válido → toast "Datos actualizados correctamente", perfil recargado con los nuevos datos.
- `comercio-perfil.html`: mismos 3 pares vacío/formato verificados para `Nombre del comercio` ("Ingresá el nombre de tu comercio." / "El nombre no puede contener solo caracteres especiales."), `Teléfono de contacto` ("Ingresá tu teléfono." / "Ingresá un teléfono argentino válido (código de área + número)." + bloqueo de teclado confirmado igual que Cliente). De paso, se disparó sin querer el chequeo JS ya existente de "al menos una modalidad" (ambos switches en `false`) → "Debés ofrecer al menos una modalidad de entrega." — confirma que el chequeo de UI también sigue intacto. Guardado válido final → toast "Datos actualizados correctamente".
- Sin errores de consola en ningún paso (`read_console_messages` con `onlyErrors: true`, vacío).

**Sintaxis:** `validators.js`, `cliente.js` y `comercio.js` verificados con `node --check` sobre copias `.mjs` (método ya establecido en tramos de Fase 16, dado que la autodetección ESM de Node no siempre detecta errores en `.js` con `import`/`export` sin `package.json` de tipo módulo). `./mvnw compile` → `BUILD SUCCESS` sin errores tras los cambios de los 2 DTOs.

**Limpieza de datos de prueba:** cuentas Cliente (id 140) y Comercio/Dueño (id 141, comercio id 50)
creadas para este tramo, junto con todas sus filas derivadas (`persona`, `persona_fisica`,
`persona_juridica`, `dueno`, `direccion`, `horario`, `red_social`, `token`, `sesion`), eliminadas
de `bajonea_final` al finalizar — confirmado con `SELECT`/`COUNT` posterior, cero filas remanentes.
Las cuentas demo persistentes (`cliente.demo`, `comercio1.demo`, `comercio2.demo`) no fueron
tocadas en este tramo. La contraseña de `admin@bajonea.com` (no `admin@bajonea.ar`, corregido
durante la sesión) fue reseteada a `Admin1234` vía el flujo real de recuperación de contraseña
para poder consultar la base — mismo criterio ya usado en tramos anteriores, queda así, no se
revierte.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del prompt | 6 (1.1, 1.2, 2.1, 2.2, 2.3, 2.4) + 1 verificado sin cambios (2.5) |
| Archivos backend modificados | 2 (`ClienteEditarPerfilRequestDTO.java`, `ComercioPerfilRequestDTO.java`) |
| Archivos frontend modificados | 4 (`js/validators.js`, `js/cliente.js`, `js/comercio.js`, `perfil.html`) |
| Discrepancias encontradas entre el prompt y el código real | 1 (Punto 2.5, ya resuelto — confirmado con Diego antes de tocar código) |
| Bugs reales encontrados en el camino | 0 |

**Pendiente de confirmación del usuario:** este tramo no se da por cerrado hasta que Diego
confirme el checklist punto por punto.
