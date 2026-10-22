# Plan del Tramo T3 de la Fase 2: precios no modificables dentro de una franja (2026-10-22)

Plan de trabajo, sin código todavía. Sale de `docs/AUDITORIA-FASE2-TURNOS.md` (punto 12: secciones 5, 9 y 10; "aud. N" = sección N), de las decisiones de Diego para este tramo y de una relectura del código **tal como quedó después de T2** (commits `f59c95a`, `149a825`, `a2d9b81` y `539d7b6`). Formato como `docs/PLAN-FASE2-T2.md`: verificación previa, decisiones fijadas, reglas de dominio, entrega A (backend, tests y estrés), entrega B (pantallas y tests de UI), orden, riesgos y tests que cambian de significado. Un commit solo cuando Diego confirme.

Reglas de este tramo: ningún `.html`, `.css`, `.js` ni `.ts` nuevo o tocado lleva comentarios (`CLAUDE.md` §4.11); las entidades no llevan comentarios (§4.8); no se ejecuta ninguna migración fuera de `bajonea_test`; no se toca `application.properties` ni `Bajonea-Local.postman_environment.json` (cambios locales de Diego).

---

## 0. Verificación previa (hecha hoy, solo lectura)

| Pregunta | Resultado |
|---|---|
| Siguiente migración libre | **`V40`** (la última es `V39__pedido_turno.sql`). La auditoría decía `V42` para `precio_visto`: la numeración se corrió dos lugares porque T1 y T2 usaron `V38` y `V39` |
| Caminos que escriben un precio de producto | **Uno solo**: `ProductoService.editarProducto` (`ProductoService.java:136`, único `setPrecio` de `backend/src/main`; no hay `UPDATE` nativo ni `@Query` que toque `producto.precio`). El alta (`crearProducto`, `:85`) fija el precio inicial por el builder. `cambiarEstado`, las imágenes y las firmas de Cloudinary no tocan el precio. `PUT /api/v1/productos/{id}` es delegable: lo usan el Dueño y el Empleado. Por SQL directo solo escriben precios los tests y los scripts de datos de prueba, que no pasan por la regla |
| Dónde se detecta hoy el cambio de precio | `ProductoService.java:124` (`compareTo` para armar `camposCambiados` del historial). **Siempre `compareTo`**, nunca `equals`: `100` y `100.00` son el mismo precio |
| Orden de guards actual de `editarProducto` | `iniciarEscrituraDeCatalogo` (usuario → relación → comercio compartido; el Empleado con el comercio `SUSPENDIDO` recibe `409 COMERCIO_SUSPENDIDO`) → `bloquearProductoDelComercio` (`404` si el producto no es del comercio) → `409` descontinuado → `409` sin imágenes → `404` categoría → recién ahí se arman cambios y se escribe. **El guard nuevo va después de `obtenerCategoria` y antes del primer `setNombre`** |
| Cómo se lee una franja | `DisponibilidadComercioService.horariosParaLeer(comercioId, ahora)` + `dentroDeFranja(horarios, ahora)`; `ahora()` sale del `Clock` único. Ya lo usan `ComercioService.validarAceptaPedidos` (`:243-245`) y `CierreComercioService:93`. Franja pura: cubre turnos que cruzan la medianoche y la convención 23:59 = 24:00; no mira `cerrado_manualmente` ni el estado del comercio |
| Cómo se lee el precio en carrito y pedido | `item_carrito` **no guarda precio**: `CarritoService.aResponseDTO` (`:245-250`) y `PedidoService.confirmarPedido` (`:194`, `:202`, `:230`, `:235`) leen `producto.getPrecio()` vigente. El pedido sí lo congela en `detalle_pedido.precio_unitario`. O sea que "se cobra el precio vigente" ya ocurre; falta el aviso y la comparación |
| `PedidoRequestDTO` | Solo `tipoEntrega` y `direccionId`. **Ningún test Java hace `new PedidoRequestDTO(...)`** (verificado por `grep`): el campo nuevo no rompe constructores. Los Playwright y Newman lo envían como JSON |
| Constructores de DTO del carrito | `new ItemCarritoResponseDTO(...)` y `new CarritoResponseDTO(...)` solo se usan dentro de `CarritoService` (2 lugares): los campos nuevos no rompen tests |
| Tests que fijan los campos exactos de un ítem del carrito | Ninguno (el `Object.keys` de `37-empleado-acceso-api.spec.ts:377` es del detalle de pedido del Empleado, no del carrito) |
| `@ConfigurationProperties` con setter | `PedidoTimeoutProperties` (`@Component`, `@Getter @Setter`) es el patrón; los tests Java la mutan sin crear contexto nuevo. `application-test.properties` ya es el lugar de los interruptores de test |
| Atajos de test | `TestController` (`@Profile("test")`, `/api/v1/test/**`) ya tiene `backfill-turnos`, `jobs/*`, etc.; las pruebas `AtajosDeTestEnElPerfilTestTest` y `AtajosDeTestFueraDelPerfilTest` cubren que existan solo en el perfil `test` y se actualizan |
| Rutas delegables | **Sin cambio** (siguen 24): `PUT /productos/{id}` ya está; `POST /pedidos/cliente` no es del comercio. T3 no agrega rutas públicas, solo el atajo de test |
| `globalSetup` de Playwright | No existe (`playwright.config.ts` solo fija `workers: 1`). Un atajo global que se deja encendido por un spec que se cae contaminaría el resto de la corrida: ver riesgo 3 |

