# Mapeo de archivos — Fase 2: Matriz de Postman de Administrador (2026-09-03)

Sigue a `docs/AUDITORIA-EXHAUSTIVA-ADMINISTRADOR.md`. Cubre los dos bloques del prompt de esta
sesión: Bloque 1 (corrección del gap de redes sociales, ya commiteado por separado — ver
`git log`, commit "fix(admin): mostrar redes sociales de un comercio en las pantallas de
Administrador") y Bloque 2 (matriz exhaustiva de Postman de Administrador, este documento).

**No cerrado** — a la espera de que Diego confirme el checklist completo, mismo criterio que el
resto de los tramos.

---

## Bloque 2 — Alcance cubierto

Los 3 formularios/flujos con tabla campo por campo en `docs/AUDITORIA-EXHAUSTIVA-ADMINISTRADOR.md`
Parte 2, ninguno más:

1. Aprobación/rechazo de Comercio (`AprobacionComercioRequestDTO`, `PUT /administrador/comercios/{id}/resolver`).
2. Gestión de Categorías (`CategoriaRequestDTO`, CRUD completo).
3. Gestión de Tags (`TagRequestDTO`, CRUD completo).

Las 6 funcionalidades descartadas por Diego (re-solicitud de comercio rechazado, suspensión/
reactivación de comercios y de clientes, `ConfiguracionTarifa`, Reclamos, Soporte) no se tocaron
ni se mencionan como pendientes en ningún request nuevo — consistente con la decisión ya cerrada
en la auditoría.

---

## Archivos tocados

- `postman/Bajonea-MVP.postman_collection.json` — 3 carpetas nuevas al final de la colección
  (60 requests en total, ver detalle abajo) + 1 corrección puntual de infraestructura de testing
  preexistente (ver "Bug de infraestructura encontrado y corregido").
- `postman/Bajonea-Local.postman_environment.json` — 13 variables nuevas (placeholders vacíos,
  mismo criterio que el resto del archivo): `adminMatrizCliente_codigo_verif`,
  `adminMatrizCliente_token`, `adminMatrizC_codigo_verif`, `adminMatrizA_id`..`adminMatrizF_id`,
  `adminMatrizCat100_id`, `adminMatrizCatBase_id`, `adminMatrizTag100_id`, `adminMatrizTagBase_id`.
- `docs/MAPEO-ARCHIVOS-FASE2-POSTMAN-ADMINISTRADOR.md` — este documento.

Ningún archivo de `backend/`, `frontend/`, ni ninguna migración Flyway, tocado en este bloque.

---

## Carpetas nuevas de la colección

### `42 - Matriz Administrador - Aprobacion de Comercio` (30 requests)

Setup propio y autocontenido: un Cliente descartable (`postman.adminmatrizcliente@bajonea.test`)
para los negativos de rol insuficiente — no depende de `{{token_cliente}}`, seteado por el
"Registro Cliente" de la carpeta `02 - Auth`, que está roto por un drift preexistente ajeno a
este tramo (ver más abajo) — y 6 comercios reales (`Comercio Postman Admin-Matriz-A`..`-F`,
nombres con guiones a propósito, ver "Hallazgo: normalización Title Case").

Cobertura, siguiendo el orden pedido en el prompt:

1. **Vacío / obligatoriedad:**
   - `aprobar` ausente → `400`, `{"aprobar":"no debe ser nulo"}` (bean validation, corre antes
     del lookup de `comercioId` — probado contra un id inexistente a propósito, ver hallazgo de
     orden de validación abajo).
   - `aprobar=false` sin `motivo` → `400`, `"El motivo es obligatorio al rechazar un comercio"`
     (regla de negocio a nivel Service, sí necesita un comercio `PENDIENTE` real).
   - `aprobar=true` sin `motivo` → acepta (cubierto como parte del caso válido normal).
2. **Formato inválido:** no aplica — `aprobar` es `Boolean` sin más variantes que `null`/ausente
   (ya cubierto en el punto 1), `motivo` es texto libre sin `@Pattern`. Sin caso, documentado acá
   para que quede explícito que no es una omisión.
3. **Boundary de `motivo`:** 500 caracteres exactos → `200` (acepta, persiste); 501 caracteres →
   `400`, `{"motivo":"el tamaño debe estar entre 0 y 500"}` (bean validation, mismo patrón que el
   punto 1 — probado también contra un id inexistente, ya que la validación nunca llega al
   lookup).
4. **Caso válido normal + persistencia:** aprobar sin motivo → `200`, verificado con un segundo
   request (`GET /administrador/comercios`) que confirma el comercio en la lista de aprobados con
   `estado: APROBADO`. Persistencia real en `historial_estado_comercio` y `notificacion`
   verificada con `SELECT` directo (ver evidencia abajo, no como assertion de Postman —
   Postman no tiene acceso a la base).
5. **Reglas de negocio:**
   - Comercio inexistente → `404`, `"Comercio no encontrado"`.
   - Doble resolución sobre **3 estados reales alcanzables** de los 5 no-`PENDIENTE` del enum
     `EstadoComercio` — ver "Hallazgo: solo 3 estados no-`PENDIENTE` son alcanzables hoy" más
     abajo. Los 3, cada uno con su propio comercio real: `APROBADO` (Admin-Matriz-A, doble
     aprobación), `RECHAZADO` (Admin-Matriz-B, aprobar sobre uno ya rechazado), y
     `CERRADO_TEMPORALMENTE` (Admin-Matriz-C: aprobado primero, luego 3 logins fallidos reales de
     su Dueño para activar el bloqueo real de cuenta y la propagación a `Comercio.estado`, no un
     `UPDATE` manual). Los 3 devuelven el mismo mensaje genérico `"El comercio ya fue resuelto,
     no está en estado PENDIENTE"`.
6. **Notificación real:** verificado con `SELECT` directo (no en Postman) que `COMERCIO_APROBADO`/
   `COMERCIO_RECHAZADO` se insertan en `notificacion` con `entidad_tipo=COMERCIO` para los 5
   comercios resueltos de esta carpeta — ver evidencia abajo.

### `43 - Matriz Administrador - Categorias` (15 requests) y `44 - Matriz Administrador - Tags` (15 requests)

Mismo patrón exacto en ambas (`CategoriaService`/`TagService` son código duplicado a propósito,
ver `CLAUDE.md` §3):

1. Nombre vacío → `400`, `"No debe estar vacío"`.
2. Formato inválido: no aplica — sin `@Pattern` en ninguno de los dos DTOs, confirmado en la
   auditoría. Sin caso.
3. Boundary 100/101 caracteres exactos → `201` / `400` (`"el tamaño debe estar entre 0 y 100"`).
4. Caso válido normal (`activo=true` por defecto) + duplicado (`409`).
5. Edición: nombre nuevo sin colisión (`200`); nombre que colisiona con otra categoría/tag
   existente (`409`, mismo mensaje que el alta); id inexistente (`404`).
6. Ciclo de vida completo con verificación real vía `GET` después de cada paso: baja (`DELETE`,
   `activo=false` confirmado) → **doble baja** (idempotente, `200` de nuevo, no error) →
   reactivar (`activo=true` confirmado) → **doble reactivación** (idempotente, `200` de nuevo).
   Comportamiento real confirmado leyendo `CategoriaService.baja/reactivar` y
   `TagService.baja/reactivar`: ninguno de los 4 métodos valida el estado actual antes de mutar,
   así que ambas operaciones son estructuralmente idempotentes — no hay ninguna rama de error
   posible para "ya estaba así", y el matiz quedó documentado en el request en vez de asumido.
7. Rol insuficiente (Cliente, `403`, `"No tiene permisos para acceder a este recurso"`) y sin
   token (`401`, `"No autenticado: token ausente, inválido, expirado o sesión cerrada"`).

---

## Hallazgos durante la construcción de la matriz

### Hallazgo 1 (no un bug, comportamiento real confirmado): `EstadoComercio.INACTIVO` es tan inalcanzable como `SUSPENDIDO`

La auditoría (`docs/AUDITORIA-EXHAUSTIVA-ADMINISTRADOR.md`, Parte 4) ya había confirmado que
`EstadoComercio.SUSPENDIDO` nunca se asigna en ningún punto del backend. Construyendo el punto 5
de la matriz (doble resolución contra "los 4 estados posibles distintos de `PENDIENTE`" que pide
el prompt) apareció un segundo caso idéntico no documentado antes: `AuthService.java:253` llama
`restaurarComercioSiCorresponde(usuario, EstadoComercio.INACTIVO)` — pero ese método solo actúa
si `comercio.getEstado() == estadoOrigenEsperado` (`AuthService.java:309-314`), y **ningún punto
del backend asigna `EstadoComercio.INACTIVO` a un `Comercio`** (`grep` de
`EstadoComercio.INACTIVO` sobre todo `backend/src/main/java`: única aparición, la de la línea
253 de arriba). Es código defensivo para una transición que estructuralmente nunca ocurre — mismo
patrón que `SUSPENDIDO`, solo que sin el `case` explícito en ningún `switch` que lo delate a
simple vista.

**Confirmado por descarte, no por prueba directa** (no existe forma real de forzar
`EstadoComercio.INACTIVO`, igual que `SUSPENDIDO`): de los 5 valores no-`PENDIENTE` del enum
(`APROBADO`, `RECHAZADO`, `SUSPENDIDO`, `INACTIVO`, `CERRADO_TEMPORALMENTE`), solo 3 son
alcanzables desde código real — los 3 que la matriz de la carpeta 42 cubre con comercios reales.
Reportado como hallazgo, no corregido — es una funcionalidad de la lista de las 6 descartadas por
Diego (suspensión/reactivación de comercios) que ya estaba fuera de alcance.

### Hallazgo 2 (no un bug, confirmación real): el mensaje de `@NotNull`/`@Size` sin `message` custom sale en español, no en inglés

La auditoría asumía (Parte 2, campo `aprobar`) que al no tener `message` custom, el texto sería
"el default en inglés de la librería, no traducido". Probado en vivo: `aprobar` ausente devuelve
`"aprobar: no debe ser nulo"`, y `motivo` de 501 caracteres devuelve
`"motivo: el tamaño debe estar entre 0 y 500"` — ambos en español. Hibernate Validator resuelve
sus mensajes default contra el locale del JVM/request, que en este entorno cae en español — no
hace falta ningún `ValidationMessages.properties` para que salgan traducidos. Corrección a la
premisa de la auditoría, sin impacto de código.

### Bug de infraestructura de testing encontrado y corregido: `token_admin` quedaba invalidado por las carpetas 39 y 41

Al correr la colección completa (no solo las carpetas nuevas), las 30 requests de la carpeta 42
que dependen de `{{token_admin}}` fallaban con `401` — pero **solo cuando el run incluía la
colección completa**, nunca corriendo `01 + 02 + 42 + 43 + 44` en aislamiento. Causa real,
confirmada por lectura del JSON de la colección: las carpetas `39 - Matriz Comercio - CRUD de
productos` y `41 - Matriz Comercio - Rechazo de pedido` tienen cada una un request "Setup - Login
Administrador" que vuelve a loguearse como `admin@bajonea.ar` para capturar un token propio
(`matriz_admin_token`, usado solo dentro de esas dos carpetas) — pero **nunca actualizaban
`token_admin`**. Bajoneá tiene sesión única por cuenta (`Sesion.activa`, ver `CLAUDE.md` §7,
confirmado también en el cierre de Fase 17): ese segundo login real cierra la sesión asociada al
`token_admin` original seteado en `02 - Auth/Login Administrador`, aunque la variable de entorno
nunca se toque — el JWT sigue teniendo firma válida, pero su `sesionId` ya no está activo, así
que cualquier carpeta posterior a la 39/41 que dependa de `{{token_admin}}` (la 42 incluida,
simplemente por estar al final de la colección) recibe `401 "No autenticado... sesión cerrada"`.

**Corregido como parte de este tramo** (autorizado explícitamente por el prompt para bugs de
infraestructura de testing, a diferencia de bugs de aplicación): ambos requests "Setup - Login
Administrador" (carpetas 39 y 41) ahora también hacen `pm.environment.set('token_admin',
json.data.token)`, además de `matriz_admin_token`. Con la corrección, la colección completa
(681 requests) corrida contra `bajonea_test` recién reseteada deja las carpetas 42-44 en
**0 fallos**, confirmado dos veces (antes y después del fix, mismo comando, mismo reset previo).
No es un bug de aplicación — el backend siempre se comportó como está documentado (sesión única
por cuenta); el bug estaba en cómo la colección reutilizaba la variable compartida.

### Aclaración: nombres de comercio con guión, no CamelCase, en los fixtures de la carpeta 42

`Comercio.nombre` pasa por `TextoUtils.aTitleCase` al persistirse (normalización ya documentada
en `CLAUDE.md`, Fase 17 reabierta). Ese método capitaliza solo la primera letra de cada
"palabra", donde una palabra termina en espacio, guión, apóstrofo o `/` — nunca en un cambio de
mayúscula a minúscula dentro de un token. Un primer intento con nombres tipo
`Comercio Postman AdminMatrizA` se persistía como `Comercio Postman Adminmatriza` (todo un solo
token, sin más mayúsculas que la inicial), rompiendo el matching por nombre exacto que hacen los
requests de "capturar ids". Corregido usando guiones (`Comercio Postman Admin-Matriz-A`, etc.),
que sí sobreviven la normalización sin cambios — no es un bug, es el comportamiento documentado
de `aTitleCase` funcionando como se diseñó, y quedó como aprendizaje aplicado al nombrar
fixtures futuros con letras/números pegados.

---

## Evidencia real generada

### Corridas de Newman

- **Aislada** (`01 - Geografía` + `02 - Auth` + `42` + `43` + `44`, `bajonea_test` recién
  reseteada): 78 items, 151 assertions, **0 fallos en las 3 carpetas nuevas** — los únicos 16
  fallos de assertion son de `02 - Auth` (`Registro Cliente`/`Registro Comercio A`/`B` con `400`
  porque sus bodies no incluyen `direccion`, ya obligatorio en `RegistroClienteRequestDTO` desde
  antes de este tramo — drift preexistente documentado en `CLAUDE.md` como pendiente
  "actualización de la colección de Postman... desalineada con `bajonea_final`", fuera de
  alcance de este bloque, no tocado).
- **Colección completa, antes del fix de `token_admin`** (681 items, `bajonea_test` recién
  reseteada): 1211 assertions, 303 fallos — 15 de ellos dentro de la carpeta 42 (efecto directo
  del bug de infraestructura de arriba).
- **Colección completa, después del fix** (681 items, `bajonea_test` recién reseteada): 1222
  assertions (+11 por el request de login extra que ahora también valida status/token), **232
  fallos — exactamente el mismo número que la corrida de referencia sin ninguna de las 3 carpetas
  nuevas** (documentado en el cierre del Bloque 1 de este mismo tramo). Confirma que las 60
  requests nuevas no metieron ni un solo fallo nuevo en el resto de la colección, y que el fix de
  `token_admin` no rompió nada de las carpetas 39/41 que ya pasaban.

### `SELECT` directo contra `bajonea_test` (Postman no tiene acceso a la base)

Tras la corrida completa post-fix, antes de la limpieza:

```
comercio: Admin-Matriz-A APROBADO | Admin-Matriz-B RECHAZADO | Admin-Matriz-C CERRADO_TEMPORALMENTE
        | Admin-Matriz-D RECHAZADO | Admin-Matriz-E PENDIENTE | Admin-Matriz-F APROBADO

