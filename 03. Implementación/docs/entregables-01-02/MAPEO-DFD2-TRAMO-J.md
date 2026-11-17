# MAPEO DFD nivel 2 — Tramo J (huecos que dejó el índice)

Relevamiento de solo lectura (2026-11-17). No se ejecutó la aplicación, la base ni las suites. El código es la fuente de verdad; las rutas de archivo son relativas a `03. Implementación/`. Abreviaturas: `BE` = `backend/src/main/java/com/bajonea/backend/`, `FE` = `frontend/`.

Cubre los tres huecos de `INDICE-DFD2-DESVIOS-Y-CUESTIONES.md` §6.5 y §5.1 (flujos 38, 39 y 64):

- **J1** Configuración de tarifas y tarifa vigente (P7).
- **J2** Categorías y tags del catálogo (P2).
- **J3** Estadísticas del Dueño (P2.06, parte de servidor y frontend).
- **Parte final:** cuatro verificaciones puntuales.

Numeración nueva: desvíos desde **D-68** y cuestiones abiertas desde **C-57**.

---

## J1. Configuración de tarifas por el Administrador y tarifa vigente (P7)

### J1.1 Endpoints

Todos en `BE/controllers/AdministradorController.java` (`@RequestMapping("/api/v1/administrador")`). Rol: `ADMINISTRADOR` (`SecurityConfig`: `/api/v1/administrador/**` → `hasRole("ADMINISTRADOR")`). Ninguno usa `X-Comercio-Id` (no declaran `ComercioActivo`).

| Método y ruta | Controller | Éxito | Mensaje literal |
|---|---|---|---|
| `GET /api/v1/administrador/tarifas/vigente` (línea 253) | `obtenerTarifaVigente` | 200 | "Tarifa vigente obtenida correctamente" |
| `GET /api/v1/administrador/tarifas/historial` (línea 259) | `obtenerHistorialTarifas` | 200 | "Historial de tarifas obtenido correctamente" |
| `POST /api/v1/administrador/tarifas` (línea 265) | `crearTarifa` (`@Valid @RequestBody ConfiguracionTarifaRequestDTO`, `@AuthenticationPrincipal AuthenticatedUser`) | 201 | "Tarifa creada correctamente" |

No existe `PUT` ni `DELETE`: no se edita ni se borra una configuración.

### J1.2 Entrada y validaciones (en orden)

`BE/dto/request/ConfiguracionTarifaRequestDTO.java`. Cuatro campos:

| Campo | Tipo | Validaciones |
|---|---|---|
| `cargoCliente` | `BigDecimal` | `@NotNull` "El cargo al cliente es obligatorio"; `@DecimalMin("0")` "El cargo al cliente no puede ser negativo" |
| `tipoCargoCliente` | `TipoCargo` (`FIJO`, `PORCENTAJE`; son los únicos dos valores del enum) | `@NotNull` "Seleccioná el tipo de cargo al cliente" |
| `cargoComercio` | `BigDecimal` | `@NotNull` "El cargo al comercio es obligatorio"; `@DecimalMin("0")` "El cargo al comercio no puede ser negativo" |
| `tipoCargoComercio` | `TipoCargo` | `@NotNull` "Seleccioná el tipo de cargo al comercio" |

Orden en la respuesta de error: `GlobalExceptionHandler.handleMethodArgumentNotValid` ordena los errores por campo con `prioridadDeCampoObligatorio` y devuelve **400** con `mensaje` = `campo: texto; campo: texto…` y `data` = mapa `{campo: texto}` (un solo error por campo, `putIfAbsent`). Ejemplo: `cargoCliente: El cargo al cliente es obligatorio`.

Otros errores del `POST`:

- Cuerpo ilegible, número no numérico o valor de `tipoCargo*` que no es `FIJO`/`PORCENTAJE`: **400** "El cuerpo de la solicitud contiene datos con formato inválido" (`handleHttpMessageNotReadable`).
- Administrador inexistente: **404** "Administrador no encontrado" (`ConfiguracionTarifaService.crear`, línea 66).
- **No hay** máximo, ni `@Digits`, ni tope de porcentaje: ver D-70.
- Los mensajes de `401`/`403` por token o rol los arma la capa de seguridad: NO RELEVADOS.

### J1.3 Pasos de `ConfiguracionTarifaService.crear` (`BE/services/ConfiguracionTarifaService.java`, 64-79)

La clase es `@Transactional` (nivel de clase, sin `readOnly`, sin bloqueos explícitos).

1. Lee el `Administrador` por `administradorId` (id del usuario autenticado) con `findById`; si no está, 404.
2. Arma un `ConfiguracionTarifa` con los cuatro valores, `administrador` y `fechaVigencia = LocalDateTime.now()` (reloj de la JVM, no el `Clock` de la aplicación).
3. `configuracionTarifaRepository.save(...)`: un `INSERT` en `configuracion_tarifa`.
4. Devuelve el DTO armado desde el objeto guardado.

**La tabla es append-only.** Solo se hace `INSERT`; nunca se actualiza ni se cierra la fila anterior.

Columnas de `configuracion_tarifa` (`V1` + `V10`): `id`, `administrador_id` (FK `fk_config_tarifa_admin`), `cargo_cliente decimal(10,2)`, `tipo_cargo_cliente ENUM('FIJO','PORCENTAJE') default 'FIJO'`, `cargo_comercio decimal(10,2)`, `tipo_cargo_comercio ENUM('FIJO','PORCENTAJE') default 'PORCENTAJE'`, `fecha_vigencia datetime default current_timestamp()`. Índices: `idx_config_tarifa_admin`, `idx_config_tarifa_vigencia`.