Sin verificar, a propósito: los volúmenes reales de `item_carrito` en `practicas3` (el `ADD COLUMN` nulo debería ser trivial, se prueba en `bajonea_test`), y si `EscriturasEmpleadoHttpIntegrationTest` edita un precio por HTTP (lo toca el `grep` de `/api/v1/productos`, no lo leí entero; con la propiedad apagada no importa).

---

## 1. Decisiones fijadas que mandan en este tramo

| Tema | Decisión |
|---|---|
| Qué se bloquea | Cambiar el **precio** de un producto existente mientras el comercio está **dentro de una franja horaria**. El alta de productos queda libre. Si el precio enviado es igual al actual (`compareTo == 0`) no se bloquea, aunque cambien nombre, descripción, categoría o etiquetas |
| Franja pura | El bloqueo depende solo de `dentroDeFranja`: no mira `cerrado_manualmente`, ni `CERRADO_TEMPORALMENTE`, ni `SUSPENDIDO`. Un comercio cerrado a mano dentro de su franja sigue bloqueado. Un comercio sin franjas vigentes no se bloquea nunca |
| Quién | Dueño y Empleado por igual |
| Código y mensaje | `409` con `ConflictoComercioException`, `data.codigo = PRECIO_BLOQUEADO_EN_FRANJA`, mensaje sin nombres internos: "No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario." |
| Orden | **Después** de todos los guards existentes (suspensión del Empleado, `404` de pertenencia, descontinuado, sin imágenes, categoría), para no tapar los `409` y `404` que fijan hoy los specs `42` y similares |
| Carrito | **Se cobra el precio vigente**, con aviso de que cambió: columna `item_carrito.precio_visto`, campo `precioCambio` por ítem en el carrito |
| Pedido | `totalEsperado` **opcional** en `POST /api/v1/pedidos/cliente` (`null` = no se compara; el frontend **siempre** lo manda). Si difiere del total calculado: `409` con `data.codigo = PRECIO_CAMBIO` y los montos nuevos. Nunca se crea el pedido en ese caso |
| Reloj en tests | Propiedad `precio.bloqueo-en-franja.habilitado` (`true` por defecto en el código, `false` en `application-test.properties`, con setter para los tests Java); atajo `PUT /api/v1/test/precio-bloqueo?habilitado=` en el perfil `test`; spec dedicado con la franja calculada alrededor de ahora |
| Migración | `V40` |
| Fuera del tramo | Email por turno cerrado (T4), estadísticas (T5), precios de extras (el bloque de Extras no existe todavía), edición masiva de precios, historial de precios |

---

## 2. Reglas de dominio que el tramo implementa

### 2.1 Guard de precio en `editarProducto`

1. Después de `obtenerCategoria(...)` y antes de armar `camposCambiados` y escribir: `precioCambia = producto.getPrecio().compareTo(request.getPrecio()) != 0`.
2. Si `precioCambia` y la propiedad `precio.bloqueo-en-franja.habilitado` es `true`: `ahora = disponibilidadComercioService.ahora()`, `horarios = disponibilidadComercioService.horariosParaLeer(actor.comercioId(), ahora)`; si `dentroDeFranja(horarios, ahora)` → `ConflictoComercioException(PRECIO_BLOQUEADO_EN_FRANJA, mensaje)`. Sin escribir nada y sin fila de historial (la transacción se revierte entera, incluida la fila del producto bloqueada).
3. Franja pura: ninguna lectura del estado del comercio ni de `cerrado_manualmente`.
4. `ConflictoComercioException` suma la constante `PRECIO_BLOQUEADO_EN_FRANJA` y su línea en el Javadoc. `GlobalExceptionHandler` ya mapea la clase a `409` con `data.codigo`.
5. `PrecioBloqueoProperties` (`config/`, `@Component @ConfigurationProperties(prefix = "precio.bloqueo-en-franja")`, `@Getter @Setter`, `habilitado = true`).

**Lecturas dentro de la transacción:** el producto ya está bloqueado `FOR UPDATE` y el comercio con `LOCK IN SHARE MODE` desde `iniciarEscrituraDeCatalogo`. El comercio compartido impide que una edición de horarios (que toma el comercio `FOR UPDATE`) confirme entre la lectura de la franja y la escritura del precio: **la franja que se mira es la vigente cuando el precio se escribe**. Las lecturas de `horario` son comunes (sin bloqueo): sin bloqueos nuevos, sin cambio del orden global.

### 2.2 `precio_visto` y aviso en el carrito

- `item_carrito.precio_visto decimal(10,2) NULL`. Se estampa **al insertar el ítem** (`CarritoService.agregarItem`, rama de ítem nuevo) con el precio vigente que esa misma transacción acaba de leer del producto (que está bloqueado en compartido desde `leerEstadoConBloqueoCompartido`, así que el precio leído y el estampado no se pueden separar de una edición).
- **No se vuelve a estampar** al sumar cantidad a un ítem existente ni al cambiar la cantidad. Motivo: si el ítem ya cambió de precio, tocar `+` o `-` ocultaría el aviso sin que el Cliente lo haya visto. El aviso se va solo cuando se paga y el carrito se vacía (o si el Cliente quita el ítem). Es **una desviación de la auditoría 5.b** ("estampado al agregar y al cambiar cantidad"): ver pregunta 1 de la sección 8.
- `ItemCarritoResponseDTO` suma `precioVisto` (nulo en los ítems anteriores a `V40`) y `precioCambio` (`precioVisto != null && precioVisto.compareTo(precioUnitario) != 0`). `CarritoResponseDTO` suma `hayCambioDePrecio` (alguno de los ítems) y `total` (`subtotal + cargoServicioCliente`; hoy el frontend lo calcula). Campos aditivos: ningún cliente actual se rompe.
- Un ítem con `precio_visto` nulo **nunca** muestra aviso. No hay backfill: al aplicar `V40` el precio vigente es el único que hubo.

