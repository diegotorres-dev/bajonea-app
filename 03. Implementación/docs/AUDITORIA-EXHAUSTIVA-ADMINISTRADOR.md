# Auditoría exhaustiva de formularios de Administrador (2026-09-03)

> **Documento de auditoría pura — no se implementó ni corrigió nada.** Mismo criterio y
> metodología que `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` y `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md`
> (lectura directa del código real: backend `entities/`/`dto/request/`/`validation/`/
> `services/`/`controllers/`, frontend `frontend/*.html` + `frontend/js/*.js`), aplicado ahora
> al rol Administrador — tercer y último tramo de esta serie. `docs/diccionario-de-datos.md`
> (v1.5, 41 tablas) se usó como fuente de verdad del modelo de datos completo, no del código
> implementado. `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` se usó como punto de partida a
> contrastar, nunca como fuente de verdad. Fase 1 únicamente: inventario, tabla campo por
> campo, discrepancias y valores límite — sin armar ninguna matriz de testeo nueva.

---

## Parte 1 — Listado completo y confirmado de formularios/flujos de Administrador

Recorrido completo de `frontend/admin-*.html` + `frontend/js/admin.js`, cruzado contra
`backend/src/main/java/com/bajonea/backend/controllers/AdministradorController.java`,
`CategoriaController.java`, `TagController.java`, `services/AdministradorService.java`,
`services/CategoriaService.java`, `services/TagService.java`, y `SecurityConfig.java` para
confirmar qué paths son `hasRole("ADMINISTRADOR")`.

**Hallazgo estructural previo a la lista:** el rol en código y en la URL de negocio se llama
`ADMINISTRADOR` (`RolUsuario.ADMINISTRADOR`, `SecurityConfig.java:95-96`,
`.requestMatchers("/api/v1/categorias/**", "/api/v1/tags/**", "/api/v1/administrador/**").hasRole("ADMINISTRADOR")`),
distinto del rol `DUENO` que protege `/api/v1/comercios/**`/`/api/v1/productos/**` (post
Tramo 6 de portabilidad a `bajonea_final`, ver `CLAUDE.md` §1bis). Sin relación con este
documento más que confirmar el matcher correcto.

### 1. Aprobación / rechazo de Comercio pendiente

- **Pantallas:** `admin-comercios-pendientes.html` (listado) + `admin-comercio-detalle.html`
  (detalle + acciones). El detalle **solo resuelve contra el listado de pendientes**
  (`initAdminComercioDetalle`, `admin.js:591-617`, llama `GET /administrador/comercios/pendientes`
  y busca el id en memoria) — no existe una ruta de detalle para un comercio ya aprobado; ese
  caso se resuelve con un **modal**, no una navegación (ver punto 2).
- **JS:** `js/admin.js`, `mostrarModalRechazarComercio` (375-433), `mostrarModalConfirmarAprobacion`
  (350-373), `renderDetalle` (526-589).
- **Endpoint:** `PUT /api/v1/administrador/comercios/{comercioId}/resolver`.
- **DTO:** `AprobacionComercioRequestDTO` (`aprobar: Boolean`, `motivo: String` opcional a nivel
  Bean Validation, obligatorio a nivel Service solo si `aprobar=false`). Confirmado en código
  real hoy — ver Parte 2 y Parte 3, punto 1, para la discrepancia contra el prompt original de
  esta auditoría (que asumía que este DTO nunca había sido auditado campo por campo).
- **Regla de negocio confirmada en `AdministradorService.resolverAprobacion` (líneas 97-136):**
  el comercio debe estar en `PENDIENTE` (si no, `409` "El comercio ya fue resuelto, no está en
  estado PENDIENTE" — sin distinguir si el estado actual es `APROBADO`, `RECHAZADO`,
  `CERRADO_TEMPORALMENTE`, etc., el mensaje es genérico para cualquier estado distinto de
  `PENDIENTE`); inserta una fila en `HistorialEstadoComercio` (estadoOrigen, estadoDestino,
  administrador, motivo, fechaHora); dispara una notificación real al Dueño
  (`TipoNotificacion.COMERCIO_APROBADO`/`COMERCIO_RECHAZADO`).

### 2. Listado de comercios aprobados (solo lectura, con modal de detalle)

- **Pantalla:** `admin-comercios.html`.
- **JS:** `js/admin.js`, `initAdminComercios` (681-707), `mostrarModalDetalleComercio`
  (619-652) — reusa la misma función `renderComercioDetailSections` que el detalle de
  pendientes, así que el contenido mostrado es idéntico en ambos casos salvo por
  aprobar/rechazar (que acá no existen, solo un botón "Cerrar").
- **Endpoint:** `GET /api/v1/administrador/comercios` (solo `EstadoComercio.APROBADO`,
  confirmado en `AdministradorService.listarComerciosAprobados`, línea 64-68 — **no incluye
  `RECHAZADO`, `SUSPENDIDO`, `INACTIVO` ni `CERRADO_TEMPORALMENTE`**, pese a que el tile del
  dashboard que enlaza acá dice "X registrados" usando `comerciosTotal` = conteo de **todos**
  los estados, ver Parte 3 punto 6).
- **Sin campo de formulario real** — es un listado + modal de solo lectura, sin ninguna acción
  de mutación disponible desde esta pantalla.

### 3. Listado de Clientes (solo lectura)

- **Pantalla:** `admin-clientes.html`.
- **JS:** `js/admin.js`, `initAdminClientes` (734-762), `renderClienteAdminRow` (709-732).
- **Endpoint:** `GET /api/v1/administrador/clientes` — **sin filtro de estado, devuelve
  absolutamente todos los Clientes** (`clienteRepository.findAll()`,
  `AdministradorService.java:70-74`).