historial_estado_comercio: 5 filas (A,B,C,D,F), estadoOrigen=PENDIENTE en las 5, motivo NULL en
        aprobaciones, motivo de longitud 41 (B) y 500 (D, el boundary) en los rechazos.

notificacion (entidad_tipo=COMERCIO): 5 filas, tipo COMERCIO_APROBADO (A,C,F) / COMERCIO_RECHAZADO
        (B,D), mensaje incluye el nombre real del comercio y el motivo real en los rechazos.

categoria: id 100-chars con activo=1, id CatBaseEditada con activo=1 (tras baja+doble-baja+
        reactivar+doble-reactivar) — ambos con LENGTH(nombre) exacto (100 y 34).

tag: mismo patrón, id 100-chars activo=1, id TagBaseEditado activo=1.
```

Todos los valores coinciden exactamente con lo esperado por cada test case.

### Limpieza final

`postman/limpiar-datos-postman.sql` corrido contra `bajonea_test` tras la verificación de
arriba (ya filtraba por `postman.%@bajonea.test` y `%Postman%` en categoria/tag — los fixtures de
este tramo ya seguían esa convención, sin necesidad de tocar el script). Verificado con `SELECT
COUNT(*)` en `0` para las 4 tablas relevantes (`comercio`/`usuario` por email, `categoria`/`tag`
por nombre) tras la limpieza.

---

## Reporte de bugs de aplicación encontrados (sin corregir, a criterio de Diego)

Ninguno nuevo más allá de lo ya documentado en `docs/AUDITORIA-EXHAUSTIVA-ADMINISTRADOR.md`. El
único hallazgo real de este tramo (`EstadoComercio.INACTIVO` inalcanzable para `Comercio`, ver
Hallazgo 1 arriba) es una extensión directa de un patrón ya reportado (`SUSPENDIDO`), no un bug
nuevo de comportamiento — ambos son parte de la misma funcionalidad ya descartada por Diego
(suspensión/reactivación de comercios). No se tocó ningún código de `backend/`/`frontend/` para
"arreglarlo" porque no hay nada roto: el sistema simplemente nunca ofreció una vía para llegar a
esos 2 estados, consistente con que esa funcionalidad nunca se implementó.

---

## Cierre

**No cerrado** — pendiente de que Diego revise este documento y confirme:

- El alcance de las 3 formularios cubiertos (sin ampliar a los 6 descartados).
- El fix de infraestructura de `token_admin` en las carpetas 39/41 (2 líneas cada una, sin tocar
  ningún request ni assertion ya existente de esas carpetas).
- Que el hallazgo de `EstadoComercio.INACTIVO` no amerita ninguna acción further (mismo criterio
  ya aplicado a `SUSPENDIDO`).
- Un commit final para este Bloque 2, mismo criterio de "sugerencia, no regla rígida" que el
  Bloque 1.
