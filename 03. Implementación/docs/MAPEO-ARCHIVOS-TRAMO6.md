# Mapeo pantallas ↔ archivos — Fase 16, Tramo 6

Relación exacta entre las 5 pantallas lógicas del catálogo de Fase 15 correspondientes a este tramo (Comercio: CRUD de productos) y los archivos generados en `frontend/`. Mismo formato que `docs/MAPEO-ARCHIVOS-TRAMO1.md`/`TRAMO2.md`/`TRAMO3.md`/`TRAMO4.md`/`TRAMO5.md`.

---

## CO — Comercio (5 pantallas → 2 archivos `.html` nuevos + 1 `.js` nuevo (`cloudinary.js`) + 1 `.js` modificado (`comercio.js`))

| Pantalla(s) | Archivo | Relación |
|---|---|---|
| CO13 (Lista de Productos, con productos) | `frontend/comercio-productos.html` (+ `js/comercio.js`, función `initComercioProductos`) | Buscador client-side, 4 chips de filtro por estado (Todos/Disponibles/Agotados/Descontinuados — la guía de Figma solo mostraba Todos/Categorías/Agotados; se usaron los 3 estados reales de `EstadoProducto` en vez de categorías, porque el filtro por categoría ya lo cubre el buscador de texto y no había una referencia real de Figma para copiar el diseño exacto), lista de `product-row` (reutilizado de `comercio-detalle.html`, con `status-badge` nuevo junto al nombre para AGOTADO/DESCONTINUADO), FAB "+" para crear. Ya estaba enrutada desde el Tramo 5 (`renderBottomNavComercio` apuntaba a este nombre de archivo desde antes de que existiera). |
| CO14 (Crear Producto), CO15 (Editar Producto) | `frontend/comercio-producto-form.html` (+ `js/comercio.js`, función `initComercioProductoForm`) | 2 pantallas, 1 archivo — mismo criterio ya usado en C37/C38 (Cliente, Tramo 2) y CO28/CO29 (Comercio, Tramo 5): un único formulario que alterna entre alta y edición según la presencia de `?id=` en la URL, en vez de duplicar campos idénticos (fotos, nombre, descripción, precio, categoría, tags) en 2 archivos. En modo edición suma el link "Descontinuar producto" (reutiliza el modal de confirmación de CO17) y permite gestionar la galería; en modo alta, la galería queda deshabilitada con un aviso ("Podés agregar fotos después de crear el producto") — ver nota de Cloudinary más abajo. |
| CO16 (Modal: Acción sobre Producto — Bottom Sheet Kebab) | Sin archivo propio — función `mostrarModalAccionProducto` en `js/comercio.js`, invocada desde el botón kebab de cada fila de CO13 | Reutiliza `.product-modal-sheet` (el bottom sheet ya usado para el detalle de producto del Cliente, Tramo 2) + `.profile-link-list`/`.profile-link` (ya usado en CO28, Tramo 5) en vez de crear un componente nuevo. Acciones mostradas: Editar, Marcar como agotado/disponible (según el estado actual — solo una de las dos, nunca ambas), Descontinuar — sin "Eliminar producto", porque `ProductoController` no expone ningún `DELETE` sobre el recurso (confirmado antes de programar, ver sección de endpoints). Si el producto ya está `DESCONTINUADO`, el sheet muestra un aviso de solo lectura sin ninguna acción (transición terminal, `ProductoService.TRANSICIONES_VALIDAS` no permite salir de ese estado). |
| CO17 (Modal: Confirmar Descontinuar Producto) | Sin archivo propio — función `mostrarModalConfirmarDescontinuar` en `js/comercio.js` | Reutiliza `.modal-backdrop`/`.modal-sheet` (mismo componente que el modal de "¿Cerrar sesión?" de CO28) con una variante nueva de color (`.modal-sheet__icon--danger`, agregada a `styles.css`). Se invoca tanto desde CO16 (kebab de CO13) como desde el link "Descontinuar producto" del propio formulario de edición (CO15) — mismo modal, dos puntos de entrada. |