### 2.3 `totalEsperado` en `POST /api/v1/pedidos/cliente`

1. `PedidoRequestDTO.totalEsperado` (`BigDecimal`, opcional, `@DecimalMin("0")`, `@Digits(integer = 10, fraction = 2)`).
2. En `PedidoService.confirmarPedido`, después de calcular `subtotalPedido` y `cargoServicioCliente` y de los dos topes de monto máximo (los `400` conservan su prioridad), y **antes** de crear el `Pedido`: si `totalEsperado != null` y `totalEsperado.compareTo(subtotalPedido + cargoServicioCliente) != 0` → `ConflictoComercioException(PRECIO_CAMBIO, "Los montos de tu pedido cambiaron. Revisá el nuevo total antes de pagar.", data)`.
3. `data`: `codigo`, `subtotal`, `cargoServicioCliente`, `total` y `items` (por ítem: `productoId`, `nombreProducto`, `cantidad`, `precioVisto`, `precioUnitario`, `subtotal`). Misma forma que el carrito, para que el frontend repinte sin otra llamada.
4. Es una comparación de **total**, no de precios: también se dispara si el Administrador cambió la tarifa de servicio entre la vista del Cliente y la confirmación. El frontend tiene que poder mostrar el caso en que ningún ítem cambió de precio ("el cargo por servicio cambió"). Decisión: se deja así (el Cliente tiene derecho a ver lo que va a pagar).
5. Orden en `confirmarPedido`: no cambia ningún bloqueo. Los precios se leen con la misma foto de la transacción con la que se arma el subtotal, así que `totalEsperado` se compara con **exactamente** lo que se cobraría. El `totalEsperado` no entra a ningún bloqueo ni al registro del historial.

### 2.4 Atajo y propiedad para tests

- `PUT /api/v1/test/precio-bloqueo?habilitado=true|false` en `TestController` (perfil `test`): cambia `PrecioBloqueoProperties.habilitado` en memoria y devuelve el valor nuevo. Se agrega a `AtajosDeTestEnElPerfilTestTest` y `AtajosDeTestFueraDelPerfilTest`.
- `application-test.properties`: `precio.bloqueo-en-franja.habilitado=false`, con el mismo estilo de comentario que las demás propiedades del archivo.
- Producción: el valor por defecto `true` vive en el código; `application.properties` no se toca. Para probar a mano en `practicas3` sin el bloqueo: variable de entorno `PRECIO_BLOQUEO_EN_FRANJA_HABILITADO=false` (enlace relajado de Spring).

---

## 3. Entrega A: backend, tests y estrés

### A1. Migración `V40` y entidad

- `V40__item_carrito_precio_visto.sql`: `ALTER TABLE item_carrito ADD COLUMN precio_visto decimal(10,2) NULL`. Sin índices, sin FK, sin backfill, sin comentarios en el SQL.
- `ItemCarrito`: campo `precioVisto` (`BigDecimal`, `@Column(name = "precio_visto", precision = 10, scale = 2)`) con `@Setter` individual y sin comentarios (§4.8). El `@Builder` de `CarritoService` queda compatible (campo nulo si no se informa).
- Verificación: tras `reset-db` sobre `bajonea_test`, `SHOW CREATE TABLE item_carrito`; un `INSERT` por SQL puro sin la columna sigue funcionando.
- Hecho cuando: `mvnw test` arranca limpio con `V40`.

### A2. Propiedad, guard y atajo

- `PrecioBloqueoProperties`, `application-test.properties`, constante y Javadoc de `ConflictoComercioException`, guard en `ProductoService.editarProducto` (2.1), atajo de test (2.4).
- Hecho cuando: con la propiedad en `true`, un cambio de precio dentro de franja responde `409 PRECIO_BLOQUEADO_EN_FRANJA`; mismo precio con otros campos cambiados, fuera de franja, alta de producto y comercio sin franjas responden `200`/`201`; el orden de los demás `409` y `404` no cambia.

### A3. Carrito: `precio_visto`, `precioCambio` y `total`

- `CarritoService.agregarItem` (ítem nuevo estampa el precio), `aResponseDTO(ItemCarrito)` y `aResponseDTO(Carrito)` con los campos nuevos (2.2). Sin tocar `actualizarCantidad`, `eliminarItem`, `vaciarCarrito` ni las operaciones en bloque (las sentencias `UPDATE`/`DELETE` de `ItemCarritoRepository` no se tocan: es la razón por la que el re-estampado es una no-operación y no un `UPDATE` más).
- Hecho cuando: un ítem agregado antes de una edición de precio devuelve `precioCambio = true`, `precioVisto` y `precioUnitario` distintos; un ítem agregado después devuelve `false`; un ítem con `precio_visto` nulo devuelve `false`.

### A4. `totalEsperado` en la creación del pedido