- **No existe columna "vigencia hasta".** La vigente es siempre la de `fecha_vigencia` más alta (`findTopByOrderByFechaVigenciaDesc`); la anterior no se cierra, queda en el historial. No se programan vigencias futuras: siempre es "ahora".
- Respuesta (`ConfiguracionTarifaResponseDTO`): `id`, `cargoCliente`, `tipoCargoCliente`, `cargoComercio`, `tipoCargoComercio`, `fechaVigencia`.
- Locks: ninguno. Un `POST` de tarifa y un `confirmarPedido` simultáneos no se serializan: el pedido usa la tarifa que lee en ese momento. La red de seguridad es `PedidoRequestDTO.totalEsperado` (409 `PRECIO_CAMBIO`, ver J1.5).
- Efectos secundarios: **ninguno**. No hay aviso in-app, email, ni tabla de auditoría aparte; el rastro es la propia fila (`administrador_id` + `fecha_vigencia`). No se busca ni se notifica a Dueños o Clientes.
- Seed: `V10__configuracion_tarifa_tipo_cargo.sql` inserta una fila inicial (200,00 `FIJO` al cliente; 1,00 `PORCENTAJE` al comercio) **solo si existe** un `usuario` con email `admin@bajonea.com` (ver D-68).

### J1.4 Lectura de la tarifa vigente

- `obtenerVigente()` (49-52): `findTopByOrderByFechaVigenciaDesc`; si la tabla está vacía lanza `ConflictoDeNegocioException` → **409** "No hay ninguna configuración de tarifa vigente".
- `obtenerVigenteResponseDTO()` y `obtenerHistorial()` (`findAllByOrderByFechaVigenciaDesc`, todas las filas, sin paginar).
- `calcular(subtotal, valor, tipo)` (99-105), una sola regla para los dos cargos:
  - `FIJO`: `valor.setScale(2, HALF_UP)`; no depende del subtotal.
  - `PORCENTAJE`: `subtotal × valor ÷ 100`, escala 2, `HALF_UP`.
- `calcularCargoCliente(subtotal, tarifa)` usa `cargoCliente`/`tipoCargoCliente`; `calcularCargoComercio(subtotal, tarifa)` usa `cargoComercio`/`tipoCargoComercio`. El Javadoc fija que el cargo al comercio se calcula siempre sobre el **subtotal**, nunca sobre el total.
- No hay mínimos, máximos ni redondeo especial más allá de la escala 2.

**Quién llama** (grep de `configuracionTarifaService` en `BE/`; no hay más llamadores):

| Llamador | Qué usa | Cuándo |
|---|---|---|
| `CarritoService.aResponseDTO` (líneas 236-240) | `obtenerVigente` + `calcularCargoCliente` | Solo si el subtotal del carrito es mayor a 0; con carrito vacío o subtotal 0, `cargoServicioCliente` = 0 y no consulta la tarifa. Lo ejecutan los cuatro métodos que devuelven `CarritoResponseDTO`: `verCarrito` (`GET /api/v1/carrito`), `agregarItem`, `actualizarCantidad` y `eliminarItem` |
| `PedidoService.confirmarPedido` (líneas 214-216) | `obtenerVigente`, `calcularCargoCliente`, `calcularCargoComercio` | Siempre, en cada confirmación |
| `AdministradorController` (tres endpoints) | `obtenerVigenteResponseDTO`, `obtenerHistorial`, `crear` | Pantalla de tarifas |

**Sin tarifa vigente:** `obtenerVigente` lanza el 409 de arriba. Efecto: `GET /carrito` con ítems, cualquier alta o cambio de ítem con subtotal mayor a 0, `confirmarPedido` y `GET /administrador/tarifas/vigente` responden 409 "No hay ninguna configuración de tarifa vigente". No hay valor por defecto.

### J1.5 Qué pasa con los pedidos ya creados (flujo 64 del N1)

`PedidoService.confirmarPedido` (234-255) guarda en `pedido`, como montos ya calculados:

- `subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio` y `total` (= subtotal + cargo al cliente).
- Las columnas son `decimal(10,2) NOT NULL` (`V1`, tabla `pedido`).

No guarda `configuracion_tarifa_id`, ni el tipo de cargo, ni la tasa o el monto de la configuración. Un cambio posterior de tarifa no altera ningún pedido existente: todo lo posterior lee las columnas del pedido (por ejemplo `MercadoPagoPagoService` líneas 430 y 527: `marketplace_fee` = `cargoServicioCliente + cargoServicioComercio` del pedido; `PedidoRepository` líneas 166, 199 y 206: `SUM(cargo_servicio_comercio)` para la comisión del turno y las estadísticas).

Efecto sobre un pedido en vuelo: si el Cliente ya tiene un total en pantalla y la tarifa cambia, `confirmarPedido` compara `request.getTotalEsperado()` con `subtotal + cargoServicioCliente`; si difiere, **409** `PRECIO_CAMBIO` (`ConflictoComercioException`, `data` con `subtotal`, `cargoServicioCliente`, `total` e `items`). Compara el total, así que también salta por un cambio de tarifa. En el frontend, `FE/js/checkout.js` línea 583 repinta `carrito.cargoServicioCliente = error.data.cargoServicioCliente`.

### J1.6 Sentido P4 → P7 (flujo 64): respuesta

**No.** Ningún flujo va del pedido hacia `configuracion_tarifa`. Evidencia:

1. `ConfiguracionTarifaRepository` solo se usa desde `ConfiguracionTarifaService`; `ConfiguracionTarifaService` solo lo inyectan `AdministradorController`, `CarritoService` y `PedidoService` (grep de `ConfiguracionTarifa|configuracionTarifaService` en `BE/`, 12 coincidencias, todas listadas arriba).
2. `Pedido.java` no tiene relación ni columna hacia `configuracion_tarifa`; `V1__baseline_bajonea_final.sql` y las migraciones posteriores solo mencionan `configuracion_tarifa` en su propia definición y en `V10`.
3. El único sentido es P7 → P4: `confirmarPedido` lee la tarifa vigente y copia los **montos resultantes** en `pedido`.