**Nuevo:** `frontend/js/cloudinary.js` — firma vía backend (`POST /productos/{id}/cloudinary/firma`) + subida directa a Cloudinary + persistencia de la imagen (`POST /productos/{id}/imagenes`), unificado en una sola función `subirImagenProducto`. También expone `validarArchivoImagen` (formato/tamaño en cliente, redundante a propósito con el Upload Preset de Cloudinary — ver Fase 11 — para dar feedback antes de gastar una llamada de red), `eliminarImagenProducto` y `marcarImagenPrincipal`.

**Modificado (no nuevo):** `frontend/js/comercio.js` — suma `initComercioProductos`, `initComercioProductoForm`, `mostrarModalAccionProducto`, `mostrarModalConfirmarDescontinuar`, `renderProductoRow`, y 6 íconos nuevos al objeto `ICONS` (`kebab`, `ban`, `check`, `xCircle`, `camera`, `alert`, `close`).

**Modificado:** `frontend/css/styles.css` — suma `.fab` (botón flotante de "+"), `.product-row__kebab`, `.product-row__thumb--descontinuado` (variante de `.product-row__thumb--agotado`, ya existente desde el Tramo 2), `.modal-sheet__icon--danger`, y el componente nuevo `.photo-gallery`/`.photo-gallery__item`/`.photo-gallery__add` (galería horizontal de hasta 5 fotos con badge "Principal" y botón de eliminar — no se reutilizó `.avatar-upload`, que es circular y de una sola imagen, pensado para la foto de perfil del comercio).

---

## Resumen numérico

| | Cantidad |
|---|---|
| Pantallas lógicas del tramo | 5 (CO13, CO14, CO15, CO16, CO17) |
| Construidas | 5 |
| Archivos `.html` nuevos | 2 (`comercio-productos.html`, `comercio-producto-form.html`) |
| Archivos `.js` nuevos | 1 (`js/cloudinary.js`) |
| Archivos `.js` modificados | 1 (`js/comercio.js`) |
| Archivos `.css` modificados | 1 (`css/styles.css`) |

---

## Backend — cambio de este tramo (no endpoint nuevo, ampliación de acceso a uno existente)

**Gap real encontrado antes de programar:** `GET /api/v1/categorias` y `GET /api/v1/tags` estaban restringidos por completo a `hasRole("ADMINISTRADOR")` en `SecurityConfig` (las 2 rutas enteras, no solo las mutaciones) — un Comercio no tenía ninguna forma de obtener la lista de categorías para el selector de CO14/CO15, y `ProductoRequestDTO.categoriaId` es `@NotNull`. Confirmado que no existía ningún atajo real: `catalogo.js` (Tramo 2) deriva categorías/tags deduplicando de los productos ya cargados, precisamente porque nunca tuvo acceso a estas rutas — patrón que no sirve para el alta del primer producto de un comercio (lista de productos vacía).

**Decisión (confirmada con el dueño del proyecto):** `SecurityConfig` separa los matchers — `GET /categorias/**` y `GET /tags/**` quedan `authenticated()` (cualquier rol con JWT válido), `POST`/`PUT`/`DELETE`/`/reactivar` siguen exclusivos de `ADMINISTRADOR`. Mismo criterio de lectura abierta / mutación restringida ya usado en el resto del proyecto. No es catálogo público sin JWT — eso quedaría como una ampliación de alcance distinta si se pide a futuro. Ver `docs/DECISIONES.md` para el detalle completo de la decisión y la verificación.

## Endpoints reales usados (confirmados antes de programar, ninguno inventado)

- `GET /api/v1/productos` — listado propio del comercio (CO13), y también reutilizado en CO15 para resolver el producto a editar por `id` (no existe `GET /productos/{id}`, mismo patrón ya usado en `pedido-detalle.html`/`js/pedidos.js` para pedidos).
- `POST /api/v1/productos` — alta (CO14).
- `PUT /api/v1/productos/{id}` — edición (CO15); `409` real si el producto está `DESCONTINUADO`.
- `PATCH /api/v1/productos/{id}/estado` — cambio de estado (CO16, y el link de CO15); transiciones válidas `DISPONIBLE↔AGOTADO`, `DISPONIBLE→DESCONTINUADO`, `AGOTADO→DESCONTINUADO`, ninguna transición fuera de `DESCONTINUADO`.
- `POST /api/v1/productos/{id}/cloudinary/firma` — firma de subida (`js/cloudinary.js`); `409` real al pedir una 6ª firma.
- `POST /api/v1/productos/{id}/imagenes` — persistir la imagen tras subirla a Cloudinary.
- `DELETE /api/v1/productos/{id}/imagenes/{imagenId}` — eliminar una imagen de la galería (CO15).
- `PATCH /api/v1/productos/{id}/imagenes/{imagenId}/principal` — marcar como principal. **Probado directo contra el backend (200 real), pero sin gesto de UI en CO14/CO15 en este tramo** — no estaba en la lista de casos a probar de la consigna, y el backend ya fuerza automáticamente que la primera imagen subida sea principal (`ProductoService.agregarImagen`), que cubre el caso de uso principal. Queda diferido a una fase futura si se pide un gesto explícito (ej. tocar una foto para marcarla principal).
- `GET /api/v1/categorias`, `GET /api/v1/tags` — poblar el selector de categoría y los chips de tags en CO14/CO15 (ampliación de acceso, ver arriba). Filtrados en el cliente a `activo: true` — `listar()` devuelve también las dadas de baja lógica, que no deben quedar seleccionables en un alta/edición nueva.

