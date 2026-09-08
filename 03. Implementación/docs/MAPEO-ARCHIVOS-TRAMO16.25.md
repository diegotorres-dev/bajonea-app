# Mapeo pantallas ↔ archivos — Tramo 16.25 (7 ajustes de pulido UI/UX, continuación del Tramo 16.24)

Ronda de 7 ajustes independientes entre sí, sobre pantallas ya construidas de Cliente y Comercio (sin pantallas nuevas). Todo lo documentado acá fue verificado con interacción real en navegador contra el backend real (perfil default, MySQL real, cuentas demo reales) — ver `docs/DECISIONES.md`, entrada "Tramo 16.25" del 2026-07-30, para el detalle completo de decisiones y evidencia.

**Nota de entorno:** el panel del navegador no compositó frames en ninguna sesión de este tramo (`screenshot`/`zoom` fallan con "Browser pane is not displayed" de forma sistemática). Toda la verificación es vía DOM real (`getComputedStyle`/`getBoundingClientRect`/`scrollWidth`), no capturas de pantalla.

---

## Punto 1 — Causa real del espaciado desparejo en tarjetas de comercio (`index.html`)

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `.comercio-card__top h3` suma `min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis` — trunca a 1 línea en vez de envolver a 2. |

**Retoma el Tramo 16.24** (que había subido el `gap` de `.comercio-card__body` de 6px a 10px sin resolver el problema real). Causa real: 4 de los 11 comercios de la base tienen nombres largos que envolvían el `<h3>` a 2 líneas, inflando la altura de esa fila (41.6px vs 23px normal) y generando la sensación óptica de "más aire" — el `gap` entre los 3 bloques ya era uniforme (10px) antes y después de este fix. Ver `docs/DECISIONES.md` para el detalle completo de la investigación.

## Puntos 2 y 5 — Badge Abierto/Cerrado → texto + puntito (`index.html` y `comercio-detalle.html`)

| Archivo | Cambio |
|---|---|
| `frontend/js/catalogo.js` | `pintarEstadoComercio(el, abierto)` nueva (exportada) — arma dot + texto en vez de `textContent` plano. Usada en `renderComercioCard` (índice) e `initComercioDetalle` (header de detalle) — mismo `<span class="comercio-estado-badge">` compartido entre ambas pantallas desde antes de este tramo. |
| `frontend/css/styles.css` | `.comercio-estado-badge` pierde `background`/`padding`/`border-radius` (ya no es pill sólida). Nueva `.comercio-estado-badge__dot`. `--open`: texto negro + dot verde. `--closed`: texto y dot gris (`var(--color-text-muted)`). |

Badges de modalidad (`.pill`, Delivery/Retiro) sin cambios — confirmado explícitamente fuera de alcance.

## Punto 3 — `carrito.html`: foto de producto + botón "Vaciar" rediseñado

| Archivo | Cambio |
|---|---|
| `frontend/js/carrito.js` | `renderItem` recibe `producto` (imagenes) y antepone `.cart-item__thumb` al bloque de nombre+precio. `initCarrito`/`pintar` cachean `GET /catalogo/comercios/{id}/productos` (con `try/catch` — ver bug real abajo) en un `Map` `productoId → producto`. Botón "Vaciar": `textContent` → ícono (`ICONS.trash`) + `<span>Vaciar</span>`, layout vertical. |
| `frontend/css/styles.css` | Nuevas: `.cart-item__thumb` (56×56, `cover`), `.cart-item__info` (flex:1, antes implícito). `.cart-vaciar-btn` rediseñada: `flex-direction:column`, color `var(--color-primary)`, `font-size:11px`; nueva regla `.cart-vaciar-btn svg`. |

**Bug real encontrado y corregido:** el fetch nuevo de productos devuelve `404` para comercios no `APROBADO` (mismo comercio 39 "Pizzas del Sur" del gap del Tramo 16.24) — sin manejo, esto rompía toda la pantalla de `carrito.html` para un cliente con un carrito viejo de ese comercio. Corregido con `try/catch`, degrada a sin-foto en vez de crashear.

## Punto 4 — Texto de resolución recomendada en `comercio-producto-form.html`