### J1.7 Frontend: `admin-tarifas.html` + `FE/js/admin.js` (`initAdminTarifas`, 1790-1897)

- Entrada: tile "Tarifas" / "Cargos y comisiones" del dashboard (`admin.js:259`, `href: 'admin-tarifas.html'`) y el ítem de la barra lateral (`data-admin-nav="tarifas"`).
- `requireAdmin()`: si el usuario no es `ADMINISTRADOR`, redirige a `login.html`.
- Título del header: "Tarifas"; contenedor `#tarifas-content`.
- Carga: dos `await apiFetch` seguidos (`/administrador/tarifas/vigente`, `/administrador/tarifas/historial`) **sin `try/catch` local**; si el vigente responde 409 la pantalla queda sin contenido. Lo que muestre `apiFetch` ante un error global: NO RELEVADO. No hay esqueleto ni estado de error propios.
- Sección "Tarifa vigente":
  - Insignia "Activa desde dd/mm/aaaa".
  - Barra de dos columnas: `formatearCargo` (por ejemplo "$200" o "1%") y la etiqueta "Cargo al cliente · Monto fijo por pedido" / "Cargo al comercio · Sobre el subtotal" (el texto depende del tipo: `FIJO` → "Monto fijo por pedido", `PORCENTAJE` → "Sobre el subtotal").
  - Botón "+ Nueva configuración".
- Sección "Historial": todas las filas menos la vigente (`item.id !== vigente.id`); cada una muestra "dd/mm/aaaa a las HH:MM hs" y "`$200` cliente · `1%` comercio". Vacío: "Todavía no hay configuraciones anteriores."
- Formulario (`crearFormularioTarifa`): dos campos "Cargo al cliente" (selector por defecto `FIJO`) y "Cargo al comercio" (por defecto `PORCENTAJE`); opciones del selector "Monto fijo ($)" y "Porcentaje (%)"; `input type="number" min="0" step="0.01"`, placeholder "0". Botón "Guardar nueva tarifa". En móvil se abre en una hoja inferior con título "Nueva configuración de tarifa", texto "Se aplica a todos los pedidos nuevos a partir de este momento." y botón "Cancelar"; desde 1024 px el mismo formulario va en línea (tarjeta `tarifa-formulario`). La elección móvil/escritorio se hace al renderizar (`matchMedia('(min-width: 1024px)')`), no al redimensionar.
- Validación en el cliente (al enviar): valor vacío, no numérico o menor a 0 → "Ingresá un valor numérico igual o mayor a 0." bajo el campo (limpia al escribir).
- Hoja de confirmación (`confirmarNuevaTarifa`): título "¿Aplicar la nueva tarifa?"; texto "Se aplica a los pedidos que se confirmen desde ahora. Los pedidos ya creados conservan la tarifa con la que se confirmaron."; párrafo "Si un cliente está por confirmar su pedido, va a ver el total actualizado antes de pagar."; comparación "Cargo al cliente" y "Cargo al comercio" con "antes → ahora" (si no hay vigente, el "antes" dice "Sin tarifa"); botones "Aplicar tarifa" ("Aplicando…" mientras envía) y "Cancelar".
- Éxito: `POST /administrador/tarifas`; toast "Tarifa creada correctamente"; recarga vigente e historial y redibuja.
- Error del `POST`: la hoja muestra `fallo.message` en su línea de error y rehabilita el botón; si no hay mensaje, "No pudimos completar la acción. Probá de nuevo." (`FE/js/hoja.js` 353-361).
- `formatearCargo`: `PORCENTAJE` sin ceros finales y con signo `%`; `FIJO` en pesos enteros con puntos de miles (el frontend redondea al entero: un cargo fijo con centavos se ve sin ellos).

---

## J2. Categorías y tags del catálogo (CRUD del Administrador) (P2)

### J2.1 Endpoints

| Recurso | Método y ruta | Rol | Éxito y mensaje literal |
|---|---|---|---|
| Categoría | `POST /api/v1/categorias` | `ADMINISTRADOR` | 201 "Categoría creada correctamente" |
| Categoría | `PUT /api/v1/categorias/{id}` | `ADMINISTRADOR` | 200 "Categoría actualizada correctamente" |
| Categoría | `GET /api/v1/categorias` | cualquier autenticado (`authenticated()` para `GET`, antes del matcher de administrador) | 200 "Categorías obtenidas correctamente" |
| Categoría | `DELETE /api/v1/categorias/{id}` | `ADMINISTRADOR` | 200 "Categoría dada de baja correctamente" (baja lógica) |
| Categoría | `PUT /api/v1/categorias/{id}/reactivar` | `ADMINISTRADOR` | 200 "Categoría reactivada correctamente" |
| Tag | `POST /api/v1/tags` | `ADMINISTRADOR` | 201 "Tag creado correctamente" |
| Tag | `PUT /api/v1/tags/{id}` | `ADMINISTRADOR` | 200 "Tag actualizado correctamente" |
| Tag | `GET /api/v1/tags` | cualquier autenticado | 200 "Tags obtenidos correctamente" |
| Tag | `DELETE /api/v1/tags/{id}` | `ADMINISTRADOR` | 200 "Tag dado de baja correctamente" |
| Tag | `PUT /api/v1/tags/{id}/reactivar` | `ADMINISTRADOR` | 200 "Tag reactivado correctamente" |

Fuentes: `BE/controllers/CategoriaController.java`, `BE/controllers/TagController.java`, `SecurityConfig` (matchers de `GET` y de `/api/v1/categorias/**`, `/api/v1/tags/**`). Ninguno usa `X-Comercio-Id`. No hay eliminación física.

