# Auditoría Postman — cierre pendiente de Fase 10 / Fase 14 (previo a Fase 17 Playwright)

> Documento de **relevamiento**, no de decisión. Generado el 2026-07-31 leyendo directamente los 14 `@RestController` reales de `backend/src/main/java/com/bajonea/backend/controllers/`, `SecurityConfig.java`, `postman/Bajonea-MVP.postman_collection.json` (estado conocido: 49 requests / 113 assertions, Fase 14) y `docs/DECISIONES.md` completo. No se modificó ningún archivo de código, DTO, ni la colección de Postman.
>
> **Hallazgo transversal antes de entrar al detalle:** el backend real tiene **69 endpoints** en 14 Controllers (67 de uso normal + 2 exclusivos del perfil `test`), no los 43 que `CLAUDE.md` documenta como cierre de la Fase 13 (2026-07-19). Hay al menos dos oleadas de endpoints nuevos posteriores a ese cierre — visibles en el código (`AuthController`, flujo de verificación por código de 6 dígitos, reenvío de verificación, `RateLimitFotoRegistroFilter`) pero **no reflejadas en la narrativa de fases de `CLAUDE.md`** (los comentarios Javadoc del propio código mencionan "Tramo 16.11" y "Tramo 16.12", que no aparecen en el índice de fases de `CLAUDE.md` §6). Esto excede el alcance de este documento (que es Postman, no auditar `CLAUDE.md`), pero se deja registrado acá porque explica gran parte de los gaps de las secciones B y D: la colección de Postman se armó en la Fase 14 (2026-07-19), antes de que buena parte de estos endpoints existiera.
>
> **Hallazgo más grave, confirmado cruzando `docs/DECISIONES.md` completo con el JSON de la colección: no es solo que falten endpoints — la colección actual está rota contra el backend actual.** Ver §E más abajo antes de decidir cualquier plan de acción; cambia la prioridad de todo lo demás en este documento.

---

## A) Inventario completo de endpoints reales

Fuente: los 14 `@RestController`. Ningún Controller usa `@PreAuthorize`/`@Secured`/`@RolesAllowed` (verificado con grep, cero resultados) — toda la autorización por rol es 100% vía matchers de path en `SecurityConfig.java` (`authorizeHttpRequests`), no anotaciones a nivel de método. La columna "Rol" refleja esos matchers, en el orden en que `SecurityConfig` los evalúa.

### A.1 — `AuthController` (`/api/v1/auth`)

| # | Verbo | Path | Rol | Request DTO | Response DTO |
|---|---|---|---|---|---|
| 1 | POST | `/registro/cliente` | público | `RegistroClienteRequestDTO` | `ApiResponse<UsuarioResponseDTO>` |
| 2 | POST | `/registro/comercio` | público | `RegistroComercioRequestDTO` | `ApiResponse<UsuarioResponseDTO>` |
| 3 | POST | `/registro/comercio/foto-firma` | público (rate-limited, ver §D) | — | `ApiResponse<CloudinarySignatureResponseDTO>` |
| 4 | POST | `/login` | público | `LoginRequestDTO` | `ApiResponse<LoginResponseDTO>` |
| 5 | GET | `/verificar/{token}` | público | path var | `ApiResponse<Void>` |
| 6 | POST | `/verificar` | público | `VerificarCodigoRequestDTO` | `ApiResponse<Void>` |
| 7 | POST | `/reenviar-verificacion` | público | `ReenviarVerificacionRequestDTO` | `ApiResponse<Void>` |
| 8 | POST | `/recuperar-password` | público | `RecuperacionPasswordRequestDTO` | `ApiResponse<Void>` |
| 9 | POST | `/recuperar-password/validar-codigo` | público | `ValidarCodigoRecuperacionRequestDTO` | `ApiResponse<Void>` |
| 10 | POST | `/recuperar-password/confirmar` | público | `ConfirmarRecuperacionPasswordRequestDTO` | `ApiResponse<Void>` |
| 11 | POST | `/reactivar-cuenta` | público | `ReactivacionCuentaRequestDTO` | `ApiResponse<Void>` |
| 12 | POST | `/reactivar-cuenta/confirmar` | público | `ConfirmarReactivacionCuentaRequestDTO` | `ApiResponse<Void>` |
| 13 | POST | `/cambiar-password` | autenticado (cualquier rol) | `CambioPasswordPerfilRequestDTO` | `ApiResponse<Void>` |
| 14 | POST | `/logout` | autenticado (cualquier rol) | — | `ApiResponse<Void>` |

### A.2 — `AdministradorController` (`/api/v1/administrador`) — todo `ROLE_ADMINISTRADOR`

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 15 | GET | `/comercios/pendientes` | — | `ApiResponse<List<ComercioAdminResponseDTO>>` |
| 16 | GET | `/comercios` | — | `ApiResponse<List<ComercioAdminResponseDTO>>` |
| 17 | GET | `/clientes` | — | `ApiResponse<List<ClienteAdminResponseDTO>>` |
| 18 | GET | `/perfil` | — | `ApiResponse<AdministradorResponseDTO>` |
| 19 | GET | `/metricas` | — | `ApiResponse<MetricasAdminResponseDTO>` |
| 20 | PUT | `/comercios/{comercioId}/resolver` | `AprobacionComercioRequestDTO` | `ApiResponse<Void>` |

### A.3 — `CarritoController` (`/api/v1/carrito`) — todo `ROLE_CLIENTE`

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 21 | GET | `` (raíz) | — | `ApiResponse<CarritoResponseDTO>` |
| 22 | POST | `/items` | `ItemCarritoRequestDTO` | `ApiResponse<CarritoResponseDTO>` |
| 23 | PUT | `/items/{id}` | `ActualizarCantidadItemCarritoRequestDTO` | `ApiResponse<CarritoResponseDTO>` |
| 24 | DELETE | `/items/{id}` | — | `ApiResponse<CarritoResponseDTO>` |
| 25 | DELETE | `` (raíz) | — | `ApiResponse<Void>` |

