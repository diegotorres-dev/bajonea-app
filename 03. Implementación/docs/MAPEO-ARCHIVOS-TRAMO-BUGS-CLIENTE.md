# Mapeo del tramo — Corrección de los 3 bugs reales de la matriz de Postman (Cliente), 2026-09-03

Insumo: `docs/MAPEO-ARCHIVOS-TRAMO-MATRIZ-POSTMAN-CLIENTE.md` (Parte 3), que documentaba
estos 3 bugs sin corregirlos. **No cerrado — pendiente de confirmación explícita de Diego**,
mismo criterio que el resto de los tramos del proyecto.

---

## 1. Bug 1 — `FotoPerfilUsuarioRequestDTO.url` sin `@Size(max=500)` → 500 en vez de 400

- **Archivo:** [backend/src/main/java/com/bajonea/backend/dto/request/FotoPerfilUsuarioRequestDTO.java](../backend/src/main/java/com/bajonea/backend/dto/request/FotoPerfilUsuarioRequestDTO.java)
- **Fix:** agregado `@Size(max = 500, message = "La URL de la foto de perfil no puede
  superar los 500 caracteres")` al campo `url`, mismo criterio que `RegistroClienteRequestDTO.fotoPerfilUrl`
  (única otra URL de foto de perfil del proyecto, ya tenía este límite).
- **Evidencia real** (cliente de prueba registrado, verificado y logueado contra
  `bajonea_test`, `PATCH /api/v1/usuarios/{id}/foto-perfil`):
  - URL de 519 caracteres → antes `500` genérico, ahora `400` con
    `"url: La URL de la foto de perfil no puede superar los 500 caracteres"`.
  - Boundary exacto confirmado: URL de exactamente 500 caracteres → `200` (acepta); 501 →
    `400` (rechaza limpio).

## 2. Bug 2 — Mensaje de `@Size` sin `message` custom, locale-dependiente

- **Archivo:** [backend/src/main/java/com/bajonea/backend/dto/request/ClienteEditarPerfilRequestDTO.java](../backend/src/main/java/com/bajonea/backend/dto/request/ClienteEditarPerfilRequestDTO.java)
- **Fix:** agregado `message` en español a los 3 `@Size` del DTO — no solo `nombre`/`apellido`
  (los 2 campos que reportaba el hallazgo original), sino también `telefono`, que tenía el
  mismo `@Size(max = 30)` sin mensaje en el mismo archivo. La afirmación del reporte
  original ("los dos únicos campos del proyecto con `@Size` sin mensaje propio") no era
  exacta — un `grep` de `@Size(max = \d+)$` (sin `message`) sobre `dto/request/` completo
  confirma que el resto de las coincidencias (`CategoriaRequestDTO`, `AprobacionComercioRequestDTO`,
  `ProductoRequestDTO`, `ComercioPerfilRequestDTO`, `RechazoPedidoRequestDTO`, `TagRequestDTO`)
  son DTOs de Comercio/Administrador, fuera del alcance de Cliente pedido para este tramo —
  no se tocaron. Se revisó también el resto de los DTOs de los 12 formularios de Cliente
  (`DireccionRequestDTO`, `ItemCarritoRequestDTO`, `ActualizarCantidadItemCarritoRequestDTO`,
  `PedidoRequestDTO`, DTOs de login/verificación/recuperación/reactivación) y ninguno tiene
  `@Size` sin mensaje.
- **Evidencia real** (`PUT /api/v1/clientes/perfil`, mismo cliente de prueba):
  - `nombre`/`apellido` de 101 caracteres, sin `Accept-Language` y con `Accept-Language: es`:
    mismo mensaje en español en ambos casos (`"El nombre no puede superar los 100
    caracteres"` / `"El apellido no puede superar los 100 caracteres"`) — antes alternaba
    inglés/español según el cliente HTTP.
  - `telefono` de 31 dígitos (viola `@Size(max=30)` y `@ValidarTelefonoArgentino` a la vez):
    repetido 5 veces, siempre en español (`"El teléfono no puede superar los 30
    caracteres"` o `"Ingresá un número de teléfono válido..."`) — sigue alternando cuál de
    las dos gana (mismo no-determinismo de orden del bug 3, no corregido acá porque el
    alcance pedido para ese fix era específicamente `password`), pero ya no hay ninguna
    variante en inglés.

## 3. Bug 3 — Orden no determinístico de `ConstraintViolation` en `RegistroClienteRequestDTO.password`