- `PedidoRequestDTO`, `PedidoService.confirmarPedido` (2.3), `ConflictoComercioException.PRECIO_CAMBIO` con `data` en la forma del carrito. `PedidoController` no cambia.
- Hecho cuando: sin `totalEsperado` todo se comporta como hoy; con el total correcto se crea el pedido; con otro total responde `409 PRECIO_CAMBIO`, no existe ninguna fila nueva en `pedido`, `detalle_pedido` ni `historial_estado_pedido` y el carrito queda intacto.

### A5. Pruebas Java

- **Nuevos:**
  - `ProductoServicePrecioFranjaTest` (relojes fijos con un `Clock` y `DisponibilidadComercioService` reales, repositorios simulados): precio distinto en franja bloquea (Dueño y Empleado); `100` contra `100.00` no bloquea; precio igual con otros campos distintos no bloquea; fuera de franja no bloquea; franja que cruza la medianoche (23:50 a 00:20, ahora 00:10 bloquea); `23:59` vale `24:00`; comercio sin franjas no bloquea; `cerrado_manualmente = true` dentro de franja **sigue bloqueando**; propiedad en `false` no bloquea; alta de producto no bloquea; el orden respecto de `COMERCIO_SUSPENDIDO`, `404`, descontinuado, sin imágenes y categoría inexistente.
  - `ProductoPrecioFranjaIntegrationTest` (contra `bajonea_test`, propiedad encendida con el setter y **restaurada en `@AfterEach`**, porque el bean es del contexto compartido): franja armada alrededor de ahora por SQL, `409` revierte todo (ni producto ni historial cambian), `200` fuera de franja deja la fila de historial con el campo `precio`.
  - `CarritoPrecioVistoIntegrationTest`: estampa al insertar; sumar cantidad no lo toca; edición de precio posterior produce `precioCambio`; `precio_visto` nulo no avisa; `hayCambioDePrecio` y `total`.
  - `PedidoTotalEsperadoIntegrationTest`: `null` (como hoy), total exacto (crea), total viejo tras una edición de precio (`409 PRECIO_CAMBIO` con los montos nuevos, nada creado), total viejo tras un cambio de tarifa (`409` con ítems sin cambio de precio), `compareTo` con escala distinta (`100` contra `100.00`), validación de `@DecimalMin` (`400` con negativo).
  - `PrecioBloqueoConcurrenciaIntegrationTest` (hilos con latches): edición de precio contra edición de horarios (la que toma el comercio `FOR UPDATE`) y contra `cerrar`/`abrir`, sin `Deadlock found`; edición de precio contra `confirmarPedido` con `totalEsperado`: el pedido creado siempre coincide con el total esperado enviado o la creación responde `409`.
- **Ajustados:** `ClasificacionRutasComercioTest` no cambia (no hay rutas nuevas); `AtajosDeTestEnElPerfilTestTest` y `AtajosDeTestFueraDelPerfilTest` suman el atajo nuevo.
- **No cambian** (propiedad apagada en el perfil `test`): `EscriturasEmpleadoIntegrationTest` (`:208`, `:347`), `EscriturasCatalogoOrdenDeBloqueoIntegrationTest` (`:179`, `:212`), `HistorialEdicionComercioIntegrationTest` (`:150-190`), `PertenenciaCruzadaDelegablesIntegrationTest` (`:186`). Todos son `@ActiveProfiles("test")` (verificado).

### A6. Pruebas de API, Newman y estrés

- **Playwright API** (siguientes números libres: `74`, `75`):
  - `74-precio-franja-api.spec.ts`: enciende el bloqueo con el atajo y lo **apaga en `afterAll` y en `finally`**. Franja calculada alrededor de ahora (`tests/helpers/zona.ts`: `hoyEnZona`, `diaDeLaSemanaEnZona`; patrón de los specs `69` y `70`), registrada de entrada porque los horarios editados rigen desde mañana. Un comercio con franja `ahora - 30 min` a `ahora + 30 min` (puede cruzar la medianoche: depende de T1, ya hecho) y otro con `ahora + 2 h` a `ahora + 3 h`. Casos: precio distinto en franja → `409 PRECIO_BLOQUEADO_EN_FRANJA` para el Dueño y para el Empleado (con el código en `data.codigo`); mismo precio con otro nombre en franja → `200`; precio distinto fuera de franja → `200`; cierre manual dentro de franja → sigue `409`; alta de producto en franja → `201`; comercio con franja `00:00` a `23:59` → `409` todo el día; el orden con `COMERCIO_SUSPENDIDO` (Empleado) y `404` (producto ajeno); el atajo devuelve el valor y fuera del perfil `test` no existe.
  - `75-pedido-total-esperado-api.spec.ts`: sin `totalEsperado` crea el pedido; con el total correcto crea; tras una edición de precio (propiedad apagada, que es el estado normal del perfil) el carrito marca `precioCambio` y `hayCambioDePrecio` y el pedido con el total viejo da `409 PRECIO_CAMBIO` con `data.items`, `subtotal`, `cargoServicioCliente` y `total` nuevos y sin pedido creado; reintento con el total nuevo crea el pedido; cambio de tarifa entre la vista y la confirmación; un ítem agregado después de la edición no avisa; sumar cantidad no apaga el aviso.