### J2.2 Entradas y validaciones (en orden)

`CategoriaRequestDTO` y `TagRequestDTO` (idénticos): un solo campo `nombre`.

1. `@NotBlank(message = "No debe estar vacío")` → **400** `nombre: No debe estar vacío`.
2. `@Size(max = 100)` **sin mensaje propio** → 400 con el texto por defecto de Hibernate Validator. NO RELEVADO el literal exacto (depende del locale de la JVM; el proyecto no define `messages` propios).
3. Servicio, `crear`: `existsByNombre` → **409** "Ya existe una categoría con ese nombre" / "Ya existe un tag con ese nombre".
4. Servicio, `editar`: `404` "Categoría no encontrada" / "Tag no encontrado"; si `!actual.getNombre().equals(nuevo)` (comparación Java sensible a mayúsculas) y `existsByNombre(nuevo)` → el mismo 409 (ver D-72).
5. `baja` y `reactivar`: `404` si el id no existe.
6. Carrera de dos altas con el mismo nombre: la `UNIQUE` (`uq_categoria_nombre` / `uq_tag_nombre`) lanza `DataIntegrityViolationException`; `GlobalExceptionHandler` responde **409** "Ya existe un registro con alguno de los datos ingresados" (el mensaje genérico, no el específico).
7. Un `id` de ruta no numérico: **400** `id: valor inválido` (`MethodArgumentTypeMismatchException`).

Unicidad: `nombre varchar(100)` con `UNIQUE` y `COLLATE utf8mb4_unicode_ci` (`V1`, tablas `categoria` y `tag`). `existsByNombre` compara con `=`, así que no distingue mayúsculas ni tildes (la `ñ` se compara como `n`).

### J2.3 Pasos y escrituras

Servicios `CategoriaService` y `TagService`: `@Transactional` de clase, sin bloqueos explícitos, sin llamadas externas.

- `crear`: lee `existsByNombre`; `INSERT` en `categoria`/`tag` con `activo = true` y `fecha_creacion = LocalDateTime.now()`. El nombre se guarda **tal cual llega** (sin `trim` ni normalización en el servidor).
- `editar`: `setNombre` + `fecha_modificacion = now()`. No toca `activo`.
- `baja` (`DELETE`): `activo = false` y `fecha_baja = now()`. No comprueba si ya estaba inactiva (repetirla pisa `fecha_baja`). No mira los productos asociados ni bloquea.
- `reactivar`: `activo = true` y `fecha_baja = null`.
- `listar`: `findAll()` (todas, activas e inactivas, sin orden explícito) y, por cada fila, `countByCategoriaId` / `countByTagId` (`cantidadProductos`, una consulta por fila).
- DTO de salida: `id`, `nombre`, `activo`, `cantidadProductos`.
- Efectos secundarios: ninguno (sin aviso, email, auditoría ni historial). `AdministradorService` usa `countByActivoTrue` solo para las métricas del dashboard (`categoriasActivas`, `tagsActivos`).

### J2.4 Qué pasa con productos que usan la categoría o el tag (baja lógica)

- La baja lógica **no modifica ningún producto** ni su relación (`producto.categoria_id`, `producto_tag`).
- `ProductoService` no valida `activo` en el servidor: `obtenerCategoria` (línea 497) solo hace `findById` y `asignarTags` (línea 445) solo hace `findById` por tag. Un `POST`/`PUT` de producto con una categoría o un tag inactivos se acepta (ver D-73).
- Catálogo del Cliente: `listarFiltrosDisponibles` (líneas 258-277) arma los chips de categorías y tags a partir de los **productos** visibles (`APTO_VENTA`, no `DESCONTINUADO`) con `distinct` y orden alfabético por nombre; **no filtra por `activo`**. Una categoría o un tag inactivos siguen apareciendo mientras haya productos que los usen (ver D-74). `listarCatalogoGlobal` y `listarCatalogoDelComercio` filtran por `categoriaId`/`tagIds` sin mirar `activo`.
- Por tanto, "desactivar" solo tiene efecto en lo que filtra el frontend: el selector del formulario de producto y la pantalla del Administrador.

### J2.5 Frontend

**Administrador** (`FE/admin-categorias.html`, `FE/admin-tags.html`, `FE/js/admin.js`):

- Categorías (`initAdminCategorias`, 1229-1321): chips "Todas (n)", "Activas (n)", "Inactivas (n)" (`data-testid` `chip-filtro-categoria-*`); fila con nombre, "1 producto asociado" / "N productos asociados" y, en escritorio, la columna Estado ("Activa" / "Inactiva") dentro de una tabla con columnas ("" , "Nombre", "Productos", "Estado", ""); botón de lápiz "Editar categoría"; "+" flotante "Crear categoría" y, en escritorio, botón "Nueva categoría". Vacío: "No hay categorías para mostrar". Tags (`initAdminTags`, 1495+): equivalente, con vacío "No hay tags para mostrar". La carga inicial (`apiFetch('/categorias')`, `apiFetch('/tags')`) no tiene `try/catch` local.
- Modal de categoría (`mostrarModalCategoria`, 1050-1189): títulos "Nueva Categoría" / "Editar Categoría"; etiqueta "Nombre de la categoría", `maxLength` 100; al guardar con el campo vacío (tras `trim`) → "El nombre de la categoría es obligatorio."; en edición aparece el interruptor "Categoría activa" con el texto "Solo las categorías activas pueden asignarse a productos."; botones "Crear Categoría" / "Guardar Cambios" y "Cancelar".
- Guardado: alta = `POST /categorias` con `{nombre}` (el nombre ya recortado); edición = `PUT /categorias/{id}` y, si el interruptor cambió, `DELETE` o `PUT .../reactivar` (dos llamadas, no atómicas). Toasts: "Categoría creada correctamente" y "Categoría actualizada correctamente". Error 409: se muestra bajo el campo (`error.message` o "Ya existe una categoría con ese nombre."); otro error: toast de error con `error.message` o "No pudimos guardar la categoría".
- Modal de tag (`mostrarModalTag`): "Nuevo Tag" / "Editar Tag"; etiqueta "Nombre del tag"; placeholder "Ej: Vegano, Sin TACC..."; "El nombre del tag es obligatorio."; interruptor "Tag activo" con "Solo los tags activos pueden asignarse a productos."; botones "Crear Tag" / "Guardar Cambios"; toasts "Tag creado correctamente" y "Tag actualizado correctamente"; 409 "Ya existe un tag con ese nombre."; error genérico "No pudimos guardar el tag".
- En el alta no hay interruptor de activo (el ramo `if (!activo) DELETE` del alta no se alcanza desde la interfaz).