- **Sin ningún campo de formulario, sin ninguna acción** — puramente de lectura (nombre,
  apellido, DNI, email, estado con puntito de color, fecha de registro).

### 4. Perfil propio del Administrador (dashboard)

- **Pantalla:** `admin-dashboard.html`.
- **JS:** `js/admin.js`, `initAdminDashboard` (150-231).
- **Endpoints:** `GET /api/v1/administrador/perfil` (nombre/apellido/fotoPerfilUrl, solo
  lectura) + el flujo compartido de foto de perfil de `UsuarioController`
  (`POST /usuarios/{id}/foto-perfil/firma` + `PATCH /usuarios/{id}/foto-perfil`), idéntico al
  que ya usan Cliente/Comercio para su propia foto — **sin diferencia de rol**, mismo
  `FotoPerfilUsuarioRequestDTO`/`subirFotoPerfilUsuario` ya auditado para Cliente. Se menciona
  acá por completitud del inventario, sin repetir su tabla campo por campo (remite a
  `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md`).
- **Sin edición de nombre/apellido** — confirmado explícitamente en el Javadoc de
  `AdministradorResponseDTO`: "Sin endpoint de edición de nombre/apellido: el Administrador se
  siembra por Flyway, no tiene autoservicio de esos datos."
- **Métricas del dashboard** (`GET /api/v1/administrador/metricas`,
  `MetricasAdminResponseDTO`): `comerciosPendientes`, `comerciosTotal` (todos los estados),
  `clientesTotal`, `categoriasActivas`, `tagsActivos` — puramente de lectura, sin formulario.

### 5. Gestión de Categorías (CRUD)

- **Pantalla:** `admin-categorias.html`.
- **JS:** `js/admin.js`, `mostrarModalCategoria` (768-909), `initAdminCategorias` (939-1026).
- **Endpoints:** `POST /api/v1/categorias` (alta) + `PUT /api/v1/categorias/{id}` (editar
  nombre) + `DELETE /api/v1/categorias/{id}` (baja lógica, `activo=false`) +
  `PUT /api/v1/categorias/{id}/reactivar` (reactivar, `activo=true`) + `GET /api/v1/categorias`
  (listado, abierto a cualquier autenticado desde Fase 16 Tramo 6, no solo Administrador).
- **DTO:** `CategoriaRequestDTO` (`nombre`, único campo).
- **Toggle "activa"** dentro del mismo modal de edición (no hay botón dedicado de
  baja/reactivación en el listado) — al guardar, si el valor del switch cambió respecto al
  original, dispara un segundo request (`DELETE` o `/reactivar`) además del `PUT` de nombre.

### 6. Gestión de Tags (CRUD)

- **Pantalla:** `admin-tags.html`.
- **JS:** `js/admin.js`, `mostrarModalTag` (1028-1170), `initAdminTags` (1200-1287) —
  estructura idéntica a Categoría, campo por campo, mismo patrón de toggle "activo" dentro del
  modal de edición.
- **Endpoints:** `POST /api/v1/tags` + `PUT /api/v1/tags/{id}` + `DELETE /api/v1/tags/{id}` +
  `PUT /api/v1/tags/{id}/reactivar` + `GET /api/v1/tags`.
- **DTO:** `TagRequestDTO` (`nombre`, único campo).

### 7. Cierre de sesión (logout)