### A.4 — `CatalogoController` (`/api/v1/catalogo`) — todo público

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 26 | GET | `/comercios` | — | `ApiResponse<List<ComercioPublicoResponseDTO>>` |
| 27 | GET | `/comercios/{id}/productos?categoriaId=&tagId=` | query params | `ApiResponse<List<ProductoResponseDTO>>` |
| 28 | GET | `/productos?categoriaId=&tagIds=&q=&pagina=` | query params | `ApiResponse<ProductosPaginadosResponseDTO>` |
| 29 | GET | `/filtros` | — | `ApiResponse<FiltrosCatalogoResponseDTO>` |

### A.5 — `CategoriaController` (`/api/v1/categorias`) — GET: autenticado (cualquier rol); resto: `ROLE_ADMINISTRADOR`

| # | Verbo | Path | Rol | Request DTO | Response DTO |
|---|---|---|---|---|---|
| 30 | POST | `` (raíz) | ADMINISTRADOR | `CategoriaRequestDTO` | `ApiResponse<CategoriaResponseDTO>` |
| 31 | PUT | `/{id}` | ADMINISTRADOR | `CategoriaRequestDTO` | `ApiResponse<CategoriaResponseDTO>` |
| 32 | GET | `` (raíz) | autenticado | — | `ApiResponse<List<CategoriaResponseDTO>>` |
| 33 | DELETE | `/{id}` | ADMINISTRADOR | — | `ApiResponse<Void>` |
| 34 | PUT | `/{id}/reactivar` | ADMINISTRADOR | — | `ApiResponse<CategoriaResponseDTO>` |

### A.6 — `ClienteController` (`/api/v1/clientes`) — todo `ROLE_CLIENTE`

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 35 | GET | `/perfil` | — | `ApiResponse<ClienteResponseDTO>` |
| 36 | PUT | `/perfil` | `ClienteEditarPerfilRequestDTO` | `ApiResponse<ClienteResponseDTO>` |

### A.7 — `ComercioController` (`/api/v1/comercios`) — todo `ROLE_COMERCIO`

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 37 | GET | `/perfil` | — | `ApiResponse<ComercioResponseDTO>` |
| 38 | PUT | `/perfil` | `ComercioPerfilRequestDTO` | `ApiResponse<ComercioResponseDTO>` |
| 39 | POST | `/perfil/foto/firma` | — | `ApiResponse<CloudinarySignatureResponseDTO>` |
| 40 | PUT | `/perfil/foto` | `FotoPerfilComercioRequestDTO` | `ApiResponse<ComercioResponseDTO>` |

### A.8 — `GeografiaController` (`/api/v1/geografia`) — todo público

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 41 | GET | `/provincias` | — | `ApiResponse<List<ProvinciaResponseDTO>>` |
| 42 | GET | `/localidades?provinciaId=` | query param (`@RequestParam` obligatorio, sin default) | `ApiResponse<List<LocalidadResponseDTO>>` |

### A.9 — `HealthController` — público

| # | Verbo | Path | Response DTO |
|---|---|---|---|
| 43 | GET | `/health` | `ApiResponse<String>` |

### A.10 — `NotificacionController` (`/api/v1/notificaciones`) — sin matcher propio en `SecurityConfig`, cae en `anyRequest().authenticated()` → cualquier rol autenticado

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 44 | GET | `` (raíz) | — | `ApiResponse<List<NotificacionResponseDTO>>` |
| 45 | PUT | `/{id}/leida` | — | `ApiResponse<NotificacionResponseDTO>` |
| 46 | GET | `/no-leidas/contador` | — | `ApiResponse<Long>` |

### A.11 — `PedidoController` (`/api/v1/pedidos`) — mixto: `/cliente/**` → `ROLE_CLIENTE`, `/comercio/**` → `ROLE_COMERCIO`

| # | Verbo | Path | Rol | Request DTO | Response DTO |
|---|---|---|---|---|---|
| 47 | POST | `/cliente` | CLIENTE | `PedidoRequestDTO` | `ApiResponse<PedidoResponseDTO>` |
| 48 | GET | `/cliente` | CLIENTE | — | `ApiResponse<List<PedidoResponseDTO>>` |
| 49 | GET | `/comercio` | COMERCIO | — | `ApiResponse<List<PedidoResponseDTO>>` |
| 50 | GET | `/comercio/resumen-hoy` | COMERCIO | — | `ApiResponse<ResumenPedidosHoyResponseDTO>` |
| 51 | PUT | `/comercio/{id}/aceptar` | COMERCIO | — | `ApiResponse<PedidoResponseDTO>` |
| 52 | PUT | `/comercio/{id}/rechazar` | COMERCIO | `RechazoPedidoRequestDTO` | `ApiResponse<PedidoResponseDTO>` |

### A.12 — `ProductoController` (`/api/v1/productos`) — todo `ROLE_COMERCIO`

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 53 | POST | `` (raíz) | `ProductoRequestDTO` | `ApiResponse<ProductoResponseDTO>` |
| 54 | PUT | `/{id}` | `ProductoRequestDTO` | `ApiResponse<ProductoResponseDTO>` |
| 55 | GET | `` (raíz) | — | `ApiResponse<List<ProductoResponseDTO>>` |
| 56 | PATCH | `/{id}/estado` | `CambioEstadoProductoRequestDTO` | `ApiResponse<ProductoResponseDTO>` |
| 57 | POST | `/{id}/cloudinary/firma` | — | `ApiResponse<CloudinarySignatureResponseDTO>` |
| 58 | POST | `/{id}/imagenes` | `ImagenProductoRequestDTO` | `ApiResponse<ImagenProductoResponseDTO>` |
| 59 | DELETE | `/{id}/imagenes/{imagenId}` | — | `ApiResponse<Void>` |
| 60 | PATCH | `/{id}/imagenes/{imagenId}/orden` | `OrdenImagenRequestDTO` | `ApiResponse<ImagenProductoResponseDTO>` |
| 61 | POST | `/{id}/imagenes/{imagenId}/recorte/firma` | — | `ApiResponse<CloudinarySignatureResponseDTO>` |
| 62 | PATCH | `/{id}/imagenes/{imagenId}/url` | `UrlImagenRequestDTO` | `ApiResponse<ImagenProductoResponseDTO>` |