**Confirmado, no agregado:** `ProductoController` no tiene ningún endpoint de baja/eliminación de producto — el catálogo de acciones de CO16 se armó estrictamente contra los endpoints reales, sin ofrecer "Eliminar producto".

---

## Probado end-to-end contra el backend real (no simulado)

Con el backend Spring Boot real (perfil `test`) y el frontend servido por `python -m http.server` (`.claude/launch.json`, config `frontend`).

1. **Alta completa con imagen real subida a Cloudinary:** producto "Papas Fritas Cheddar" creado desde CO14 (sin fotos, según el flujo — ver nota de Cloudinary abajo) → apareció en CO13 → editado desde CO15, subida de una imagen real (PNG generado por `canvas.toBlob` en el propio navegador, no un archivo simulado) → firma real, subida real a `https://api.cloudinary.com/v1_1/dhzqelo1n/image/upload`, `POST /imagenes` → `201`. Verificado que el asset existe de verdad: `GET` directo contra la `secure_url` persistida devolvió `200 image/jpeg`, no solo que el backend aceptó el POST.
2. **Las 5 imágenes permitidas, y una 6ª real que dio `409`:** subidas 4 imágenes más (5 en total) sin error; un 6º intento de firma (`POST /cloudinary/firma`) devolvió `409 "El producto ya tiene el máximo de 5 imágenes"` — probado tanto disparando el flujo real de UI (el botón "Agregar" desaparece al llegar a 5, comportamiento esperado) como forzando el `input[type=file]` directamente para confirmar que el backend también lo bloquea sin depender de que el frontend oculte el botón.
3. **`marcarImagenPrincipal` probado directo contra el backend** (sin gesto de UI, ver nota de endpoints): `200`, la imagen marcada pasó a `esPrincipal: true` y la anterior a `false` — confirmado con un `GET /productos` posterior.
4. **Edición persistida, confirmada con recarga completa + `GET` posterior, no solo la respuesta del `PUT`:** nombre, descripción, precio y un tag cambiados desde CO15 → `PUT` → redirección a CO13 → recarga completa de `comercio-productos.html` (`navigate`, no solo re-render en memoria) → los cambios siguen ahí.
5. **Marcar como agotado / disponible, reflejado en CO13 con el indicador correcto:** "Empanada de Carne" marcada `AGOTADO` desde el kebab de CO13 → badge "Agotado" + overlay en el thumbnail, sin recargar la página (actualización local del estado tras la respuesta del `PATCH`) → confirmado también con un `GET /productos` posterior que el cambio persistió en la base real.
6. **Descontinuar, con el modal de confirmación real (CO16 → CO17):** "Papas Fritas Cheddar y Panceta" descontinuada desde el kebab → CO17 con el nombre real interpolado de forma segura (`textContent`, no `innerHTML`, para no exponer el nombre del producto a un vector de inyección) → confirmado → badge "Descontinuado" en CO13. Verificado que el kebab de un producto `DESCONTINUADO` ya no ofrece ninguna acción (solo el aviso + "Cancelar"), y que `comercio-producto-form.html?id=34` sobre ese mismo producto muestra el aviso "Este producto está descontinuado y no se puede editar" sin renderizar el formulario — mismo `409` que protege `ProductoService.editarProducto` del lado del backend.
7. **Caso de error de validación de cliente:** intento de enviar CO14 sin ningún campo completo → el navegador bloqueó el submit en el campo "Nombre del producto" (`required` nativo) → confirmado por `read_network_requests` que ningún `POST /productos` se disparó.
8. **Aislamiento por tenant — `404`, no `403`, mismo criterio ya establecido en tramos anteriores:** logueado como `comercio2.demo@bajonea.test`, se intentó `PUT`/`PATCH estado`/`POST cloudinary/firma` directo contra el producto `id=34` (de `comercio1.demo`) → los 3 devolvieron `404` — confirmado por lectura de código que `ProductoService.obtenerProductoDelComercio` lanza la excepción **antes** de cualquier mutación, así que no hizo falta re-verificar que el producto siguiera intacto.
9. Consola del navegador revisada en cada paso (`read_console_messages`) — sin errores en ningún punto del recorrido.
10. Regla de "cero comentarios en `frontend/`" verificada con `grep` sobre los 2 archivos `.html` nuevos, `js/comercio.js` y `js/cloudinary.js`.