- **Newman:** constructor nuevo `build-precio-franja-tramoT3-postman.mjs`, carpeta `75` (va **última**; la `74` es la de T2). Calcula la franja en un pre-request script con el desfase fijo `-03:00` (Ushuaia no tiene horario de verano), enciende y apaga el bloqueo con el atajo al principio y al final de la carpeta. Los constructores de las carpetas existentes **no se tocan** (la propiedad queda apagada).
- **Estrés** nuevo `stress-locks-tramoPrecios.mjs`, registrado en `correr-estreses.mjs` (`precios`), 8 o más rondas, sin locks nuevos pero con invariantes de dinero:
  1. Ráfagas de ediciones de precio (Dueño y Empleado) contra `agregarItem`, `actualizarCantidad` y `GET /carrito`: sin `5xx` ni `Deadlock found`; para todo ítem, `precio_visto` (lectura de control por SQL) es un precio que el producto tuvo.
  2. Ráfagas de ediciones de precio contra `POST /pedidos/cliente` con `totalEsperado` (propiedad apagada, para poder editar durante la franja): **para todo pedido creado, `pedido.total == totalEsperado` enviado**; todo desacuerdo responde `409 PRECIO_CAMBIO`; ningún `5xx`.
  3. Con el bloqueo encendido y una franja calculada, ráfagas de ediciones de precio contra ediciones de horarios (T1) y contra `cerrar`/`abrir`: todo `409` lleva el código esperado, ningún `5xx`.
  4. Pagos y cambios de estado en paralelo con ediciones de precio: el resumen del turno (T2) sigue coincidiendo con la suma de la base (los pedidos ya congelaron `precio_unitario`; una edición no los toca).
  El script **restaura la propiedad al final y en el manejo de errores**. Más el runner completo de los estreses una vez (los 21 existentes no deberían cambiar).
- **Mutaciones ("las pruebas muerden"):** el guard antes de los guards existentes (debe fallar el spec `42` y el test de orden); comparar con `equals` en vez de `compareTo` (falla `100` contra `100.00`); mirar `cerrado_manualmente` o el estado del comercio en el guard; bloquear el alta; bloquear con precio igual; no revertir el historial ante el `409`; re-estampar `precio_visto` al cambiar la cantidad; comparar `totalEsperado` antes de los topes de monto máximo o después de crear el pedido; comparar solo el subtotal; devolver `precioCambio` con `precio_visto` nulo; dejar el atajo registrado fuera del perfil `test`.

### A7. Verificación de la entrega A

`mvnw test` (las dos pasadas del proyecto), Newman completo desde base reseteada, Playwright de API, runner de estreses completo y mutaciones. Entregable: lista de archivos tocados, evidencia por punto y los tests que cambian de significado de la sección 7 (que deberían ser ninguno si la propiedad está apagada). **Punto de corte: informe a Diego antes de la entrega B.**

---

## 4. Entrega B: pantallas y tests de UI

### Pantallas que necesitan mockup (Diego las elige antes de escribir una línea de frontend)

El sistema de diseño es el de `css/styles.css`. Sin colores de fondo nuevos para los avisos: el proyecto viene sacando carteles con fondo de color a favor de puntito + texto (Tramos 16.28 y 16.29) y usa `mostrarAvisoFijo` (`js/form-utils.js:55`) para los `409` de reglas del comercio. Todas las variantes respetan eso salvo que Diego pida otra cosa.

| # | Mockup | Qué tiene que definir | Variantes propuestas |
|---|---|---|---|
| **M1** | **Formulario de producto con el precio bloqueado** (`comercio-producto-form.html`, edición; Dueño y Empleado idénticos) | Cuándo aparece el mensaje (antes de tocar o al guardar), qué pasa con el campo `producto-precio`, y qué muestra | **A (reactiva, sin backend extra):** el campo precio normal; al guardar con el `409`, `mostrarAvisoFijo` arriba del formulario ("No podés cambiar precios mientras tu comercio está en horario de atención. Hacelo fuera de ese horario.") y el mismo texto corto bajo el campo (`error-producto-precio`); el formulario queda como estaba. **B (preventiva):** apenas se abre, el campo precio nace deshabilitado, con candado y la leyenda "Se puede cambiar fuera de tu horario de atención" bajo el campo; el resto del formulario se edita normal y el precio viaja sin cambios. Requiere un campo nuevo `precioBloqueado` en la respuesta del producto (A2 lo suma si se elige B o C). **C (preventiva y reactiva, recomendada):** como B pero el campo sigue editable con un aviso suave bajo el campo ("Ahora estás en tu horario de atención: el precio no se puede cambiar hasta que termine"), y el `409` como red de seguridad; no deshabilita nada porque el dato puede quedar viejo si la franja termina con el formulario abierto. Dejar dicho en el mockup: qué ve el campo (valor actual formateado), si el candado va en el campo o en la leyenda, y si la leyenda lleva la hora en que se libera (suma `precioBloqueadoHasta` al backend; sin la hora, el texto es genérico) |
| **M2** | **Aviso de precio cambiado en el carrito** (`carrito.html`) | Cómo se ve la línea afectada, si hay un aviso general, y qué pasa con el total y el botón "Confirmar pedido - $X" | **A (recomendada):** en cada línea afectada, el precio viejo tachado y el nuevo al lado ("$4.200 → $4.800 c/u") con un puntito amarillo y el texto "Cambió el precio"; el subtotal, el cargo y el total ya con los valores nuevos; sin aviso general. **B:** un aviso fijo arriba ("Actualizamos el precio de 2 productos") con la lista de cambios, y las líneas normales con el valor nuevo. **C:** una hoja inferior bloqueante al abrir el carrito ("Cambiaron los precios", lista con antes y ahora, botón "Entendido"); después el carrito normal |
| **M3** | **Aviso y reconfirmación en el checkout** (`checkout.html`, paso 3; el `409 PRECIO_CAMBIO` de "Ir a pagar") | Qué se muestra cuando el servidor rechaza el total, cómo se repinta el resumen, qué dice el botón, y qué pasa cuando no cambió ningún precio sino el cargo por servicio | **A (recomendada):** el paso 3 se repinta con los valores del `409` (líneas afectadas como en M2-A, total nuevo), arriba un `renderBanner` "Los montos de tu pedido cambiaron. Revisá el nuevo total antes de pagar." y el botón pasa a "Confirmar con el nuevo total - $X" (un segundo toque envía el total nuevo); si ningún ítem cambió, el texto dice "El cargo por servicio cambió". **B:** una hoja inferior "Los precios cambiaron" con antes y ahora, y dos botones: "Volver al carrito" y "Aceptar y pagar - $X". **C:** redirigir al carrito con el aviso de M2 y exigir que el Cliente vuelva a entrar al checkout |