### A.13 — `TagController` (`/api/v1/tags`) — GET: autenticado (cualquier rol); resto: `ROLE_ADMINISTRADOR`

| # | Verbo | Path | Rol | Request DTO | Response DTO |
|---|---|---|---|---|---|
| 63 | POST | `` (raíz) | ADMINISTRADOR | `TagRequestDTO` | `ApiResponse<TagResponseDTO>` |
| 64 | PUT | `/{id}` | ADMINISTRADOR | `TagRequestDTO` | `ApiResponse<TagResponseDTO>` |
| 65 | GET | `` (raíz) | autenticado | — | `ApiResponse<List<TagResponseDTO>>` |
| 66 | DELETE | `/{id}` | ADMINISTRADOR | — | `ApiResponse<Void>` |
| 67 | PUT | `/{id}/reactivar` | ADMINISTRADOR | — | `ApiResponse<TagResponseDTO>` |

### A.14 — `TestController` (`/api/v1/test`) — público en la lista de rutas, pero **solo existe bajo `spring.profiles.active=test`** (`@Profile("test")` en el Controller y en `TestSupportService`; fuera de ese perfil Spring no registra el bean ni la ruta)

| # | Verbo | Path | Request DTO | Response DTO |
|---|---|---|---|---|
| 68 | GET | `/token-verificacion?email=` | query param | `ApiResponse<String>` |
| 69 | GET | `/token?email=&tipo=` | query params (`tipo` = `TipoToken`: `VERIFICACION_EMAIL`\|`RECUPERACION_PASSWORD`\|`REACTIVACION_CUENTA`) | `ApiResponse<String>` |

---

## B) Endpoints reales vs. cobertura en Postman

Colección: `postman/Bajonea-MVP.postman_collection.json`, 49 requests, estado conocido de Fase 14 (113/113 assertions). Cruzado endpoint por endpoint contra las 9 carpetas reales de la colección.