- **Pantalla:** `admin-dashboard.html` — único punto de logout manual del rol Administrador
  (agregado en el Tramo 16.23 según `CLAUDE.md` §6, "no existía ninguna forma manual de salir
  desde Admin").
- **JS:** `mostrarModalConfirmarLogoutAdmin` (`admin.js:128-148`).
- Mismo flujo que Cliente/Comercio (`logout()` de `auth.js`), sin campos de formulario — se
  menciona por completitud, sin fila propia en la Parte 2.

### Formularios/flujos compartidos con Cliente/Comercio — no re-auditados

Mismo criterio pedido en el prompt: se listan pero no se repite su tabla campo por campo, ya
cubierta en `docs/AUDITORIA-EXHAUSTIVA-CLIENTE.md` Parte 2. Confirmado por lectura de
`login.html`/`js/auth.js` que ninguno de los 4 tiene una rama de código condicionada por rol
Administrador — el único comportamiento post-login específico de este rol es el redirect a
`admin-dashboard.html` según `usuario.rol`, que no es un campo de formulario.

- **Login** (`LoginRequestDTO`) — sin diferencias por rol.
- **Verificación de cuenta** (`VerificarCodigoRequestDTO`/`ReenviarVerificacionRequestDTO`) —
  el Administrador se siembra por Flyway y en la práctica ya nace `ACTIVO` (sin flujo de alta
  pública), pero el propio formulario/DTO es idéntico y no tiene ninguna rama de código
  condicionada por rol — se deja la mención por completitud, sin diferencia real.
- **Recuperación de contraseña** (3 DTOs) — sin diferencias por rol; de hecho es el mecanismo
  real usado en `testing/playwright/tests/helpers/backend.ts`
  (`fijarPasswordAdminYLoguear`) para fijarle una contraseña conocida a `admin@bajonea.ar` en
  los specs E2E, precisamente porque no hay otra vía de alta/edición de credenciales para este
  rol.
- **Reactivación de cuenta** (2 DTOs) — sin diferencias por rol; sin uso práctico real
  documentado para una cuenta de Administrador (nunca queda `INACTIVO` por ningún flujo de
  código, ver Parte 3).

### Formularios/flujos de la lista tentativa del prompt confirmados como NO IMPLEMENTADOS

Cada uno confirmado por ausencia total en código — no solo "sin pantalla", sino sin
`entity`/`repository`/`service`/`controller`/`DTO` ni rastro alguno más allá del modelo de
datos documentado en `docs/diccionario-de-datos.md`.

- **Re-solicitud de aprobación de comercio rechazado:** sin ningún endpoint ni pantalla.
  `grep` de "resolicit"/"re-solicit" sobre todo `frontend/` y `backend/src/main/java` no
  devuelve ningún archivo salvo la definición del enum `TipoNotificacion.NUEVA_RESOLICITUD_COMERCIO`
  (nunca instanciado en ningún `Service`, ver Parte 3 punto 4). Un comercio `RECHAZADO` no tiene
  ninguna vía de volver a `PENDIENTE` en el código actual.
- **Suspensión / reactivación de comercios:** **no implementado.** `EstadoComercio.SUSPENDIDO`
  existe como valor del enum (`EstadoComercio.java:7`) pero **no hay una sola línea de código en
  todo el backend que asigne ese valor a un `Comercio`** (confirmado por `grep` de
  `EstadoComercio.SUSPENDIDO` sobre `backend/src/main/java` completo — cero resultados fuera de
  la propia definición del enum). Es un estado del enum estructuralmente inalcanzable hoy.
  `AdministradorService` no tiene ningún método `suspender`/`reactivar` de Comercio —
  `resolverAprobacion` es el único método de mutación de estado, y solo opera sobre comercios
  `PENDIENTE`.
- **Suspensión / reactivación de clientes:** **no implementado**, mismo patrón exacto.
  `EstadoUsuario.SUSPENDIDO` existe en el enum (`EstadoUsuario.java:7`) pero `grep` de
  `EstadoUsuario.SUSPENDIDO` sobre todo el backend solo devuelve la propia definición del enum y
  el `case SUSPENDIDO -> throw new ConflictoDeNegocioException("Cuenta suspendida")` dentro del
  `switch` de `AuthService` que valida el estado al hacer login (`AuthService.java:275`) — un
  `case` que maneja una transición defensiva para un estado que **nunca se llega a asignar**
  desde ningún punto del código. `ClienteAdminResponseDTO` es explícitamente de solo lectura
  (Javadoc: "sin acción de suspender/reactivar, confirmado fuera de alcance del MVP actual").
- **Configuración de tarifas de servicio (`ConfiguracionTarifa`):** **no implementado en
  absoluto.** Sin `Entity`, sin `Repository`, sin `Service`, sin `Controller`, sin `DTO`, sin
  ninguna pantalla ni rastro en `frontend/`. Solo existe como tabla documentada en
  `docs/diccionario-de-datos.md:814-830` (modelo completo v1.5). Confirmado además que
  `Pedido.cargo_servicio_cliente`/`cargo_servicio_comercio` (las columnas que "congelarían" la
  tarifa vigente al momento del pedido) tampoco están implementadas en `PedidoResponseDTO` ni en
  la entidad `Pedido` real de este tramo del proyecto.
- **Gestión de Reclamos:** **no implementado en absoluto.** Sin `Entity Reclamo`, sin
  `EstadoReclamo`, sin `Controller`/`Service`/`DTO`, sin ninguna pantalla. Los enum values
  `TipoNotificacion.NUEVO_RECLAMO`/`RECLAMO_APROBADO`/`RECLAMO_RECHAZADO` existen mencionados en
  `TipoNotificacion.java` pero **nunca se instancian** (`grep` sobre `services/` sin resultados)
  — mismo patrón de "enum preparado, lógica ausente" que Suspensión.
- **Soporte — resolución de mensajes de usuarios suspendidos:** **no implementado en
  absoluto.** Sin `Entity Soporte`, sin enum `ResolucionSoporte` en el backend (solo existe
  documentado en `docs/diccionario-de-datos.md:344`, nunca portado a
  `backend/src/main/java/com/bajonea/backend/enums/`), sin `Controller`/`Service`/`DTO`, sin
  ninguna pantalla. Las 5 apariciones de la palabra "soporte" en `frontend/` son todas texto
  estático de contacto genérico ("Contactá a soporte", "comunicate con soporte") en pantallas de
  error/perfil — nunca un formulario real ni un enlace a una función de soporte.

### Hallazgo adicional no listado en la lista tentativa del prompt

Ninguno nuevo — a diferencia de las auditorías de Cliente (`explorar.html`) y Comercio
(`RedSocialController`), no apareció ningún flujo real de Administrador construido en código
que no estuviera ya mencionado en la lista tentativa del prompt o en `CLAUDE.md`. El inventario
de este rol es más acotado que el de Cliente/Comercio: 6 formularios/flujos con campos reales
(puntos 1, 4 parcial, 5, 6) + 2 listados de solo lectura (puntos 2, 3) + logout, contra 6+
formularios de Comercio o 10+ de Cliente.

---

## Parte 2 — Tabla campo por campo por formulario

Formato idéntico a los dos documentos anteriores: `Campo | Backend | Frontend | Alineación`.
Cobertura de test relevada contra `postman/Bajonea-MVP.postman_collection.json` (carpetas
`03 - Administrador`, `10 - Administrador (endpoints nuevos y reglas de aprobacion)`,
`11 - Categorias y Tags (CRUD completo)`) y `testing/playwright/tests/07-crud-categorias-tags.spec.ts` +
`testing/playwright/tests/08-aprobacion-comercio.spec.ts`.

### 1. Aprobación / rechazo de Comercio — `AprobacionComercioRequestDTO`

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `aprobar` | `@NotNull` sobre `Boolean` (`AprobacionComercioRequestDTO.java:24-25`), **sin `message` custom** — cae al mensaje default de Jakarta/Hibernate Validator (sin `ValidationMessages.properties` en el proyecto, confirmado por `find` sin resultados sobre `backend/src/main/resources`, así que el texto real es el default en inglés de la librería, no traducido). | No es un campo de formulario tipeado — dos botones (`Aprobar`/`Rechazar`) arman el body directamente (`aprobar: true`/`aprobar: false`), estructuralmente imposible enviar `null` desde la UI. | **Sin divergencia práctica** (la UI nunca permite el caso `null`), pero **sin ningún test que ejercite el `@NotNull` de este campo directamente** — ni en Postman ni en Playwright hay un request con `aprobar` ausente o `null` (ver Parte 2, sección de cobertura). |
| `motivo` | `@Size(max = 500)` únicamente a nivel Bean Validation, **sin `@NotBlank`/`@NotNull`** — es opcional en el DTO. Obligatoriedad condicional real impuesta en `AdministradorService.resolverAprobacion` (línea 106-108): si `aprobar=false` y `motivo` es `null` o `isBlank()` → `400 ValidacionException("El motivo es obligatorio al rechazar un comercio")`. Decisión de diseño documentada en el Javadoc del DTO: texto libre a propósito, sin `ENUM` (a diferencia de `Pedido.motivo_rechazo`, que sí usa `MotivoRechazo`) porque no existe ningún catálogo cerrado de motivos de rechazo de Comercio en el diccionario completo. | Textarea con `maxlength="500"` + contador `0/500` en vivo (`admin.js:387-388`, `405-406`). Chequeo manual `if (!motivo)` tras `.trim()` en el listener de `input` (habilita/deshabilita el botón de confirmar) y de nuevo en el `submit` del formulario (`admin.js:407-408`, `422-429`), mensaje "El motivo es obligatorio para rechazar una solicitud." — **texto distinto** del mensaje del backend ("...al rechazar un comercio"), mismo significado. Cuando `aprobar=true`, el frontend nunca muestra el campo `motivo` — lo envía explícitamente como `null` (`admin.js:578`, `body: { aprobar: true, motivo: null }`). | **Alineado funcionalmente** — la obligatoriedad condicional está implementada en ambas capas con el mismo criterio. Divergencia cosmética de redacción entre los 2 mensajes de "motivo obligatorio", ya señalada en `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 6 como pendiente de unificar — **sigue sin corregirse hoy**, confirmado releyendo el código actual. Sin mensaje en español para el `@Size(max=500)` propiamente dicho (nunca alcanzable en la práctica por el `maxlength="500"` del HTML, mismo patrón ya documentado para `ProductoRequestDTO.descripcion`/`Comercio.descripcion` en la auditoría de Comercio). |

### 2. Gestión de Categorías — `CategoriaRequestDTO`

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `nombre` | `@NotBlank(message = "No debe estar vacío")` + `@Size(max = 100)` **sin mensaje custom** (default de Jakarta, no traducido). **Sin ninguna validación de formato** — cualquier string no vacío de hasta 100 caracteres es válido hoy (`"123"`, `"!!!"`, `" - "`, todos pasan). Regla de unicidad a nivel Service (`CategoriaService.crear`/`editar`, `categoriaRepository.existsByNombre(...)`) → `409 ConflictoDeNegocioException("Ya existe una categoría con ese nombre")`, comparación exacta (no case-insensitive, no confirmado si hay `UNIQUE` a nivel de columna física — no revisado en esta pasada por no ser parte del alcance de "formularios"). | `<input maxlength="100">` (`admin.js:796`). Chequeo manual `if (!nombre)` tras `.trim()` en el `submit` (`admin.js:862-866`), mensaje "El nombre de la categoría es obligatorio." — **tampoco valida formato**, coincide exactamente con el backend (no hay nada que separar porque no existe la noción de "formato inválido" en ninguna capa). Manejo explícito del `409` de duplicado: si `error.status === 409`, muestra el mensaje del backend (o un fallback "Ya existe una categoría con ese nombre.") directamente bajo el input (`admin.js:889-894`). | **Alineado — misma "alineación vacía" ya señalada en `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` punto 3**, confirmada sin cambios hoy: ninguna capa impone contenido alfanumérico real para el nombre de una categoría. Cobertura de duplicado real y probada en ambas capas (ver Parte 2, cobertura de test). |
| `activo` (fuera del DTO — toggle del modal de edición) | No es un campo de `CategoriaRequestDTO` — se resuelve con 2 endpoints aparte (`DELETE`/`PUT .../reactivar`), sin Bean Validation aplicable (son sin body). | Switch visible solo en modo edición (`esEdicion`, `admin.js:810-833`), con hint "Solo las categorías activas pueden asignarse a productos." Al guardar, si `activo !== categoriaExistente.activo`, dispara el request correspondiente **después** del `PUT` de nombre — 2 requests HTTP secuenciales para un solo "Guardar Cambios" cuando cambian ambos. | **Sin divergencia** — decisión de UI documentada (reusar el toggle existente en vez de un botón de menú de 3 puntitos dedicado, ver `CLAUDE.md` §6 Tramo 16.21). Nota de robustez: si el primer request (`PUT` de nombre) tiene éxito pero el segundo (`DELETE`/`reactivar`) falla, el catch general captura el error y muestra un toast, pero el nombre ya quedó guardado sin el cambio de estado — no es atómico, no confirmado si esto se documentó antes como riesgo aceptado. |

### 3. Gestión de Tags — `TagRequestDTO`

| Campo | Backend | Frontend | Alineación |
|---|---|---|---|
| `nombre` | Idéntico patrón a Categoría: `@NotBlank(message = "No debe estar vacío")` + `@Size(max = 100)` sin mensaje custom, sin validación de formato. Unicidad vía `tagRepository.existsByNombre(...)` → `409 "Ya existe un tag con ese nombre"`. | Idéntico patrón a Categoría (`admin.js:1053-1069`, `1123-1127`), mensaje "El nombre del tag es obligatorio." Único matiz de UI: placeholder "Ej: Vegano, Sin TACC..." (`admin.js:1058`), ausente en el input de Categoría. | **Alineado**, misma "alineación vacía" que Categoría — confirma que es el mismo patrón replicado a propósito, no una inconsistencia entre los dos formularios. |
| `activo` (toggle del modal) | Igual patrón que Categoría (`DELETE`/`PUT .../reactivar`), sin Bean Validation. | Igual patrón que Categoría (`admin.js:1071-1094`), hint "Solo los tags activos pueden asignarse a productos." | **Sin divergencia**, mismo patrón replicado. |

### Cobertura de test — resumen por formulario

| # | Formulario | Cobertura Postman | Cobertura Playwright |
|---|---|---|---|
| 1 | Aprobación/rechazo de Comercio | **Buena para reglas de negocio, floja para validación de campo.** Folder `03`: flujo feliz de aprobación (Comercio A/B). Folder `10`: doble resolución sobre un comercio ya resuelto (`409`, mensaje exacto verificado), comercio inexistente (`404`), rechazo sin motivo (`400`, mensaje exacto verificado), rechazo con motivo (`200`), rol insuficiente (Comercio intentando listar pendientes). **Sin ningún test de `aprobar` ausente/`null`** (el `@NotNull` de ese campo específico nunca se ejercita), sin test de `motivo` de más de 500 caracteres. | 4 tests en `08-aprobacion-comercio.spec.ts`: comercio pendiente visible con datos reales, aprobación completa (incluida verificación de la notificación real recibida por el Comercio vía polling), rechazo completo con motivo (incluida verificación de la notificación con el motivo real), acceso sin rol Administrador redirige a login. **Sin test del botón deshabilitado cuando el motivo está vacío a nivel UI puro** (el flujo feliz sí lo ejercita de paso, línea 127: `toBeDisabled()` antes de tipear). |
| 2 | Gestión de Categorías | Folder `11`: creación, edición (incluida colisión de nombre al editar contra otra categoría existente, no la propia), duplicado en creación (`409`), baja (confirmado que `GET /categorias` sigue devolviendo la categoría dada de baja con `activo=false`, no un `404`/exclusión), reactivación, acceso con rol insuficiente (Cliente intentando crear). **Sin test de `nombre` vacío, sin test de `nombre` de más de 100 caracteres.** | 2 tests en `07-crud-categorias-tags.spec.ts`: CRUD completo (crear → editar → dar de baja vía el switch del modal → confirmar que desaparece del filtro "Activas" y aparece en "Inactivas" → reactivar → confirmar que vuelve a "Activas") y duplicado de nombre (`409` + mensaje de error visible en el input). Cobertura real y completa del ciclo de vida, sin negativos de formato de campo (mismo hueco que Postman). |
| 3 | Gestión de Tags | Folder `11`: mismo patrón que Categoría — creación, edición con colisión de nombre, duplicado (`409`), baja, reactivación, rol insuficiente (Comercio intentando dar de baja un tag). Mismo hueco: sin negativos de formato de `nombre`. | 2 tests en `07-crud-categorias-tags.spec.ts`, mismo patrón que Categoría — CRUD completo + duplicado. |
| 4 | Listado de comercios aprobados | Folder `10`: `GET administrador/comercios (aprobados) - A y B aparecen, D no` — confirma el filtro por `EstadoComercio.APROBADO` excluyendo un comercio recién rechazado (Comercio D). | **Ninguno** — no hay ningún test de Playwright que visite `admin-comercios.html` ni ejercite el modal de detalle. |
| 5 | Listado de Clientes | Folder `10`: `GET administrador/clientes` — flujo feliz únicamente, sin negativo de rol insuficiente probado específicamente para este endpoint (el patrón de rol insuficiente sí está probado para `/administrador/comercios/pendientes` en el mismo folder, no repetido acá). | **Ninguno** — no hay ningún test de Playwright que visite `admin-clientes.html`. |
| 6 | Perfil propio / Métricas del dashboard | Folder `10`: `GET administrador/perfil`, `GET administrador/metricas` — flujo feliz únicamente. | **Ninguno directo** — `08-aprobacion-comercio.spec.ts` navega a `admin-dashboard.html` como parte del login (`waitForURL('**/admin-dashboard.html')`) pero no verifica contenido del dashboard en sí (métricas, nombre, foto). |
| 7 | Cambio de foto de perfil (Admin) | **Ninguno propio** — la cobertura de `UsuarioController` (firma + `PATCH`/`DELETE` de foto) existe para Cliente (folder `29`), sin un request equivalente para una cuenta Administrador. | **Ninguno.** |

---

## Parte 3 — Discrepancias contra documentación previa

### 1. El prompt original de esta auditoría asumía que `AprobacionComercioRequestDTO` nunca había sido auditado campo por campo — es incorrecto, ya lo fue en `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md`

El prompt pidió explícitamente auditar este DTO "campo por campo, sin excepciones" bajo la
premisa de que "nunca fue auditado en ningún documento anterior, por ser una acción de
Administrador sobre un Comercio". Releyendo `docs/AUDITORIA-FORMULARIOS-PENDIENTES.md` (punto
6, líneas 101-110), **sí fue auditado** — con exactamente el mismo nivel de detalle que se
reprodujo en la Parte 2 de este documento (campo `motivo` sin `@NotBlank`, obligatoriedad
condicional a nivel Service, texto libre a propósito sin ENUM, divergencia de redacción entre
capas). La premisa del prompt de esta auditoría (que probablemente venía de la propia
auditoría de Comercio, que en su punto 14 de la Parte 1 y su Hallazgo 5 decía "no se auditó
`AprobacionComercioRequestDTO` campo por campo **en ese documento**") es correcta en cuanto a
que la auditoría de *Comercio* no lo hizo — pero eso no significa que ningún documento lo
hubiera hecho antes. Se deja esta discrepancia documentada explícitamente porque afecta la
narrativa de "qué es nuevo en este tramo": la Parte 2, punto 1, de este documento es una
**re-verificación contra el código actual** de algo ya conocido, no un descubrimiento nuevo —
aunque la re-verificación sí aporta valor real (confirma que nada cambió, agrega la cobertura
de test relevada, que la auditoría de 2026-09-01 no incluía).

### 2. Confirmado: el backend de RedSocial (ya documentado como huérfano de frontend en la auditoría de Comercio) también está ausente de las pantallas de Administrador que muestran datos de comercio — gap real, punto específico pedido en el prompt

`ComercioAdminResponseDTO.java` (líneas 24-83) — el DTO que alimenta tanto
`admin-comercios-pendientes.html`/`admin-comercio-detalle.html` (comercios pendientes) como
`admin-comercios.html` (comercios aprobados) — **no tiene ningún campo `redesSociales`**,
confirmado por lectura completa de la clase (17 campos: `id`, `nombre`, `descripcion`,
`fotoPerfilUrl`, `telefono`, `emailContacto`, `emailCuenta`, `tipoComercio`, `aceptaDelivery`,
`aceptaRetiro`, `estado`, `razonSocial`, `cuit`, `condicionIva`, `fechaRegistro`, `direccion`,
`horarios`, `representante` — ninguno relacionado a redes sociales). `AdministradorService.aAdminResponseDTO`
(líneas 138-176) tampoco resuelve ni consulta `RedSocialRepository`/`RedSocialService` en
ningún punto. Confirmado además que `renderComercioDetailSections` (`admin.js:435-524`, la
función compartida que arma tanto el detalle de pendientes como el modal de aprobados) no
tiene ninguna sección "Redes Sociales" — sus secciones son "Datos del Comercio", "Datos
Legales / Fiscales", "Dirección", "Modalidades de Entrega" y, condicionales, "Representante
Legal" y "Horarios Registrados". `grep` de "redSocial"/"RedSocial"/"redesSociales" sobre
`ComercioAdminResponseDTO.java` y sobre `admin.js` completo: cero resultados en ambos.

**Pantallas exactas donde debería mostrarse y no lo hace:** `admin-comercio-detalle.html`
(comercio pendiente, HU-A02: "visualizar comercios pendientes de aprobación con sus datos de
registro" — un comercio carga entre 1 y 5 redes sociales obligatoriamente en el registro,
ninguna llega a la vista del Administrador que decide si aprobarlo) y el modal de detalle de
`admin-comercios.html` (comercio ya aprobado, mismo componente compartido). Es el mismo gap ya
identificado en la auditoría de Comercio (Hallazgo 1: "backend completo, bien probado, sin
ningún consumidor en el frontend"), confirmado ahora también desde el lado de quien aprueba el
alta — el Administrador nunca tuvo, en ningún punto del flujo, la posibilidad de ver las redes
sociales de un comercio antes de decidir si aprobarlo o rechazarlo.

### 3. El requisito funcional de "listado completo de comercios/clientes con filtros por estado y búsqueda por nombre" no está implementado — ninguna de las dos capacidades existe

`../01. Análisis de Requerimientos/04. Requisitos Funcionales/requisitos-funcionales-administrador.md`,
sección "Supervisión General" (líneas 44-48): *"Ambos listados deben soportar filtros por
estado y búsqueda por nombre."* Confirmado por lectura completa de `admin-comercios.html`/
`admin-clientes.html` y de las funciones `initAdminComercios`/`initAdminClientes` en
`admin.js`: **ninguna de las dos pantallas tiene un chip de filtro por estado ni un input de
búsqueda por nombre** — a diferencia de `admin-categorias.html`/`admin-tags.html`, que sí
tienen `chip-row` de filtro (Todas/Activas/Inactivas). El único orden aplicado es alfabético
por nombre (`.sort((a,b) => a.nombre.localeCompare(b.nombre))`, `admin.js:705`, `759`), no un
filtro. Consistente además con el gap de backend ya documentado en `CLAUDE.md` §6 (Fase 15
§2.4, AD07/AD11): no existe ningún `@RequestParam` de búsqueda ni de filtro en
`AdministradorController.listarComerciosAprobados`/`listarClientes` — el filtro por estado que
sí existe (`APROBADO` para comercios) está hardcodeado en el Service, no es un parámetro que
el Administrador pueda variar desde la UI.

### 4. `TipoNotificacion` tiene 13 valores relacionados a funcionalidades de Administrador no implementadas, definidos pero nunca instanciados — confirma que el modelo de datos "ya sabe" qué viene, el código todavía no

`backend/src/main/java/com/bajonea/backend/enums/TipoNotificacion.java` (35 líneas, 30
valores) incluye `COMERCIO_SUSPENDIDO`, `NUEVO_COMERCIO_PENDIENTE`, `NUEVA_RESOLICITUD_COMERCIO`,
`NUEVO_RECLAMO`, `RECLAMO_APROBADO`, `RECLAMO_RECHAZADO`, `NUEVO_MENSAJE_SOPORTE`,
`CUENTA_INACTIVADA`, `COMERCIO_INACTIVADO`, `CLIENTE_SUSPENDIDO`, `SUSPENSION_LEVANTADA`,
`INVITACION_EMPLEADO`, `EMPLEADO_DESACTIVADO` — 13 de los 30 valores del enum, ninguno usado en
ningún `Service` del proyecto (`grep` de cada uno sobre `backend/src/main/java/.../services/`:
cero resultados). Solo `COMERCIO_APROBADO`/`COMERCIO_RECHAZADO` (los 2 usados por
`AdministradorService.resolverAprobacion`) están realmente conectados a lógica de negocio. Esto
confirma indirectamente el requisito funcional "El sistema debe notificar al administrador ante
nuevos comercios pendientes de revisión" (`requisitos-funcionales-administrador.md`, sección
"Gestión de Usuarios", línea 20) como **no implementado**: el valor `NUEVO_COMERCIO_PENDIENTE`
existe en el enum pero nunca se dispara, y de todos modos el Administrador no tiene ninguna
campana de notificaciones en su UI — confirmado ya en `CLAUDE.md` §6 Tramo 8 ("Bell de
notificaciones deliberadamente omitido del header de Administrador... ningún
`notificacionService.crear(...)` del proyecto apunta nunca a un usuario Administrador").

### 5. `requisitos-funcionales-administrador.md` nombra la tabla de historial de Comercio como `HistorialAccionComercio` — el nombre real en código y en el diccionario de datos es `HistorialEstadoComercio`

Sección "Gestión de Comercios" del requisito (líneas 8, 12): *"El sistema registra la acción en
el historial de acciones del comercio (HistorialAccionComercio)"* / *"El sistema debe registrar
un historial de acciones sobre cada comercio (HistorialAccionComercio)"*. La entidad real,
tanto en `backend/src/main/java/com/bajonea/backend/entities/HistorialEstadoComercio.java`
(reincorporada en la Fase 8 del MVP original, ver `CLAUDE.md` §5, entidad #22) como en
`docs/diccionario-de-datos.md` (sección "Tabla: HistorialEstadoComercio", con la misma
estructura de columnas que el requisito describe: `estado_origen`, `estado_destino`, `motivo`,
`fecha_hora`, `administrador_id`), se llama `HistorialEstadoComercio`, no
`HistorialAccionComercio`. Es un desajuste de nomenclatura entre el documento de requisitos y
el resto del proyecto (código + diccionario coinciden entre sí) — no un campo faltante ni una
tabla distinta, la estructura descrita coincide en sustancia. Se deja documentado porque el
prompt pidió contrastar explícitamente contra los requisitos funcionales de Administrador.

### 6. El tile "Comercios" del dashboard muestra un conteo de TODOS los estados pero enlaza a una pantalla que solo lista `APROBADO` — el número visible no coincide con la cantidad de filas que se ven al entrar

`MetricasAdminResponseDTO.comerciosTotal` = `comercioRepository.count()`
(`AdministradorService.java:91`), sin ningún filtro de estado — cuenta comercios `PENDIENTE`,
`APROBADO`, `RECHAZADO`, `CERRADO_TEMPORALMENTE`, etc. El tile del dashboard que muestra ese
número (`admin.js:205`, `{ ..., subtitulo: `${metricas.comerciosTotal} registrados`, href:
'admin-comercios.html' }`) enlaza a una pantalla que llama
`administradorService.listarComerciosAprobados()` (solo `EstadoComercio.APROBADO`,
`AdministradorService.java:64-68`). En cualquier base con comercios pendientes o rechazados
(el caso normal, no un edge case: los datos de prueba reales de Fase 16/17 siempre tienen
comercios en más de un estado), el número del tile del dashboard será mayor a la cantidad de
filas que el Administrador ve al entrar a `admin-comercios.html` — no es un bug de cálculo (el
conteo es correcto para lo que dice, "registrados"), pero es una experiencia de usuario
potencialmente confusa no señalada antes en ningún documento revisado. No confirmado si esto es
una decisión de diseño deliberada (mostrar el total real, aunque el listado detrás sea un
subconjunto) o un gap sin detectar — se documenta como discrepancia observada, sin asumir cuál
de las dos es.

### 7. El requisito de "no se puede eliminar una categoría/tag con productos asociados" no está implementado como bloqueo — es una decisión de diseño ya documentada y aceptada, no una omisión nueva

`requisitos-funcionales-administrador.md`, sección "Gestión de Categorías" (línea 29): *"No es
posible eliminar una categoría que tenga productos asociados (activos o históricos). El
administrador debe primero desactivarla o reasignar los productos."* Mismo texto para Tags
(línea 39). Releyendo `CategoriaService.baja`/`TagService.baja` (líneas 59-64/59-64
respectivamente): ninguno de los dos consulta `cantidadProductos` antes de dar de baja — la
baja lógica (`activo=false`) siempre tiene éxito, sin importar cuántos productos tenga asociados
la categoría/tag. Esto **no es un hallazgo nuevo**: `CLAUDE.md` §6 (Fase 16, Tramo 9) ya lo
documenta explícitamente como decisión de diseño confirmada con Diego — *"la captura decía 'no
se puede deshacer' pero `CategoriaService.baja()`/`TagService.baja()` son reversibles
(`activo=false`, `reactivar()` ya existe)... sin bloqueo de borrado por uso (confirmado, misma
decisión de diseño ya documentada en Fase 15 §2.2 para AD18/AD22, no un hueco nuevo)"*. Se deja
documentado acá porque el requisito funcional formal todavía describe el comportamiento
bloqueante original, sin haberse actualizado para reflejar la decisión de UX real tomada
después — un desajuste de documentación, no de código (el código es intencional).

### 8. Confirmado sin discrepancia: el listado de Clientes no distingue "Suspendido" de forma alcanzable — coherente con que ese estado nunca se asigna

`admin.js` sí tiene un mapeo completo de color/label para los 5 valores de `EstadoUsuario`
(`LABELS_ESTADO_USUARIO`/`DOT_ESTADO_USUARIO`, líneas 88-102), incluido `SUSPENDIDO` — pero
como ya se documentó en la Parte 1, ningún `Cliente` puede llegar a ese estado en el código
actual (nunca asignado). No es una inconsistencia del frontend (el mapeo está completo y
correcto respecto al enum), es simplemente una rama de UI construida para un estado que el
backend todavía no sabe producir — mismo patrón que el resto de los hallazgos de "Suspensión"
de este documento, dejado como confirmación explícita, no un hallazgo adicional.

---

## Parte 4 — Valores límite exactos

Para los patrones ya documentados como compartidos con Cliente/Comercio (DNI, teléfono
argentino, email, password segura, código postal, URL de red social, URL de Cloudinary), sin
uso propio en el rol Administrador — remite a la tabla ya existente en
`docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md`, Parte 4. Lo que sigue es exclusivo o distintivo de
Administrador.

### Longitudes

| Campo | Columna física (`docs/diccionario-de-datos.md`) | Límite de validación real |
|---|---|---|
| `Categoria.nombre` | No confirmado línea por línea en esta pasada (fuera del modelo MVP recortado histórico, `docs/modelo-mvp.md`, no en `docs/diccionario-de-datos.md` v1.5 completo — `Categoria`/`Tag` son entidades del recorte MVP original, siguen vigentes sin cambios en `bajonea_final`). | `@Size(max=100)`, sin mensaje custom. `maxlength="100"` HTML — coincide. |
| `Tag.nombre` | Idem. | `@Size(max=100)`, sin mensaje custom. `maxlength="100"` HTML — coincide. |
| `AprobacionComercioRequestDTO.motivo` | `HistorialEstadoComercio.motivo`: VARCHAR(500) (`docs/diccionario-de-datos.md:801`, columna real del historial donde termina persistido). | `@Size(max=500)`, sin mensaje custom. `maxlength="500"` HTML — coincide. |
| `ConfiguracionTarifa.cargo_cliente`/`cargo_comercio` | DECIMAL(10,2) (`docs/diccionario-de-datos.md:822-823`) | **No aplica — sin implementación real, ver Parte 1.** Documentado acá únicamente porque el prompt pedía explícitamente sus rangos si la entidad existiera; no hay ningún `RequestDTO`/anotación que auditar. |

### Regex exactos

Ninguno propio de Administrador — `CategoriaRequestDTO.nombre`/`TagRequestDTO.nombre` no
tienen ningún `@Pattern` (confirmado en Parte 2, es la "alineación vacía" ya señalada:
cualquier string no vacío pasa). `AprobacionComercioRequestDTO.motivo` es texto libre sin
regex, a propósito (ver Parte 2, punto 1).

### Rangos numéricos y enums cerrados

| Campo | Rango / valores |
|---|---|
| `AprobacionComercioRequestDTO.aprobar` | `Boolean`, sin enum — `true`/`false`, `@NotNull`. |
| `EstadoComercio` (transiciones reales alcanzables desde `AdministradorService`) | Únicamente `PENDIENTE → APROBADO` y `PENDIENTE → RECHAZADO`, ambas vía `resolverAprobacion`. Los otros 4 valores del enum (`SUSPENDIDO`, `INACTIVO`, `CERRADO_TEMPORALMENTE`) existen pero **ninguno es alcanzable desde una acción de Administrador** — `CERRADO_TEMPORALMENTE`/`INACTIVO` los asigna `AuthService` como efecto colateral del bloqueo/inactivación del Dueño titular (no una acción directa sobre el Comercio), `SUSPENDIDO` es inalcanzable en su totalidad (ver Parte 1). |
| `EstadoUsuario` (transiciones reales alcanzables desde `AdministradorService`) | **Ninguna** — `AdministradorService` no muta `Usuario.estado` en absoluto, ni de Cliente ni de nadie. Las 5 transiciones reales del enum (`PENDIENTE→ACTIVO`, `→BLOQUEADO`, `→INACTIVO`, `INACTIVO→ACTIVO`) las gestiona `AuthService`, sin intervención de Administrador. `SUSPENDIDO` inalcanzable en su totalidad. |
| Categorías/Tags — cantidad | Sin tope superior de cantidad de categorías/tags que puede crear un Administrador (a diferencia de, por ejemplo, el tope de 5 redes sociales de un Comercio). |
| `TipoNotificacion` valores usados realmente por `AdministradorService` | 2 de 30: `COMERCIO_APROBADO`, `COMERCIO_RECHAZADO` (ver Parte 3, punto 4, para el resto). |

---

## Cierre

**Formularios/flujos relevados:** 7 con inventario propio en la Parte 1 (Aprobación/rechazo de
Comercio, Listado de comercios aprobados, Listado de Clientes, Perfil propio del Administrador,
Gestión de Categorías, Gestión de Tags, Logout) + 4 compartidos con Cliente/Comercio
referenciados sin re-auditar (Login, Verificación de cuenta, Recuperación de contraseña,
Reactivación de cuenta) — 3 de ellos (Aprobación/rechazo, Categorías, Tags) con tabla campo por
campo completa en la Parte 2.

**Discrepancias reales encontradas:** 8, documentadas en la Parte 3 — la más relevante es la
confirmación del gap de redes sociales (punto 2, el punto específico pedido en el prompt),
seguida de la corrección sobre la premisa del propio prompt respecto a
`AprobacionComercioRequestDTO` (punto 1) y la confirmación de que "filtros por estado y
búsqueda por nombre" del requisito funcional de Supervisión General no existe en ninguna capa
(punto 3).

**De la lista tentativa de Parte 1, confirmado como NO implementado en el backend actual:**
Re-solicitud de aprobación de comercio rechazado, Suspensión/reactivación de comercios,
Suspensión/reactivación de clientes, Configuración de tarifas de servicio
(`ConfiguracionTarifa`), Gestión de Reclamos, Soporte (resolución de mensajes de usuarios
suspendidos) — los 6 puntos de la lista tentativa que el prompt marcaba como "posiblemente
todavía no construidos" resultaron efectivamente ausentes, ninguno con ni siquiera un
`Controller`/`Service` parcial. Únicamente Aprobación/rechazo de comercios y Gestión de
Categorías/Tags, de la lista original de 9 puntos tentativos, están realmente implementados.

No cerrado — a la espera de que Diego confirme el checklist completo antes de dar por
terminada esta fase.