**Dueño / Empleado** (`FE/js/comercio.js`, formulario de producto, líneas 3380-3470 y 3586-3750; `FE/comercio-producto-form.html`):

- Pide `GET /categorias` y `GET /tags` y **filtra `activo` en el cliente**: selector "Seleccioná una categoría" con las activas; chips de tags solo de los activos (el campo de tags se oculta si no hay ninguno activo); máximo 5 tags en pantalla: "Podés seleccionar hasta 5 tags." (el servidor responde "No podés seleccionar más de 5 tags").
- Al editar un producto, `selectCategoria.value = String(productoActual.categoriaId)`: si esa categoría está inactiva no existe la opción y el selector queda sin valor (ver D-75). Los tags preseleccionados se buscan entre los chips activos por nombre; los inactivos no se marcan y al guardar `tagIds` reemplaza la lista (`deleteByProductoId` + `asignarTags`), así que se pierden.
- Errores del servidor: `categoriaId` mapeado a `error-producto-categoria` (`mapearErroresBackend`).

**Cliente** (`FE/js/explorar.js`): los chips de categorías ("Todas" + una por categoría) y de tags salen de `GET /catalogo/filtros` (ver parte final, punto 1).

---

## J3. Estadísticas y ventas por turno del Dueño (P2.06, servidor y frontend)

### J3.1 Endpoint y permisos

- `GET /api/v1/comercios/estadisticas` (`BE/controllers/EstadisticasComercioController.java`).
- Parámetros (todos `String`, `required = false`): `desde`, `hasta` (`AAAA-MM-DD`, inclusive los dos) y `agrupar` (`DIA`, por defecto, o `TURNO`). Usa `ComercioActivo` (header `X-Comercio-Id` obligatorio para el Dueño; sin header, vacío o no numérico: 400; comercio ajeno o inexistente: 404 `COMERCIO_NO_DISPONIBLE`).
- Quién la ve: **solo el Dueño del comercio activo.** La ruta cae bajo `/api/v1/comercios/**` → `hasRole("DUENO")` y no figura en `DelegacionEmpleado.RUTAS`, así que un Cliente/Empleado y el Administrador reciben 403 de la capa de seguridad (mensaje literal NO RELEVADO).
- Estado del comercio: **el servidor no lo mira.** `ComercioActivoService.resolverComoDueno` busca por `(comercioId, duenoId)` sin filtrar el estado, y el servicio no valida ningún estado. Lo que ve el Dueño con un comercio suspendido, cerrado o rechazado depende solo de las pantallas que lo dejen entrar (ver D-77).
- En el frontend la entrada ("Ver estadísticas" bajo las métricas del panel, `comercio.js` 689-697) se arma solo para el contexto Dueño; la página usa `exigirDueno()` (`FE/js/estadisticas.js:286`).

### J3.2 Validaciones (`EstadisticasComercioService.obtener`) — en orden, todas 400 (`ValidacionException`)

1. `desde` o `hasta` ausentes o en blanco: "Indicá las fechas desde y hasta".
2. `desde` o `hasta` que no parsean como `LocalDate`: "La fecha desde tiene que tener el formato AAAA-MM-DD" / "La fecha hasta tiene que tener el formato AAAA-MM-DD".
3. `desde` posterior a `hasta`: "La fecha desde no puede ser posterior a la fecha hasta".
4. Más de 92 días (`ChronoUnit.DAYS.between(desde, hasta) + 1 > 92`): "El rango no puede superar los 92 días".
5. `agrupar` distinto de `DIA`/`TURNO` (con `trim`): "La agrupación tiene que ser DIA o TURNO".

`hasta` en el futuro no es error. Todas las lecturas son una sola transacción de solo lectura, sin bloqueos.

### J3.3 Consultas y qué cuenta

Dos consultas nativas en `BE/repositories/PedidoRepository.java` (líneas 195-215), con `estado` leído como texto (el ENUM físico conserva el literal viejo `PENDIENTE`):

1. `estadisticasPorTurno(comercioId, desde, hasta)`: `SELECT turno_fecha, turno_horario_id, estado, COUNT(*), SUM(subtotal), SUM(cargo_servicio_comercio) FROM pedido WHERE comercio_id = ? AND turno_fecha BETWEEN ? AND ? GROUP BY turno_fecha, turno_horario_id, estado`.
2. `estadisticasSinTurno(comercioId, desdeDT, hastaExclusivoDT)`: pedidos con `turno_fecha IS NULL` y `fecha_pago_confirmado >= desde 00:00` y `< (hasta + 1) 00:00`, agrupados por `DATE(fecha_pago_confirmado)` y estado.

Qué cuenta:

- Solo pedidos que **llegaron pagados**: los que tienen `turno_fecha` (se asigna al confirmarse el pago) y los pagados sin turno por el día de `fecha_pago_confirmado`. Un pedido que nunca se pagó (`turno_fecha` y `fecha_pago_confirmado` nulos) no aparece.
- El día es el de **apertura del turno**.
- `pedidos`: todas las filas; `facturados`, `vendido` (suma de `subtotal`) y `comision` (suma de `cargo_servicio_comercio`): solo estados de `ResumenTurnoService.ESTADOS_FACTURADOS` (`EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`, `ENTREGADO`, `NO_RETIRADO`). `neto = vendido − comision`. `ticketPromedio = vendido ÷ facturados` con escala 2 `HALF_UP`, o `null` si no hay facturados.
- `resultados` en siete categorías (`CategoriaResultadoPedido`): `ENTREGADO`, `NO_RETIRADO`, `RECHAZADO`, `CANCELADO` (junta `CANCELADO` y `CANCELADO_POR_SISTEMA`), `ANULADO`, `EXPIRADO`, `EN_CURSO` (`PENDIENTE`, `PENDIENTE_CONFIRMACION_COMERCIO`, `EN_PREPARACION`, `EN_CAMINO`, `LISTO_PARA_RETIRAR`; un estado desconocido cuenta como en curso con un `log.warn`).
- Agrupación `DIA`: una entrada por cada día del rango, con ceros para los vacíos (el servicio precarga todos los días); los pagados sin turno suman al día de pago. Agrupación `TURNO`: solo turnos con pedidos, ordenados por fecha y luego por inicio, y las entradas "sin turno" (`turno = null`) al final de cada día. Datos del turno: `id` del horario, `inicio` (fecha del turno + hora de apertura), `fin` (`DisponibilidadComercioService.finDelTurno`) y `cruzaMedianoche`.
- No es una foto: refleja el estado actual de los pedidos y puede diferir del email de cierre de turno.
- Respuesta (`EstadisticasComercioResponseDTO`): `desde`, `hasta`, `agrupar`, `totales` (`pedidos`, `facturados`, `vendido`, `comision`, `neto`, `ticketPromedio`, `resultados`) y `periodos[]`. Mensaje: "Estadísticas obtenidas correctamente".

### J3.4 "Hoy incluido" para 7 y 30 días

El rango lo arma el frontend (`FE/js/estadisticas.js`, `pedirRango`): `hasta = diaDeHoyEnZonaComercio()` (zona `America/Argentina/Ushuaia`, `FE/js/fechas.js`) y `desde = sumarDias(hasta, −(cantidadDias − 1))`. Es decir, "7 días" = hoy y los 6 anteriores (7 fechas), "30 días" = hoy y los 29 anteriores; ambos extremos inclusive y sin pasar el tope de 92. El servidor no calcula "hoy": usa lo que recibe.

### J3.5 Frontend (`FE/comercio-estadisticas.html`, `FE/js/estadisticas.js`)

- Header "Estadísticas" con volver a `comercio-dashboard.html`; navegación inferior/lateral del comercio con "Panel" activo y la entrada lateral "estadisticas".
- Chips de rango: "7 días" y "30 días" (por defecto 30). Texto del período: "Del dd/mm al dd/mm".
- Carga: esqueleto (cuatro tiles, gráfico y lista) con `aria-busy`; las dos consultas (`agrupar=DIA` y `agrupar=TURNO`) se piden en paralelo y se cachean por rango durante la vida de la página (una consulta fallida se descarta de la caché).
- Cifras (cuatro tiles): "Vendido", "Comisión", "Neto" y "Ticket promedio", formato `$` con puntos de miles y sin centavos; sin pedidos o sin dato, el guion "–".
- "Vendido por día": gráfico de barras hecho con botones (una por día, `aria-label` "dd/mm: $monto", `aria-pressed`), navegable con flechas, Inicio y Fin; altura proporcional al máximo con un mínimo de 3 %; eje con la primera y la última fecha; nota "Cada pedido cuenta en el día en que abrió su turno." Al tocar una barra: título "<día> dd/mm", "Vendido $X" y "N pedido(s)", y una lista de turnos (rango "HH:MM a HH:MM", con "(día siguiente)" si cruza la medianoche, o "Sin turno asignado") con "$monto · N pedidos". Día sin pedidos: "No hubo pedidos este día." Sin selección: "Tocá una barra para ver el detalle de ese día."
- "Cómo terminaron los pedidos": siete filas con las etiquetas "Entregados", "No retirados", "Rechazados", "Cancelados", "Anulados", "Sin respuesta" (`EXPIRADO`) y "En curso", con la cantidad; las de cero se atenúan.
- Vacío (`totales.pedidos === 0`): "No hubo pedidos en los últimos N días." y, solo en el rango de 7 días y solo si los 30 días tienen pedidos, el botón "Ver los últimos 30 días".
- Error: aviso "No pudimos cargar las estadísticas. Probá de nuevo." con el botón "Reintentar"; el error de la consulta de 30 días para el aviso de vacío se ignora.
- Cada elección de chip invalida las respuestas de peticiones anteriores (`peticionVigente`).

---

## Parte final. Cuatro verificaciones puntuales

### 1. P3.01 búsqueda y filtros

Endpoints (`BE/controllers/CatalogoController.java`, públicos, `GET`, sin autenticación; el frontend manda `auth: false`):

- `GET /api/v1/catalogo/productos?categoriaId=&tagIds=&q=&pagina=` → `listarProductosGlobal` → `ProductoService.listarCatalogoGlobal`. Parámetros (todos `required = false`): `categoriaId` (`Integer`), `tagIds` (`List<Integer>`, repetible: `tagIds=1&tagIds=2`), `q` (`String`) y `pagina` (`Integer`).
- `GET /api/v1/catalogo/filtros` → `listarFiltrosDisponibles` → `FiltrosCatalogoResponseDTO` con `categorias[]` y `tags[]`.
- Mismo controller, otros endpoints del catálogo: `GET /api/v1/catalogo/comercios` y `GET /api/v1/catalogo/comercios/{id}/productos?categoriaId=&tagId=` (un solo `tagId`).