| Endpoint | ¿Existe en Postman? | Notas |
|---|---|---|
| POST `/auth/registro/cliente` | Sí | Caso feliz (201) + negativo `localidadId` inexistente (404). Sin negativo de email duplicado ni de password débil. |
| POST `/auth/registro/comercio` | Sí | Caso feliz x2 (Comercio A y B, 201). Sin negativo de CUIT duplicado ni de email duplicado. |
| POST `/auth/registro/comercio/foto-firma` | No | Endpoint público sin auth, protegido por `RateLimitFotoRegistroFilter` (5 req/min/IP → 429) — sin ningún request en la colección, ni caso feliz ni el 429. |
| POST `/auth/login` | Sí | Caso feliz x4 (Cliente, Comercio A, Comercio B, Admin) + negativo password incorrecta (401). Sin negativo de email inexistente, sin probar el bloqueo al 3er intento fallido, sin probar login con `estado` `PENDIENTE`/`BLOQUEADO`/`INACTIVO`/`SUSPENDIDO`. |
| GET `/auth/verificar/{token}` | Sí | Caso feliz x3 (Cliente, Comercio A, Comercio B), siempre combinado con el bypass `/test/token-verificacion`. Sin negativo de token inválido/ya usado/expirado. |
| POST `/auth/verificar` (código de 6 dígitos) | No | Segundo mecanismo de verificación (Tramo 16.11, no documentado en el índice de `CLAUDE.md`), con límite de 5 intentos fallidos que invalida el token — cero cobertura. |
| POST `/auth/reenviar-verificacion` | No | Sin ningún request; incluye la regla de "no lanza excepción si el email no existe" (corrección de user enumeration, Tramo 16.12) sin ningún test que la ejercite. |
| POST `/auth/recuperar-password` | No | Sin cobertura pese a ser parte del alcance ampliado de Fase 7 (`docs/DECISIONES.md`, 2026-07-17) — nunca se probó end-to-end vía Postman, solo hay evidencia manual documentada en el checklist de cierre de Fase 7. |
| POST `/auth/recuperar-password/validar-codigo` | No | Sin cobertura. |
| POST `/auth/recuperar-password/confirmar` | No | Sin cobertura. |
| POST `/auth/reactivar-cuenta` | No | Sin cobertura. |
| POST `/auth/reactivar-cuenta/confirmar` | No | Sin cobertura. |
| POST `/auth/cambiar-password` | No | Sin cobertura vía Postman — la Fase 7 lo probó manualmente con `curl` (checklist §6.7bis), nunca se automatizó en la colección. |
| POST `/auth/logout` | No | Sin cobertura — mismo caso: probado manual en Fase 7, nunca en Postman. Regla real asociada (cierre de `Sesion`, JWT deja de servir en la siguiente request) sin test de regresión. |
| GET `/administrador/comercios/pendientes` | Sí | Caso feliz (200) + negativo con token de Cliente (403, tenant/rol). Sin negativo con token de Comercio ni sin token (401). |
| GET `/administrador/comercios` (aprobados) | No | Endpoint agregado en el Tramo 16.21 (posterior a Fase 14) — no existía cuando se armó la colección. |
| GET `/administrador/clientes` | No | Mismo caso — Tramo 16.21, posterior a Fase 14. |
| GET `/administrador/perfil` | No | Mismo caso — Tramo 16.21, posterior a Fase 14. |
| GET `/administrador/metricas` | No | Endpoint del Tramo 16.8 (dashboard de Admin), posterior a Fase 14. |
| PUT `/administrador/comercios/{id}/resolver` | Parcial | Solo caso feliz de aprobación (x2, Comercio A y B). Sin ningún request de rechazo (`aprobar: false` + motivo), pese a que `MotivoRechazo` es un enum del modelo con varios valores. Sin negativo de comercio ya resuelto (doble resolución) ni de comercio inexistente. |
| POST `/categorias` | Sí | Solo caso feliz (201). Sin negativo de nombre duplicado, sin rol insuficiente (Cliente/Comercio intentando crear). |
| PUT `/categorias/{id}` | No | Sin cobertura. |
| GET `/categorias` | No | Sin cobertura directa (nunca se pide el listado en ningún request; el `categoria_id` se obtiene del `data.id` de la creación). |
| DELETE `/categorias/{id}` | No | Sin cobertura — incluye la regla real de que la baja es reversible (`activo=false`, no hard delete), sin test que lo confirme. |
| PUT `/categorias/{id}/reactivar` | No | Sin cobertura. |
| POST `/tags` | Sí | Mismo patrón que categorías: solo caso feliz (201). |
| PUT `/tags/{id}` | No | Sin cobertura. |
| GET `/tags` | No | Sin cobertura directa. |
| DELETE `/tags/{id}` | No | Sin cobertura. |
| PUT `/tags/{id}/reactivar` | No | Sin cobertura. |
| GET `/clientes/perfil` | No | `ClienteController` completo (Fase 16a, posterior a Fase 14) sin ningún request en la colección. |
| PUT `/clientes/perfil` | No | Mismo caso — incluye la regla de que `email`/`dni`/`fechaNacimiento` se ignoran si vienen en el body, sin test. |
| GET `/comercios/perfil` | No | `ComercioController` self-service, sin cobertura (existía desde Fase 9, antes de Fase 14, pero nunca se agregó). |
| PUT `/comercios/perfil` | No | Sin cobertura. |
| POST `/comercios/perfil/foto/firma` | No | Sin cobertura (Fase 11, previo a Fase 14, tampoco se agregó nunca). |
| PUT `/comercios/perfil/foto` | No | Sin cobertura. |
| POST `/productos` | Sí | Caso feliz x2 (Comercio A y B, 201), incluye assertion de que nace `DISPONIBLE`. Sin negativo de producto con `categoriaId` inexistente, sin Cliente/Admin intentando crear (403). |
| PUT `/productos/{id}` | No | Sin cobertura. |
| GET `/productos` (propio del comercio) | No | Sin cobertura — nunca se lista el catálogo propio de un Comercio vía Postman. |
| PATCH `/productos/{id}/estado` | Parcial | **Solo el negativo** (producto inexistente → 404). No hay ningún caso feliz que pruebe la transición real `DISPONIBLE → AGOTADO` (o cualquier otra) contra un producto propio existente. |
| POST `/productos/{id}/cloudinary/firma` | Sí | Caso feliz (200) + assertion explícita de que la firma no expone `api_secret`. |
| POST `/productos/{id}/imagenes` | Sí | Caso feliz x5 (imágenes 1 a 5, incluida la principal) + negativo de la 6ª imagen (409, límite de galería). Buena cobertura. |
| DELETE `/productos/{id}/imagenes/{imagenId}` | No | Sin cobertura. |
| PATCH `/productos/{id}/imagenes/{imagenId}/orden` | No | Sin cobertura. |
| POST `/productos/{id}/imagenes/{imagenId}/recorte/firma` | No | Sin cobertura (feature de Tramo 16.22, posterior a Fase 14). |
| PATCH `/productos/{id}/imagenes/{imagenId}/url` | No | Sin cobertura (mismo tramo). |
| GET `/catalogo/comercios` | Sí | Caso feliz (200), confirma que el Comercio A aprobado aparece. |
| GET `/catalogo/comercios/{id}/productos` | Sí | Caso feliz (200), confirma galería completa de 5 imágenes. |
| GET `/catalogo/productos` (búsqueda global) | No | Endpoint con paginación/búsqueda/filtros — sin cobertura, no existía en Fase 14. |
| GET `/catalogo/filtros` | No | Sin cobertura, no existía en Fase 14. |
| GET `/carrito` | Sí | Caso feliz (200), assertion de subtotal (3000 = 2 × 1500). |
| POST `/carrito/items` | Sí | Caso feliz x2 (comercio A, luego comercio B tras el primer pedido) + negativo de producto de otro comercio mientras el carrito sigue activo (409, "un comercio a la vez"). |
| PUT `/carrito/items/{id}` | No | Sin cobertura — endpoint de actualizar cantidad, sin ningún request. |
| DELETE `/carrito/items/{id}` | No | Sin cobertura. |
| DELETE `/carrito` (vaciar) | No | Sin cobertura. |
| POST `/pedidos/cliente` | Sí | Caso feliz x2 (pedido a Comercio A y a Comercio B), assertion de que nace `PENDIENTE`. Sin negativo de carrito vacío, sin negativo de `tipoEntrega: DELIVERY` sin `direccionId`. |
| GET `/pedidos/cliente` | No | Sin cobertura — nunca se lista el historial de pedidos del propio Cliente. |
| GET `/pedidos/comercio` | Sí | Caso feliz (200), confirma que el pedido pendiente aparece. |
| GET `/pedidos/comercio/resumen-hoy` | No | Endpoint del Tramo 16.5 (posterior a Fase 14), sin cobertura. |
| PUT `/pedidos/comercio/{id}/aceptar` | Sí | Caso feliz (200), assertion de transición a `EN_PREPARACION`. Sin negativo de pedido ya resuelto, sin negativo de Comercio B intentando aceptar un pedido de Comercio A (tenant isolation). |
| PUT `/pedidos/comercio/{id}/rechazar` | Sí | Caso feliz (200) con motivo `SIN_STOCK` + comentario, assertion de transición a `RECHAZADO`. Sin negativo de pedido ya resuelto ni de motivo inválido. |
| GET `/notificaciones` | Sí | Caso feliz (200), confirma notificaciones de aceptado/rechazado presentes. |
| PUT `/notificaciones/{id}/leida` | Sí | Caso feliz (200), assertion de `leida: true`. Sin negativo de notificación de otro usuario (tenant isolation). |
| GET `/notificaciones/no-leidas/contador` | Sí | Caso feliz (200), solo status + mensaje, sin assertion sobre el valor numérico real. |
| GET `/health` | Sí | Caso feliz (200). |
| GET `/geografia/provincias` | Sí | Caso feliz (200), confirma Tierra del Fuego presente. |
| GET `/geografia/localidades?provinciaId=` | Sí | Caso feliz (200), confirma Río Grande presente + negativo sin `provinciaId` (400). |
| GET `/test/token-verificacion` | Sí | Usado x3 como soporte de otros tests (no es el objeto bajo test en sí). |
| GET `/test/token` (genérico) | No | El endpoint genérico (`tipo` = cualquier `TipoToken`) no tiene ningún request propio en la colección — solo existe el más antiguo `/test/token-verificacion`, que es un caso particular. Sin este, no hay forma de automatizar recuperación de contraseña / reactivación de cuenta contra el backend real sin depender de un email real. |