- **Archivo:** [backend/src/main/java/com/bajonea/backend/dto/request/RegistroClienteRequestDTO.java](../backend/src/main/java/com/bajonea/backend/dto/request/RegistroClienteRequestDTO.java)
- **Fix:** eliminado el `@Size(max = 72, message = "...")` del campo `password` —
  `@ValidarPasswordSegura` ya acota la longitud dentro de su propio regex
  (`^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,72}$`), así que el `@Size` nunca aportaba una regla
  adicional, solo competía por el mensaje con la misma regla. Confirmado antes del fix que
  esto no deja ningún caso sin mensaje específico: para 73+ caracteres, el mensaje de
  `@ValidarPasswordSegura` ("Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y
  un número") sigue siendo claro y accionable — mismo mensaje que ya usan sin problema
  `CambioPasswordPerfilRequestDTO`/`ConfirmarRecuperacionPasswordRequestDTO`, que nunca
  tuvieron este `@Size` redundante (ver `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md`, Parte 3
  punto 4, ahora resuelto).
- **Evidencia real** (`POST /api/v1/auth/registro/cliente`, password de exactamente 73
  caracteres, por lo demás válido — mayúscula/minúscula/número presentes): repetido 5 veces
  seguidas contra el mismo proceso backend corriendo, mensaje idéntico en las 5 corridas:
  `"password: Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número"`.
  Antes alternaba 3/5 vs. 2/5 entre ese mensaje y `"La contraseña no puede superar los 72
  caracteres"`.

## 4. Colección de Postman actualizada

Los 3 requests de la matriz que documentaban estos bugs con el comportamiento viejo se
actualizaron para reflejar el comportamiento correcto (colección local,
`postman/Bajonea-MVP.postman_collection.json` — la copia alojada en la nube del MCP de
Postman sigue con la limitación de scripts de test ya documentada en `CLAUDE.md`, Fase 14,
no se tocó):

| Carpeta | Request (nombre nuevo) | Cambio |
|---|---|---|
| `29 - Matriz Cliente - Foto de perfil (Usuario)` | `Foto perfil Usuario - url por encima del limite (501 caracteres, debe rechazar con 400)` | Renombrado (sacado el prefijo `[BUG REAL]`), assertion cambiada de "espera 500" a "espera 400 + mensaje". |
| `27 - Matriz Cliente - Perfil (datos personales)` | `Perfil Cliente - nombre por encima del limite (101 caracteres, debe rechazar)` | Renombrado, assertion cambiada de "acepta 2 mensajes posibles" a mensaje exacto en español. |
| `27 - Matriz Cliente - Perfil (datos personales)` | `Perfil Cliente - apellido por encima del limite (101 caracteres, debe rechazar)` | Igual que `nombre`. |
| `22 - Matriz Cliente - Registro (campo por campo)` | `Registro Cliente - password por encima del limite (73 caracteres, debe rechazar)` (nombre sin cambios) | Assertion cambiada de "acepta 2 mensajes posibles" a mensaje exacto único. |

No se agregó ningún request nuevo para el hallazgo adicional de `telefono` (Bug 2): el caso
de `telefono` >30 caracteres nunca estuvo cubierto por ningún request existente de la
matriz (los 3 casos de `telefono` en `27 - ...` prueban vacío y 2 formatos inválidos con
teléfonos cortos, que nunca disparan `@Size`), así que el fix no rompió ni afectó ninguna
assertion existente — confirmado corriendo la colección completa.

## 5. Evidencia común — corrida completa de la colección

- Limpieza de `bajonea_test` con `postman/limpiar-datos-postman.sql` antes de cada corrida.
- **2 corridas consecutivas con Newman** contra `bajonea_test` limpia, después de aplicar
  los 3 fixes de backend + actualizar la colección: **793/795 en verde** en ambas — los 2
  fallos restantes son el mismo rate limit ambiental ya documentado (`09 - Auth avanzado`,
  `[negativo] Pedir firma foto de registro de comercio (6/5, rate limit)`,
  `application-test.properties` sube el límite a 1000/min para no bloquear Playwright, no
  reproducible bajo perfil default, sin relación con estos 3 bugs).
- Antes de los fixes, la misma corrida daba 792/794 con exactamente 4 fallos adicionales
  (los 3 requests de arriba con la assertion vieja, más el de rate limit) — confirma que los
  fixes cambiaron el comportamiento exactamente donde se esperaba y en ningún otro lado.
- Limpieza final de `bajonea_test`: `SELECT` sobre `usuario`/`categoria`/`tag` filtrados por
  marcador `postman`/`bajonea.test` → 0 filas en las 3 tablas. El usuario de prueba
  registrado a mano para verificar los boundaries exactos con `curl`
  (`bugtest.cliente@bajonea.test`, id 378) se limpió aparte, también confirmado en 0 filas.
- `./mvnw compile` → `BUILD SUCCESS` tras los 3 fixes.

## 6. Pendiente, no resuelto en este tramo

- El no-determinismo de orden de `telefono` en `ClienteEditarPerfilRequestDTO` (Bug 2,
  hallazgo adicional) sigue existiendo — ya no es un bug de locale (ambas variantes están en
  español), pero cuál de las dos gana sigue sin ser determinístico. Fuera del alcance pedido
  para este tramo (que acotaba el fix de no-determinismo únicamente al caso de `password`
  documentado como Bug 3).
- `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` (Parte 3 puntos 4 y 9, Parte 5) actualizado para
  reflejar estos 3 fixes.

**No cerrado.** A la espera de que Diego confirme antes de dar por terminado este tramo —
mismo criterio que el resto de los tramos del proyecto.