Validaciones y reglas (sin mensaje de negocio propio, no hay `ValidacionException`):

- Un parámetro con tipo inválido (por ejemplo `categoriaId=abc`, `tagIds=x` o `pagina=x`): **400** `<nombre del parámetro>: valor inválido` (`handleMethodArgumentTypeMismatch`).
- `pagina` nula o menor a 1 → página 1. Página mayor al total → 200 con lista vacía (`totalPaginas`, `totalProductos` informados). Tamaño de página fijo: 20 (`TAMANIO_PAGINA_CATALOGO_GLOBAL`).
- `categoriaId` o un `tagId` inexistentes → 200 con 0 resultados (no hay 404). Varios `tagIds` combinan con AND; la categoría es un solo valor.
- `q`: se ignora si es nula o en blanco; se aplica `trim().toLowerCase()` y se busca con `contains` solo sobre `producto.nombre` en minúsculas (sin normalizar tildes; no busca en la descripción ni en el nombre del comercio). El servidor no limita la longitud.
- Universo: productos de comercios `APTO_VENTA` que no están `DESCONTINUADO` (los `AGOTADO` se incluyen); orden aleatorio (`Collections.shuffle`) recalculado en cada petición.
- Respuesta: `{productos, paginaActual, totalPaginas, totalProductos}`; mensaje "Productos obtenidos correctamente" / "Filtros obtenidos correctamente".

Búsqueda por nombre de **comercio** del lado servidor: **no existe.** `GET /catalogo/comercios` no acepta parámetros; el filtrado de comercios es del cliente (ver D-78). El frontend de Explorar (`FE/js/explorar.js`) manda `q` en minúsculas y recortado a 80 caracteres, con espera de 300 ms tras dejar de escribir; envía `categoriaId`, `tagIds`, `q` y `pagina`.

### 2. `TurnoBackfillRunner` y aviso de los 75 minutos

- **Asignación de turnos al arrancar** (`BE/services/TurnoBackfillRunner.java` + `TurnoBackfillService`): se dispara en `ApplicationReadyEvent`, en un hilo aparte, solo con `turno.backfill.habilitado=true` (por defecto `true`; el perfil `test` lo apaga). **Tablas:** lee `pedido` (filas con `turno_fecha IS NULL` y `fecha_pago_confirmado IS NOT NULL`) y `horario`, y escribe `pedido.turno_fecha` y `pedido.turno_horario_id` con `UPDATE ... WHERE id = ? AND turno_fecha IS NULL`. **Idempotente:** sí, por esa condición en el `UPDATE` y porque la selección solo toma pedidos sin turno; se puede correr con más de una instancia.
- **Aviso de los 75 minutos** (`PedidoService.avisar75MinYAutoconfirmar`, línea 985, mismo proceso que la autoconfirmación de los 90): para cada pedido `EN_CAMINO` y con la fila bloqueada, si pasaron `pedido.timeout.aviso-en-camino-minutos` (75) y `primer_aviso_emitido` es falso, marca `pedido.primer_aviso_emitido = true` y crea el aviso `AVISO_75MIN_SIN_CONFIRMACION` en `notificacion` para el Cliente ("Tu pedido #N sigue en camino. Si ya lo recibiste, confirmalo para cerrarlo."). **Idempotente:** sí, por la bandera `primer_aviso_emitido`; si el job ve por primera vez un pedido que ya pasó los 90 minutos, solo autoconfirma y no emite el aviso.

### 3. `AptitudVentaComercioService` y T40/T41

Sin cambios: no se relevó de nuevo.

### 4. Numeración (`P1.15`, `P3.04`, `P3.05`)

- **P1.15: no existen** funciones del código que lo justifiquen. `GET /carrito` con tarifa pertenece al carrito (P4.01) y a la lectura de tarifa (J1); "Mis consultas" (`ayuda.js`, `cliente.js`, `comercio.js`, `soporte-mis-consultas.js`, `mis-consultas.html`) es Soporte, no cuentas ni sesión.
- **P3.04 y P3.05: no existen.** Los endpoints del catálogo son cuatro (`/comercios`, `/comercios/{id}/productos`, `/productos`, `/filtros`) y quedan cubiertos por P3.01, P3.02 y P3.03. Se deja constancia (D-78) de que lo que el índice llama P3.01 ("Búsqueda y filtros de comercios") reúne en el código dos recorridos distintos del Cliente: el listado de comercios de `index.html` con chips del lado cliente y Explorar de productos con búsqueda del lado servidor.

---

## Resumen de desvíos (D-68 en adelante)

