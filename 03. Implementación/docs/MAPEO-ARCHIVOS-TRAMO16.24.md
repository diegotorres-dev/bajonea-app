# Mapeo pantallas ↔ archivos — Tramo 16.24 (8 ajustes de pulido UI/UX, Cliente y Comercio)

Ronda de 8 ajustes independientes entre sí, sobre pantallas ya construidas de Cliente y Comercio (sin pantallas nuevas). Todo lo documentado acá fue verificado con interacción real en navegador contra el backend real (perfil `test`, MySQL real, cuentas demo reales) — ver `docs/DECISIONES.md`, entrada "Tramo 16.24" del 2026-07-30, para el detalle completo de decisiones y evidencia.

---

## Punto 1 — Reversión parcial de la galería de fotos de producto (`comercio-detalle.html`, Cliente)

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | `abrirVisorZoom` y el botón de lupa (`.product-gallery__zoom`) eliminados de `abrirModalProducto`. Tira de miniaturas (`.product-gallery__thumbs`/`.product-gallery__thumb`) sin cambios. |
| `frontend/css/styles.css` | `.product-gallery__main` vuelve a `object-fit:cover`, ancho/alto completo (`height:200px`, sin `flex`/aire), mismo criterio que `.product-modal-sheet__gallery`. `.product-gallery__zoom` y `.image-zoom-backdrop`/`__img`/`__close` eliminadas. |

Reversión parcial de una decisión del Tramo 16.23 (punto 5) — motivo estético (foto angosta con aire, lupa invasiva), no funcional. La tira de miniaturas clickeables se mantiene tal cual.

## Punto 2 — Capitalización estandarizada en Perfil (Cliente y Comercio)

| Archivo | Cambio |
|---|---|
| `frontend/perfil.html` | "Editar Datos Personales" → "Editar datos personales" (label del botón + título del header). |
| `frontend/comercio-perfil.html` | "Editar Datos del Comercio" → "Editar datos del comercio" (label + título), "Ver Datos Legales" → "Ver datos legales", "Datos Legales" → "Datos legales" (título del header). |

## Punto 3 — Espaciado parejo en tarjetas de comercio (`index.html`)

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.comercio-card__body { gap: 6px }` → `gap: 10px` — ya era un valor único uniforme entre los 3 bloques (título, tipo+horario, modalidades), subido para dar más aire general. |

## Punto 4 — Encabezado con foto de perfil del comercio en `carrito.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/carrito.js` | `renderConProductos` recibe un nuevo parámetro `comercioInfo`. El `<h1>` con `nombreComercio` se reemplaza por `.cart-comercio-header` (avatar vía `pintarAvatarComercio`, importada de `catalogo.js`, + texto "Vas a hacer un pedido a **{nombre}**"), con "Vaciar" a la derecha de la misma fila. `initCarrito`/`pintar` ahora async: resuelven `comercioInfo` contra `GET /catalogo/comercios` (cacheado, una sola vez por sesión de carrito). |
| `frontend/css/styles.css` | Nuevas: `.cart-comercio-header`, `.cart-comercio-header__info`, `.cart-comercio-header__avatar` (+ `img`, `.avatar-inicial`), `.cart-comercio-header__text`. |

## Punto 5 — `pedidos.html` (Cliente): foto de comercio + puntitos de estado

| Archivo | Cambio |
|---|---|
| `frontend/js/pedidos.js` | `comercioPorId` pasa de mapear solo `nombre` a mapear el objeto `comercio` completo. `renderPedidoCard` agrega avatar (`pintarAvatarComercio`, 32px) a la izquierda del nombre. `renderBadge` → `renderEstadoDot`: construye `.pedido-estado` (texto negro + `.pedido-estado__dot`) en vez de `.status-badge`. `ESTADO_INFO` suma `dotClass` en vez de `badgeClass`. |
| `frontend/css/styles.css` | Nuevas: `.pedido-card__comercio-row`, `.pedido-card__avatar` (+ `img`, `.avatar-inicial`), `.pedido-estado`, `.pedido-estado__dot` (+ `--positivo`/`--rechazado`/`--pendiente`). |

Mapeo de color confirmado contra el enum real `EstadoPedido` (3 valores, sin ambigüedad): `EN_PREPARACION` verde, `RECHAZADO` rojo, `PENDIENTE` naranja (`var(--color-primary)`).

## Punto 6 — `index.html` (Cliente): comercios abiertos primero

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | `pintarLista()`: `visibles` se ordena con `.sort()` (estable, sin criterio secundario) usando `estadoHorario(comercio.horarios).abierto` como único criterio, aplicado después del filtro por chip — cubre "Todos" y cualquier filtro activo por igual. |

## Punto 7 — `pedido-detalle.html` (Cliente): mensaje de estado con nombre real del comercio

| Archivo | Cambio |
|---|---|
| `frontend/js/pedidos.js` | `ESTADO_INFO[].texto` pasa de string fijo a función `(nombreComercio) => string`. `initPedidoDetalle` la invoca con `comercio ? comercio.nombre : 'El comercio'` (mismo fallback ya usado en el resto de la pantalla). |

## Punto 8 — Puntitos de estado en `comercio-pedidos.html` y "Pedidos activos" de `comercio-dashboard.html`

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | `ESTADO_BADGE_COMERCIO` suma `dotClass` (reusa `.pedido-estado__dot--*` del punto 5) en vez de `className`. `renderPedidoActivoCard` construye `.pedido-estado` en vez de `.status-badge` — un solo cambio cubre ambas pantallas porque comparten el mismo renderer. |
| `frontend/css/styles.css` | `.status-badge--preparacion` eliminada (huérfana tras el cambio, confirmado por `grep` sin uso restante en `frontend/js/`). |

---

## Gap de datos encontrado, sin acción tomada

Comercio id 39 ("Pizzas del Sur", `comercio2.demo`) pasó de `APROBADO` a `RECHAZADO` durante el Tramo 16.23. `GET /catalogo/comercios` (usado por `pedidos.js` desde el Tramo 4 para resolver nombre/foto del comercio de cada pedido) solo devuelve comercios `APROBADO` — los pedidos `#15`/`#21`/`#22` de `cliente.demo` (contra ese comercio) no resuelven nombre ni foto, caen al fallback `Pedido #N` ya existente desde el Tramo 4. No es una regresión de este tramo (el gap de `nombreComercio` ya existía), pero ahora también afecta el avatar nuevo. Requiere una decisión de backend fuera del alcance de un tramo de pulido visual — queda para que Diego decida.

