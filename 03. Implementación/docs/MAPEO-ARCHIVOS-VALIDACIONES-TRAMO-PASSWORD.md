# Mapeo pantallas ↔ archivos — Perfeccionamiento de validaciones: cambio y recuperación de contraseña

Continuación directa del tramo de perfeccionamiento de validaciones anterior
(`docs/MAPEO-ARCHIVOS-VALIDACIONES-TRAMO-PERFIL-CLIENTE-COMERCIO.md`). Corrige un único hallazgo
de fondo, puramente de texto: el mensaje de formato inválido de contraseña ("La [nueva] contraseña
debe tener al menos 8 caracteres, una mayúscula y un número.") no mencionaba la exigencia de
minúscula que `esPasswordSegura`/`@ValidarPasswordSegura` ya exigen desde antes de este tramo —
duplicado igual en 3 lugares del frontend. Sin cambios de lógica de validación en ningún archivo,
backend ni frontend.

**Auditoría previa confirmada sin discrepancias:** los 3 lugares y el texto exacto descriptos en el
prompt coincidían con el código real. Se encontró además un 4to lugar no mencionado en el prompt —
el hint estático (siempre visible, no solo en error) debajo del campo de `recuperar-password.html`
paso 3 — con el mismo texto desactualizado. Confirmado con Diego antes de tocarlo: se incluye en
el alcance del tramo para que el hint permanente y el mensaje de error digan lo mismo.

---

## Texto nuevo (idéntico al mensaje default de `@ValidarPasswordSegura` en el backend)

> "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número."

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/js/cliente.js:305` | Mensaje de `mostrarErrorCampo('error-password-nueva', ...)` en `initPerfil` (formulario "Cambiar contraseña" de Cliente) actualizado al texto nuevo. |
| `frontend/js/comercio.js:1016` | Mismo cambio, formulario "Cambiar contraseña" de Comercio. |
| `frontend/js/auth.js:1498` | Mensaje de `mostrarErrorCampo('error-nuevaPassword', ...)` en `initRecuperarPasswordSolicitar` (paso 3 de recuperación de contraseña) actualizado al texto nuevo. |
| `frontend/recuperar-password.html:71` | Hint estático (`<p class="field__hint">`) del paso 3, siempre visible bajo el campo `Nueva contraseña`, actualizado al mismo texto (4to lugar, agregado con confirmación de Diego, fuera del prompt original). |

Ningún archivo de validador (`js/validators.js`, `PasswordSeguraValidator.java`,
`ValidarPasswordSegura.java`) fue tocado — la lógica ya era correcta, confirmado antes de tocar
nada.

---

## Nota de entorno — mismo hallazgo del tramo anterior, repetido para que quede documentado en este tramo también

El perfil Spring `test` sigue apuntando a `bajonea_test` (`application-test.properties`), no a
`bajonea_final`. La primera ronda de este tramo arrancó el backend con `-Dspring-boot.run.profiles=test`
para poder usar `TestController` (atajo de código de verificación) — se registraron ahí 2 cuentas
de prueba, se detectó el error antes de dar nada por probado (`SELECT` contra `bajonea_final` no
encontraba las cuentas recién creadas), y esas 2 cuentas se limpiaron por completo de
`bajonea_test` antes de continuar (confirmado con `SELECT`, solo quedaron las 2 fixtures
preexistentes de `e2e.validaciones.*`, ajenas a este tramo). El backend se reinició sin perfil
(`bajonea_final` real) y toda la evidencia de este documento es contra esa base, con los códigos
de verificación/recuperación leídos directo de la tabla `token` vía `mysql.exe`.

**Aprobación del comercio de prueba:** para llegar a `comercio-perfil.html` (bloqueada por guard de
estado mientras el comercio está `PENDIENTE`) se aprobó el comercio de prueba con un `UPDATE`
directo (`comercio.estado = 'APROBADO'`) en vez de loguearse como `admin@bajonea.com` — la cuenta
de administrador real no fue tocada en este tramo (el tramo anterior ya había dejado registrada su
contraseña resetera, `Admin1234`, pero no hizo falta usarla acá). El comercio de prueba y toda su
fila derivada se eliminaron por completo al finalizar.

---

## Verificado en esta sesión (evidencia real, contra `bajonea_final`)

Cuentas de prueba registradas por API: Cliente `testtramopwd@bajonea.test` (id 142) y
Comercio/Dueño `testtramocomercio@bajonea.test` (id 143, comercio id 51) — verificadas con el
código real leído de la tabla `token`, sin `TestController`.

**Parte 1 — Cambio de contraseña desde perfil (`perfil.html` y `comercio-perfil.html`,
`POST /auth/cambiar-password`):**

Mismos 3 casos probados en navegador real (JS ejecutado vía `javascript_tool`, disparando eventos
`input`/`submit` reales sobre el DOM cargado — no simulado) para ambos roles:

- Formato inválido (`PASSWORD1`, sin minúscula) → `error-password-nueva` muestra
  "Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número." — Cliente y Comercio.
- Vacío → sigue mostrando "Ingresá una nueva contraseña." sin regresión — Cliente y Comercio.
- Válido (`Nuevapass2`, con minúscula) → formulario redirige a `login.html` con banner
  "Tu contraseña se actualizó...", confirmado con `curl` real: login con `Nuevapass2` → `200` con
  JWT; login con la contraseña vieja (`Testpass1`) → `401`. `SELECT password_hash FROM usuario`
  confirma un hash BCrypt nuevo — Cliente y Comercio.

**Parte 2 — Recuperación de contraseña, paso 3 (`recuperar-password.html`,
`POST /auth/recuperar-password/confirmar`):**

Flujo completo real de 3 pasos recorrido en el navegador (solicitud de código → llenado de los 6
inputs OTP con el código real leído de `token` → paso 3):

- Formato inválido (`PASSWORD1`) → mismo mensaje nuevo en `error-nuevaPassword`.
- Vacío → "Ingresá una nueva contraseña." sin regresión.
- Válido (`Recuperada3`, con minúscula) → pantalla de éxito "Contraseña actualizada", confirmado
  con `curl`: login con `Recuperada3` → `200`; login con la contraseña anterior (`Nuevapass2`) →
  `401`.
- Hint estático del paso 3 confirmado con el texto nuevo tanto antes de tocar el campo (carga
  inicial de la pantalla) como durante el resto del flujo.

**Backend — sin regresión de `@ValidarPasswordSegura`:**

`POST /auth/registro/cliente` con `password: "PASSWORD1"` → `400`,
`"password: Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"` (mismo texto
default de la anotación, sin cambios), sin persistir ninguna fila.

**Limpieza de datos de prueba:** cuentas Cliente (id 142) y Comercio/Dueño (id 143, comercio id 51)
creadas para este tramo, junto con todas sus filas derivadas (`persona`, `persona_fisica`,
`persona_juridica`, `dueno`, `comercio`, `direccion`, `horario`, `red_social`, `carrito`,
`item_carrito`, `token`, `sesion`), eliminadas de `bajonea_final` al finalizar — confirmado con
`SELECT` posterior, cero filas remanentes. Las 2 cuentas creadas por error contra `bajonea_test`
durante el diagnóstico del perfil `test` también se eliminaron por completo de esa base. Ninguna
cuenta demo ni de tramos anteriores fue tocada.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del prompt (Parte 1 + Parte 2) | 2 |
| Punto agregado con confirmación de Diego (hint estático) | 1 |
| Archivos frontend modificados | 4 (`js/cliente.js`, `js/comercio.js`, `js/auth.js`, `recuperar-password.html`) |
| Archivos backend modificados | 0 |
| Bugs reales encontrados en el camino | 0 |

**Pendiente de confirmación del usuario:** este tramo no se da por cerrado hasta que Diego confirme
el checklist punto por punto.