**Resumen numérico:** de 67 endpoints "de producto" (excluyendo los 2 de `TestController`), **27 están cubiertos** (algunos solo parcialmente) y **40 no tienen ningún request en la colección**. De los 27 cubiertos, la enorme mayoría solo tiene el caso feliz — muy pocos tienen algún negativo (401/403/404/409) más allá de los que ya se documentan explícitamente arriba.

---

## C) Verificación de email: endpoint real, bypass de test, y equivalencia de estado final

**Endpoint real de verificación (2 variantes, ambas mutan el mismo estado):**

1. `GET /api/v1/auth/verificar/{token}` (`AuthController.verificarEmail` → `AuthService.verificarEmail(String token)`, `AuthService.java:117`) — resuelve el token literal recibido por URL (típicamente el link del email).
2. `POST /api/v1/auth/verificar` (`AuthController.verificarEmailConCodigo` → `AuthService.verificarEmailConCodigo(VerificarCodigoRequestDTO)`, `AuthService.java:134`) — variante más nueva (Tramo 16.11) que valida un código de 6 dígitos contra el email, con límite de 5 intentos fallidos antes de invalidar el token (`usado = true`).

Las dos hacen exactamente lo mismo a nivel de estado — mismo bloque de código en ambos métodos:
```java
Usuario usuario = tokenEntity.getUsuario();
usuario.setEstado(EstadoUsuario.ACTIVO);
usuarioRepository.save(usuario);
```
Es decir: **el único campo que cambia es `Usuario.estado`, de `PENDIENTE` a `ACTIVO`** (más el propio `Token.usado = true` al consumirse, vía `consumirToken(tokenEntity)`, compartido por ambos flujos).

**Bypass de test:** `GET /api/v1/test/token-verificacion?email=` (`TestController` → `TestSupportService.obtenerTokenVerificacionPendiente`, exclusivo del perfil `test` vía `@Profile("test")`). Este endpoint **no verifica nada por sí mismo** — solo hace un `SELECT` del token pendiente (`Token` con `tipo=VERIFICACION_EMAIL`, `usado=false`, el más reciente) y lo devuelve como string. Es un reemplazo únicamente para "leer el email real" (que hoy sí funciona vía Resend, Fase 10), no un atajo que salte la verificación en sí — el token devuelto se pasa igual al endpoint real `GET /auth/verificar/{token}`, que es el que efectivamente cambia el estado.

**Conclusión:** confirmado — el bypass deja al usuario en el mismo estado final (`ACTIVO`) que el flujo real vía Resend, porque no reemplaza la verificación, solo la obtención del token que de otro modo vendría del cuerpo del email. La única diferencia observable es *cómo se obtiene* el valor del token, no qué hace la verificación con él. Este comportamiento no cambió desde que se documentó en Fase 14 (`docs/DECISIONES.md`, 2026-07-19).

**Gap adicional confirmado en `docs/DECISIONES.md` (relevante para Fase 10, no solo Fase 14):** la prueba de "email real" que cerró formalmente la Fase 10 (2026-07-20, `bukle.arg@gmail.com`) se hizo contra el mecanismo **viejo** de verificación por link/UUID (`GET /auth/verificar/{token}`). El Tramo 16.11 (2026-07-24) cambió el mecanismo primario a un código de 6 dígitos (`POST /auth/verificar`), y el Tramo 16.12 (2026-07-28) extendió el mismo cambio a recuperación de password y reactivación de cuenta. **No hay ninguna entrada posterior en `docs/DECISIONES.md` que documente una repetición de la prueba de email real contra el nuevo copy/formato de código de 6 dígitos** — el cierre formal de Fase 10 con evidencia real quedó atado a un mecanismo que ya no es el que usan 2 de los 3 tipos de token (y que dejó de ser el primario incluso para verificación de cuenta). Esto es relevante para decidir el alcance de Fase 17: un registro real → email real de Resend con el código de 6 dígitos → `POST /auth/verificar` es un candidato natural a caso E2E, y también cerraría esta deuda de Fase 10 de paso.

**Gap real de cobertura relacionado (no de comportamiento):** el bypass genérico `GET /test/token?email=&tipo=` (que cubre también `RECUPERACION_PASSWORD` y `REACTIVACION_CUENTA`, generalizado explícitamente en Fase 14 para ese propósito — ver `CLAUDE.md` §6, fila Fase 14) **no tiene ningún request en la colección de Postman**, pese a existir desde 2026-07-19. Es la pieza que falta para poder automatizar `POST /auth/recuperar-password/confirmar` y `POST /auth/reactivar-cuenta/confirmar` sin depender de un email real — hoy esos dos flujos completos no están en la colección en absoluto (ver tabla B).

---

## D) Reglas de negocio documentadas sin assertion en la colección actual

Cruzando `CLAUDE.md` + `docs/DECISIONES.md` + lectura directa del código contra las 113 assertions reales de la colección.

**Confirmadas SIN cobertura:**