---

## Verificado en esta sesión (cierre formal)

- `node --check` sobre los 4 archivos JS modificados (`catalogo.js`, `carrito.js`, `pedidos.js`, `comercio.js`) — sin errores de sintaxis.
- Conteo de llaves de `styles.css` balanceado tras todos los cambios (incluida la eliminación de `.status-badge--preparacion`).
- Cero comentarios confirmado por `grep` en todos los archivos tocados.
- Producto real con 3 fotos (id 50, comercio 48 "Patio Balto"): `object-fit:cover` confirmado, ancho completo (460px), sin lupa, miniaturas funcionando (comparado por `src`). Producto real con 1 sola foto ("Empanada de Pollo", comercio 38): sin cambios, `.product-modal-sheet__gallery` intacta.
- Carrito real de `cliente.demo` (Pizzas del Sur, ítem real): header con avatar-inicial "P" + texto en negrita, un solo `<h1>` en la página.
- `pedidos.html` real de `cliente.demo`: avatares + puntitos confirmados por `getComputedStyle` en los 3 colores (`rgb(255,71,0)` pendiente, `rgb(30,142,62)` en preparación, `rgb(217,48,37)` rechazado).
- `pedido-detalle.html` real: los 3 estados (#20 en preparación, #19 rechazado, #16 pendiente) con nombre real de "Sabores Fueguinos"; #22 (gap de datos) con el fallback "El comercio" sin romper la pantalla.
- `comercio-dashboard.html`/`comercio-pedidos.html` reales de `comercio1.demo`: mismos 3 colores confirmados, sin badges viejos remanentes en el DOM.
- Sin errores de consola en ninguna pantalla recorrida en todo el tramo.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 8 |
| Archivos backend tocados | 0 |
| Archivos frontend modificados | 7 (`perfil.html`, `comercio-perfil.html`, `js/catalogo.js`, `js/carrito.js`, `js/pedidos.js`, `js/comercio.js`, `css/styles.css`) |
| Gaps de datos encontrados, sin acción tomada | 1 (comercio rechazado no resoluble desde el historial de pedidos del cliente, punto 5) |

**Pendiente de confirmación del usuario:** este tramo no se cierra hasta que Diego confirme el checklist punto por punto — ver el mensaje de cierre de la sesión para el detalle completo.