**Hasta que Diego elija M1, M2 y M3 la entrega B no empieza.** Lo que no necesita mockup se puede adelantar (B1 en lo que no depende de M1).

### B1. Formulario de producto (Dueño y Empleado) — **requiere M1**

- `js/comercio.js` (`initComercioProductoForm`, `:3255-3330`): el `PUT` con el `409 PRECIO_BLOQUEADO_EN_FRANJA` se muestra según M1. Distinguir el `409` por `error.data.codigo` y no por el texto (patrón de `js/cloudinary.js` ya hecho en E3). El `403` del Empleado no cambia.
- Si M1 es B o C: lectura del campo `precioBloqueado` del producto en edición y leyenda bajo el campo; cierre de la leyenda al cambiar el estado en un refresco programado (sin polling nuevo).
- `docs/DATA-TESTID-FASE17.md`: `aviso-precio-bloqueado`, `leyenda-precio-bloqueado` (si aplica).

### B2. Carrito — **requiere M2**

- `js/carrito.js` (`:119-121` línea, `:190` tope de subtotal, `:239-267` totales): leer `precioVisto`, `precioCambio` y `hayCambioDePrecio`; pintar según M2. El botón de confirmar sigue mostrando el total del servidor (`carrito.total`).
- `docs/DATA-TESTID-FASE17.md`: `item-precio-cambio`, `item-precio-anterior`, `aviso-precios-cambiaron`.

### B3. Checkout — **requiere M3**

- `js/checkout.js` (`:341-400`): el `POST /pedidos/cliente` envía **siempre** `totalEsperado` (el total que el paso 3 muestra en pantalla, `totalConCargo`); en el `catch`, si `error.data.codigo === 'PRECIO_CAMBIO'`, repinta con `error.data` según M3 (antes de `esConflictoDeCierre`); el segundo toque envía el total nuevo. Cualquier otro error conserva el comportamiento actual.
- Cuidado con el caso sin ítems modificados (cambio de tarifa): el texto no puede decir "precio" si ningún ítem cambió.
- `docs/DATA-TESTID-FASE17.md`: `aviso-total-cambio`, `btn-confirmar-nuevo-total`.

### B4. Pruebas de UI

- Spec nuevo (siguiente número libre: `76`): `76-precio-franja-ui.spec.ts`: Dueño y Empleado reciben el aviso de M1 al guardar un precio nuevo dentro de franja (el bloqueo se enciende con el atajo y se apaga siempre); el mismo formulario guarda nombre y descripción sin cambiar el precio; fuera de franja guarda el precio; carrito con un precio cambiado (M2); checkout con `409 PRECIO_CAMBIO` y reconfirmación (M3), con un precio cambiado por SQL entre la vista y "Ir a pagar" y con la tarifa cambiada; el Cliente que no tiene cambios no ve ningún aviso; sin scroll horizontal a 375 px (`tests/helpers/layout.ts`); sin errores de consola.
- Specs existentes que recorren carrito y checkout (`04`, `05`, `09`, `12`, `16`, `31`, `62` y los que usan `btn-confirmar-pedido`): corrida completa de verificación; no deberían cambiar porque el frontend manda el total que muestra y coincide.

### B5. Cierre del tramo

- Documentación: `CLAUDE.md` (§1bis, §5 `ItemCarrito`, §6), `docs/DECISIONES.md` (una entrada por decisión), `docs/diccionario-de-datos.md` (columna `precio_visto`; versión nueva), `docs/APRENDIZAJES-TECNICOS.md`, `docs/CONCURRENCIA-Y-TRANSACCIONES.md` (el guard de precio lee la franja bajo el comercio compartido; sin bloqueos nuevos), `docs/LISTA-DE-DESPLIEGUE.md` (propiedad `precio.bloqueo-en-franja.habilitado`, valor por defecto `true`, y el aviso de que **en `practicas3` el bloqueo queda activo** y cómo apagarlo con la variable de entorno), `docs/DATA-TESTID-FASE17.md`, requisitos funcionales y historias del Dueño, Empleado y Cliente en `docs/entregables-01-02/`, `docs/MAPEO-ARCHIVOS-FASE2-T3.md`, `testing/playwright/README.md` (el atajo y la regla "apagarlo siempre").
- Regresión completa: `mvnw test`, Newman, Playwright completo (inestables conocidos `01:101`, `27:497` y `52:437`) y todos los estreses.
- Checklist para Diego con evidencia por punto. **Sin commit hasta su confirmación.**

