# Reconstrucción de carpetas 09-21 de la colección de Postman (174 requests)

Continuación directa del tramo cerrado en el commit `4f6f249` (reconstrucción de las
matrices 22-41). Cubre lo que quedó pendiente del mismo incidente de `git checkout --`
sobre `postman/Bajonea-MVP.postman_collection.json`: las 13 carpetas entre "08 -
Notificaciones" y "22 - Matriz Cliente - Registro" (numeradas 09 a 21 — 13 carpetas, no
12 como estimaba el prompt de arranque; la cuenta real de 174 requests sí coincidía).

A diferencia del tramo 22-41, acá **no existía ningún documento de auditoría de respaldo**
— toda la reconstrucción se hizo leyendo el código real del backend (Entities/DTOs/
Services/Controllers) y verificando cada caso contra un backend levantado en perfil
`test` sobre `bajonea_test`, sin ningún assertion escrito "a ojo".

## Carpetas reconstruidas y fuente leída para cada una

| # | Carpeta | Requests | Fuente principal leída |
|---|---|---|---|
| 09 | Auth avanzado (código, recuperación, reactivación, cambiar-password, logout) | 38 | `AuthController`, `AuthService` (completo), `TestController`/`TestSupportService`, `RegistroService`, `RegistroComercioRequestDTO`, `RateLimitFotoRegistroFilter`, `application-test.properties` |
| 10 | Administrador (endpoints nuevos y reglas de aprobación) | 18 | `AdministradorController`, `AdministradorService`, `AprobacionComercioRequestDTO` |
| 11 | Categorías y Tags (CRUD completo) | 16 | `CategoriaController`/`CategoriaService`, `TagController`/`TagService`, `SecurityConfig` (regla GET abierto a cualquier autenticado) |
| 12 | Cliente perfil | 5 | `ClienteController`, `ClienteService`, `ClienteEditarPerfilRequestDTO` |
| 13 | Comercio perfil y foto | 6 | `ComercioController`, `ComercioService`, `ComercioPerfilRequestDTO`, `FotoPerfilComercioRequestDTO` |
| 14 | Productos extras (editar, imágenes, estados) | 18 | `ProductoController`, `ProductoService` (completo), `OrdenImagenRequestDTO`, `UrlImagenRequestDTO`, `CambioEstadoProductoRequestDTO`, `ImagenProductoRequestDTO` |
| 15 | Carrito extras (cantidad, eliminar, purga por agotado) | 10 | `CarritoController`, `CarritoService`, `ItemCarritoRequestDTO`, `ActualizarCantidadItemCarritoRequestDTO`, `ProductoService.limpiarCarritosActivos` |
| 16 | Catálogo extras (búsqueda global, filtros) | 6 | `CatalogoController`, `CatalogoService`, `ProductoService.listarCatalogoGlobal/listarFiltrosDisponibles` |
| 17 | Pedidos extras (tenant isolation, doble resolución, carrito vacío) | 10 | `PedidoController`, `PedidoService` (completo) |
| 18 | Notificaciones extras (tenant isolation) | 3 | `NotificacionController`, `NotificacionService` |
| 19 | Bloqueo de comercio por intentos fallidos (CERRADO_TEMPORALMENTE) | 15 | `AuthService.registrarIntentoFallido/propagarBloqueoAComercio`, `ComercioService.validarAceptaPedidos` |
| 20 | Autorización (401 sin token) | 9 | `SecurityConfig` (mapa completo de rutas por rol), `CustomAuthenticationEntryPoint` |
| 21 | Redes Sociales | 20 | `RedSocialController`, `RedSocialService` (completo), `RedSocialRequestDTO`, `TipoRedSocial` |

Total: **174 requests**, verificados 1 a 1 contra el backend real antes de escribirse
como definitivos (perfil `test`, `bajonea_test`, backend en `localhost:8080`).

## Discrepancias reales encontradas (nombre rescatado vs. comportamiento real)