**Nota sobre el flujo de alta sin fotos (CO14):** `ProductoRequestDTO` no tiene campo de imágenes (confirmado en su propio Javadoc desde la Fase 8/5 — "la galería se gestiona aparte, vía firma de Cloudinary") y los 3 endpoints de galería requieren un `productoId` ya existente (`CloudinaryService.generarFirmaImagenProducto` arma la carpeta como `productos/{comercioId}/{productoId}/`). Por eso CO14 no permite adjuntar fotos antes de guardar — es una restricción estructural del backend desde Fase 11, no una limitación nueva de este tramo. El flujo real queda: crear producto (sin fotos) → editar para agregar fotos, tal como se probó en el punto 1.

**Datos que quedan en la base al cierre de esta sesión** (mismo criterio que tramos anteriores — cuenta demo persistente, útil para sesiones futuras):
- Producto `id=28` ("Empanada de Carne", `comercio1.demo`) → `AGOTADO`.
- Producto `id=34` ("Papas Fritas Cheddar y Panceta", `comercio1.demo`) → `DESCONTINUADO`, con 5 imágenes reales subidas a la cuenta de Cloudinary de prueba durante esta sesión.
- El resto de los productos demo (`Empanada de Pollo`, `Milanesa Napolitana`, y los de `comercio2.demo`) quedan sin cambios.

## Cobertura de Figma en este tramo — ver la entrada de `docs/DECISIONES.md` de esta fecha

Incluye: el incidente de edición accidental sobre el archivo de Figma (investigado y descartado), las 2 reglas nuevas agregadas a `CLAUDE.md` §4, y el método real que terminó funcionando para capturar las 5 pantallas (`Exportar` → `Vista previa` en el panel derecho, tras una recarga completa de la pestaña).

## Checklist de cierre del Tramo 6

- [x] Endpoints reales inventariados antes de programar — el gap de `/categorias`/`/tags` encontrado y resuelto con el dueño del proyecto antes de escribir el frontend, no descubierto a mitad de la implementación.
- [x] `js/cloudinary.js`: flujo de firma confirmado (backend firma, frontend sube directo a Cloudinary), límite de 5 imágenes probado real (firma y bypass directo), nunca loguea la firma ni credenciales de Cloudinary en consola.
- [x] CO13 con los 3 estados reales de producto y su indicador visual, datos reales del comercio de prueba.
- [x] CO16/CO17 con exactamente las acciones que el backend soporta (sin "Eliminar", que no existe).
- [x] Las 5 pantallas generadas reutilizando componentes existentes de `styles.css`/`js/api.js`/`js/comercio.js`, sin un archivo por pantalla.
- [x] Seguridad: sin JWT ni datos sensibles logueados, `textContent` para contenido interpolado de usuario (nombre de producto en modales).
- [x] Recorrido manual completo (login → lista → crear con imagen → editar → agotar → descontinuar → reflejo en la lista) sin errores de consola ni de red.
- [x] Regla de "cero comentarios en `frontend/`" verificada con `grep`.
- [x] Datos que quedan en la base documentados explícitamente.

Con esto, el Tramo 6 de 9 de la Fase 16 queda cerrado. Siguen los tramos 7 a 9 (gestión de Pedidos del Comercio, panel de Administrador, etc.) en sesiones futuras.