| Id | Diagrama | Resumen |
|---|---|---|
| D-68 | J1 | `V10` siembra la tarifa inicial solo si existe `usuario.email = 'admin@bajonea.com'` (también el `CASE` de `V19`); `CLAUDE.md` nombra al Administrador como `admin@bajonea.ar`. Sin esa fila no hay tarifa vigente y el carrito con ítems y `confirmarPedido` responden 409 "No hay ninguna configuración de tarifa vigente" |
| D-69 | J1 | `fecha_vigencia` usa `LocalDateTime.now()` (zona de la JVM, no el `Clock`) en una columna `datetime` sin fracciones; dos altas dentro del mismo segundo empatan y `findTopByOrderByFechaVigenciaDesc` no desempata. No existe "vigencia hasta" |
| D-70 | J1 | Sin tope ni `@Digits`: el porcentaje puede superar 100 (la comisión supera el subtotal y el neto queda negativo), los dos cargos pueden ser 0, más de dos decimales los redondea la base, y un valor mayor al `decimal(10,2)` falla en la base (resultado NO VERIFICADO) |
| D-71 | J1 | El pedido guarda solo los montos (`subtotal`, `cargo_servicio_cliente`, `cargo_servicio_comercio`, `total`): sin id, tipo ni tasa de la configuración aplicada; el flujo 64 (P4 → P7) no existe. El cambio de tarifa sin aviso ni auditoría más allá de `administrador_id` y fecha |
| D-72 | J2 | Editar una categoría o un tag cambiando solo mayúsculas o tildes responde 409 "Ya existe una categoría con ese nombre" / "Ya existe un tag con ese nombre": el `equals` de Java es sensible a mayúsculas, pero `existsByNombre` (collation `utf8mb4_unicode_ci`) la encuentra a sí misma |
| D-73 | J2 | El servidor no valida `activo` al asignar categoría o tags a un producto (`obtenerCategoria`, `asignarTags`); la frase "Solo las categorías activas pueden asignarse a productos." (y la de tags) solo la cumple el filtro del formulario |
| D-74 | J2 | Dar de baja una categoría o un tag no cambia ningún producto ni el catálogo: `listarFiltrosDisponibles` no filtra `activo`, y `GET /categorias` y `GET /tags` devuelven las inactivas a cualquier autenticado |
| D-75 | J2 | Editar un producto cuya categoría está inactiva deja el selector sin valor (no existe la opción) y al guardar se pierden sus tags inactivos (`tagIds` reemplaza la lista) |
| D-76 | J2 | Sin `trim` ni normalización en el servidor (el frontend recorta); `@Size(max = 100)` sin mensaje propio; una carrera de altas devuelve el 409 genérico "Ya existe un registro con alguno de los datos ingresados" |
| D-77 | J3 | El servidor devuelve las estadísticas con el comercio en cualquier estado (sin comprobar `APROBADO`/`APTO_VENTA`/`SUSPENDIDO`...); el Empleado y el Administrador reciben 403 de la seguridad (la ruta no está en la lista delegable) |
| D-78 | P3.01 | Corrige a D-COMPL·D-09: los chips "Delivery", "Retiro" y "Abierto ahora" están en `initCatalogo` (`index.html`, filtro del lado cliente sobre `GET /catalogo/comercios`), no en Explorar; Explorar solo tiene categoría, tags, búsqueda por nombre de producto y paginación. No existe búsqueda por nombre de comercio |
| D-79 | P3.01 | `q` busca solo en `producto.nombre` con `contains` en minúsculas (sin normalizar tildes) y el servidor no limita su longitud (el frontend corta en 80); un parámetro de tipo inválido devuelve "`<parámetro>`: valor inválido" |

## Resumen de cuestiones abiertas (C-57 en adelante)

| Id | Diagrama | Cuestión |
|---|---|---|
| C-57 | J1 | ¿Debe el servidor validar un tope (por ejemplo porcentaje de 0 a 100) y un máximo para las tarifas? |
| C-58 | J1 | Sin tarifa vigente el carrito y los pedidos quedan bloqueados con 409: ¿es lo buscado o debe haber un valor por defecto? |
| C-59 | J1 | ¿Debe avisarse a Dueños y Clientes un cambio de tarifa o programarse una vigencia futura? Hoy se aplica siempre "desde ahora" y sin aviso |
| C-60 | J1 | ¿Debe el pedido conservar una referencia a la configuración de tarifa aplicada (flujo 64) además de los montos? |
| C-61 | J2 | ¿Debe desactivar una categoría o un tag impedir su asignación en el servidor y ocultarlos del catálogo del Cliente, o solo del selector del Dueño? |
| C-62 | J2 | ¿Un producto cuya categoría quedó inactiva debe seguir publicado? Hoy sí |
| C-63 | J2 | ¿Es la regla buscada que "Café" y "cafe" (y mayúsculas) cuenten como el mismo nombre, incluso al renombrar solo la capitalización? |
| C-64 | J3 | ¿Deben verse las estadísticas con el comercio en cualquier estado y debe el Empleado poder verlas? Hoy el servidor no mira el estado y el Empleado no |
| C-65 | P3.01 | ¿Hace falta una búsqueda de comercios por nombre (del servidor)? Hoy no existe: solo la de productos en Explorar |

## NO RELEVADO

- Mensaje literal del `400` por `@Size(max = 100)` de `nombre` (categoría y tag), que depende del locale de la JVM.
- Mensajes literales de `401` y `403` de la capa de seguridad en los endpoints de tarifas, categorías, tags y estadísticas.
- Respuesta real de la base ante un valor de tarifa mayor al `decimal(10,2)` (el `POST` no se ejecutó); qué muestra `apiFetch` globalmente ante el 409 de `GET /tarifas/vigente` y ante las fallas de carga de categorías y tags.
- Qué muestra `prepararPaginaComercio` (y por tanto la pantalla de estadísticas) con un comercio no operativo (se apoya en lo ya documentado en `CLAUDE.md`, sin volver a leerlo).
- Si el Administrador real de cada base (`bajonea_final`, `bajonea_practicas3`, `bajonea_test`) tiene el email `admin@bajonea.com` o `.ar`, y por tanto si la fila inicial de tarifa existe (no se consultó la base).
- Contraste de los textos de J1, J2 y J3 contra los documentos de requisitos (`04. Requisitos Funcionales`, `07. Historias de Usuario`): no se leyeron en este tramo, por eso los desvíos de J1 a J3 son de código contra código o contra `CLAUDE.md`.
- Estilos, `data-testid` y comportamiento táctil/teclado de las pantallas de tarifas, categorías y tags más allá de lo citado.