| Regla | Dónde se define | Cobertura en Postman |
|---|---|---|
| Bloqueo de cuenta tras 3 intentos fallidos de login (`usuario.estado = BLOQUEADO`, `409` en el 4° intento) | `AuthService.MAX_INTENTOS_FALLIDOS = 3`; checklist de cierre de Fase 7 §6.7bis | Ninguna. Solo hay 1 intento fallido de login (401), nunca se llega al 3°/4°. |
| Bloqueo de cuenta tras 3 intentos fallidos de cambio de password desde perfil | Mismo mecanismo (`registrarIntentoFallido`), alcance ampliado Fase 7 | Ninguna — `/auth/cambiar-password` no tiene ningún request. |
| Login rechazado según `estado` del usuario (`PENDIENTE`/`BLOQUEADO`/`INACTIVO`/`SUSPENDIDO`) vía `validarEstadoParaLogin` | `AuthService.java`, checklist Fase 7 | Ninguna — todos los logins de la colección son contra usuarios recién verificados y `ACTIVO`. |
| Expiración de token de recuperación de password (30 min) | `AuthService.EXPIRACION_RECUPERACION_PASSWORD_MIN = 30`; `CLAUDE.md` §1 | Ninguna — el flujo de recuperación completo no está en la colección. |
| Expiración de token de reactivación de cuenta (24hs) | `AuthService.EXPIRACION_REACTIVACION_CUENTA_HORAS = 24`; `CLAUDE.md` §1 | Ninguna — mismo motivo. |
| Expiración de token de verificación de email (24hs, agregado junto con el flujo de código) | `AuthService.EXPIRACION_VERIFICACION_EMAIL_HORAS = 24` | Ninguna. |
| Límite de 5 intentos fallidos de código de verificación (invalida el token, `usado=true`) | `AuthService.MAX_INTENTOS_TOKEN_VERIFICACION = 5`, Tramo 16.11 punto 2 — con un bug real ya corregido (el rollback deshacía el `usado=true`) | Ninguna — el flujo `POST /auth/verificar` (código) no está en la colección en absoluto. |
| Invalidación real de sesión (`Sesion.activa=false`) en: recuperación de password, bloqueo de cuenta, login concurrente, logout manual | `CLAUDE.md` §1/§7, checklist Fase 7 (`cerrarSesionActivaSiExiste`) | Ninguna — ningún request de la colección hace un segundo login/logout para confirmar que el JWT anterior deja de servir. |
| No exponer `api_secret` de Cloudinary en la firma | `CloudinaryService`, `CLAUDE.md` §validaciones | **Sí cubierta** — único caso de esta lista con assertion real (`pedir-firma-cloudinary-para-imagen-de-producto`, línea 451-454 de la colección). Se incluye acá solo para confirmar que SÍ está cubierta, no como gap. |
| Límite de 5 imágenes por producto (409 en la 6ª) | `ProductoService`, Fase 11 | **Sí cubierta** — assertion real (`[negativo] Agregar imagen 6`). Confirmado, no es un gap. |
| Tenant isolation vía 404 en vez de 403 (un Comercio no puede operar sobre un recurso de otro Comercio) | Patrón general documentado en `docs/CONCURRENCIA-Y-TRANSACCIONES.md` y aplicado en varios Services (ej. `ProductoService`, `PedidoService`) | **No verificado en ningún lado de la colección** — el único negativo de aislamiento que existe es de **rol** (Cliente contra endpoint de Admin → 403, `negativo-listar-comercios-pendientes-con-token-de-cliente`), no de **tenant** (ej. Comercio B intentando aceptar/rechazar/editar un recurso de Comercio A → debería dar 404, nunca se prueba). El propio Tramo 8 de Fase 16 (`CLAUDE.md`) documenta este patrón como verificado manualmente contra el frontend, pero no vía Postman. |
| Exclusión mutua `clienteId`/`comercioId` en `Direccion` (`@DireccionExclusionMutua`) | `CLAUDE.md` §5bis, catálogo de validaciones | Ninguna — no hay ningún request que envíe una `Direccion` con ambos IDs o ninguno. |
| `ComercioPublicoResponseDTO` sin campo `representante` (el DNI del representante no debe viajar sin autenticación) | Corrección retroactiva documentada en `CLAUDE.md` (Tramo 8, 2026-07-22) | Ninguna — el request `Listar comercios del catálogo` no tiene ninguna assertion que confirme la ausencia del campo `representante` en la respuesta pública. |
| Unicidad de email (Cliente/Comercio) | Regla de negocio implícita de `Usuario.email` | Ninguna — no hay ningún negativo de registro con email duplicado. |
| Unicidad de CUIT (Comercio) | Regla de negocio implícita de `RegistroComercioRequestDTO`/`@ValidarCuit` | Ninguna — no hay ningún negativo de registro con CUIT duplicado. |
| Unicidad de DNI (Cliente) | Regla de negocio implícita | Ninguna. |
| `GET /geografia/localidades` sin `provinciaId` → 400 | Ya cubierta (bug real corregido en Fase 8, `docs/DECISIONES.md` 2026-07-18: excepción no cubierta se enmascaraba como 401) | **Sí cubierta** — assertion real. Se lista para contraste: es el único ejemplo de un bug real de Fase 8 que sí terminó con test de regresión. |
| Rate limit de `POST /auth/registro/comercio/foto-firma` (5 req/min/IP → 429) | `RateLimitFotoRegistroFilter.java` — sin mención en `CLAUDE.md` en absoluto | Ninguna — ni el endpoint ni el filtro tienen ningún request. |
| Reversibilidad de baja de Categoría/Tag (`activo=false`, no hard delete; `reactivar()` ya probado en Fase 8) | Tramo 9 de Fase 16, `CLAUDE.md` | Ninguna vía Postman — ni `DELETE /categorias/{id}` ni `PUT /categorias/{id}/reactivar` (ni sus equivalentes de tag) están en la colección. |
| `PATCH /productos/{id}/estado` — transición real de estado (`DISPONIBLE`→`AGOTADO`, etc.) contra un producto propio existente | `EstadoProducto` enum (`DISPONIBLE`/`AGOTADO`/`DESCONTINUADO`) | **Sin caso feliz** — solo existe el negativo de producto inexistente (404). La transición real nunca se ejercita. |
| `EstadoComercio` — comercio `RECHAZADO`/`SUSPENDIDO`/`INACTIVO`/`CERRADO_TEMPORALMENTE` intentando operar (login, publicar producto, etc.) | Enum de 6 valores, guard de frontend documentado en Tramo 5 de Fase 16, pero backend (`SecurityConfig`) no bloquea por `Comercio.estado`, solo por rol — confirmado explícitamente en `CLAUDE.md` como deuda conocida | Ninguna — ningún request prueba qué pasa si un Comercio `RECHAZADO` intenta usar su JWT contra un endpoint de `ROLE_COMERCIO`. Dado que `CLAUDE.md` ya documenta que `SecurityConfig` no lo bloquea, este es candidato fuerte a test explícito (para fijar el comportamiento actual, sea o no el deseado). |
| Pedido ya resuelto (`EN_PREPARACION`/`RECHAZADO`) — reintentar aceptar/rechazar | `EstadoPedido` enum, ciclo recortado `PENDIENTE → EN_PREPARACION/RECHAZADO` | Ninguna — no hay negativo de doble resolución de un mismo pedido. |
| Carrito con `tipoEntrega: DELIVERY` sin `direccionId` | `PedidoRequestDTO`/`PedidoService` | Ninguna — los 2 pedidos de la colección usan `RETIRO`, nunca `DELIVERY`. |