---

## 5. Orden de trabajo y dependencias

0. **Antes de empezar la entrega B:** Diego elige M1, M2 y M3. **M1 conviene antes de cerrar A2** (si elige B o C, A2 suma `precioBloqueado` y, opcionalmente, `precioBloqueadoHasta` a la respuesta del producto). No frena el resto de la entrega A.
1. A1 (`V40`, entidad) → A2 (propiedad, guard, atajo) → A3 (carrito) → A4 (`totalEsperado`): el servidor queda completo.
2. A5 (Java) en paralelo con cada paso; A6 (API, Newman, estrés) y A7 (verificación). **Corte: informe a Diego.**
3. B1 a B3 esperan los mockups; B4 al final de ellos; B5 cierra.
4. T4 y T5 no entran; T4 (email del turno) no depende de T3.

---

## 6. Riesgos y puntos de atención

| # | Riesgo | Cómo se maneja |
|---|---|---|
| 1 | **Los comercios de prueba tienen una franja `00:00` a `23:59` del día de registro** (`tests/helpers/backend.ts:732`, `helpers/multicomercio.ts:36`, los registros de Dueño de toda la suite): con el guard encendido, todo cambio de precio recibe `409` el día entero. Además la franja es solo del día de la semana en que se registró, así que un comercio viejo se comportaría distinto según el día, un test intermitente por fecha | La propiedad **apagada en `application-test.properties`** deja el comportamiento actual en las ~40 llamadas que editan precio (sección 7). Solo los specs `74` y `76` y la carpeta `75` encienden el bloqueo, con franjas calculadas y con el registro ya hecho con esa franja. Cierto para el estrés y Newman: quedan con el bloqueo apagado salvo que lo pidan |
| 2 | Si el comercio de prueba se registra con la franja `00:00` a `23:59` y el bloqueo está encendido por error, la causa del fallo de un test de precio es difícil de ver | El mensaje y el código del `409` son únicos; el atajo devuelve el estado; el `README` de Playwright lo documenta |
| 3 | **Un spec que enciende el atajo y se cae deja el bloqueo encendido para el resto de la corrida** (backend único, `workers: 1`, sin `globalSetup`), y todos los specs posteriores que editan un precio fallarían en cadena | `try/finally` y `afterAll` en los specs `74` y `76`; el estrés y la carpeta de Newman lo restauran al terminar y al fallar; el atajo es idempotente. Alternativa de más defensa (pregunta 5): un `globalSetup` de Playwright que lo apague antes de empezar |
| 4 | El bean `PrecioBloqueoProperties` es único por contexto de Spring y los contextos se cachean entre clases de test: un test Java que lo enciende y no lo restaura contamina a los siguientes | `@AfterEach` que lo deja en `false` y un test que lo verifica; las clases nuevas lo hacen en una base común |
| 5 | **En `practicas3` y en producción el bloqueo está activo por defecto**: Diego no va a poder editar precios de los comercios de demostración mientras estén dentro de su franja (los datos de `datos-prueba` usan `23:59` en todos los días) | Es el comportamiento pedido. Se anota en `docs/LISTA-DE-DESPLIEGUE.md` y en la entrega, con la variable de entorno para apagarlo en pruebas manuales. No se toca `application.properties` |
| 6 | **`totalEsperado` es una comparación de total, no de precios**: un cambio de tarifa de servicio del Administrador también dispara `PRECIO_CAMBIO` | Se mantiene a propósito (el Cliente tiene que ver lo que paga); el frontend distingue "ningún ítem cambió" y lo explica como cargo por servicio. Prueba dedicada |
| 7 | Ventana residual de carrera: una edición de precio confirmada un instante antes de abrir la franja y un pedido confirmado un instante después | `totalEsperado` la cubre (compara contra lo que la misma transacción lee para cobrar); el estrés 2 prueba la invariante `pedido.total == totalEsperado` con ediciones concurrentes |
| 8 | **Desviación de la auditoría 5.b**: `precio_visto` se estampa solo al insertar el ítem, no al cambiar la cantidad | Ver pregunta 1 de la sección 8. Si Diego prefiere la regla de la auditoría, el cambio es una línea en `actualizarCantidad` y `agregarItem`, pero hay que tocar `ItemCarritoRepository.actualizarCantidad` (hoy una sentencia en bloque que no lee el producto) y se pierde el aviso cuando el Cliente toca `+` o `-` |
| 9 | Los ítems de carritos anteriores a `V40` tienen `precio_visto` nulo y no avisan nunca | Esperado: no hay referencia para comparar. Los carritos no expiran, así que durante un tiempo habrá ítems sin aviso; se documenta |
| 10 | El Cliente ve el precio viejo en una pantalla que no refresca (catálogo abierto, carrito en otra pestaña) | El aviso del carrito, la lectura fresca de `GET /carrito` al entrar al checkout y `totalEsperado` en la confirmación cubren los tres puntos. No hay polling nuevo |
| 11 | El guard compara el precio nuevo con `compareTo` y el formulario envía el precio como número entero (el frontend trunca decimales, `precioDesdeInput`): un producto con precio con centavos cargado por API parecería "cambiado" al editarlo desde la pantalla | Hoy ese caso ya genera un campo `precio` en el historial; con T3 quedaría bloqueado en franja. Se detecta en A5 con una prueba y se anota; el producto de pantalla siempre tiene precio entero (el campo es `inputmode="numeric"`) |
| 12 | Cambios locales de Diego en `application.properties` y `Bajonea-Local.postman_environment.json` | No se tocan: la propiedad nueva lleva su valor por defecto en el código y la de test va en `application-test.properties` |