| Archivo | Cambio |
|---|---|
| `frontend/comercio-producto-form.html` | Segundo `<p class="field__hint">` agregado debajo del hint existente de fotos: "Resolución recomendada: 1200 x 900 px (horizontal)...". Mismo formulario reusado para alta y edición — un solo cambio cubre ambos flujos. |

Resolución derivada del código real, no arbitraria: toda foto de producto ya pasa por un editor de recorte obligatorio 4:3 (`comercio.js`, Tramo 16.22) que limita la salida a 1200px de ancho máximo (`crop.js`) — 1200×900 es exactamente ese techo en 4:3.

## Punto 6 — Aviso de "comercio cerrado" sin fondo amarillo (`comercio-dashboard.html`)

| Archivo | Cambio |
|---|---|
| `frontend/js/comercio.js` | `renderEstadoBanner(slot, abierto, texto)` nueva, dedicada al banner de estado del dashboard — no toca `renderBanner` (genérico, compartido con banners de error/warning de formularios en el resto del archivo). Aplicada a ambos estados (abierto/cerrado) del banner, no solo "cerrado", por coherencia visual. |
| `frontend/css/styles.css` | Nuevas: `.estado-banner`, `.estado-banner__dot`, `--open` (texto negro + dot verde), `--closed` (texto y dot gris). |

## Punto 7 — Recalibrar color de "Pendiente" a amarillo en puntitos de estado de pedido

| Archivo | Cambio |
|---|---|
| `frontend/css/styles.css` | `--color-warning: #f2b400` nueva en `:root`. `.pedido-estado__dot--pendiente` pasa de `var(--color-primary)` (naranja, indistinguible de rechazado/rojo) a `var(--color-warning)`. Cambio centralizado, sin tocar JS — cubre `pedidos.html`, `comercio-pedidos.html` y "Pedidos activos" de `comercio-dashboard.html` automáticamente. |

---

## Verificado en esta sesión (cierre formal)

- `node --check` sobre los 4 archivos JS relevantes — sin errores de sintaxis.
- Conteo de llaves de `styles.css` balanceado tras todos los cambios.
- Cero comentarios confirmado por `grep` en todos los archivos tocados.
- Punto 1: los 11 comercios reales de la base con `topHeight = 23px` y `gap1 = gap2 = 10px` exactos tras el fix (antes, 4 de 11 medían `41.6px` por envolver a 2 líneas); truncado con elipsis confirmado solo en los 4 nombres largos.
- Puntos 2/5: colores confirmados por `getComputedStyle` en `index.html` (comercio abierto y cerrado reales) y `comercio-detalle.html` (comercios 38 y 46).
- Punto 3: bug de `404` reproducido y corregido (carrito real de `cliente.demo` con el ítem de "Pizzas del Sur"); fragmento de renderizado de imagen verificado con datos reales de Cloudinary (producto 29) en un nodo de scratch, ningún comercio con fotos estaba abierto en el momento de la sesión para probarlo end-to-end en el carrito real (4 comercios reales intentados, los 4 devolvieron `409` por horario — regla de negocio preexistente, no de este tramo).
- Punto 4: texto confirmado presente en el flujo de alta (sin `?id=`) y edición (`?id=28`, producto real de Sabores Fueguinos).
- Punto 6: estado "cerrado" verificado real con `comercio1.demo`; estado "abierto" verificado inyectando las clases CSS en un nodo de scratch (ningún comercio de la cuenta de prueba estaba abierto en el momento de la sesión).
- Punto 7: color `rgb(242,180,0)` confirmado en las 3 pantallas (`pedidos.html`, `comercio-pedidos.html`, `comercio-dashboard.html`).
- Sin errores de consola en ninguna pantalla recorrida en todo el tramo.

---

## Resumen numérico

| | Cantidad |
|---|---|
| Puntos del tramo | 7 |
| Archivos backend tocados | 0 |
| Archivos frontend modificados | 5 (`comercio-producto-form.html`, `js/catalogo.js`, `js/carrito.js`, `js/comercio.js`, `css/styles.css`) |
| Bugs reales encontrados y corregidos en el camino | 1 (crash de `carrito.html` ante comercio no aprobado, punto 3) |

**Pendiente de confirmación del usuario:** este tramo no se cierra hasta que Diego confirme el checklist punto por punto — ver el mensaje de cierre de la sesión para el detalle completo.