**Ampliación tras la lectura completa de `docs/DECISIONES.md` (reglas adicionales no visibles solo con el código actual, por ser reglas de negocio en `Service`, no en anotaciones de DTO):**

| Regla | Dónde se define | Cobertura en Postman |
|---|---|---|
| `EstadoComercio.CERRADO_TEMPORALMENTE` — comercio bloqueado (3 intentos fallidos de login) o fuera de horario **no puede recibir pedidos** | `ComercioService.validarAceptaPedidos()`, invocado en `CarritoService.agregarItem`/`PedidoService.confirmarPedido` (Tramo 16.14, 2026-07-28) — **bug crítico real corregido** en este mismo tramo: antes, un comercio cerrado o bloqueado podía seguir recibiendo pedidos porque la única validación de horario vivía en el frontend (cosmética, sin respaldo real en el backend) | Ninguna — ningún request agrega al carrito o confirma un pedido contra un comercio cerrado por horario o `CERRADO_TEMPORALMENTE`. Dado que es un bug ya corregido una vez, es el candidato más fuerte de toda esta lista para un test de regresión explícito. |
| Cantidad de ítem de carrito: clamp a 20 (agregar el mismo producto de nuevo *suma* en vez de rechazar, hasta el tope) | `CarritoService`, decisión documentada 2026-07-17 (cambio respecto al diseño original que rechazaba) | Ninguna — el único `agregarItem` de la colección es contra un carrito vacío, nunca se prueba agregar el mismo producto dos veces ni el tope de 20. |
| Producto debe estar `DISPONIBLE` para agregarse al carrito (`409` si `AGOTADO`/`DESCONTINUADO`) | `CarritoService.agregarItem` | Ninguna. |
| Purga de carrito + reseteo de `Carrito.comercio=null` cuando el único producto del carrito pasa a `AGOTADO`/`DESCONTINUADO` | `ProductoService.limpiarCarritosActivos` — bug real corregido en Tramo 3 de Fase 16 (2026-07-21): antes no reseteaba `Carrito.comercio`, dejando un `409` falso de "un comercio a la vez" en el siguiente intento de agregar cualquier producto | Ninguna. |
| Confirmar pedido con carrito vacío → `409` | `PedidoService.confirmarPedido` | Ninguna. |
| Confirmar pedido `RETIRO` contra un comercio con `aceptaRetiro=false` (o `DOMICILIO` con `aceptaDelivery=false`) | `PedidoService.confirmarPedido` | Ninguna. |
| Doble aceptación/rechazo de un pedido ya resuelto → `409` | `PedidoService` | Ninguna (ya señalado arriba, se repite acá por completitud del cruce con `docs/DECISIONES.md`). |
| Unicidad de DNI del representante de Comercio, cross-role (contra Cliente, Administrador, u otro representante) | Corrección retroactiva 2026-07-22, ampliada explícitamente a "sin excepción" cross-role | Ninguna — no hay ningún negativo de DNI de representante duplicado contra otro rol. |
| User enumeration en `recuperar-password`/`reactivar-cuenta`: respuesta 200 genérica siempre, exista o no el email | Vulnerabilidad real encontrada y corregida en Tramo 16.12 (2026-07-28) — antes una excepción sin capturar revelaba indirectamente si el email existía | Ninguna — ninguno de los dos flujos está en la colección (ver tabla B), así que tampoco está la regresión de esta corrección puntual. |
| Límite de 5 intentos de código de verificación/recuperación/reactivación antes de invalidar el token | `AuthService.MAX_INTENTOS_TOKEN_VERIFICACION`, Tramo 16.11/16.12 — con reintento automático ante colisión de código de 6 dígitos agregado en Tramo 16.12 | Ninguna. |
| Validador de teléfono argentino rechaza strings con letras (`"2964000000asd"`) | Bug real corregido en Tramo 16.21 (2026-07-29) en Java **y** JS — antes la sanitización de formato descartaba las letras en silencio antes de validar el charset | Ninguna — no hay ningún negativo de teléfono con caracteres no numéricos en ningún registro. |
| Reorden concurrente de imágenes de producto no debe generar deadlock de MySQL | Deadlock real (`Error 1213`) encontrado en Tramo 16.22 (2026-07-29) bajo escritura paralela al recalcular `esPrincipal`; mitigado con loop secuencial en el **frontend** — el backend en sí sigue siendo vulnerable a la carrera si algo más disparara requests paralelos | Ninguna — fuera del alcance de Postman en su forma actual (requeriría requests concurrentes reales, más apto para un test de integración dedicado que para Postman/Newman secuencial). Se deja registrado para que quede como decisión consciente, no como omisión. |

**Nota metodológica:** la primera tabla de esta sección se construyó cruzando `CLAUDE.md` + lectura directa del código; esta segunda tabla incorpora hallazgos que solo aparecían en `docs/DECISIONES.md` completo (2310 líneas, leídas íntegramente por un subagente de research en paralelo) — mayormente bugs reales ya corregidos una vez, que son los candidatos más fuertes a test de regresión porque ya se sabe que el comportamiento incorrecto es posible si el fix se rompe.

---

## E) Hallazgo crítico: la colección no solo tiene gaps — está rota contra el backend actual

Esto surge de cruzar `docs/DECISIONES.md` completo (2310 líneas, 2026-07-16 a 2026-07-31) con el JSON real de la colección ya leído en la sección B. Verificado de forma independiente (no solo citado de `docs/DECISIONES.md`): abrí `RegistroComercioRequestDTO.java` y confirmé que los 5 campos de representante son `@NotBlank`/`@NotNull` (obligatorios), y el body guardado en la colección para "Registro Comercio A"/"Registro Comercio B" (`postman/Bajonea-MVP.postman_collection.json`, líneas 104 y 118) **no incluye ninguno de esos 5 campos**.