1. **Folder 09, ítem "6/5, rate limit" — conflicto de configuración entre dos suites de
   test, no un bug de la app.** `RateLimitFotoRegistroFilter` limita
   `POST /auth/registro/{comercio,cliente}/foto-firma` a 5/min por IP por diseño (valor
   real de producción). `application-test.properties` sube ese límite a 1000/min
   **a propósito**, para que la suite de Playwright (Fase 17) pueda registrar muchos
   comercios seguidos sin toparse con un 429 real. Bajo esa configuración compartida, el
   6º pedido de firma nunca da 429 — da 200 como los 5 anteriores.
   Se verificó el comportamiento real de todos modos: se reinició el backend una vez con
   `-Dapp.rate-limit.foto-registro-por-minuto=5` (el default real), se confirmó 429 en el
   6º pedido con el mensaje exacto `"Demasiadas solicitudes. Esperá un minuto e intentá de
   nuevo."`, y se volvió a levantar el backend con el perfil `test` estándar para el resto
   de la sesión. El assertion quedado en la colección refleja ese comportamiento real de
   producción — **es sabido que este caso puntual no va a dar 429 corriendo la colección
   completa bajo `application-test.properties` tal cual está hoy**; no es un defecto de
   esta reconstrucción ni de la app, es una limitación conocida y documentada de compartir
   un único archivo de propiedades de test entre dos suites con necesidades opuestas sobre
   el mismo rate limit.

2. **Folder 21, cantidad de requests.** `docs/AUDITORIA-EXHAUSTIVA-COMERCIO.md` (Parte 2,
   tabla de cobertura, punto 9) menciona "17 requests" para esta carpeta al describir el
   estado del proyecto en una fecha anterior. La lista rescatada real
   (`tree-completo-nombres.txt`, líneas 204-223) tiene **20** nombres de request distintos.
   Se reconstruyeron los 20 nombres rescatados (fuente primaria, literal, de lo que existía
   antes del incidente) en vez de recortar a 17 — la cifra de la auditoría es aproximada/de
   una versión anterior de la carpeta, no una lista cerrada de nombres.

3. **Ningún otro nombre rescatado resultó contradecir el comportamiento real observado.**
   Todas las demás reglas de negocio (tenant isolation con 404 en vez de 403, transiciones
   de `EstadoProducto`, bloqueo de cuenta y propagación a `Comercio.estado =
   CERRADO_TEMPORALMENTE`, límite de 5 redes sociales activas, reactivación de un tipo de
   red social dado de baja, etc.) se comportaron exactamente como el nombre del request
   rescatado sugería.

## Bugs reales encontrados y corregidos durante la verificación (propios de esta
reconstrucción, no de la app)

Al correr la colección nueva por primera vez con Newman contra un backend recién
levantado, aparecieron 12 assertions fallidas en 2 carpetas — ambas por el mismo patrón de
error en el test-script que yo mismo escribí, no por el comportamiento del backend:

- **Folder 11** ("GET categorias confirma que la dada de baja sigue apareciendo"): el
  script comparaba `String(c.id) === pm.environment.get('categoria2_id')` — pero
  `pm.environment.get` devuelve el valor tal cual se guardó (un `number`, porque
  `pm.environment.set('categoria2_id', json.data.id)` guarda el id numérico crudo), así
  que la comparación contra un `String` nunca daba `true`.
- **Folder 15** (mismo patrón, 3 sitios: alta de item en el carrito con Producto Purga/
  Purga 2, y edición de cantidad): mismo problema con `producto_purga_id`,
  `producto_purga2_id` e `item_carrito_extra_id`.

Corregido envolviendo también el lado de `pm.environment.get(...)` en `String(...)` en
los 4 sitios. Re-verificado con Newman: **0 fallas atribuibles a este patrón** en la
corrida siguiente.

## Resultado de Newman

### Corrida aislada de las 13 carpetas nuevas (09-21), con fixtures reales pre-sembrados

Contra `bajonea_test` recién reseteada, con Comercio A/B aprobados, categoría/tag,
producto A/B y pedido A/B sembrados una sola vez vía un script de bootstrap (mismo
payload completo — `horarios`/`redesSociales`/`fotoPerfilUrl`/representante — que
`RegistroComercioRequestDTO` exige hoy):

- **174/174 requests ejecutados**, 0 fallas de request.
- **332/334 assertions en verde.** Las 2 que no pasan son, exactamente, las 2 del caso de
  rate limit documentado arriba (punto 1) — comportamiento esperado bajo
  `application-test.properties`, no una falla real.

### Corrida completa literal de las 42 carpetas (00-41), desde una base recién reseteada

Tal como pide el Paso 3 del prompt original, sin sembrar nada de antemano:

- 621 requests ejecutados (0 fallas de conexión), **355/1099 assertions fallidas**,
  concentradas en las carpetas 02, 03, 04, 05, 06, 07, 08 (ya documentadas como deuda
  técnica previa) y, por efecto cascada, en todas las carpetas nuevas y viejas que dependen
  de fixtures compartidas que esas carpetas rotas nunca llegan a poblar
  (`comercio_a_id`, `token_comercio`, `producto_id`, `pedido_id`, etc.): 09, 10, 11, 12,
  13, 14, 15, 17, 18, 19, 21, y también **30, 31, 39, 40, 41** — carpetas ya reconstruidas
  y commiteadas en el tramo anterior.

**Verificación de que esto no es una regresión de esta sesión:** se extrajo la versión de
la colección tal cual estaba commiteada antes de este tramo (`git show HEAD:...`, 29
carpetas, sin 09-21) y se corrió con Newman contra la misma base recién reseteada, sin
ningún seed previo. Resultado: **155/774 assertions fallidas**, con el desglose por
carpeta **idéntico, número por número**, al de la corrida completa de esta sesión para
cada carpeta que ambas corridas tienen en común (39=38, 04=23, 30=21, 02=21, 41=20,
40=14, 07=14, 03=11, 31=9, 08=8, 06=5, 05=4 fallas, en ambas corridas). Esto confirma que
la causa raíz (los payloads de `Registro Comercio A/B` en la carpeta 02 quedaron
desactualizados frente a los campos que `RegistroComercioRequestDTO` exige hoy —
`horarios`, `redesSociales`, `fotoPerfilUrl` y los 5 campos del representante, sumados en
fases posteriores a cuando se escribió esa carpeta) es **anterior a esta sesión y ajena a
ella** — folders 22-41 ya fallaban así en un run limpio desde cero antes de que existiera
ninguna carpeta 09-21, e insertar las carpetas nuevas no les agregó ni les quitó ninguna
falla. Confirmado explícitamente: `git diff --stat` del commit de esta sesión muestra
**7669 inserciones, 0 eliminaciones** sobre el archivo de la colección — ningún byte de
las carpetas 00-08 ni 22-41 fue tocado.

Por diseño, y siguiendo el mismo criterio de nombres rescatados (que ya usaban
`{{comercio_a_id}}`, `{{token_comercio}}`, `{{producto_id}}`, `{{pedido_id}}`, etc. como
variables compartidas en vez de crear sus propios fixtures), las carpetas 09-21 dependen
de esas mismas variables globales tal como las poblarían las carpetas 00-08 si
funcionaran — no se rediseñaron como self-contained (a diferencia de las matrices 22-41)
porque eso hubiera sido inventar una estructura distinta a la que efectivamente existía
antes del incidente. La corrida aislada de arriba demuestra que, con esas variables
pobladas, las 174 requests nuevas son correctas.

**No se tocaron las carpetas 00-08 en esta sesión**, conforme a la instrucción explícita
del prompt de arranque — arreglarlas queda fuera de este tramo.

## Limpieza de datos de prueba

Al terminar toda la verificación, se corrió `testing/playwright/scripts/reset-db.mjs` una
última vez contra `bajonea_test` y se confirmó con `SELECT COUNT(*)` que las tablas
`comercio`, `producto`, `pedido`, `categoria`, `tag`, `red_social`, `carrito` y
`notificacion` quedaron en **0 filas** — solo persiste la fila de `admin@bajonea.ar` que
el propio script de reset siembra como parte de su baseline (no es un remanente de esta
sesión).

## Commit

```
9ffa105a35cbd959f869fc9d56b60463d084bae9
postman: reconstruir carpetas 09-21 (174 requests) tras pérdida por git checkout accidental, reconstruidas directo desde código
```

Incluye únicamente `postman/Bajonea-MVP.postman_collection.json` (7669 inserciones, 0
eliminaciones), conforme a la excepción autorizada por Diego para esta sesión.

**Nota aparte, fuera del commit:** `postman/Bajonea-Local.postman_environment.json` quedó
con 5 variables nuevas agregadas (`token_verif_comercioC`, `token_verif_comercioD`,
`producto_purga_id`, `producto_purga2_id`, `item_carrito_delete_id`) que las carpetas
09/19/15 necesitan y que no existían en el archivo — necesarias para que la colección
funcione de verdad al abrirla en Postman, pero el archivo ya venía con cambios sin
commitear de la sesión anterior (reformateo + variables de las carpetas 22-41) y no se
incluyó en el commit de este tramo, siguiendo el mismo criterio de "solo el archivo de la
colección" de la excepción autorizada.

## Cierre

El cierre formal de este tramo, como el resto, queda a criterio de Diego.