## 7. Tests existentes que cambian de significado

Con `precio.bloqueo-en-franja.habilitado=false` en el perfil `test` **ninguno cambia de resultado**. Lo que sigue es el inventario de lo que edita un precio hoy (observado; hay llamadas escondidas en helpers y en `precio` aleatorio de los estreses, así que el conteo exacto no está verificado) y por qué queda cubierto.

| Capa | Dónde | Estado con la propiedad apagada |
|---|---|---|
| Playwright API | `42-empleado-escrituras-api.spec.ts:131` (200 esperado), `:253` y `:490` (esperan `409 COMERCIO_SUSPENDIDO` y `404`: son anteriores al guard por diseño; **cualquier cambio de orden los rompe**), `50-empleado-matriz-delegable-api.spec.ts:62` y `:124` (matriz: `200` y `404`), `51-catalogo-orden-bloqueo-api.spec.ts:185` (ráfagas), `21-multicomercio-tramo1.spec.ts:248` (`404` cruzado) | Sin cambio |
| Playwright UI | `06-crud-productos.spec.ts` (editar nombre y precio, 3 usos del campo), `53-empleado-edicion-ui.spec.ts` (3 usos del campo), `15-crud-productos-validaciones.spec.ts` (solo valida el input, 3 usos) | Sin cambio |
| Java | `EscriturasEmpleadoIntegrationTest:208,347`, `EscriturasCatalogoOrdenDeBloqueoIntegrationTest:179,212`, `HistorialEdicionComercioIntegrationTest:150-190` (5 llamadas; fija que el cambio de precio queda en el historial), `PertenenciaCruzadaDelegablesIntegrationTest:186` | Sin cambio; todos `@ActiveProfiles("test")` |
| Newman (constructores) | `build-empleado-tramoE3-A1-postman.mjs` (2), `-A2-` (2), `-A5-` (2), `build-catalogo-orden-tramoE3-A5b-postman.mjs` (1), `build-multicomercio-tramo1-postman.mjs` (1) | Sin cambio; ningún constructor existente se toca |
| Estreses | `stress-locks-tramoE3-A1.mjs` (1), `-A2.mjs` (1), `-A2b.mjs` (2), `-A3.mjs` (1), `-A5.mjs` (3), `stress-locks-tramoHorarios.mjs` (2) y `stress-locks-tramoTurnos.mjs` (1): editan con **precio aleatorio en cada ráfaga** | Sin cambio. **Los dos últimos son nuevos respecto de la auditoría (T1 y T2)** y también quedarían bloqueados si el bloqueo estuviera encendido |
| Tests del carrito y el pedido | Todos los que hacen `POST /pedidos/cliente` sin `totalEsperado` (`crearPedido` de `helpers/backend.ts` y las llamadas directas de specs, Newman y estreses) | Sin cambio: `null` no se compara. **No se agrega `totalEsperado` a los helpers existentes** (la cobertura de `null` es parte del contrato); los specs nuevos lo mandan a propósito |
| Tests de pantalla del carrito y del checkout | `04`, `05`, `09`, `12`, `16`, `31`, `62` y los que usan `btn-confirmar-pedido` | El frontend manda el total que muestra y coincide: sin cambio; se corren completos en B4 para confirmarlo |
| Tests que **sí** cambian de significado | Ninguno si Diego confirma el diseño | `ItemCarritoResponseDTO` y `CarritoResponseDTO` solo suman campos |
| Documentos que citan comportamiento | `CLAUDE.md`, `docs/entregables-01-02/requisitos-funcionales-*.md`, `testing/playwright/README.md` | Se actualizan en B5 |

## 8. Qué necesito de Diego

1. **Elegir M1, M2 y M3** (tabla de la entrega B). M1 antes de cerrar A2 si elige B o C; el resto puede hacerse mientras corre la entrega A.
2. **Confirmar la desviación de la auditoría 5.b** (riesgo 8): `precio_visto` se estampa **solo al agregar el ítem por primera vez**, no al cambiar la cantidad ni al sumar unidades de un ítem existente. Recomiendo esto porque si no, tocar `+` o `-` apaga el aviso sin que el Cliente lo haya visto. La alternativa es la de la auditoría.
3. **Confirmar la forma de `PRECIO_CAMBIO`** (sección 2.3): es una comparación del **total** (precios y cargo por servicio) y trae `items`, `subtotal`, `cargoServicioCliente` y `total`. Recomiendo así; la alternativa es comparar solo el subtotal y dejar un cambio de tarifa sin aviso.
4. **Confirmar el defecto del bloqueo en `practicas3`** (riesgo 5): activo por defecto, apagable con `PRECIO_BLOQUEO_EN_FRANJA_HABILITADO=false`. Si preferís que en `practicas3` arranque apagado, hay que fijarlo en tu `application.properties` local, que no toco.
5. **Decidir si sumamos un `globalSetup` de Playwright** que apague el bloqueo antes de cada corrida (riesgo 3). Recomiendo no hacerlo todavía (el `try/finally` alcanza con `workers: 1`) y revisarlo si algún día aparece contaminación.