**Cronología del quiebre:**

1. **2026-07-22** — corrección retroactiva agrega 5 campos obligatorios (`nombreRepresentante`, `apellidoRepresentante`, `dniRepresentante`, `telefonoRepresentante`, `fechaNacimientoRepresentante`) a `POST /auth/registro/comercio`. La colección de Postman (cerrada el 2026-07-19, 3 días antes) nunca se actualizó.
2. **2026-07-28 (Tramo 16.12)** — cambio de contrato, sin mantener compatibilidad hacia atrás (decisión explícita del dueño del proyecto): `POST /auth/recuperar-password/confirmar` pasa de `{token, nuevaPassword}` a `{email, codigo, nuevaPassword}`; `GET /reactivar-cuenta/confirmar/{token}` se **elimina** y se reemplaza por `POST /auth/reactivar-cuenta/confirmar` con `{email, codigo}`. (Sin impacto directo en la colección actual porque ninguno de los dos flujos llegó a tener un request ahí — ver tabla B — pero sí bloquea cualquier intento de reconstruirlos copiando la forma vieja.)
3. **2026-07-29 (Tramo 16.22)** — `PATCH /productos/{id}/imagenes/{imagenId}/principal` (si alguna vez existió un plan de agregarlo a la colección) queda **eliminado** del backend, reemplazado por recálculo automático de imagen principal.
4. **2026-07-30 (Tramo 16.23)** — primera corrida real de Newman contra el backend actual desde el cierre de Fase 14, documentada en `docs/DECISIONES.md`: **la colección falla por completo**, por 3 causas combinadas:
   - `postman.cliente@bajonea.test` ya existe de una corrida parcial anterior → `409` en vez de `201` esperado (esto es un problema de higiene de datos de entorno, no de contrato — se resuelve limpiando la base o generando emails únicos por corrida, no es un bug de código).
   - `Registro Comercio A`/`B` → `400` real por los 5 campos de representante faltantes (confirmado arriba, es un problema de contrato).
   - Efecto cascada: sin comercios creados, toda la carpeta `03 - Administrador` en adelante (`04 - Productos`, `05 - Catálogo`, `06 - Carrito`, `07 - Pedidos`, `08 - Notificaciones` — el 90% de la colección) falla en cadena, porque cada carpeta depende de variables de entorno (`comercio_a_id`, `producto_id`, etc.) que nunca se setean.
   - **No se corrigió en ese tramo** — quedó como gap documentado a decisión de Diego, según `docs/DECISIONES.md`.

**Consecuencia práctica para este relevamiento:** los "27 endpoints cubiertos" de la sección B reflejan lo que la colección *prueba si corre*, no lo que *corre hoy sin tocar nada*. Contra la base real, tal como está commiteada ahora mismo, la corrida se cae en la request #9 (`Registro Comercio A`) salvo que se corra por primera vez contra una base sin ese email/CUIT usado antes — y aun así seguiría fallando el resto de comercios porque los 5 campos de representante no están.

Esto cambia el orden de prioridades: antes de pensar en sumar cobertura nueva (Playwright o Postman), **la colección existente necesita una reparación mínima de contrato** para volver a ser una regresión confiable — separado de la discusión de qué gaps de la sección B/D vale la pena cerrar.

---

## Resumen para la conversación de decisión

1. **Antes que nada: la colección está rota, no solo incompleta.** Contra la base real tal como está commiteada hoy, Newman se cae en la request de registro de Comercio A (`400`, faltan los 5 campos de representante obligatorios desde el 2026-07-22) y arrastra en cascada el 90% de las carpetas siguientes — confirmado tanto en `docs/DECISIONES.md` (corrida real de Tramo 16.23, 2026-07-30) como de forma independiente abriendo el DTO y el JSON de la colección. Esto no es una opinión de este relevamiento, es un hecho verificable ahora mismo. Ver §E.
2. **La colección quedó desactualizada por el ritmo del proyecto, no por descuido puntual**: se cerró formalmente en Fase 14 (2026-07-19) y desde entonces el backend sumó al menos 20 endpoints nuevos y 2 cambios de contrato sin retrocompatibilidad (recuperación de password y reactivación de cuenta pasaron de link/UUID a código de 6 dígitos, Tramo 16.12). Ninguno de esos endpoints ni cambios tiene testing automatizado hoy.
3. **Los flujos de recuperación de password y reactivación de cuenta** — parte formal del alcance del MVP desde la enmienda de Fase 7 — nunca tuvieron cobertura en Postman, ni siquiera en el cierre original de Fase 14, y además cambiaron de contrato después. La pieza que lo permitiría (`GET /test/token?email=&tipo=`, generalizado justamente para esto) existe pero no se usó nunca.
4. **El patrón de aislamiento por tenant** (Comercio A no puede tocar recursos de Comercio B) está probado manualmente contra el frontend según la documentación, pero no tiene ningún assertion automatizado vía API — sigue siendo el gap de seguridad con más impacto potencial de esta lista.
5. **El bug de `CERRADO_TEMPORALMENTE`/horario (Tramo 16.14)** — un comercio cerrado o bloqueado podía recibir pedidos igual, hasta que se corrigió — es el candidato más fuerte a test de regresión de todo el relevamiento: es la única regla de esta lista que ya se rompió una vez en producción del proyecto (no una hipótesis), y hoy no tiene ningún assertion que la proteja de romperse de nuevo.
6. **`PATCH /productos/{id}/estado`** es el único endpoint con un negativo pero sin ningún caso feliz — vale la pena notarlo porque es un patrón inverso al resto (todo lo demás que falta, falta por completo).

**Sugerencia de secuencia, para la conversación, no como decisión tomada:** (a) reparar el contrato roto de la colección existente (§E) antes de sumarle nada — hoy no sirve como red de seguridad; (b) recién ahí decidir cuánto de los gaps de §B/§D conviene cerrar en Postman/Newman (API pura, rápido de iterar) vs. dejar para Playwright (Fase 17, más caro de mantener, mejor para flujos de UI completos como el de verificación por email real). Quedo a la espera de esa decisión.
