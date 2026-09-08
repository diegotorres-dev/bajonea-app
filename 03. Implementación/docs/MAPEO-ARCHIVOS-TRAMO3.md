# Mapeo pantallas ↔ archivos — Fase 16, Tramo 3

Relación exacta entre las 8 pantallas lógicas del catálogo de Fase 15 correspondientes a este tramo (Cliente: Carrito y Checkout) y los archivos generados en `frontend/`. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`/`TRAMO2.md`.

---

## C — Cliente (8 pantallas del tramo → 2 archivos nuevos + 1 modificado)

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| C09, C10 | `frontend/carrito.html` (+ `frontend/js/carrito.js`, función `initCarrito`) | 2 pantallas, 1 archivo. C09 (carrito vacío) y C10 (carrito con productos) son el mismo `GET /api/v1/carrito` — lo que cambia es si `items` viene vacío o no, resuelto con un estado vacío reutilizable, no una pantalla aparte (mismo criterio que C01/C02/C03 en el Tramo 2). |
| C10b | Modal `mostrarModalVaciarCarrito()` en `frontend/js/carrito.js` | Sin archivo `.html` propio — se abre sobre `carrito.html` al tocar "Vaciar carrito", mismo patrón de modal inyectado que `C46` (Tramo 2). |
| C12 | Modal `mostrarModalConflictoComercio()` en `frontend/js/catalogo.js` | Sin archivo `.html` propio. Vive en `catalogo.js`, no en `carrito.js`, porque se dispara desde la acción de "agregar al carrito" del modal de producto (`C06`, ya construido en el Tramo 2) al recibir `409` de `POST /carrito/items` — mantenerlo junto a `abrirModalProducto` evita un import circular entre `catalogo.js` y `carrito.js` (`carrito.js` importa `renderTopBar`/`renderBottomNav`/`showToast` de `catalogo.js`, nunca al revés). |
| C13, C14, C15, C16 | `frontend/checkout.html` (+ `frontend/js/checkout.js`, función `initCheckout`) | 4 pantallas, 1 archivo — wizard de 3 pasos (`step-progress`, mismo componente y patrón `mostrarPaso` ya usado en `registro-cliente.html`/`registro-comercio.html`, Tramo 1). Paso 2 renderiza C14 o C15 según la modalidad elegida en el Paso 1 (C13), sin dos archivos separados. La confirmación final de pedido (más allá de C16) se resuelve con un modal de éxito reutilizando `.modal-sheet`, no una pantalla nueva — no está en el catálogo cerrado de Fase 15 y no ameritaba fabricar una pantalla no pedida. |

**Modificado (no nuevo):** `frontend/js/catalogo.js` — `abrirModalProducto` (C06, Tramo 2) suma la sección de "agregar al carrito" (stepper de cantidad, nota opcional, botón con precio dinámico) que el Tramo 2 había omitido a propósito por estar el Carrito fuera de ese tramo (ver `docs/MAPEO-ARCHIVOS-TRAMO2.md`, desvío 3). `frontend/css/styles.css` suma las clases nuevas de este tramo (`.stepper`, `.cart-item`, `.cart-summary`, `.cart-footer`, `.delivery-option`, `.summary-card`, `.order-line`, `.conflict-card`, `.toast`, `.cart-notice`, `.quantity-input-row`, `.modal-sheet__icon--success`), reutilizando los tokens de diseño existentes (`--color-*`, `--radius-*`, `--shadow-*`) sin definir ninguno nuevo.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Pantallas lógicas del tramo | 8 |
| Construidas | 8 |
| Archivos `.html` nuevos | 2 (`carrito.html`, `checkout.html`) |
| Archivos `.js` nuevos | 2 (`js/carrito.js`, `js/checkout.js`) |
| Archivos `.js` modificados | 1 (`js/catalogo.js`) |
| Pantallas sin archivo `.html` propio (componentes modales) | 2 (C10b, C12) |

---

## Cobertura real de Figma (MCP) en este tramo

La cuota mensual del MCP (plan Starter, seat View) seguía agotada al iniciar este tramo — confirmado con un intento real de `get_design_context` sobre C12 (`141:3613`), que devolvió el mismo error de límite de los tramos anteriores. **Cero llamadas exitosas de `get_design_context` en este tramo** (se intentó 1, priorizando C12 por ser la pantalla más específica del tramo, tal como pidió el dueño del proyecto, y falló por cuota).

En vez de construir todo por sistema de diseño puro, se corrió `get_metadata` (sin costo de cuota, confirmado en los dos tramos anteriores) sobre la página completa "MVP" — volcado nuevo de 662.606 caracteres — y se minó texto real de capas estáticas para las 8 pantallas de este tramo, sin gastar la cuota agotada de `get_design_context`:

| Pantalla | node-id | Qué se recuperó |
|---|---|---|
| C09 | `141:3356` | "Tu carrito está vacío" + texto de apoyo. |
| C10 | `141:3423` | Aviso "Podés pedir de un solo comercio a la vez.", filas de ítem (nombre, nota, precio), bloque "Resumen" con subtotal, botón "Confirmar pedido - $12.800". |
| C10b | `141:3592` | "¿Vaciar el carrito?", texto de advertencia, botón "Sí, vaciar carrito". |
| C12 | `141:3613` | "Tu carrito tiene productos de otro comercio", texto con nombres de comercio entre comillas, tarjetas "Comercio actual"/"Nuevo pedido" con nombre + cantidad de productos. |
| C13 | `141:3658` | Labels del step-progress (Modalidad/Dirección-Retiro/Resumen), heading, 2 tiles de modalidad con su subtítulo. |
| C14 | `141:3734` | "¿A dónde enviamos tu pedido?", dirección de ejemplo, botón "Confirmar dirección". |
| C15 | `141:3846` | Nombre + dirección del comercio, sección "¿Cómo funciona el retiro?" con 3 pasos. |
| C16 | `141:3943` | "Resumen de tu pedido", link "Editar", "Desglose del pago", línea "Podés cancelar hasta que el comercio inicie la preparación.", botón "Confirmar Pedido - $14.200". |

Igual que en el Tramo 2, la metadata solo resuelve texto de capas estáticas — las etiquetas de instancias de componente (ej. el ícono exacto de cada tile) se completaron con el sistema de diseño ya establecido (mismos íconos lineales `stroke="currentColor"` del resto del proyecto).

---

## Desvíos reales encontrados entre el diseño de Figma y el contrato real del backend

1. **"Confirmás el pedido y pagás." (C15) — adaptado a "Confirmás el pedido."** El MVP no tiene ningún flujo de pago real (MercadoPago está explícitamente fuera de alcance, `CLAUDE.md` §1). Mostrar "pagás" sugeriría una funcionalidad que no existe — se omitió esa palabra sin alterar el resto de la explicación del paso a paso de retiro.
2. **"Podés cancelar hasta que el comercio inicie la preparación." (C16) — omitido por completo.** No existe ningún endpoint de cancelación de pedido por parte del Cliente en el MVP (`EstadoPedido` recortado a `PENDIENTE → EN_PREPARACION/RECHAZADO`, sin `CANCELADO`, `PedidoController` no tiene ningún endpoint de baja/cancelación). Mostrar esa línea sería prometer una acción que no se puede ejecutar — se omitió, no se dejó un botón deshabilitado.
3. **Stepper de cantidad + nota + botón "Agregar al carrito" en C06 (modal de producto) — implementados en este tramo**, cerrando la omisión deliberada del Tramo 2 (ver `docs/MAPEO-ARCHIVOS-TRAMO2.md`, desvío 3). Solo visibles para un Cliente autenticado con el producto `DISPONIBLE`; para visitante sin sesión se muestra un botón "Iniciá sesión para pedir" en su lugar (no estaba en el Figma minado, pero es necesario: el endpoint de carrito requiere rol `CLIENTE`).
4. **Contador de intentos/badge de carrito en el ícono de "Carrito" del bottom nav — no implementado.** El backend no expone ningún endpoint de "cantidad de ítems en el carrito" separado de `GET /carrito` completo; agregar un badge numérico hubiera requerido una llamada extra en cada navegación solo para un detalle decorativo, no pedido explícitamente por el catálogo de Fase 15 para este ícono.

---

## Ampliación de alcance formal: `ClienteResponseDTO.direccion`

Antes de construir C14 (Confirmar Dirección de delivery), se confirmó un bloqueo real: ningún endpoint del backend exponía la `direccionId` del Cliente — `ClienteResponseDTO` no la incluía, no existe `DireccionController`, y ningún Service de Cliente tocaba `DireccionRepository` (mismo gap ya documentado para C41 en el Tramo 2, pero ahora bloqueando un flujo obligatorio de este tramo, no uno pospuesto). Sin esto, `checkout.html` no tenía forma de saber qué `direccionId` mandar en `PedidoRequestDTO` para `TipoEntrega.DOMICILIO`.

**Decisión, confirmada explícitamente por el dueño del proyecto antes de tocar código** (mismo criterio que `Sesion`/`Horario`/`ClienteController` en fases anteriores): `ClienteResponseDTO` se amplía con un campo `direccion` (objeto `DireccionResponseDTO` completo, de solo lectura) — expone la única dirección del Cliente para que `GET /clientes/perfil` (ya existente, sin endpoint nuevo) alcance para resolver C14. **No implica CRUD de direcciones** — sigue sin existir ningún endpoint de edición/alta de direcciones de Cliente; el gap que bloquea C41 permanece exactamente igual que en el Tramo 2.

**Implementado:** `DireccionRepository.findByClienteId` (nuevo finder, mismo patrón que el `findByComercioId` ya existente); `ClienteResponseDTO` suma el campo `direccion`; `ClienteService.aResponseDTO` arma el `DireccionResponseDTO` anidado con el mismo mapeo manual ya usado en `PedidoService`/`ComercioService`. `./mvnw compile` → `BUILD SUCCESS`.

**Probado contra la base real:** `GET /clientes/perfil` del cliente de prueba (`cliente.demo@bajonea.test`) devuelve `direccion` completa (`id`, `calle`, `numero`, `pisoDepto`, `codigoPostal`, `localidadId`, `nombreLocalidad`, `nombreProvincia`, `principal`) — usada de punta a punta en 3 pedidos reales de este tramo (ver sección de pruebas end-to-end).

---

## Bugs reales encontrados y corregidos probando contra el backend real (no solo compilación)

### 1. Modal de conflicto de comercio (C12) no se mostraba — `sheet` nunca se adjuntaba a `backdrop`

Al probar el disparo real de C12 (agregar un producto de "Pizzas del Sur" con el carrito de "Sabores Fueguinos" activo), el `POST /carrito/items` devolvía `409` correctamente y `mostrarModalConflictoComercio` armaba todo el contenido del modal (tarjetas de comparación, botones), pero **la pantalla no mostraba nada** — un overlay oscuro vacío. Inspeccionado con `document.querySelector('.modal-backdrop').outerHTML` en el navegador real: `<div class="modal-backdrop"></div>`, sin hijos. Causa: `frontend/js/catalogo.js` construía `sheet` con todo su contenido pero nunca ejecutaba `backdrop.appendChild(sheet)`. Corregido agregando esa línea antes de los `addEventListener`. Confirmado el fix reproduciendo el mismo escenario real (2 comercios de prueba): el modal ahora muestra el texto completo ("Tu carrito tiene productos de otro comercio", tarjetas "Comercio actual"/"Nuevo pedido" con conteo real de productos) y el botón "Vaciar carrito y agregar" reemplaza el carrito de verdad (`DELETE /carrito` → `POST /carrito/items`, confirmado por `GET /carrito` posterior).

### 2. `ProductoService.limpiarCarritosActivos` (Fase 8.4, ya cerrada) no reseteaba `Carrito.comercio` al vaciar el carrito por producto agotado/descontinuado

Probando el caso "producto agotado entre agregar al carrito y hacer checkout" (pedido explícito de esta sesión: "confirmalo, no lo asumas"), se encontró que `ProductoService.cambiarEstado` a `AGOTADO`/`DESCONTINUADO` **sí** elimina el `ItemCarrito` de cualquier carrito que lo tuviera (comportamiento ya documentado en el cierre de la Fase 8.4) — pero **no** reseteaba `Carrito.comercio` a `null` cuando el carrito quedaba sin ítems, a diferencia de `CarritoService.eliminarItem`/`vaciarCarrito`, que sí lo hacen. Consecuencia real: un carrito visualmente vacío (`carrito.html` mostraba C09 correctamente) quedaba con `comercio_id` apuntando al comercio del producto purgado — el siguiente intento de agregar un producto de **cualquier otro comercio** devolvía `409` "El carrito ya tiene productos de otro comercio", un falso conflicto sin ningún producto real en el carrito. Confirmado por `SELECT` directo: `carrito.comercio_id = 38`, `0` filas en `item_carrito` para ese carrito.

**Corrección:** `ProductoService.limpiarCarritosActivos` ahora, después de borrar los `ItemCarrito`, revisa cada `Carrito` afectado y si quedó sin ítems le resetea `comercio = null` (mismo patrón ya usado en `CarritoService.eliminarItem`). Se agregó `CarritoRepository` como dependencia nueva de `ProductoService`. `./mvnw compile` → `BUILD SUCCESS`.

**Verificado con el escenario real reproducido dos veces:** (1) antes del fix, marcar `AGOTADO` un producto en el carrito dejaba `comercio_id` pegado (confirmado por `SELECT`); (2) después del fix, el mismo escenario deja `comercio_id = NULL` (confirmado por `SELECT`), y agregar un producto de un comercio distinto inmediatamente después devuelve `201`, no `409`.

### 3. Chequeo especulativo de "producto agotado" en el resumen de checkout (C16) — agregado y luego retirado por ser código muerto

Al construir C16 se agregó, por precaución, una verificación adicional del lado del cliente (re-consultar el catálogo público antes de confirmar el pedido) para avisar si algún ítem del carrito ya no estaba `DISPONIBLE`. Al investigar el bug #2 de arriba se confirmó que este escenario **no puede ocurrir en la práctica**: `ProductoService.cambiarEstado` purga proactivamente cualquier `ItemCarrito` del producto afectado (con notificación in-app al Cliente) en el mismo momento en que el comercio marca `AGOTADO`/`DESCONTINUADO` — un carrito nunca puede llegar a checkout con un producto ya no disponible. Se retiró la verificación del lado del cliente por no tener ningún caso real que cubrir (`CLAUDE.md` §regla de no validar escenarios que no pueden pasar), dejando `PedidoService.confirmarPedido` tal cual está (sin re-chequeo de `estado` de producto al confirmar) — no es un gap real dado que el carrito ya está protegido antes de llegar ahí.

---

## Confirmado, no asumido: comportamiento real de `CarritoService` y `PedidoService`

- **Producto duplicado en el carrito → suma cantidades (clamp en 20), no `409`.** Confirmado leyendo `CarritoService.agregarItem` antes de programar el frontend (ya documentado en `docs/DECISIONES.md` de una sesión anterior) — el frontend de este tramo no necesita manejar un caso de "producto ya en el carrito" como error.
- **`PedidoService.confirmarPedido` no re-valida el estado del producto al confirmar** — confirmado leyendo el código, no asumido. No es un gap real en la práctica por el bug #2/#3 de arriba (el carrito nunca llega con productos no disponibles).
- **Checkout con carrito vacío → `409` "El carrito está vacío"** (probado con `curl` real). El frontend nunca deja que el usuario llegue a este estado (`checkout.html` redirige a `carrito.html` si `GET /carrito` devuelve `items: []`), pero el backend lo cubre igual como defensa en profundidad.
- **`DOMICILIO` sin `direccionId` → `409` "La dirección es obligatoria para entrega a domicilio"** (probado con `curl` real, forzando el caso que la UI nunca genera porque siempre manda la `direccionId` real del cliente).
- **`RETIRO` en un comercio con `aceptaRetiro=false` → `409` "El comercio no permite retiro en el local"** (probado con `curl` real contra "Pizzas del Sur", que solo acepta delivery — la UI ya filtra esta opción del selector de modalidad, pero el backend la bloquea igual).

---

## Probado end-to-end contra el backend real (no simulado)

Con el backend Spring Boot real (perfil `test`, credenciales reales de Cloudinary) y el frontend servido por `python -m http.server`, usando los datos de prueba persistentes cargados al inicio de esta sesión (Cliente `cliente.demo@bajonea.test`, comercios "Sabores Fueguinos" y "Pizzas del Sur" con productos e imágenes reales de Cloudinary):

- Catálogo → `comercio-detalle.html` → modal de producto (C06) con stepper real, nota opcional, botón con precio dinámico → `POST /carrito/items` → `201`, 2 productos agregados del mismo comercio.
- `carrito.html` (C10): ambos ítems reales, cantidades, nota mostrada ("Nota: \"Sin sal\""), subtotales, footer con subtotal total y link a `checkout.html`.
- Conflicto de comercio (C12) disparado real (no simulado) intentando agregar un producto de "Pizzas del Sur" con el carrito de "Sabores Fueguinos" activo → `409` real → modal con conteo real de productos por comercio → "Vaciar carrito y agregar" → `DELETE /carrito` + `POST /carrito/items` reales → carrito reemplazado, confirmado por `GET /carrito` posterior.
- C10b: "Cancelar" no vacía nada (confirmado con `GET` posterior); "Sí, vaciar carrito" → `DELETE /carrito` real → `200` → carrito vuelve a C09 (vacío real).
- Checkout delivery completo: C13 (ambas modalidades visibles para "Sabores Fueguinos") → C14 con la dirección real del cliente (`Islas Malvinas 1450, Río Grande`) → C16 con desglose real → `POST /pedidos/cliente` → `201`, pedido `#13` verificado por `SELECT` (`estado=PENDIENTE`, `tipo_entrega=DOMICILIO`, `direccion_id` correcto, `detalle_pedido` correcto) y carrito vaciado automáticamente (`item_carrito` en `0` filas).
- Checkout pickup completo: mismo flujo con C15 (retiro) → `POST /pedidos/cliente` → `201`, pedido `#14` verificado (`tipo_entrega=RETIRO`, `direccion_id=NULL`).
- Checkout con comercio de una sola modalidad ("Pizzas del Sur", solo delivery): C13 muestra un único tile, auto-seleccionado, sin bloquear el flujo → pedido `#15` verificado (`tipo_entrega=DOMICILIO`).
- `checkout.html` con carrito vacío → redirige real a `carrito.html` (confirmado navegando directo a la URL).
- Casos de error de backend confirmados con `curl` real (carrito vacío, `DOMICILIO` sin dirección, `RETIRO` no soportado) — ver sección de arriba.
- Consola del navegador revisada en cada paso (`read_console_messages`) — sin errores en ningún punto del recorrido, incluidos los 2 bugs reales encontrados y corregidos antes de este resumen final.
- Regla de "cero comentarios en frontend/" verificada con `grep` sobre los 4 archivos nuevos/modificados antes de cerrar el tramo.

Pedidos `#13`, `#14`, `#15` y sus notificaciones/detalles quedan en la base — a diferencia de los datos de prueba descartables de otras fases, estos pertenecen a la cuenta de demo persistente (`cliente.demo@bajonea.test`, comercios de prueba) que el dueño del proyecto pidió mantener para navegación manual; no se eliminan al cierre de este tramo.

## Checklist de cierre del Tramo 3

- [x] Confirmado antes de programar: `CarritoService.agregarItem` suma cantidades (no `409`) ante producto duplicado.
- [x] Confirmado antes de programar: qué endpoints reales existen para carrito/checkout, sin inventar ninguno.
- [x] Gap real detectado (`ClienteResponseDTO` sin `direccion`) resuelto como ampliación formal, confirmada explícitamente antes de tocar código — no asumida.
- [x] C12 disparado con una condición real (2 comercios de prueba, `409` real), no simulado.
- [x] 8 pantallas del tramo construidas, ninguna con datos mockeados.
- [x] Regla de "cero comentarios en frontend/" verificada con `grep`.
- [x] Recorrido manual completo contra el backend real (delivery + pickup + comercio de una sola modalidad), con 2 bugs reales de backend encontrados y corregidos, más 1 chequeo especulativo del frontend retirado por ser código muerto.
- [x] Casos de error reales confirmados con `curl` (no asumidos): carrito vacío, dirección faltante, modalidad no soportada.

Con esto, el Tramo 3 de 9 de la Fase 16 queda cerrado. Siguen los tramos 4 a 9 (panel de Comercio, panel de Administrador, notificaciones, etc.) en sesiones futuras.
